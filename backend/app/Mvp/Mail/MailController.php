<?php
declare(strict_types=1);

namespace App\Mvp\Mail;

use App\Identity\Rbac\RbacPolicy;
use App\Identity\Sessions\StaffSessionContext;
use App\Reference\Shared\ReferenceResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class MailController
{
    public function __construct(private readonly MailSettings $settings, private readonly BookingMailWorker $worker) {}

    public function settings(Request $request)
    {
        $session = $this->admin($request);
        if ($request->isMethod('GET')) return ReferenceResponse::success($request,$this->settings->read());
        try { $data = $this->settings->save($this->body($request),$session->getStaffId(),function () use ($request) { ($request->attributes->get('reservation_authorize'))(); $this->admin($request); }); }
        catch (\InvalidArgumentException) { return ReferenceResponse::error($request,422,'validation_error'); }
        return ReferenceResponse::success($request,$data);
    }

    public function test(Request $request)
    {
        $this->admin($request); $body = $this->body($request);
        if (array_keys($body) !== ['recipient'] || !is_string($body['recipient'])) abort(422);
        if (!$this->settings->read()['configured']) abort(409);
        return ReferenceResponse::success($request,$this->worker->queueTest($body['recipient']),202);
    }

    public function messages(Request $request)
    {
        $this->admin($request);
        $rows = DB::table('mvp_mail_messages as m')->leftJoin('mvp_reservations as r','r.id','=','m.reservation_id')
            ->orderByDesc('m.created_at')->limit(50)->get(['m.id','m.purpose','m.status','m.attempts','m.generation','m.created_at','m.updated_at','r.reference']);
        return ReferenceResponse::success($request,['items'=>$rows->map(fn($r)=>['id'=>$r->id,'purpose'=>$r->purpose,
            'status'=>$r->status,'attempts'=>(int)$r->attempts,'generation'=>(int)$r->generation,'reference'=>$r->reference,
            'createdAt'=>$r->created_at,'updatedAt'=>$r->updated_at])->all()]);
    }

    public function status(Request $request, string $ref)
    {
        $reservation = $this->ownedReservation($request,$ref);
        return ReferenceResponse::success($request,$this->statusFor($reservation->id,$ref));
    }

    public function resend(Request $request, string $ref)
    {
        $session = $request->attributes->get('identity_session_context');
        if ($session instanceof StaffSessionContext) $this->admin($request);
        $reservation = $this->ownedReservation($request,$ref);
        if ($reservation->status !== 'confirmed') abort(409);
        $body = $this->body($request);
        if (array_keys($body) !== ['requestId'] || !is_string($body['requestId']) || !\Illuminate\Support\Str::isUuid($body['requestId'])) abort(422);
        $this->worker->adoptIntents($reservation->id);
        $message = DB::table('mvp_mail_messages')->where('reservation_id',$reservation->id)->lockForUpdate()->first();
        if (!$message) abort(404);
        $replay = DB::table('mvp_mail_resends')->where('message_id',$message->id)->where('request_id',$body['requestId'])->first();
        if ($replay) return ReferenceResponse::success($request,$this->statusFor($reservation->id,$ref));
        if (!in_array($message->status,['failed','accepted','captured_locally'],true)) abort(409);
        if (DB::table('mvp_mail_resends')->where('message_id',$message->id)->where('created_at','>',DB::raw("clock_timestamp() - interval '1 hour'"))->count() >= 3) throw new \Symfony\Component\HttpKernel\Exception\HttpException(429, '', null, ['Retry-After'=>'3600']);
        $generation = (int)$message->generation+1;
        DB::table('mvp_mail_resends')->insert(['message_id'=>$message->id,'request_id'=>$body['requestId'],
            'actor_id'=>$session instanceof StaffSessionContext ? $session->getStaffId() : $session->getUserId(),'generation'=>$generation]);
        DB::table('mvp_mail_messages')->where('id',$message->id)->update(['status'=>'pending','attempts'=>0,'generation'=>$generation,
            'accepted_at'=>null,'next_attempt_at'=>DB::raw('clock_timestamp()'),'updated_at'=>DB::raw('clock_timestamp()')]);
        return ReferenceResponse::success($request,$this->statusFor($reservation->id,$ref));
    }

    private function statusFor(string $id, string $ref): array
    {
        $message = DB::table('mvp_mail_messages')->where('reservation_id',$id)->first();
        return ['reference'=>$ref,'status'=>$message->status ?? 'pending','attempts'=>(int)($message->attempts ?? 0),
            'generation'=>(int)($message->generation ?? 1),'updatedAt'=>$message->updated_at ?? null];
    }

    private function ownedReservation(Request $request, string $ref): object
    {
        $session = $request->attributes->get('identity_session_context');
        $query = DB::table('mvp_reservations')->where('reference',$ref);
        if (!$session instanceof StaffSessionContext) $query->where('owner_user_id',$session?->getUserId());
        if (!$request->isMethod('GET')) $query->lockForUpdate();
        $row = $query->first(); if (!$row) abort(404);
        if (!$request->isMethod('GET')) { ($request->attributes->get('reservation_authorize'))(); if ($session instanceof StaffSessionContext) $this->admin($request); }
        return $row;
    }

    private function admin(Request $request): StaffSessionContext
    {
        $s = $request->attributes->get('identity_session_context');
        if (!$s instanceof StaffSessionContext || !app(RbacPolicy::class)->hasPermission($s->role ?? '', 'admin.manage')) abort(403);
        $now = time(); $mfa = $s->mfaVerifiedAt?->getTimestamp();
        if (!$request->isMethod('GET') && ($mfa === null || $mfa > $now || $mfa < $now - 300)) abort(403,'Recent step-up required.');
        return $s;
    }

    private function body(Request $request): array
    {
        if ($request->getContentTypeFormat() !== 'json' || strlen($request->getContent()) > 8192) abort(422);
        try { $object = json_decode($request->getContent(),false,16,JSON_THROW_ON_ERROR); }
        catch (\JsonException) { abort(422); }
        if (!$object instanceof \stdClass) abort(422);
        return json_decode($request->getContent(),true,16,JSON_THROW_ON_ERROR);
    }
}
