<?php
declare(strict_types=1);
namespace App\Mvp\Site;

use App\Identity\Protocol\CookieSecurity;
use App\Identity\Sessions\PassengerSessionStore;
use App\Reference\Shared\ReferenceResponse;
use App\Support\DatabaseClock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class SiteController
{
    private function body(Request $request): array
    {
        if ($request->getContentTypeFormat() !== 'json' || strlen($request->getContent()) > 16384) abort(422);
        try { $value = json_decode($request->getContent(),false,16,JSON_THROW_ON_ERROR); }
        catch (\JsonException) { abort(422); }
        if (!$value instanceof \stdClass) abort(422);
        return json_decode($request->getContent(),true,16,JSON_THROW_ON_ERROR);
    }
    private function fields(array $body, array $required, array $optional=[]): void
    {
        if (array_diff($required,array_keys($body)) || array_diff(array_keys($body),[...$required,...$optional])) abort(422);
    }
    private function text(mixed $value, int $min, int $max): string
    {
        if (!is_string($value) || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/',$value)) abort(422);
        $value = trim($value); $length = mb_strlen($value);
        if ($length < $min || $length > $max) abort(422);
        return $value;
    }
    private function contactSettings(mixed $payload): array
    {
        if (!is_array($payload)) abort(422);
        $this->fields($payload,['phone','email','addressEn','addressAr','socialInstagram','socialX','socialFacebook','socialYouTube']);
        foreach ($payload as $key=>$value) $payload[$key]=$this->text($value,str_starts_with($key,'social') ? 0 : 3,2048);
        if (!preg_match('/^\+?[0-9 \-()]{7,25}$/',$payload['phone']) || !filter_var($payload['email'],FILTER_VALIDATE_EMAIL)) abort(422);
        foreach (['socialInstagram','socialX','socialFacebook','socialYouTube'] as $key) {
            $url=$payload[$key]; if ($url === '') continue;
            $parts=parse_url($url);
            if (!filter_var($url,FILTER_VALIDATE_URL) || ($parts['scheme']??'') !== 'https' || !str_contains($parts['host']??'','.') || isset($parts['user']) || isset($parts['pass'])) abort(422);
        }
        return $payload;
    }
    public function published(Request $request)
    {
        $row=DB::table('mvp_site_documents as d')->join('mvp_site_revisions as r',fn($j)=>$j->on('r.slug','=','d.slug')->on('r.revision','=','d.published_revision'))->where('d.slug','contact')->first(['r.payload','r.revision']);
        if (!$row) abort(404);
        try { $payload=$this->contactSettings(json_decode($row->payload,true,16,JSON_THROW_ON_ERROR)); }
        catch (\Throwable $e) { throw new \UnexpectedValueException('Published contact settings are invalid.', previous: $e); }
        return ReferenceResponse::success($request,['revision'=>(int)$row->revision,'payload'=>$payload]);
    }
    public function settings(Request $request)
    {
        if (!$request->isMethod('GET')) {
            $body=$this->body($request); $draft=str_ends_with($request->path(),'/draft');
            $this->fields($body,$draft ? ['expectedRevision','payload'] : ['expectedRevision']);
            if (!is_int($body['expectedRevision']) || $body['expectedRevision'] < 0 || $body['expectedRevision'] > 9007199254740991) abort(422);
            $payload=$draft ? $this->contactSettings($body['payload']) : null;
            $row=DB::table('mvp_site_documents')->where('slug','contact')->lockForUpdate()->first();
            if (!$row) {
                DB::table('mvp_site_documents')->insertOrIgnore(['slug'=>'contact']);
                $row=DB::table('mvp_site_documents')->where('slug','contact')->lockForUpdate()->first();
            }
            ($request->attributes->get('editorial_authorizer'))();
            if ((int)$row->revision !== $body['expectedRevision']) abort(409);
            if ($draft) {
                DB::table('mvp_site_documents')->where('slug','contact')->update(['draft'=>json_encode($payload,JSON_THROW_ON_ERROR),'revision'=>$row->revision+1]);
            } elseif (str_ends_with($request->path(),'/publish')) {
                if ($row->draft === null) abort(409);
                $safe=$this->contactSettings(json_decode($row->draft,true,16,JSON_THROW_ON_ERROR));
                $revision=(int)$row->revision+1;
                DB::table('mvp_site_revisions')->insert(['slug'=>'contact','revision'=>$revision,'payload'=>json_encode($safe,JSON_THROW_ON_ERROR),'author_id'=>$request->attributes->get('editorial_staff_session')->getStaffId(),'created_at'=>DatabaseClock::now()]);
                DB::table('mvp_site_documents')->where('slug','contact')->update(['published_revision'=>$revision,'revision'=>$revision,'draft'=>null]);
            } elseif ($row->draft !== null) DB::table('mvp_site_documents')->where('slug','contact')->update(['draft'=>null,'revision'=>$row->revision+1]);
        }
        $row=DB::table('mvp_site_documents')->where('slug','contact')->first();
        $public=$row?->published_revision ? DB::table('mvp_site_revisions')->where('slug','contact')->where('revision',$row->published_revision)->value('payload') : null;
        return ReferenceResponse::success($request,['revision'=>(int)($row->revision??0),'publishedRevision'=>$row?->published_revision ? (int)$row->published_revision : null,
            'draft'=>$row?->draft ? $this->contactSettings(json_decode($row->draft,true,16,JSON_THROW_ON_ERROR)) : null,'published'=>$public ? $this->contactSettings(json_decode($public,true,16,JSON_THROW_ON_ERROR)) : null]);
    }
    public function submit(Request $request)
    {
        if (!$request->isSecure() || !in_array($request->header('Origin'),config('cors.allowed_origins',[]),true)) abort(403);
        $body=$this->body($request); $this->fields($body,['submissionId','senderName','email','topic','message','language'],['bookingRef']);
        $body['submissionId']=$this->text($body['submissionId'],1,200); $body['senderName']=$this->text($body['senderName'],2,120);
        $body['email']=strtolower($this->text($body['email'],3,254)); $body['message']=$this->text($body['message'],10,5000);
        if (!filter_var($body['email'],FILTER_VALIDATE_EMAIL) || !in_array($body['topic'],['booking','baggage','accessibility','archive','media','other'],true) || !in_array($body['language'],['en','ar'],true)) abort(422);
        $body['bookingRef']=isset($body['bookingRef']) ? $this->text($body['bookingRef'],0,24) : '';
        if ($body['bookingRef'] !== '' && !preg_match('/^(GZA-)?[A-Z0-9]{4,12}$/',$body['bookingRef'])) abort(422);
        return DB::transaction(function () use($request,$body) {
            $token=CookieSecurity::getCookieValue($request,CookieSecurity::COOKIE_PASSENGER);
            $session=$token ? app(PassengerSessionStore::class)->read($token) : null;
            $csrf=$request->headers->all('x-csrf-token');
            if (!$session || count($csrf)!==1 || !is_string($csrf[0]) || !hash_equals($session->getCsrfToken(),$csrf[0])) abort(403);
            ksort($body); $hash=hash('sha256',json_encode($body,JSON_THROW_ON_ERROR));
            $row=DB::table('contact_messages')->where('submission_id',$body['submissionId'])->lockForUpdate()->first();
            if ($row && !hash_equals($row->payload_hash,$hash)) abort(409);
            if (!$row) {
                $id=(string)Str::uuid();
                DB::table('contact_messages')->insert(['id'=>$id,'submission_id'=>$body['submissionId'],'payload_hash'=>$hash,'sender_name'=>$body['senderName'],
                    'email'=>$body['email'],'topic'=>$body['topic'],'message'=>$body['message'],'language'=>$body['language'],'booking_ref'=>$body['bookingRef'] ?: null,
                    'reply_draft'=>'', 'created_at'=>DatabaseClock::now(), 'updated_at'=>DatabaseClock::now()]);
                $row=DB::table('contact_messages')->where('id',$id)->first();
            }
            return ReferenceResponse::success($request,['id'=>$row->id,'createdAt'=>$this->iso($row->created_at),'status'=>'received'],202);
        });
    }
    private function iso(string $value): string { return (new \DateTimeImmutable($value))->format(DATE_ATOM); }
    private function dto(object $r): array
    {
        $out=['id'=>$r->id,'submissionId'=>$r->submission_id,'senderName'=>$r->sender_name,'email'=>$r->email,'topic'=>$r->topic,'message'=>$r->message,
            'language'=>$r->language,'status'=>$r->status,'source'=>'public-contact','createdAt'=>$this->iso($r->created_at),'updatedAt'=>$this->iso($r->updated_at),
            'internalNotes'=>DB::table('contact_notes')->where('message_id',$r->id)->orderBy('created_at')->get()->map(fn($n)=>['id'=>$n->id,'body'=>$n->body,'staffId'=>$n->staff_id,'createdAt'=>$this->iso($n->created_at)])->all()];
        if ($r->booking_ref) $out['bookingRef']=$r->booking_ref;
        if ($r->assigned_staff_id) $out['assignedStaffId']=$r->assigned_staff_id;
        if ($r->reply_draft !== '') $out['replyDraft']=$r->reply_draft;
        return $out;
    }
    public function inbox(Request $request)
    {
        $query=DB::table('contact_messages');
        foreach (['status','topic','language'] as $key) if ($request->query($key) && $request->query($key) !== 'all') $query->where($key,$request->query($key));
        if ($search=$request->query('search')) { if (!is_string($search) || strlen($search)>200) abort(422); $query->where(fn($q)=>$q->whereRaw('LOWER(sender_name) LIKE LOWER(?)', ['%'.$search.'%'])->orWhereRaw('LOWER(email) LIKE LOWER(?)', ['%'.$search.'%'])->orWhereRaw('LOWER(message) LIKE LOWER(?)', ['%'.$search.'%'])); }
        return ReferenceResponse::success($request,['items'=>$query->orderByDesc('created_at')->limit(200)->get()->map(fn($r)=>$this->dto($r))->all(),'countNew'=>DB::table('contact_messages')->where('status','new')->count()]);
    }
    public function detail(Request $request,string $id)
    {
        $row=DB::table('contact_messages')->where('id',$id)->first(); if (!$row) abort(404);
        return ReferenceResponse::success($request,$this->dto($row));
    }
    public function mutate(Request $request,string $id)
    {
        $body=$this->body($request); $session=$request->attributes->get('editorial_staff_session');
        $row=DB::table('contact_messages')->where('id',$id)->lockForUpdate()->first(); if (!$row) abort(404);
        ($request->attributes->get('editorial_authorizer'))();
        $kind=basename($request->path()); $patch=[]; $changed=true;
        if ($kind==='status') {
            $this->fields($body,['status']); if (!in_array($body['status'],['new','open','resolved','spam'],true)) abort(422);
            $patch=['status'=>$body['status']]; $changed=$row->status!==$body['status'];
        } elseif ($kind==='assign') {
            $this->fields($body,['staffId']);
            if ($body['staffId']!==null && (!is_string($body['staffId']) || !Str::isUuid($body['staffId']) || !DB::table('staff_users')->where('id',$body['staffId'])->where('status','active')->exists())) abort(422);
            $patch=['assigned_staff_id'=>$body['staffId']]; $changed=$row->assigned_staff_id!==$body['staffId'];
        } elseif ($kind==='notes') {
            $this->fields($body,['body']); $text=$this->text($body['body'],1,2000);
            DB::table('contact_notes')->insert(['id'=>(string)Str::uuid(),'message_id'=>$id,'body'=>$text,'staff_id'=>$session->getStaffId(),'created_at'=>DatabaseClock::now()]);
        } elseif ($kind==='reply-draft') {
            $this->fields($body,['replyDraft']); $text=$this->text($body['replyDraft'],0,5000); $patch=['reply_draft'=>$text]; $changed=$row->reply_draft!==$text;
        } else abort(404);
        if ($changed) {
            DB::table('contact_messages')->where('id',$id)->update([...$patch,'updated_at'=>DatabaseClock::now()]);
            DB::table('contact_audits')->insert(['id'=>(string)Str::uuid(),'message_id'=>$id,'staff_id'=>$session->getStaffId(),'action'=>$kind,'created_at'=>DatabaseClock::now()]);
        }
        $result=['message'=>$this->dto(DB::table('contact_messages')->where('id',$id)->first()),'changed'=>$changed];
        if ($kind==='status') $result['beforeStatus']=$row->status;
        if ($kind==='assign') $result['beforeAssignee']=$row->assigned_staff_id;
        return ReferenceResponse::success($request,$result);
    }
}
