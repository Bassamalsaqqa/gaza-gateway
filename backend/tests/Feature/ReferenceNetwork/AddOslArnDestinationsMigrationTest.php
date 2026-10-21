<?php

declare(strict_types=1);

namespace Tests\Feature\ReferenceNetwork;

use App\Editorial\Validation\EditorialValidator;
use App\Reference\Network\NetworkCoordinator;
use App\Reference\Network\NetworkValidator;
use App\Reference\Schedules\OfferingResolver;
use App\Reference\Schedules\ScheduleIdentityCodec;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class AddOslArnDestinationsMigrationTest extends TestCase
{
    private object $migration;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertDisposableDatabaseTarget();
        $this->migration = require database_path('migrations/2026_10_21_000001_add_osl_arn_destinations.php');
    }

    public function test_validators_admit_osl_and_arn(): void
    {
        $this->assertContains('OSL', NetworkValidator::ACCEPTED_CODES);
        $this->assertContains('ARN', NetworkValidator::ACCEPTED_CODES);
        $this->assertContains('OSL', NetworkValidator::DESTINATION_CODES);
        $this->assertContains('ARN', NetworkValidator::DESTINATION_CODES);
        $this->assertContains('OSL', NetworkCoordinator::ACCEPTED_CODES);
        $this->assertContains('ARN', NetworkCoordinator::ACCEPTED_CODES);
        $this->assertContains('OSL', EditorialValidator::PRESENTATION_DESTINATION_CODES);
        $this->assertContains('ARN', EditorialValidator::PRESENTATION_DESTINATION_CODES);
        $this->assertContains('city-oslo', EditorialValidator::DESTINATION_PHOTO_IDS);
        $this->assertContains('city-stockholm', EditorialValidator::DESTINATION_PHOTO_IDS);
    }

    public function test_migration_up_is_idempotent_preserves_old_rows_and_appends_canonical_revisions(): void
    {
        // 0. Ensure clean baseline in disposable test database for testing upgrade transition
        DB::table('schedules')->whereIn('id', [
            'memorial-b01-osl-out', 'memorial-b01-osl-in',
            'memorial-b01-arn-out', 'memorial-b01-arn-in',
        ])->delete();
        DB::table('airports')->whereIn('code', ['OSL', 'ARN'])->delete();

        // 1. Capture baseline state of existing rows
        $baselineAirports = DB::table('airports')->get()->keyBy('code');
        $this->assertTrue($baselineAirports->has('GZA'), 'Base airport GZA must exist');
        $this->assertTrue($baselineAirports->has('AMM'), 'Baseline destination AMM must exist');

        $initialNetRev = (int) (DB::table('network_revision_control')->where('domain', 'network')->value('revision') ?? 0);
        $initialSchedRev = (int) (DB::table('schedule_revision_control')->where('domain', 'schedules')->value('revision') ?? 0);
        $initialNetRevRows = DB::table('network_revisions')->count();
        $initialSchedRevRows = DB::table('schedule_revisions')->count();
        $initialNetAuditRows = DB::table('network_audit_events')->count();
        $initialSchedAuditRows = DB::table('schedule_audit_events')->count();

        // 2. Apply migration up
        $this->migration->up();

        // 3. Verify preexisting rows are preserved (bytes unchanged)
        foreach ($baselineAirports as $code => $beforeRow) {
            $afterRow = DB::table('airports')->where('code', $code)->first();
            $this->assertNotNull($afterRow, "Preexisting airport {$code} must be preserved");
            $this->assertSame($beforeRow->city_en, $afterRow->city_en);
            $this->assertSame($beforeRow->timezone, $afterRow->timezone);
            $this->assertSame((int) $beforeRow->block_minutes, (int) $afterRow->block_minutes);
            $this->assertSame((bool) $beforeRow->active, (bool) $afterRow->active);
        }

        // 4. Verify OSL and ARN airports exist with exact attributes
        $osl = DB::table('airports')->where('code', 'OSL')->first();
        $this->assertNotNull($osl, 'Airport OSL must exist after up()');
        $this->assertSame('Europe/Oslo', $osl->timezone);
        $this->assertSame(310, (int) $osl->block_minutes);
        $this->assertSame('Oslo', $osl->city_en);
        $this->assertSame('أوسلو', $osl->city_ar);
        $this->assertSame('Norway', $osl->country_en);
        $this->assertSame('النرويج', $osl->country_ar);
        $this->assertTrue((bool) $osl->active);

        $arn = DB::table('airports')->where('code', 'ARN')->first();
        $this->assertNotNull($arn, 'Airport ARN must exist after up()');
        $this->assertSame('Europe/Stockholm', $arn->timezone);
        $this->assertSame(290, (int) $arn->block_minutes);
        $this->assertSame('Stockholm', $arn->city_en);
        $this->assertSame('ستوكهولم', $arn->city_ar);
        $this->assertSame('Sweden', $arn->country_en);
        $this->assertSame('السويد', $arn->country_ar);
        $this->assertTrue((bool) $arn->active);

        // 5. Verify the 4 Nordic schedules exist with real active equipment
        $schedules = DB::table('schedules')->whereIn('id', [
            'memorial-b01-osl-out', 'memorial-b01-osl-in',
            'memorial-b01-arn-out', 'memorial-b01-arn-in',
        ])->get()->keyBy('id');

        $this->assertCount(4, $schedules);

        $oslOut = $schedules->get('memorial-b01-osl-out');
        $this->assertSame('PS 241', $oslOut->number);
        $this->assertSame('out', $oslOut->direction);
        $this->assertSame('OSL', $oslOut->destination);
        $this->assertSame('08:15', substr((string) $oslOut->depart_time, 0, 5));
        $this->assertSame('12:25', substr((string) $oslOut->arrive_time, 0, 5));
        $this->assertSame('Airbus A321neo', $oslOut->aircraft);
        $this->assertSame('a321neo', $oslOut->aircraft_id);
        $this->assertTrue((bool) $oslOut->active);

        $oslIn = $schedules->get('memorial-b01-osl-in');
        $this->assertSame('PS 242', $oslIn->number);
        $this->assertSame('in', $oslIn->direction);
        $this->assertSame('OSL', $oslIn->destination);
        $this->assertSame('14:00', substr((string) $oslIn->depart_time, 0, 5));
        $this->assertSame('20:10', substr((string) $oslIn->arrive_time, 0, 5));
        $this->assertSame('Airbus A321neo', $oslIn->aircraft);
        $this->assertSame('a321neo', $oslIn->aircraft_id);
        $this->assertTrue((bool) $oslIn->active);

        $arnOut = $schedules->get('memorial-b01-arn-out');
        $this->assertSame('PS 243', $arnOut->number);
        $this->assertSame('out', $arnOut->direction);
        $this->assertSame('ARN', $arnOut->destination);
        $this->assertSame('08:30', substr((string) $arnOut->depart_time, 0, 5));
        $this->assertSame('12:20', substr((string) $arnOut->arrive_time, 0, 5));
        $this->assertSame('Airbus A320neo', $arnOut->aircraft);
        $this->assertSame('a320neo', $arnOut->aircraft_id);
        $this->assertTrue((bool) $arnOut->active);

        $arnIn = $schedules->get('memorial-b01-arn-in');
        $this->assertSame('PS 244', $arnIn->number);
        $this->assertSame('in', $arnIn->direction);
        $this->assertSame('ARN', $arnIn->destination);
        $this->assertSame('14:00', substr((string) $arnIn->depart_time, 0, 5));
        $this->assertSame('19:50', substr((string) $arnIn->arrive_time, 0, 5));
        $this->assertSame('Airbus A320neo', $arnIn->aircraft);
        $this->assertSame('a320neo', $arnIn->aircraft_id);
        $this->assertTrue((bool) $arnIn->active);

        // 6. Verify reference revisions: exactly one new revision appended matching canonical format
        $afterNetRev = (int) DB::table('network_revision_control')->where('domain', 'network')->value('revision');
        $afterSchedRev = (int) DB::table('schedule_revision_control')->where('domain', 'schedules')->value('revision');

        $this->assertSame($initialNetRev + 1, $afterNetRev);
        $this->assertSame($initialSchedRev + 1, $afterSchedRev);
        $this->assertSame($initialNetRevRows + 1, DB::table('network_revisions')->count());
        $this->assertSame($initialSchedRevRows + 1, DB::table('schedule_revisions')->count());

        // Validate canonical network revision snapshot structure
        $netRevRow = DB::table('network_revisions')->where('domain', 'network')->where('revision', $afterNetRev)->first();
        $this->assertNotNull($netRevRow);
        $netSnapshot = json_decode((string) $netRevRow->snapshot_bytes, true, 512, JSON_THROW_ON_ERROR);
        $this->assertArrayHasKey('airports', $netSnapshot);
        $this->assertArrayHasKey('routes', $netSnapshot);
        $codesInSnapshot = array_column($netSnapshot['airports'], 'code');
        $this->assertContains('OSL', $codesInSnapshot);
        $this->assertContains('ARN', $codesInSnapshot);

        // Validate canonical schedule revision snapshot structure
        $schedRevRow = DB::table('schedule_revisions')->where('domain', 'schedules')->where('revision', $afterSchedRev)->first();
        $this->assertNotNull($schedRevRow);
        $schedSnapshot = json_decode((string) $schedRevRow->snapshot_bytes, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame($afterSchedRev, $schedSnapshot['revision']);
        $this->assertArrayHasKey('schedules', $schedSnapshot);
        $schedIdsInSnapshot = array_column($schedSnapshot['schedules'], 'id');
        $this->assertContains('memorial-b01-osl-out', $schedIdsInSnapshot);
        $this->assertContains('memorial-b01-osl-in', $schedIdsInSnapshot);
        $this->assertContains('memorial-b01-arn-out', $schedIdsInSnapshot);
        $this->assertContains('memorial-b01-arn-in', $schedIdsInSnapshot);

        // No fake staff audit events created during migration
        $this->assertSame($initialNetAuditRows, DB::table('network_audit_events')->count());
        $this->assertSame($initialSchedAuditRows, DB::table('schedule_audit_events')->count());

        // 7. Verify Idempotency: re-running up() preserves counts and does not increment revisions
        $this->migration->up();

        $this->assertSame(1, DB::table('airports')->where('code', 'OSL')->count());
        $this->assertSame(1, DB::table('airports')->where('code', 'ARN')->count());
        $this->assertSame(1, DB::table('schedules')->where('id', 'memorial-b01-osl-out')->count());
        $this->assertSame($afterNetRev, (int) DB::table('network_revision_control')->where('domain', 'network')->value('revision'));
        $this->assertSame($afterSchedRev, (int) DB::table('schedule_revision_control')->where('domain', 'schedules')->value('revision'));
        $this->assertSame($initialNetRevRows + 1, DB::table('network_revisions')->count());
        $this->assertSame($initialSchedRevRows + 1, DB::table('schedule_revisions')->count());
    }

    public function test_real_two_way_bookability_for_osl_and_arn(): void
    {
        $this->migration->up();

        // 1. OSL Outbound: Gaza -> Oslo on Monday 2026-10-19
        $oslOutOfferingId = ScheduleIdentityCodec::encodeDatedOfferingId('memorial-b01-osl-out', '2026-10-19');
        $oslOut = OfferingResolver::resolve($oslOutOfferingId);
        $this->assertSame('GZA', $oslOut->originCode);
        $this->assertSame('OSL', $oslOut->destinationCode);
        $this->assertSame('a321neo', $oslOut->aircraftId);
        $this->assertSame('Airbus A321neo', $oslOut->aircraft);
        $oslOutCapacity = $oslOut->layout['rows'] * count($oslOut->layout['letters']) - count($oslOut->layout['unavailable']);
        $this->assertSame(196, $oslOutCapacity);
        $this->assertNotEmpty($oslOut->layout['zones']);
        $this->assertSame('08:15', $oslOut->departTime);
        $this->assertSame('12:25', $oslOut->arriveTime);

        // 2. OSL Inbound: Oslo -> Gaza on Monday 2026-10-19
        $oslInOfferingId = ScheduleIdentityCodec::encodeDatedOfferingId('memorial-b01-osl-in', '2026-10-19');
        $oslIn = OfferingResolver::resolve($oslInOfferingId);
        $this->assertSame('OSL', $oslIn->originCode);
        $this->assertSame('GZA', $oslIn->destinationCode);
        $this->assertSame('a321neo', $oslIn->aircraftId);
        $this->assertSame('Airbus A321neo', $oslIn->aircraft);
        $oslInCapacity = $oslIn->layout['rows'] * count($oslIn->layout['letters']) - count($oslIn->layout['unavailable']);
        $this->assertSame(196, $oslInCapacity);
        $this->assertNotEmpty($oslIn->layout['zones']);
        $this->assertSame('14:00', $oslIn->departTime);
        $this->assertSame('20:10', $oslIn->arriveTime);

        // 3. ARN Outbound: Gaza -> Stockholm on Tuesday 2026-10-20
        $arnOutOfferingId = ScheduleIdentityCodec::encodeDatedOfferingId('memorial-b01-arn-out', '2026-10-20');
        $arnOut = OfferingResolver::resolve($arnOutOfferingId);
        $this->assertSame('GZA', $arnOut->originCode);
        $this->assertSame('ARN', $arnOut->destinationCode);
        $this->assertSame('a320neo', $arnOut->aircraftId);
        $this->assertSame('Airbus A320neo', $arnOut->aircraft);
        $arnOutCapacity = $arnOut->layout['rows'] * count($arnOut->layout['letters']) - count($arnOut->layout['unavailable']);
        $this->assertSame(168, $arnOutCapacity);
        $this->assertNotEmpty($arnOut->layout['zones']);
        $this->assertSame('08:30', $arnOut->departTime);
        $this->assertSame('12:20', $arnOut->arriveTime);

        // 4. ARN Inbound: Stockholm -> Gaza on Tuesday 2026-10-20
        $arnInOfferingId = ScheduleIdentityCodec::encodeDatedOfferingId('memorial-b01-arn-in', '2026-10-20');
        $arnIn = OfferingResolver::resolve($arnInOfferingId);
        $this->assertSame('ARN', $arnIn->originCode);
        $this->assertSame('GZA', $arnIn->destinationCode);
        $this->assertSame('a320neo', $arnIn->aircraftId);
        $this->assertSame('Airbus A320neo', $arnIn->aircraft);
        $arnInCapacity = $arnIn->layout['rows'] * count($arnIn->layout['letters']) - count($arnIn->layout['unavailable']);
        $this->assertSame(168, $arnInCapacity);
        $this->assertNotEmpty($arnIn->layout['zones']);
        $this->assertSame('14:00', $arnIn->departTime);
        $this->assertSame('19:50', $arnIn->arriveTime);
    }

    public function test_migration_down_refuses_destructive_contraction_without_writes(): void
    {
        $this->migration->up();

        $airportsCountBefore = DB::table('airports')->count();
        $schedulesCountBefore = DB::table('schedules')->count();
        $netRevControlBefore = (int) DB::table('network_revision_control')->where('domain', 'network')->value('revision');
        $schedRevControlBefore = (int) DB::table('schedule_revision_control')->where('domain', 'schedules')->value('revision');
        $netRevisionsBefore = DB::table('network_revisions')->count();
        $schedRevisionsBefore = DB::table('schedule_revisions')->count();

        try {
            $this->migration->down();
            $this->fail('Expected down() to refuse destructive contraction.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Network contraction refused', $e->getMessage());
        }

        // Verify no writes occurred
        $this->assertSame($airportsCountBefore, DB::table('airports')->count());
        $this->assertSame($schedulesCountBefore, DB::table('schedules')->count());
        $this->assertSame($netRevControlBefore, (int) DB::table('network_revision_control')->where('domain', 'network')->value('revision'));
        $this->assertSame($schedRevControlBefore, (int) DB::table('schedule_revision_control')->where('domain', 'schedules')->value('revision'));
        $this->assertSame($netRevisionsBefore, DB::table('network_revisions')->count());
        $this->assertSame($schedRevisionsBefore, DB::table('schedule_revisions')->count());
        $this->assertTrue(DB::table('airports')->where('code', 'OSL')->exists());
        $this->assertTrue(DB::table('airports')->where('code', 'ARN')->exists());
        $this->assertTrue(DB::table('schedules')->where('id', 'memorial-b01-osl-out')->exists());
        $this->assertTrue(DB::table('schedules')->where('id', 'memorial-b01-arn-out')->exists());
    }
}
