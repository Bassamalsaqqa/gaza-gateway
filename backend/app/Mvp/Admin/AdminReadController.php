<?php
declare(strict_types=1);
namespace App\Mvp\Admin;

use Carbon\CarbonImmutable;
use App\Reference\Shared\ReferenceResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Explicit read projections: never exposes password hashes, tokens, documents or audit metadata. */
final class AdminReadController
{
    public function dashboard(Request $request): JsonResponse
    {
        $confirmed = DB::table('mvp_reservations')->where('status', 'confirmed');
        return ReferenceResponse::success($request, [
            'confirmedBookings' => (int) (clone $confirmed)->count(),
            'confirmedPassengers' => (int) (clone $confirmed)->sum('passenger_count'),
            'cancelledBookings' => DB::table('mvp_reservations')->where('status', 'cancelled')->count(),
            'passengerAccounts' => DB::table('users')->count(),
            'activeDestinations' => DB::table('airports')->where('active', true)->where('code', '<>', 'GZA')->count(),
            'activeAircraft' => DB::table('aircraft')->where('active', true)->count(),
            'activeSchedules' => DB::table('schedules')->where('active', true)->count(),
        ], 200);
    }

    private function page(Request $request): ?int
    {
        $value = $request->query('page', '1');
        return is_string($value) && preg_match('/^[1-9][0-9]{0,5}$/D', $value) ? (int) $value : null;
    }

    public function customers(Request $request): JsonResponse
    {
        $page = $this->page($request);
        if ($page === null) return ReferenceResponse::error($request, 400, 'bad_request');
        $bookings = DB::table('mvp_reservations')->select('owner_user_id')->selectRaw('COUNT(*) AS booking_count')->groupBy('owner_user_id');
        $query = DB::table('users as u')->leftJoin('passenger_profiles as p', 'p.user_id', '=', 'u.id')
            ->leftJoinSub($bookings, 'b', fn ($join) => $join->on('b.owner_user_id', '=', 'u.id'));
        $total = DB::table('users')->count();
        $items = $query->orderByDesc('u.created_at')->orderBy('u.id')->offset(($page - 1) * 25)->limit(25)
            ->get(['u.id', 'u.email', 'u.status', 'u.created_at', 'p.first_name', 'p.last_name', 'p.phone', 'b.booking_count'])
            ->map(fn ($row) => ['id'=>$row->id, 'name'=>trim(($row->first_name ?? '').' '.($row->last_name ?? '')),
                'email'=>$row->email, 'phone'=>$row->phone ?? '', 'status'=>$row->status,
                'bookingCount'=>(int) ($row->booking_count ?? 0), 'createdAt'=>CarbonImmutable::parse($row->created_at, 'UTC')->toIso8601String()])->all();
        return ReferenceResponse::success($request, ['items'=>$items, 'page'=>$page, 'pageSize'=>25, 'total'=>$total], 200);
    }

    public function activity(Request $request): JsonResponse
    {
        $page = $this->page($request);
        if ($page === null) return ReferenceResponse::error($request, 400, 'bad_request');
        // Normalize only non-sensitive columns from immutable domain audit tables.
        $sources = [
            ['audit_events', 'identity', 'occurred_at', 'target_id'],
            ['reference_audit_events', 'fleet', 'created_at', 'aircraft_id'],
            ['network_audit_events', 'network', 'created_at', 'airport_code'],
            ['meal_audit_events', 'meals', 'created_at', 'meal_id'],
            ['schedule_audit_events', 'schedules', 'created_at', 'schedule_id'],
            ['editorial_audit_events', 'content', 'created_at', 'slug'],
            ['gallery_audit_events', 'gallery', 'created_at', 'slug'],
        ];
        $union = null;
        foreach ($sources as [$table, $domain, $time, $target]) {
            $query = DB::table($table)->select(['id', 'action', 'outcome', 'staff_id'])
                ->selectRaw('? AS domain', [$domain])->addSelect($time.' as occurredAt', $target.' as targetId');
            if ($union === null) $union = $query; else $union->unionAll($query);
        }
        $union->unionAll(DB::table('mvp_reservation_audits')
            ->selectRaw("CAST(id AS CHAR) AS id, action, 'success' AS outcome, actor_id AS staff_id, 'reservations' AS domain, created_at AS occurredAt, reservation_id AS targetId"));
        $union->unionAll(DB::table('contact_audits')
            ->selectRaw("id, action, 'success' AS outcome, staff_id, 'contact' AS domain, created_at AS occurredAt, message_id AS targetId"));
        $query = DB::query()->fromSub($union, 'events');
        $total = (clone $query)->count();
        $items = $query->orderByDesc('occurredAt')->orderBy('domain')->orderBy('id')->offset(($page - 1) * 25)->limit(25)->get()
            ->map(fn ($row) => ['id'=>$row->domain.':'.$row->id, 'domain'=>$row->domain, 'action'=>$row->action,
                'outcome'=>$row->outcome, 'actorId'=>$row->staff_id, 'targetId'=>$row->targetId, 'occurredAt'=>CarbonImmutable::parse($row->occurredAt, 'UTC')->toIso8601String()])->all();
        return ReferenceResponse::success($request, ['items'=>$items, 'page'=>$page, 'pageSize'=>25, 'total'=>$total], 200);
    }
}
