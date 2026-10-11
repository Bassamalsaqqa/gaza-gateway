<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassengerProfile;

use App\Identity\Passenger\Profile\SavedTravelerCoordinator;
use App\Support\RequestCorrelation;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Tests\Fixtures\IdentityPassengerProfile\PassengerProfileTestHarness;
use Tests\TestCase;

final class SavedTravelersOperationsTest extends TestCase
{
    use PassengerProfileTestHarness;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPassengerProfileHarness();
    }

    protected function tearDown(): void
    {
        $this->flushHeaders();
        $this->tearDownPassengerProfileHarness();
        parent::tearDown();
    }

    /**
     * Positive: GET /auth/passenger/travelers returns 200 with list of companion travelers.
     */
    public function test_get_saved_travelers_returns_list_with_decrypted_documents(): void
    {
        $user = $this->createTestUser();
        $t1 = $this->createTestTraveler($user->id, [
            'first_name' => 'Nour',
            'last_name' => 'Al-Husseini',
            'dob' => '1995-07-12',
            'nationality' => 'Palestinian',
            'document' => 'PASSPORT-112233',
        ]);
        $t2 = $this->createTestTraveler($user->id, [
            'first_name' => 'Tariq',
            'last_name' => 'Al-Husseini',
            'dob' => '2001-11-05',
            'nationality' => 'Palestinian',
            'document' => 'PASSPORT-445566',
        ]);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/travelers');

        $response->assertStatus(200);
        $response->assertHeader('Cache-Control', 'no-store, private');
        $this->assertTrue(RequestCorrelation::isValidUuid($response->headers->get('X-Request-Id')));

        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertCount(2, $json['data']);

        $itemsById = array_column($json['data'], null, 'id');
        $item1 = $itemsById[$t1->external_id];
        $this->assertSame($t1->external_id, $item1['id']);
        $this->assertStringStartsWith('trv-', $item1['id']);
        $this->assertSame('Nour', $item1['firstName']);
        $this->assertSame('1995-07-12', $item1['dob']);
        $this->assertSame('PASSPORT-112233', $item1['document']);

        // Verify audit event
        $audit = DB::table('audit_events')
            ->where('passenger_id', $user->id)
            ->where('action', 'getSavedTravelers')
            ->first();
        $this->assertNotNull($audit);
        $metadata = json_decode((string) $audit->metadata, true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame(2, $metadata['count'] ?? 0);
    }

    /**
     * Decryption integrity: Decryption failure does not silently blank data; fails closed with generic integrity error.
     */
    public function test_get_saved_travelers_fails_closed_on_document_decryption_failure(): void
    {
        $user = $this->createTestUser();
        $traveler = $this->createTestTraveler($user->id, [
            'first_name' => 'Nour',
            'document' => 'PASSPORT-112233',
        ]);
        $session = $this->createTestSession($user->id);

        // Corrupt encrypted document in database
        DB::table('saved_travelers')
            ->where('id', $traveler->id)
            ->update(['encrypted_document' => 'corrupted_ciphertext_tampered_payload']);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/travelers');

        $response->assertStatus(500);
        $this->assertSame('internal_error', $response->json('error.code'));

        // Verify data was NOT purged or blanked
        $row = DB::table('saved_travelers')->where('id', $traveler->id)->first();
        $this->assertSame('corrupted_ciphertext_tampered_payload', $row->encrypted_document);
    }

    /**
     * Empty list: User with no travelers returns 200 with empty data array.
     */
    public function test_get_saved_travelers_empty_list_for_new_user(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/travelers');

        $response->assertStatus(200);
        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertSame([], $json['data']);
    }

    /**
     * Positive: POST /auth/passenger/travelers creates traveler with stable server-allocated trv- ID.
     */
    public function test_post_saved_traveler_creates_record_with_stable_opaque_id_and_encrypted_document(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->postJson('/api/v1/auth/passenger/travelers', [
                'firstName' => 'Mona',
                'lastName' => 'Al-Shawwa',
                'dob' => '1990-03-25',
                'nationality' => 'Palestinian',
                'document' => 'DOC-PRIVATE-SECRET-1234',
            ]);

        $response->assertStatus(201);
        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertStringStartsWith('trv-', $json['data']['id']);
        $this->assertSame('Mona', $json['data']['firstName']);
        $this->assertSame('Al-Shawwa', $json['data']['lastName']);
        $this->assertSame('1990-03-25', $json['data']['dob']);
        $this->assertSame('DOC-PRIVATE-SECRET-1234', $json['data']['document']);

        // Verify storage: document is encrypted at rest and DB id is a UUID
        $dbRow = DB::table('saved_travelers')
            ->where('owner_user_id', $user->id)
            ->where('external_id', $json['data']['id'])
            ->first();

        $this->assertNotNull($dbRow);
        $this->assertTrue(RequestCorrelation::isValidUuid($dbRow->id));
        $this->assertNotSame($json['data']['id'], $dbRow->id);
        $this->assertNotSame('DOC-PRIVATE-SECRET-1234', $dbRow->encrypted_document);

        /** @var Encrypter $encrypter */
        $encrypter = $this->app->make(Encrypter::class);
        $this->assertSame('DOC-PRIVATE-SECRET-1234', $encrypter->decrypt($dbRow->encrypted_document));

        // Track for cleanup
        $this->trackedTravelerIds[] = $dbRow->id;

        // Verify audit event
        $audit = DB::table('audit_events')
            ->where('passenger_id', $user->id)
            ->where('action', 'postSavedTraveler')
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame('saved_traveler', $audit->target_type);
        $this->assertSame($dbRow->id, $audit->target_id);
    }

    /**
     * Single-name support: Traveler with only firstName or only lastName is permitted.
     */
    public function test_post_saved_traveler_single_name_support(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        // 1. Only firstName
        $resFirstOnly = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->postJson('/api/v1/auth/passenger/travelers', [
                'firstName' => 'Fatima',
                'lastName' => '',
            ]);
        $resFirstOnly->assertStatus(201);
        $this->assertSame('Fatima', $resFirstOnly->json('data.firstName'));
        $this->assertSame('', $resFirstOnly->json('data.lastName'));

        $this->flushHeaders();

        // 2. Only lastName
        $resLastOnly = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->postJson('/api/v1/auth/passenger/travelers', [
                'firstName' => '',
                'lastName' => 'Al-Najjar',
            ]);
        $resLastOnly->assertStatus(201);
        $this->assertSame('', $resLastOnly->json('data.firstName'));
        $this->assertSame('Al-Najjar', $resLastOnly->json('data.lastName'));
    }

    /**
     * Negative: Traveler with both names empty is rejected (422).
     */
    public function test_post_saved_traveler_rejects_empty_names(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->postJson('/api/v1/auth/passenger/travelers', [
                'firstName' => '   ',
                'lastName' => '',
            ]);

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));
    }

    /**
     * Empty DOB: Empty string maps to nullable database DATE and back to empty string.
     */
    public function test_post_saved_traveler_empty_dob_maps_to_null(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->postJson('/api/v1/auth/passenger/travelers', [
                'firstName' => 'Kareem',
                'dob' => '',
            ]);

        $response->assertStatus(201);
        $this->assertSame('', $response->json('data.dob'));

        $dbRow = DB::table('saved_travelers')
            ->where('owner_user_id', $user->id)
            ->where('external_id', $response->json('data.id'))
            ->first();
        $this->assertNull($dbRow->dob);
    }

    /**
     * Negative: Invalid Gregorian calendar date (e.g. 2026-02-30) rejected (422).
     */
    public function test_post_saved_traveler_rejects_invalid_gregorian_calendar_date(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->postJson('/api/v1/auth/passenger/travelers', [
                'firstName' => 'Tareq',
                'dob' => '2026-02-30',
            ]);

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));
    }

    /**
     * Negative: Forbidden aliases (dateOfBirth, passport, etc.) rejected (422).
     */
    public function test_post_saved_traveler_rejects_forbidden_aliases(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->postJson('/api/v1/auth/passenger/travelers', [
                'firstName' => 'Samir',
                'dateOfBirth' => '1992-05-10',
            ]);

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));
    }

    /**
     * Merge fidelity: PATCH merges with current record and preserves single name.
     */
    public function test_identical_document_patch_preserves_ciphertext_timestamp_and_noop_audit_version(): void
    {
        config(['cors.allowed_origins' => ['http://localhost:3000']]);
        $user = $this->createTestUser(); $session = $this->createTestSession($user->id);
        $traveler = $this->createTestTraveler($user->id, ['first_name' => 'Nour', 'document' => 'SYNTHETIC-DOCUMENT-123']);
        $original = DB::table('saved_travelers')->where('id', $traveler->id)->first();
        for ($i = 0; $i < 2; $i++) {
            $this->flushHeaders();
            $response = $this->withServerVariables($this->secureServerVariables())->withHeaders($this->passengerHeaders($session))
                ->patchJson('/api/v1/auth/passenger/travelers/' . $traveler->external_id, ['document' => 'SYNTHETIC-DOCUMENT-123']);
            $response->assertStatus(200)->assertJsonPath('data.document', 'SYNTHETIC-DOCUMENT-123');
            $current = DB::table('saved_travelers')->where('id', $traveler->id)->first();
            $this->assertSame($original->encrypted_document, $current->encrypted_document);
            $this->assertSame($original->updated_at, $current->updated_at);
        }
        $events = DB::table('audit_events')->where('target_id', $traveler->id)->where('action', 'patchSavedTraveler')->get();
        $this->assertCount(2, $events);
        foreach ($events as $event) { $this->assertSame(1, json_decode($event->metadata, true, 32, JSON_THROW_ON_ERROR)['version']); }
        DB::table('saved_travelers')->where('id', $traveler->id)->update(['encrypted_document' => 'synthetic-corrupt-ciphertext']);
        $this->flushHeaders();
        $this->withServerVariables($this->secureServerVariables())->withHeaders($this->passengerHeaders($session))
            ->patchJson('/api/v1/auth/passenger/travelers/' . $traveler->external_id, ['document' => 'SYNTHETIC-DOCUMENT-123'])
            ->assertStatus(500)->assertJsonPath('error.code', 'internal_error');
        $this->assertSame('synthetic-corrupt-ciphertext', DB::table('saved_travelers')->where('id', $traveler->id)->value('encrypted_document'));
    }

    public function test_patch_saved_traveler_merges_names_and_preserves_single_name(): void
    {
        $user = $this->createTestUser();
        $traveler = $this->createTestTraveler($user->id, [
            'first_name' => 'Lina',
            'last_name' => '',
            'dob' => '1994-06-15',
        ]);
        $session = $this->createTestSession($user->id);

        // Patch only adding a lastName
        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->patchJson("/api/v1/auth/passenger/travelers/{$traveler->external_id}", [
                'lastName' => 'Al-Kurd',
            ]);

        $response->assertStatus(200);
        $json = $response->json();
        $this->assertSame('Lina', $json['data']['firstName']);
        $this->assertSame('Al-Kurd', $json['data']['lastName']);
        $this->assertSame('1994-06-15', $json['data']['dob']);
    }

    /**
     * Negative: PATCH attempting to purge both names fails with 422.
     */
    public function test_patch_saved_traveler_rejects_purging_all_names(): void
    {
        $user = $this->createTestUser();
        $traveler = $this->createTestTraveler($user->id, [
            'first_name' => 'Rami',
            'last_name' => '',
        ]);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->patchJson("/api/v1/auth/passenger/travelers/{$traveler->external_id}", [
                'firstName' => '',
                'lastName' => '',
            ]);

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));
    }

    /**
     * Negative: Injected ID in PATCH body is rejected.
     */
    public function test_patch_saved_traveler_rejects_id_in_body(): void
    {
        $user = $this->createTestUser();
        $traveler = $this->createTestTraveler($user->id);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->patchJson("/api/v1/auth/passenger/travelers/{$traveler->external_id}", [
                'id' => 'trv-injected-id',
                'firstName' => 'Attempt',
            ]);

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));
    }

    /**
     * Negative: PATCH on nonexistent traveler returns canonical 404 not_found.
     */
    public function test_patch_saved_traveler_nonexistent_returns_404(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->patchJson('/api/v1/auth/passenger/travelers/trv-nonexistent-999', [
                'firstName' => 'Update',
            ]);

        $response->assertStatus(404);
        $this->assertSame('not_found', $response->json('error.code'));
    }

    /**
     * Positive: DELETE /auth/passenger/travelers/{id} deletes record and returns honest receipt.
     */
    public function test_delete_saved_traveler_deletes_record_and_returns_receipt(): void
    {
        $user = $this->createTestUser();
        $traveler = $this->createTestTraveler($user->id);
        $session = $this->createTestSession($user->id);

        $response = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->bodyless('DELETE', "/api/v1/auth/passenger/travelers/{$traveler->external_id}", $this->passengerHeaders($session));

        $response->assertStatus(200);
        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertTrue($json['data']['deleted']);

        // Verify record gone from DB
        $exists = DB::table('saved_travelers')->where('id', $traveler->id)->exists();
        $this->assertFalse($exists);

        // Verify audit event
        $audit = DB::table('audit_events')
            ->where('passenger_id', $user->id)
            ->where('action', 'deleteSavedTraveler')
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame($traveler->id, $audit->target_id);
    }

    /**
     * Negative: DELETE on nonexistent traveler returns canonical 404 not_found.
     */
    public function test_delete_saved_traveler_nonexistent_returns_404(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        $response = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->bodyless('DELETE', '/api/v1/auth/passenger/travelers/trv-missing-uuid', $this->passengerHeaders($session));

        $response->assertStatus(404);
        $this->assertSame('not_found', $response->json('error.code'));
    }

    /**
     * Negative: GET /auth/passenger/travelers rejects unexpected request body with 422.
     */
    public function test_get_saved_travelers_rejects_unexpected_request_body(): void
    {
        $user = $this->createTestUser();
        $session = $this->createTestSession($user->id);

        $response = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->call(
                'GET',
                '/api/v1/auth/passenger/travelers',
                [],
                [],
                [],
                $this->transformHeadersToServerVars($this->passengerHeaders($session)),
                '{"unexpected":"body"}'
            );

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));
    }

    /**
     * Negative: DELETE /auth/passenger/travelers/{id} rejects unexpected request body with 422.
     */
    public function test_delete_saved_traveler_rejects_unexpected_request_body(): void
    {
        $user = $this->createTestUser();
        $traveler = $this->createTestTraveler($user->id);
        $session = $this->createTestSession($user->id);

        $response = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->call(
                'DELETE',
                "/api/v1/auth/passenger/travelers/{$traveler->external_id}",
                [],
                [],
                [],
                $this->transformHeadersToServerVars($this->passengerHeaders($session)),
                '{"unexpected":"body"}'
            );

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));
    }

    /**
     * Negative: DELETE /auth/passenger/travelers/{id} missing CSRF token is denied with 403.
     */
    public function test_delete_saved_traveler_denies_missing_csrf_token(): void
    {
        $user = $this->createTestUser();
        $traveler = $this->createTestTraveler($user->id);
        $session = $this->createTestSession($user->id);

        $headers = $this->passengerHeaders($session);
        unset($headers['X-CSRF-TOKEN']);

        $response = $this->withHttps()
            ->withHeaders($headers)
            ->bodyless('DELETE', "/api/v1/auth/passenger/travelers/{$traveler->external_id}", $headers);

        $response->assertStatus(403);
        $this->assertSame('csrf_missing', $response->json('error.code'));
    }

    /**
     * Negative: DELETE /auth/passenger/travelers/{id} with mismatched credential epoch is denied with 401.
     */
    public function test_delete_saved_traveler_denies_mismatched_credential_epoch(): void
    {
        $user = $this->createTestUser(credentialEpoch: 1);
        $traveler = $this->createTestTraveler($user->id);
        $session = $this->createTestSession($user->id, credentialEpoch: 1);

        DB::table('users')->where('id', $user->id)->update(['credential_epoch' => 2]);

        $response = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->bodyless('DELETE', "/api/v1/auth/passenger/travelers/{$traveler->external_id}", $this->passengerHeaders($session));

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    /**
     * Negative: PATCH /auth/passenger/travelers/{id} missing CSRF token is denied with 403.
     */
    public function test_patch_saved_traveler_denies_missing_csrf_token(): void
    {
        $user = $this->createTestUser();
        $traveler = $this->createTestTraveler($user->id);
        $session = $this->createTestSession($user->id);

        $headers = $this->passengerHeaders($session);
        unset($headers['X-CSRF-TOKEN']);

        $response = $this->withHttps()
            ->withHeaders($headers)
            ->patchJson("/api/v1/auth/passenger/travelers/{$traveler->external_id}", [
                'firstName' => 'UpdatedName',
            ]);

        $response->assertStatus(403);
        $this->assertSame('csrf_missing', $response->json('error.code'));
    }

    /**
     * Negative: PATCH /auth/passenger/travelers/{id} with mismatched credential epoch is denied with 401.
     */
    public function test_patch_saved_traveler_denies_mismatched_credential_epoch(): void
    {
        $user = $this->createTestUser(credentialEpoch: 1);
        $traveler = $this->createTestTraveler($user->id);
        $session = $this->createTestSession($user->id, credentialEpoch: 1);

        DB::table('users')->where('id', $user->id)->update(['credential_epoch' => 2]);

        $response = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->patchJson("/api/v1/auth/passenger/travelers/{$traveler->external_id}", [
                'firstName' => 'UpdatedName',
            ]);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }
}
