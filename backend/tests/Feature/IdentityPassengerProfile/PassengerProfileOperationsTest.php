<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassengerProfile;

use App\Identity\Passenger\Profile\MealCatalogInterface;
use App\Identity\Passenger\Profile\UnconfiguredMealCatalog;
use App\Support\RequestCorrelation;
use Illuminate\Support\Facades\DB;
use Tests\Fixtures\IdentityPassengerProfile\PassengerProfileTestHarness;
use Tests\Fixtures\IdentityPassengerProfile\TestMealCatalog;
use Tests\TestCase;

final class PassengerProfileOperationsTest extends TestCase
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
     * Positive: GET /auth/passenger/profile returns 200 with canonical PassengerProfileResponse.
     */
    public function test_get_passenger_profile_returns_200_with_canonical_response(): void
    {
        $user = $this->createTestUser();
        $profile = $this->createTestProfile($user->id, [
            'first_name' => 'Basel',
            'last_name' => 'Al-Ashi',
            'phone' => '+970599445566',
            'seat_preference' => 'window',
            'meal_preference' => 'halal-standard',
            'newsletter' => true,
        ]);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/profile');

        $response->assertStatus(200);
        $response->assertHeader('Cache-Control', 'no-store, private');
        $this->assertTrue(RequestCorrelation::isValidUuid($response->headers->get('X-Request-Id')));

        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertSame($user->email, $json['data']['email']);
        $this->assertSame('Basel', $json['data']['firstName']);
        $this->assertSame('Al-Ashi', $json['data']['lastName']);
        $this->assertSame('+970599445566', $json['data']['phone']);
        $this->assertSame('window', $json['data']['seatPreference']);
        $this->assertSame('halal-standard', $json['data']['mealPreference']);
        $this->assertTrue($json['data']['newsletter']);

        $this->assertTrue(RequestCorrelation::isValidUuid($json['meta']['requestId']));
        $this->assertNotEmpty($json['meta']['timestamp']);

        // Verify append-only audit event recorded
        $audit = DB::table('audit_events')
            ->where('passenger_id', $user->id)
            ->where('action', 'getPassengerProfile')
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame('success', $audit->outcome);
        $this->assertSame('user', $audit->target_type);
    }

    /**
     * Semantic fallback: Missing/null DB preferences map to wire defaults 'none' and 'standard'.
     */
    public function test_get_passenger_profile_maps_null_preferences_to_defaults(): void
    {
        $user = $this->createTestUser();
        $profile = $this->createTestProfile($user->id, [
            'first_name' => '',
            'last_name' => '',
            'phone' => '',
            'seat_preference' => null,
            'meal_preference' => null,
            'newsletter' => false,
        ]);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/profile');

        $response->assertStatus(200);
        $json = $response->json();
        $this->assertSame('none', $json['data']['seatPreference']);
        $this->assertSame('standard', $json['data']['mealPreference']);
        $this->assertSame('', $json['data']['firstName']);
        $this->assertSame('', $json['data']['lastName']);
        $this->assertSame('', $json['data']['phone']);
        $this->assertFalse($json['data']['newsletter']);
    }

    /**
     * Preservation: Unchanged retired meal preference in DB survives profile reads without change.
     */
    public function test_get_passenger_profile_preserves_retired_meal_preference(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id, [
            'meal_preference' => 'retired-flight-meal-1998',
        ]);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/profile');

        $response->assertStatus(200);
        $this->assertSame('retired-flight-meal-1998', $response->json('data.mealPreference'));
    }

    /**
     * Safe integrity error: Missing profile row returns 500 internal_error, never implicit user creation.
     */
    public function test_get_passenger_profile_fails_if_profile_missing_integrity_error(): void
    {
        $user = $this->createTestUser();
        // Notice: do NOT create profile row
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->get('/api/v1/auth/passenger/profile');

        $response->assertStatus(500);
        $json = $response->json();
        $this->assertFalse($json['success']);
        $this->assertSame('internal_error', $json['error']['code']);
    }

    /**
     * Positive: PUT /auth/passenger/profile updates fields and returns exact PassengerProfileReceiptResponse.
     */
    public function test_put_passenger_profile_updates_fields_and_returns_receipt(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id, [
            'first_name' => 'OldFirst',
            'last_name' => 'OldLast',
            'phone' => '+970599000000',
            'seat_preference' => 'none',
            'meal_preference' => 'standard',
            'newsletter' => false,
        ]);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'firstName' => 'NewFirst',
                'lastName' => 'NewLast',
                'phone' => '+970599999999',
                'seatPreference' => 'window',
                'newsletter' => true,
            ]);

        $response->assertStatus(200);
        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertTrue($json['data']['changed']);
        $this->assertSame('NewFirst', $json['data']['account']['firstName']);
        $this->assertSame('NewLast', $json['data']['account']['lastName']);
        $this->assertSame('+970599999999', $json['data']['account']['phone']);
        $this->assertSame('window', $json['data']['account']['seatPreference']);
        $this->assertTrue($json['data']['account']['newsletter']);
        $this->assertSame($user->email, $json['data']['account']['email']);

        // Verify DB state updated
        $updated = DB::table('passenger_profiles')->where('user_id', $user->id)->first();
        $this->assertSame('NewFirst', $updated->first_name);
        $this->assertSame('NewLast', $updated->last_name);
        $this->assertSame('+970599999999', $updated->phone);
        $this->assertSame('window', $updated->seat_preference);
        $this->assertTrue((bool) $updated->newsletter);

        // Verify audit event
        $audit = DB::table('audit_events')
            ->where('passenger_id', $user->id)
            ->where('action', 'putPassengerProfile')
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame('success', $audit->outcome);
    }

    /**
     * Honest receipt: No-op update returns changed=false.
     */
    public function test_put_passenger_profile_noop_returns_changed_false(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id, [
            'first_name' => 'SameFirst',
            'last_name' => 'SameLast',
            'phone' => '+970599111111',
            'seat_preference' => 'aisle',
            'meal_preference' => 'standard',
            'newsletter' => true,
        ]);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'firstName' => 'SameFirst',
                'lastName' => 'SameLast',
                'phone' => '+970599111111',
                'seatPreference' => 'aisle',
                'newsletter' => true,
            ]);

        $response->assertStatus(200);
        $json = $response->json();
        $this->assertFalse($json['data']['changed']);
    }

    /**
     * Immutability negative: Email in profile update is rejected (422 validation_error).
     */
    public function test_put_passenger_profile_rejects_email_in_body(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'email' => 'new_injected@example.com',
                'firstName' => 'Hacker',
            ]);

        $response->assertStatus(422);
        $json = $response->json();
        $this->assertFalse($json['success']);
        $this->assertSame('validation_error', $json['error']['code']);

        // Verify DB email remains unchanged
        $dbUser = DB::table('users')->where('id', $user->id)->first();
        $this->assertSame($user->email, $dbUser->email);
    }

    /**
     * Immutability negative: Injected security identifiers rejected.
     */
    public function test_put_passenger_profile_rejects_identity_ids_in_body(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'id' => (string) \Illuminate\Support\Str::uuid(),
                'firstName' => 'Hacker',
            ]);

        $response->assertStatus(422);
        $this->assertSame('validation_error', $response->json('error.code'));
    }

    /**
     * Meal boundary: With unconfigured meal catalog, genuinely changed mealPreference fails 503 BEFORE write.
     */
    public function test_put_passenger_profile_with_unconfigured_meal_catalog_fails_503_before_write(): void
    {
        $this->app->instance(MealCatalogInterface::class, new UnconfiguredMealCatalog());

        $user = $this->createTestUser();
        $this->createTestProfile($user->id, [
            'meal_preference' => 'standard',
        ]);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'mealPreference' => 'gluten-free-gourmet',
                'firstName' => 'ShouldNotBeWritten',
            ]);

        $response->assertStatus(503);
        $json = $response->json();
        $this->assertFalse($json['success']);
        $this->assertSame('service_unavailable', $json['error']['code']);

        // Verify fail-closed: NO database write occurred
        $dbProfile = DB::table('passenger_profiles')->where('user_id', $user->id)->first();
        $this->assertSame('standard', $dbProfile->meal_preference);
        $this->assertNotSame('ShouldNotBeWritten', $dbProfile->first_name);
    }

    /**
     * Meal boundary: Unchanged retired meal succeeds without catalog check.
     */
    public function test_put_passenger_profile_unchanged_retired_meal_succeeds_without_catalog(): void
    {
        $this->app->instance(MealCatalogInterface::class, new UnconfiguredMealCatalog());

        $user = $this->createTestUser();
        $this->createTestProfile($user->id, [
            'meal_preference' => 'historical-meal-1998',
            'phone' => '+970599000000',
        ]);
        $session = $this->createTestSession($user->id);

        $response = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'mealPreference' => 'historical-meal-1998',
                'phone' => '+970599111222',
            ]);

        $response->assertStatus(200);
        $json = $response->json();
        $this->assertTrue($json['data']['changed']);
        $this->assertSame('historical-meal-1998', $json['data']['account']['mealPreference']);
        $this->assertSame('+970599111222', $json['data']['account']['phone']);
    }

    /**
     * Deterministic injection: Active catalog allows valid meal update and rejects inactive meal (422).
     */
    public function test_put_passenger_profile_with_test_meal_catalog(): void
    {
        $testCatalog = new TestMealCatalog(available: true, activeMealIds: ['halal-standard', 'vegetarian']);
        $this->app->instance(MealCatalogInterface::class, $testCatalog);

        $user = $this->createTestUser();
        $this->createTestProfile($user->id, ['meal_preference' => 'halal-standard']);
        $session = $this->createTestSession($user->id);

        // 1. Valid active meal update succeeds
        $resValid = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'mealPreference' => 'vegetarian',
            ]);

        $resValid->assertStatus(200);
        $this->assertSame('vegetarian', $resValid->json('data.account.mealPreference'));

        // Flush headers between cases
        $this->flushHeaders();

        // 2. Inactive/unknown meal update fails with 422
        $resInvalid = $this->withServerVariables($this->secureServerVariables())
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'mealPreference' => 'caviar-unsupported',
            ]);

        $resInvalid->assertStatus(422);
        $this->assertSame('validation_error', $resInvalid->json('error.code'));
    }

    /**
     * Negative: PUT /auth/passenger/profile with mismatched credential epoch is denied with 401.
     */
    public function test_put_passenger_profile_denies_mismatched_credential_epoch(): void
    {
        $user = $this->createTestUser(credentialEpoch: 1);
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id, credentialEpoch: 1);

        DB::table('users')->where('id', $user->id)->update(['credential_epoch' => 2]);

        $response = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'firstName' => 'UpdatedKareem',
            ]);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }

    /**
     * Negative: PUT /auth/passenger/profile with revoked session is denied with 401.
     */
    public function test_put_passenger_profile_denies_revoked_session(): void
    {
        $user = $this->createTestUser();
        $this->createTestProfile($user->id);
        $session = $this->createTestSession($user->id);

        DB::table('passenger_sessions')
            ->where('id', $session['sessionId'])
            ->update(['revoked_at' => \Carbon\CarbonImmutable::now()->toIso8601String()]);

        $response = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'firstName' => 'UpdatedKareem',
            ]);

        $response->assertStatus(401);
        $this->assertSame('unauthorized', $response->json('error.code'));
    }
}
