<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPassengerProfile;

use App\Identity\Passenger\Profile\MealCatalogInterface;
use App\Support\RequestCorrelation;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityPassengerProfile\PassengerProfileTestHarness;
use Tests\Fixtures\IdentityPassengerProfile\TestMealCatalog;
use Tests\TestCase;

/**
 * Bounded contract capture test for the Phase 13B passenger profile HTTP lifecycle.
 *
 * Executes a single genuine HTTP lifecycle across all six passenger profile/traveler operations:
 * 1. GET /auth/passenger/profile (getPassengerProfile, 200)
 * 2. PUT /auth/passenger/profile (putPassengerProfile, 200)
 * 3. GET /auth/passenger/travelers (getSavedTravelers, 200)
 * 4. POST /auth/passenger/travelers (postSavedTraveler, 201)
 * 5. PATCH /auth/passenger/travelers/{id} (patchSavedTraveler, 200)
 * 6. DELETE /auth/passenger/travelers/{id} (deleteSavedTraveler, 200)
 *
 * Captures ONLY operationId, status, contentType, and rawResponseBody into an owned
 * private storage directory with mode 0700 and exclusive markers/files with mode 0600.
 */
final class PassengerProfileContractCaptureTest extends TestCase
{
    use PassengerProfileTestHarness;

    /** @var array<string, array{operationId: string, status: int, contentType: string, rawResponseBody: string}> */
    private array $capturedResponses = [];

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

    private function recordCapture(string $operationId, \Illuminate\Testing\TestResponse $response): void
    {
        $contentType = $response->headers->get('Content-Type') ?? 'application/json';
        $rawBody = (string) $response->getContent();

        // Strict invariant: captures ONLY operationId, status, contentType, rawResponseBody
        // Zero cookies, passwords, tokens, request bodies, or CSRF tokens
        $this->capturedResponses[$operationId] = [
            'operationId' => $operationId,
            'status' => $response->getStatusCode(),
            'contentType' => $contentType,
            'rawResponseBody' => $rawBody,
        ];
    }

    private function persistCaptures(): void
    {
        $this->assertDisposableDatabaseTarget();
        $parent = storage_path('app/private');
        if (is_link($parent) || (!is_dir($parent) && !mkdir($parent, 0700, true))) {
            throw new \RuntimeException('Private capture parent unavailable.');
        }
        $target = getenv('PASSENGER_PROFILE_CAPTURES_DIR') ?: $parent . '/passenger-profile-captures-' . Str::uuid();
        if (realpath(dirname($target)) !== realpath($parent)
            || !preg_match('/^passenger-profile-captures-[A-Za-z0-9-]{1,80}$/D', basename($target))
            || file_exists($target) || is_link($target)) {
            throw new \RuntimeException('Capture admission requires a new immediate private child.');
        }
        $mask = umask(0077);
        try {
            if (!mkdir($target, 0700)) {
                throw new \RuntimeException('Exclusive capture directory creation failed.');
            }
            $files = [
                '.exclusive_marker' => (string) Str::uuid(),
                'captures.json' => json_encode(array_values($this->capturedResponses), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
            ];
            foreach ($files as $name => $bytes) {
                $handle = fopen($target . '/' . $name, 'x');
                if ($handle === false) {
                    throw new \RuntimeException('Exclusive capture file creation failed.');
                }
                try {
                    if (fwrite($handle, $bytes) !== strlen($bytes) || !fflush($handle)) {
                        throw new \RuntimeException('Capture persistence failed.');
                    }
                } finally {
                    fclose($handle);
                }
                if (DIRECTORY_SEPARATOR === '/' && !chmod($target . '/' . $name, 0600)) {
                    throw new \RuntimeException('Capture permissions failed.');
                }
            }
            // Capture bodies are synthetic responses only; retain the owned directory for independent validation.
            fwrite(STDOUT, "\nPASSENGER_PROFILE_CAPTURES=" . $target . "\n");
        } finally {
            umask($mask);
        }
    }

    public function test_passenger_profile_six_operations_http_lifecycle_contract_capture(): void
    {
        // ---------------------------------------------------------------------
        // Bootstrap verified passenger fixture
        // ---------------------------------------------------------------------
        $user = $this->createTestUser();
        $profile = $this->createTestProfile($user->id, [
            'first_name' => 'Kareem',
            'last_name' => 'Al-Husseini',
            'phone' => '+970599112233',
            'seat_preference' => 'window',
            'meal_preference' => 'halal-standard',
            'newsletter' => true,
        ]);
        $session = $this->createTestSession($user->id);

        // ---------------------------------------------------------------------
        // 1. GET /auth/passenger/profile (getPassengerProfile, 200)
        // ---------------------------------------------------------------------
        $this->flushHeaders();
        $respGetProfile = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->bodyless('GET', '/api/v1/auth/passenger/profile', $this->passengerHeaders($session));

        $respGetProfile->assertStatus(200);
        $this->recordCapture('getPassengerProfile', $respGetProfile);

        // ---------------------------------------------------------------------
        // 2. PUT /auth/passenger/profile (putPassengerProfile, 200)
        // ---------------------------------------------------------------------
        $this->flushHeaders();
        $respPutProfile = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->putJson('/api/v1/auth/passenger/profile', [
                'firstName' => 'Kareem-Updated',
                'lastName' => 'Al-Husseini',
                'phone' => '+970599112233',
                'seatPreference' => 'aisle',
                'mealPreference' => 'halal-standard',
                'newsletter' => true,
            ]);

        $respPutProfile->assertStatus(200);
        $this->recordCapture('putPassengerProfile', $respPutProfile);

        // ---------------------------------------------------------------------
        // 3. GET /auth/passenger/travelers (getSavedTravelers, 200)
        // ---------------------------------------------------------------------
        $this->flushHeaders();
        $respGetTravelers = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->bodyless('GET', '/api/v1/auth/passenger/travelers', $this->passengerHeaders($session));

        $respGetTravelers->assertStatus(200);
        $this->recordCapture('getSavedTravelers', $respGetTravelers);

        // ---------------------------------------------------------------------
        // 4. POST /auth/passenger/travelers (postSavedTraveler, 201)
        // ---------------------------------------------------------------------
        $this->flushHeaders();
        $respPostTraveler = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->postJson('/api/v1/auth/passenger/travelers', [
                'firstName' => 'Yara',
                'lastName' => 'Al-Masri',
                'dob' => '1998-04-20',
                'nationality' => 'Palestinian',
                'document' => 'P98765432',
            ]);

        $respPostTraveler->assertStatus(201);
        $this->recordCapture('postSavedTraveler', $respPostTraveler);

        $travelerExternalId = (string) $respPostTraveler->json('data.id');
        $this->assertNotEmpty($travelerExternalId);

        // ---------------------------------------------------------------------
        // 5. PATCH /auth/passenger/travelers/{id} (patchSavedTraveler, 200)
        // ---------------------------------------------------------------------
        $this->flushHeaders();
        $respPatchTraveler = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->patchJson("/api/v1/auth/passenger/travelers/{$travelerExternalId}", [
                'firstName' => 'Yara-Patched',
                'nationality' => 'Palestinian',
            ]);

        $respPatchTraveler->assertStatus(200);
        $this->recordCapture('patchSavedTraveler', $respPatchTraveler);

        // ---------------------------------------------------------------------
        // 6. DELETE /auth/passenger/travelers/{id} (deleteSavedTraveler, 200)
        // ---------------------------------------------------------------------
        $this->flushHeaders();
        $respDeleteTraveler = $this->withHttps()
            ->withHeaders($this->passengerHeaders($session))
            ->bodyless('DELETE', "/api/v1/auth/passenger/travelers/{$travelerExternalId}", $this->passengerHeaders($session));

        $respDeleteTraveler->assertStatus(200);
        $this->recordCapture('deleteSavedTraveler', $respDeleteTraveler);

        // ---------------------------------------------------------------------
        // Verification & persistence
        // ---------------------------------------------------------------------
        $this->assertCount(6, $this->capturedResponses);

        $expectedOps = [
            'getPassengerProfile',
            'putPassengerProfile',
            'getSavedTravelers',
            'postSavedTraveler',
            'patchSavedTraveler',
            'deleteSavedTraveler',
        ];

        foreach ($expectedOps as $expectedOp) {
            $this->assertArrayHasKey($expectedOp, $this->capturedResponses);
        }

        $this->persistCaptures();
    }
}
