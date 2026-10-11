<?php
declare(strict_types=1);

namespace Tests\Feature\ReferenceFleet;

use App\Identity\Mfa\TotpSecret;
use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\StaffSessionStore;
use App\Reference\Fleet\FleetCoordinator;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\{Artisan, DB, Schema};
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class FleetRoutesTest extends TestCase
{
    private static ?string $hash = null;

    private function staff(string $role = 'admin'): array
    {
        $id = (string) Str::uuid();
        self::$hash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-fleet-password-2026', 'staff');
        DB::table('staff_users')->insert(['id' => $id, 'username' => 'fleet-'.$id, 'email' => $id.'@example.invalid',
            'full_name_en' => 'Synthetic Staff', 'full_name_ar' => 'Synthetic Staff', 'password_hash' => self::$hash,
            'role' => $role, 'status' => 'invited', 'credential_epoch' => 1, 'email_verified_at' => DB::raw('clock_timestamp()'),
            'created_at' => DB::raw('clock_timestamp()'), 'updated_at' => DB::raw('clock_timestamp()')]);
        DB::table('staff_mfa_credentials')->insert(['staff_id' => $id, 'version' => 1,
            'encrypted_secret' => app(Encrypter::class)->encrypt(TotpSecret::generate()->revealBase32Secret()),
            'confirmed_at' => DB::raw('clock_timestamp()')]);
        DB::table('staff_users')->where('id', $id)->update(['status' => 'active', 'mfa_version' => 1]);
        $receipt = app(StaffSessionStore::class)->issueFull($id, 1, 1, new \DateTimeImmutable());
        return ['owner' => $id, 'id' => $receipt->sessionId, 'cookie' => $receipt->getRawToken(), 'csrf' => $receipt->getCsrfToken()];
    }

    private function http(string $method, string $path, array $session = [], mixed $body = null, array $headers = [], ?string $raw = null): TestResponse
    {
        $this->flushHeaders();
        $server = ['HTTPS' => 'on', 'SERVER_PORT' => 443, 'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173', 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json',
            'HTTP_COOKIE' => isset($session['cookie']) ? 'gza_staff_session='.$session['cookie'] : '',
            'HTTP_X_CSRF_TOKEN' => $session['csrf'] ?? '', 'REMOTE_ADDR' => '2001:db8:'.bin2hex(random_bytes(2)).'::9'];
        $response = $this->call($method, 'https://'.($headers['HTTP_HOST'] ?? '127.0.0.1:18090').'/api/v1'.$path, [], [], [], array_replace($server, $headers),
            $raw ?? ($body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR)));
        $operation = str_ends_with($path, '/receipt')
            ? ($method === 'PATCH' ? 'patchMvpAircraftReceipt' : 'putMvpLayoutReceipt')
            : ($path === '/fleet/snapshot' ? 'getMvpFleetSnapshot' : match ($method) {
            'POST' => 'postAdminAircraft', 'PATCH' => 'patchAdminAircraft', 'PUT' => 'putAdminSeatLayout',
            default => str_contains($path, 'seat-layouts') ? 'getSeatLayoutById' : 'getFleetAircraft',
        });
        if ($operation !== null && getenv('REFERENCE_GATE_OWNED') === '1') {
            $file = '/tmp/reference-captures.json';
            $captures = is_file($file) ? json_decode(file_get_contents($file), true, 32, JSON_THROW_ON_ERROR) : [];
            $captures[$operation.':'.$response->status()] ??= ['operationId' => $operation, 'status' => $response->status(),
                'contentType' => $response->headers->get('Content-Type'), 'payload' => $response->json()];
            file_put_contents($file, json_encode($captures, JSON_THROW_ON_ERROR), LOCK_EX);
        }
        return $response;
    }

    private function input(?string $id = null): array
    {
        return ['aircraft' => ['id' => $id ?? (string) Str::uuid(), 'model' => 'Synthetic Aircraft',
            'registration' => 'T-'.strtoupper(bin2hex(random_bytes(2)))]];
    }

    public function test_expand_only_migration_roundtrip_preserves_identity(): void
    {
        $staff = $this->staff();
        $this->assertSame(0, DB::table('aircraft')->count());
        $this->assertSame(0, Artisan::call('migrate:rollback', ['--step' => 2, '--force' => true]));
        $this->assertFalse(Schema::hasTable('aircraft'));
        $this->assertTrue(DB::table('staff_users')->where('id', $staff['owner'])->exists());
        $this->assertSame(0, Artisan::call('migrate', ['--force' => true]));
        $this->assertSame(0, DB::table('aircraft')->count());
    }

    public function test_genuine_source_fixtures_and_five_actual_contracts(): void
    {
        $staff = $this->staff();
        $source = json_decode(file_get_contents('/tmp/fleet-source.json'), true, 32, JSON_THROW_ON_ERROR);
        foreach ($source['aircraft'] as $aircraft) {
            $layout = $source['layouts'][$aircraft['id']]; unset($layout['aircraftId']);
            $this->http('POST', '/admin/fleet/aircraft', $staff, ['aircraft' => $aircraft, 'initialLayout' => $layout])
                ->assertStatus(201)->assertJsonPath('data', $aircraft);
            $this->http('GET', '/fleet/seat-layouts/'.$aircraft['id'])->assertOk()
                ->assertJsonPath('data', $source['layouts'][$aircraft['id']]);
        }
        $this->http('GET', '/fleet/aircraft')->assertOk()->assertJsonCount(3, 'data');
        $this->assertFalse(DB::table('aircraft')->where('id', 'b737800')->value('active'));
        foreach (['a320neo' => 168, 'a321neo' => 196, 'b737800' => 162] as $id => $capacity) {
            $this->assertSame($capacity, DB::table('seat_layouts')->where('aircraft_id', $id)->value('capacity'));
        }
        $this->http('PATCH', '/admin/fleet/aircraft/a320neo', $staff, ['model' => 'Synthetic Revised Model'])->assertOk();
        $layout = FleetCoordinator::defaultLayout();
        $this->http('PUT', '/admin/fleet/seat-layouts/a320neo', $staff, $layout)->assertOk();
        $this->assertSame(5, DB::table('reference_revisions')->count());
        $this->assertSame(5, DB::table('reference_audit_events')->count());
    }

    public function test_default_layout_normalization_noops_and_snapshot_hashes(): void
    {
        $staff = $this->staff(); $input = $this->input(); $input['aircraft']['registration'] = ' t-ab12 ';
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input)->assertStatus(201)->assertJsonPath('data.registration', 'T-AB12');
        $id = $input['aircraft']['id'];
        $this->assertSame(168, DB::table('seat_layouts')->where('aircraft_id', $id)->value('capacity'));
        $revision = DB::table('reference_revision_control')->value('revision');
        $this->http('PATCH', '/admin/fleet/aircraft/'.$id, $staff, (object) [])->assertOk();
        $this->http('PUT', '/admin/fleet/seat-layouts/'.$id, $staff, FleetCoordinator::defaultLayout())->assertOk();
        $this->assertSame($revision, DB::table('reference_revision_control')->value('revision'));
        foreach (DB::table('reference_revisions')->get() as $row) {
            $this->assertSame(hash('sha256', $row->snapshot_bytes), $row->snapshot_hash);
            $this->assertEquals(json_decode($row->snapshot_bytes), json_decode($row->snapshot_json));
        }
    }

    public function test_wrong_realms_roles_csrf_origin_and_stale_authority_are_denied(): void
    {
        $input = $this->input(); $staff = $this->staff(); $viewer = $this->staff('viewer'); $editor = $this->staff('editor');
        $before = DB::table('reference_audit_events')->count();
        $this->http('POST', '/admin/fleet/aircraft', [], $input)->assertStatus(401);
        foreach ([$viewer, $editor] as $denied) { $this->http('POST', '/admin/fleet/aircraft', $denied, $input)->assertStatus(403); }
        foreach (['', 'http://attacker.invalid'] as $origin) {
            $this->http('POST', '/admin/fleet/aircraft', $staff, $input, ['HTTP_ORIGIN' => $origin, 'HTTP_SEC_FETCH_SITE' => 'same-origin'])->assertStatus(403);
        }
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input, ['HTTP_X_CSRF_TOKEN' => '', 'HTTP_SEC_FETCH_SITE' => 'same-origin'])->assertStatus(403);
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input, ['HTTP_COOKIE' => 'gza_session='.$staff['cookie']])->assertStatus(401);
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input, ['HTTP_COOKIE' => 'gza_staff_pending='.$staff['cookie']])->assertStatus(401);
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input, ['HTTP_COOKIE' => 'gza_staff_session='.$staff['cookie'].'; gza_staff_session='.$staff['cookie']])->assertStatus(401);
        DB::table('staff_users')->where('id', $staff['owner'])->update(['credential_epoch' => 2]);
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input)->assertStatus(401);
        $this->assertSame($before, DB::table('reference_audit_events')->count());
    }

    public function test_revoked_expired_anonymous_and_unconfirmed_mfa_sessions_are_denied(): void
    {
        $input = $this->input();
        foreach (['revoke', 'expire', 'mfa', 'suspend'] as $probe) {
            $staff = $this->staff();
            match ($probe) {
                'revoke' => DB::table('staff_sessions')->where('id', $staff['id'])->update(['revoked_at' => DB::raw('clock_timestamp()')]),
                'expire' => DB::table('staff_sessions')->where('id', $staff['id'])->update(['absolute_expires_at' => DB::raw("statement_timestamp() - interval '1 second'"), 'idle_expires_at' => DB::raw("statement_timestamp() - interval '1 second'"), 'issued_at' => DB::raw("statement_timestamp() - interval '2 seconds'"), 'last_seen_at' => DB::raw("statement_timestamp() - interval '2 seconds'")]),
                'mfa' => DB::table('staff_mfa_credentials')->where('staff_id', $staff['owner'])->update(['revoked_at' => DB::raw('clock_timestamp()')]),
                'suspend' => DB::table('staff_users')->where('id', $staff['owner'])->update(['status' => 'suspended']),
            };
            $this->http('POST', '/admin/fleet/aircraft', $staff, $input)->assertStatus(401);
        }
        $anonymous = app(StaffSessionStore::class)->issueAnonymous();
        $this->http('POST', '/admin/fleet/aircraft', ['cookie' => $anonymous->getRawToken(), 'csrf' => $anonymous->getCsrfToken()], $input)->assertStatus(401);
    }

    public function test_invalid_closed_commands_and_geometry_leave_no_partial_aircraft(): void
    {
        $staff = $this->staff(); $input = $this->input(); $layout = FleetCoordinator::defaultLayout();
        $badLayouts = [
            $layout + ['capacity' => 999], array_replace($layout, ['letters' => ['A','A']]),
            array_replace($layout, ['aisleAfter' => 6]), array_replace($layout, ['rows' => 61]),
            array_replace($layout, ['unavailable' => ['01A']]), array_replace($layout, ['unavailable' => ['29A']]),
            array_replace($layout, ['extraLegroomRows' => [5,5]]),
            array_replace($layout, ['zones' => [['id' => 'economy','firstRow' => 2,'lastRow' => 28]]]),
        ];
        foreach ($badLayouts as $bad) {
            $this->http('POST', '/admin/fleet/aircraft', $staff, $input + ['initialLayout' => $bad])->assertStatus(422);
        }
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input + ['capacity' => 999])->assertStatus(422);
        $this->http('POST', '/admin/fleet/aircraft', $staff, ['aircraft' => []])->assertStatus(422);
        $this->assertFalse(DB::table('aircraft')->where('id', $input['aircraft']['id'])->exists());
        $this->http('PATCH', '/admin/fleet/aircraft/missing', $staff, ['id' => 'changed'])->assertStatus(422);
        $this->http('GET', '/fleet/seat-layouts/missing')->assertStatus(404);
    }

    public function test_database_constraints_and_history_cannot_be_bypassed(): void
    {
        $staff = $this->staff(); $input = $this->input(); $id = $input['aircraft']['id'];
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input)->assertStatus(201);
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input)->assertStatus(409);
        $sql = [
            ['UPDATE aircraft SET registration_normalized = ? WHERE id = ?', [strtolower($input['aircraft']['registration']), $id]],
            ['UPDATE aircraft SET id = ? WHERE id = ?', ['changed', $id]],
            ['UPDATE seat_layouts SET letters_json = ?::jsonb WHERE aircraft_id = ?', ['["A","A"]', $id]],
            ['UPDATE seat_layouts SET unavailable_json = ?::jsonb WHERE aircraft_id = ?', ['["99A"]', $id]],
            ['UPDATE seat_layouts SET zones_json = ?::jsonb WHERE aircraft_id = ?', ['[]', $id]],
            ['UPDATE seat_layouts SET capacity = 999 WHERE aircraft_id = ?', [$id]],
            ['DELETE FROM seat_layouts WHERE aircraft_id = ?', [$id]],
            ['UPDATE reference_revisions SET snapshot_hash = ?', [str_repeat('0', 64)]],
            ['DELETE FROM reference_revisions', []], ['TRUNCATE reference_revisions CASCADE', []],
            ['UPDATE reference_audit_events SET outcome = ?', ['success']],
            ['DELETE FROM reference_audit_events', []], ['TRUNCATE reference_audit_events', []],
        ];
        foreach ($sql as [$statement, $bindings]) {
            try { DB::transaction(fn() => DB::statement($statement, $bindings)); $this->fail('Database boundary bypassed.'); }
            catch (\Illuminate\Database\QueryException|\PDOException) { $this->assertTrue(true); }
        }
        try {
            DB::transaction(fn() => DB::table('aircraft')->insert(['id' => 'orphan', 'model' => 'Synthetic', 'registration_normalized' => 'T-ORPH']));
            $this->fail('Aircraft without layout committed.');
        } catch (\Illuminate\Database\QueryException|\PDOException) { $this->assertFalse(DB::table('aircraft')->where('id', 'orphan')->exists()); }
    }

    public function test_history_failure_rolls_back_aircraft_layout_revision_and_audit(): void
    {
        $staff = $this->staff(); $input = $this->input(); $before = DB::table('reference_revision_control')->value('revision');
        DB::unprepared("CREATE FUNCTION reference_test_fail() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic failure'; END \$\$; CREATE TRIGGER reference_test_failure BEFORE INSERT ON reference_audit_events FOR EACH ROW EXECUTE FUNCTION reference_test_fail();");
        try { $this->http('POST', '/admin/fleet/aircraft', $staff, $input)->assertStatus(503); }
        finally { DB::unprepared('DROP TRIGGER reference_test_failure ON reference_audit_events; DROP FUNCTION reference_test_fail();'); }
        $this->assertFalse(DB::table('aircraft')->where('id', $input['aircraft']['id'])->exists());
        $this->assertFalse(DB::table('seat_layouts')->where('aircraft_id', $input['aircraft']['id'])->exists());
        $this->assertSame($before, DB::table('reference_revision_control')->value('revision'));
        $this->assertSame((int) $before, DB::table('reference_revisions')->count());
    }

    public function test_concurrent_normalized_registration_has_one_winner_and_no_partial_rows(): void
    {
        $one = $this->staff(); $two = $this->staff(); $a = $this->input(); $b = $this->input();
        $b['aircraft']['registration'] = strtolower($a['aircraft']['registration']);
        $statuses = $this->race([
            ['method' => 'POST','path' => '/admin/fleet/aircraft','session' => $one,'body' => $a],
            ['method' => 'POST','path' => '/admin/fleet/aircraft','session' => $two,'body' => $b],
        ]);
        sort($statuses); $this->assertSame([201,409], $statuses);
        $this->assertSame(1, DB::table('aircraft')->whereIn('id', [$a['aircraft']['id'], $b['aircraft']['id']])->count());
    }

    public function test_concurrent_patches_merge_locked_current_state_without_lost_updates(): void
    {
        $one = $this->staff(); $two = $this->staff(); $input = $this->input(); $id = $input['aircraft']['id'];
        $this->http('POST', '/admin/fleet/aircraft', $one, $input)->assertStatus(201);
        $this->assertSame([200,200], $this->race([
            ['method' => 'PATCH','path' => '/admin/fleet/aircraft/'.$id,'session' => $one,'body' => ['model' => 'Concurrent Model']],
            ['method' => 'PATCH','path' => '/admin/fleet/aircraft/'.$id,'session' => $two,'body' => ['active' => false]],
        ]));
        $row = DB::table('aircraft')->where('id', $id)->first();
        $this->assertSame('Concurrent Model', $row->model); $this->assertFalse($row->active);
    }


    public function test_registered_routes_preserve_exact_contract_and_permission_boundary(): void
    {
        $spec = json_decode(file_get_contents(base_path('../docs/backend/openapi.v1.json')), true, 64, JSON_THROW_ON_ERROR);
        $registry = json_decode(file_get_contents(base_path('../docs/backend/operation-policies.v1.json')), true, 64, JSON_THROW_ON_ERROR);
        $expected = [
            ['getFleetAircraft','GET','/fleet/aircraft'],
            ['getSeatLayoutById','GET','/fleet/seat-layouts/{id}'],
            ['postAdminAircraft','POST','/admin/fleet/aircraft'],
            ['patchAdminAircraft','PATCH','/admin/fleet/aircraft/{id}'],
            ['putAdminSeatLayout','PUT','/admin/fleet/seat-layouts/{id}'],
        ];
        foreach ($expected as [$id,$method,$path]) {
            $route = app('router')->getRoutes()->getByName($id);
            $this->assertNotNull($route); $this->assertSame('api/v1'.$path, $route->uri());
            $this->assertContains($method, $route->methods());
            $this->assertSame($id, $spec['paths'][$path][strtolower($method)]['operationId']);
            $policy = array_values(array_filter($registry['operations'], static fn(array $p): bool => $p['operationId'] === $id))[0];
            if ($method === 'GET') { $this->assertSame([], $policy['allowedSecurity']); }
            else {
                $this->assertSame('ops.edit', $policy['requiredPermission']);
                $this->assertSame([['StaffCookieAuth' => []]], $policy['allowedSecurity']);
                $this->assertContains(\App\Http\Middleware\Reference\RequireReferenceStaffAuth::class, $route->gatherMiddleware());
            }
        }
    }

    public function test_expiry_while_waiting_for_domain_lock_cannot_commit_a_mutation(): void
    {
        $staff = $this->staff(); $input = $this->input();
        DB::table('staff_sessions')->where('id',$staff['id'])->update([
            'absolute_expires_at' => DB::raw("clock_timestamp() + interval '1500 milliseconds'"),
            'idle_expires_at' => DB::raw("clock_timestamp() + interval '1400 milliseconds'")]);
        $db = DB::connection(); $db->beginTransaction();
        $children = []; $process = null; $pipes = [];
        try {
            $db->table('reference_revision_control')->where('domain','fleet')->lockForUpdate()->first();
            $process = proc_open([PHP_BINARY,base_path('tests/Feature/ReferenceFleet/concurrency-worker.php')],
                [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,base_path());
            if (!is_resource($process)) { throw new \RuntimeException('Worker unavailable.'); }
            stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false);
            fwrite($pipes[0],json_encode(['method'=>'POST','path'=>'/admin/fleet/aircraft','session'=>$staff,'body'=>$input],JSON_THROW_ON_ERROR)."\n");
            fflush($pipes[0]); $this->assertSame('READY',$this->line($process,$pipes[1]));
            fwrite($pipes[0],"GO\n"); fflush($pipes[0]);
            $deadline = microtime(true)+1;
            do {
                $db->select('SELECT pg_stat_clear_snapshot()');
                $waiting = (int) $db->selectOne("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%reference_revision_control%'")->n;
                if ($waiting > 0) { break; } usleep(10000);
            } while (microtime(true)<$deadline);
            $this->assertGreaterThan(0,$waiting,'The request must actually reach the locked aggregate before expiry.');
            usleep(1700000); $db->commit();
            $this->assertSame('401',$this->line($process,$pipes[1]));
            $this->assertFalse(DB::table('aircraft')->where('id',$input['aircraft']['id'])->exists());
        } finally {
            if ($db->transactionLevel()>0) { $db->rollBack(); }
            foreach ($pipes as $pipe) { if (is_resource($pipe)) { fclose($pipe); } }
            if (is_resource($process)) {
                $deadline=microtime(true)+1;
                while (proc_get_status($process)['running'] && microtime(true)<$deadline) { usleep(10000); }
                if (proc_get_status($process)['running']) { proc_terminate($process,9); }
                proc_close($process);
            }
        }
    }

    public function test_bounded_throttle_and_security_headers_are_preserved(): void
    {
        \Illuminate\Support\Facades\RateLimiter::for('reference', static fn($request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(2)->by('reference:'.$request->ip()));
        $headers = ['REMOTE_ADDR'=>'192.0.2.99'];
        $this->http('GET','/fleet/aircraft',[],null,$headers)->assertOk()->assertHeader('X-Content-Type-Options','nosniff');
        $this->http('GET','/fleet/aircraft',[],null,$headers)->assertOk();
        $response=$this->http('GET','/fleet/aircraft',[],null,$headers);
        $response->assertStatus(429)->assertHeader('Retry-After')->assertHeader('X-Frame-Options','DENY');
        $this->assertStringContainsString('no-store',$response->headers->get('Cache-Control'));
    }


    public function test_route_safe_ids_roundtrip_exactly_and_unsafe_ids_fail_http_and_sql(): void
    {
        $staff=$this->staff();
        foreach (['Round_Trip-1',str_repeat('Z',64),'0'] as $id) {
            $this->http('POST','/admin/fleet/aircraft',$staff,$this->input($id))->assertStatus(201)->assertJsonPath('data.id',$id);
            $this->http('GET','/fleet/seat-layouts/'.$id)->assertOk()->assertJsonPath('data.aircraftId',$id);
            $this->http('PATCH','/admin/fleet/aircraft/'.$id,$staff,['model'=>'Exact ID'])->assertOk()->assertJsonPath('data.id',$id);
            $this->http('PUT','/admin/fleet/seat-layouts/'.$id,$staff,FleetCoordinator::defaultLayout())->assertOk()->assertJsonPath('data.aircraftId',$id);
        }
        foreach (['',str_repeat('x',65),'plane/1','plane\\1','plane?1','plane#1','plane%2F1','plane%252F1',
            "plane\0x","plane\nx","plane\n",' plane','plane ','plane.1','..','plane??'] as $id) {
            $this->http('POST','/admin/fleet/aircraft',$staff,$this->input($id))->assertStatus(422);
            try {
                DB::transaction(fn()=>DB::table('aircraft')->insert(['id'=>$id,'model'=>'Synthetic','registration_normalized'=>'T-SQL']));
                $this->fail('Unsafe database ID admitted.');
            } catch (\Illuminate\Database\QueryException|\PDOException) {
                $this->assertFalse(DB::table('aircraft')->where('id',$id)->exists());
            }
        }
        foreach (['GET','PATCH','PUT'] as $method) {
            $path=($method==='GET'?'/fleet/seat-layouts/':($method==='PATCH'?'/admin/fleet/aircraft/':'/admin/fleet/seat-layouts/')).'plane%3F1';
            $body=$method==='PUT'?FleetCoordinator::defaultLayout():['model'=>'Synthetic'];
            $this->http($method,$path,$staff,$body)->assertStatus(422);
        }
    }

    public function test_all_fleet_error_statuses_are_actual_canonical_http_responses(): void
    {
        $staff=$this->staff(); $viewer=$this->staff('viewer'); $input=$this->input();
        $this->http('POST','/admin/fleet/aircraft',$staff,$input)->assertStatus(201);
        $id=$input['aircraft']['id'];
        $cases=[
            ['GET','/fleet/aircraft',null],
            ['GET','/fleet/seat-layouts/'.$id,null],
            ['POST','/admin/fleet/aircraft',$this->input()],
            ['PATCH','/admin/fleet/aircraft/'.$id,['model'=>'Synthetic']],
            ['PUT','/admin/fleet/seat-layouts/'.$id,FleetCoordinator::defaultLayout()],
        ];
        foreach($cases as [$method,$path,$body]) {
            $this->http($method,$path,$staff,$body,['HTTP_HOST'=>'untrusted.invalid'])->assertStatus(400);
            $originResponse=$this->http($method,$path,$staff,$body,['HTTP_ORIGIN'=>'https://untrusted.invalid']);
            if($method==='GET') { $originResponse->assertOk()->assertHeaderMissing('Access-Control-Allow-Origin'); }
            else { $originResponse->assertStatus(403); }
            if($method!=='GET') {
                $this->http($method,$path,[],$body)->assertStatus(401);
                $this->http($method,$path,$viewer,$body)->assertStatus(403);
                $this->http($method,$path,$staff,['unexpected'=>true])->assertStatus(422);
                $this->http($method,$path,$staff,null,[], '{')->assertStatus(422);
                $this->http($method,$path,$staff,$body,['CONTENT_TYPE'=>'text/plain'])->assertStatus(422);
            }
        }
        $this->http('POST','/admin/fleet/aircraft',$staff,$input)->assertStatus(409);
        $other=$this->input();
        $this->http('POST','/admin/fleet/aircraft',$staff,$other)->assertStatus(201);
        $this->http('PATCH','/admin/fleet/aircraft/'.$id,$staff,['registration'=>$other['aircraft']['registration']])->assertStatus(409);
        $this->http('PATCH','/admin/fleet/aircraft/missing-layout',$staff,['model'=>'Synthetic'])->assertStatus(404);
        $this->http('PUT','/admin/fleet/seat-layouts/missing-layout',$staff,FleetCoordinator::defaultLayout())->assertStatus(404);
        $this->http('GET','/fleet/seat-layouts/missing-layout')->assertStatus(404);
        DB::statement('ALTER TABLE cache RENAME TO reference_test_unavailable_cache');
        try {
            foreach($cases as [$method,$path,$body]) { $this->http($method,$path,$staff,$body)->assertStatus(503); }
        } finally { DB::statement('ALTER TABLE reference_test_unavailable_cache RENAME TO cache'); }
        \Illuminate\Support\Facades\RateLimiter::for('reference',static fn($request)=>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(1)->by('reference:'.$request->ip()));
        foreach($cases as [$method,$path,$body]) {
            $headers=['REMOTE_ADDR'=>'2001:db8:'.bin2hex(random_bytes(2)).'::3'];
            $this->http($method,$path,$staff,$body,$headers);
            $this->http($method,$path,$staff,$body,$headers)->assertStatus(429)->assertHeader('Retry-After');
        }
    }

    private function race(array $inputs): array
    {
        $children = [];
        try {
            foreach ($inputs as $input) {
                $pipes = [];
                $process = proc_open([PHP_BINARY, base_path('tests/Feature/ReferenceFleet/concurrency-worker.php')],
                    [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes, base_path());
                if (!is_resource($process)) { throw new \RuntimeException('Worker unavailable.'); }
                stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
                $children[] = [$process,$pipes];
                fwrite($pipes[0], json_encode($input, JSON_THROW_ON_ERROR)."\n"); fflush($pipes[0]);
            }
            foreach ($children as [$process,$pipes]) { $this->assertSame('READY', $this->line($process,$pipes[1])); }
            foreach ($children as [$process,$pipes]) { fwrite($pipes[0], "GO\n"); fflush($pipes[0]); }
            $statuses = [];
            foreach ($children as [$process,$pipes]) { $statuses[] = (int) $this->line($process,$pipes[1]); }
            return $statuses;
        } finally {
            foreach ($children as [$process,$pipes]) {
                foreach ($pipes as $pipe) { fclose($pipe); }
                $deadline = microtime(true)+2;
                while (proc_get_status($process)['running'] && microtime(true)<$deadline) { usleep(10000); }
                if (proc_get_status($process)['running']) { proc_terminate($process,9); }
                proc_close($process);
            }
        }
    }

    private function line($process, $pipe): string
    {
        $deadline = microtime(true)+10; $buffer = '';
        do {
            $buffer .= fread($pipe,4096) ?: '';
            if (strlen($buffer)>4096) { throw new \RuntimeException('Worker output bound exceeded.'); }
            if (str_contains($buffer,"\n")) { return trim(explode("\n",$buffer,2)[0]); }
            if (!proc_get_status($process)['running']) { break; }
            usleep(10000);
        } while (microtime(true)<$deadline);
        throw new \RuntimeException('Worker deadline exceeded.');
    }
    public function test_mvp_consistent_snapshot_and_transactional_changed_receipts(): void
    {
        $staff = $this->staff(); $input = $this->input('mvp-receipt-aircraft');
        $this->http('POST', '/admin/fleet/aircraft', $staff, $input)->assertCreated();
        $before = (int) DB::table('reference_revision_control')->value('revision');
        $snapshot = $this->http('GET', '/fleet/snapshot')->assertOk()->json('data');
        $this->assertSame($before, $snapshot['revision']);
        $this->assertSame(app(FleetCoordinator::class)->aircraft(), $snapshot['aircraft']);
        foreach ($snapshot['aircraft'] as $plane) {
            $this->assertSame(app(FleetCoordinator::class)->layout($plane['id']), $snapshot['layouts'][$plane['id']]);
        }
        $this->http('PATCH', '/admin/fleet/aircraft/mvp-receipt-aircraft/receipt', $staff, ['model' => 'Updated synthetic model'])
            ->assertOk()->assertJsonPath('data.changed', true)->assertJsonPath('data.revision', $before + 1)
            ->assertJsonPath('data.aircraft.model', 'Updated synthetic model');
        $this->http('PATCH', '/admin/fleet/aircraft/mvp-receipt-aircraft/receipt', $staff, ['model' => 'Updated synthetic model'])
            ->assertOk()->assertJsonPath('data.changed', false)->assertJsonPath('data.revision', $before + 1);
        $layout = FleetCoordinator::defaultLayout(); $layout['extraLegroomRows'] = [1];
        $this->http('PUT', '/admin/fleet/seat-layouts/mvp-receipt-aircraft/receipt', $staff, $layout)
            ->assertOk()->assertJsonPath('data.changed', true)->assertJsonPath('data.revision', $before + 2)
            ->assertJsonPath('data.layout.extraLegroomRows', [1]);
        $this->http('PUT', '/admin/fleet/seat-layouts/mvp-receipt-aircraft/receipt', $staff, $layout)
            ->assertOk()->assertJsonPath('data.changed', false)->assertJsonPath('data.revision', $before + 2);
        $this->http('GET', '/fleet/snapshot')->assertOk()->assertJsonPath('data.revision', $before + 2)
            ->assertJsonPath('data.layouts.mvp-receipt-aircraft.extraLegroomRows', [1]);
        $this->assertSame($before + 2, DB::table('reference_revisions')->count());
        foreach ([['PATCH', '/admin/fleet/aircraft/mvp-receipt-aircraft/receipt', ['model' => 'New']],
            ['PUT', '/admin/fleet/seat-layouts/mvp-receipt-aircraft/receipt', $layout]] as [$method, $route, $body]) {
            $this->http($method, $route, [], $body)->assertStatus(401);
            $this->http($method, $route, $staff, $body, ['HTTP_X_CSRF_TOKEN' => 'wrong'])->assertStatus(403);
            $this->http($method, str_replace('mvp-receipt-aircraft', 'missing-mvp-aircraft', $route), $staff, $body)->assertStatus(404);
            $this->http($method, $route, $staff, ['injected' => true])->assertStatus(422);
        }
        $this->assertSame($before + 2, DB::table('reference_revision_control')->value('revision'));
    }

}
