<?php

declare(strict_types=1);

namespace Tests\Feature\MvpReservations;

use App\Identity\Password\Argon2idPasswordHasher;
use App\Identity\Sessions\PassengerSessionStore;
use App\Mvp\Reservations\ReservationTripCommand;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class ReservationTripTest extends TestCase
{
    private static ?string $passengerHash = null;

    protected function setUp(): void
    {
        if (getenv('MVP_RESERVATIONS_GATE_OWNED') !== '1' || getenv('REFERENCE_GATE_OWNED') !== '1') {
            throw new \RuntimeException('Reservation tests require the disposable reservation gate.');
        }

        parent::setUp();

        DB::beginTransaction();

        config([
            'reservations.enabled' => true,
            'reservations.authority' => 'resolver',
        ]);

        // Asserts actual routes are registered by coordinator via backend/routes/reservations.php
        self::assertTrue(Route::has('postReservationTrip'), 'Route postReservationTrip must be registered in reservations.php');
        self::assertTrue(Route::has('postGuestReservationTrip'), 'Route postGuestReservationTrip must be registered in reservations.php');

        DB::transaction(function (): void {
            DB::table('airports')->updateOrInsert(['code' => 'GZA'], [
                'airport_name_en' => 'Gaza International Airport',
                'airport_name_ar' => 'مطار غزة الدولي',
                'city_en' => 'Gaza',
                'city_ar' => 'غزة',
                'country_en' => 'Palestine',
                'country_ar' => 'فلسطين',
                'timezone' => 'Asia/Gaza',
                'block_minutes' => 55,
                'active' => true,
            ]);

            DB::table('airports')->updateOrInsert(['code' => 'AMM'], [
                'airport_name_en' => 'Queen Alia International Airport',
                'airport_name_ar' => 'مطار الملكة علياء الدولي',
                'city_en' => 'Amman',
                'city_ar' => 'عمان',
                'country_en' => 'Jordan',
                'country_ar' => 'الأردن',
                'timezone' => 'Asia/Amman',
                'block_minutes' => 55,
                'active' => true,
            ]);

            if (!DB::table('aircraft')->where('id', 'ac-b738-1')->exists()) {
                DB::table('aircraft')->insert([
                    'id' => 'ac-b738-1',
                    'model' => 'Boeing 737-800',
                    'registration_normalized' => 'T-MVPG',
                    'active' => true,
                    'rows' => 28,
                    'letters_json' => json_encode(['A', 'B', 'C', 'D', 'E', 'F'], JSON_THROW_ON_ERROR),
                    'aisle_after' => 3,
                    'zones_json' => json_encode([['id' => 'economy', 'firstRow' => 1, 'lastRow' => 28]], JSON_THROW_ON_ERROR),
                    'extra_legroom_rows_json' => json_encode([], JSON_THROW_ON_ERROR),
                    'unavailable_json' => json_encode([], JSON_THROW_ON_ERROR),
                ]);
            }

            // Standard Outbound schedule: GZA -> AMM (direction: out)
            DB::table('schedules')->updateOrInsert(['id' => 'trip-curated-flight'], [
                'number' => 'PS100',
                'direction' => 'out',
                'destination' => 'AMM',
                'days_json' => '[0,1,2,3,4,5,6]',
                'depart_time' => '08:00',
                'arrive_time' => '09:00',
                'aircraft' => 'Boeing 737-800',
                'aircraft_id' => 'ac-b738-1',
                'from_date' => '2026-01-01',
                'until_date' => '2027-12-31',
                'active' => true,
                'exceptions_json' => '[]',
            ]);

            // Standard Return schedule: AMM -> GZA (direction: in)
            DB::table('schedules')->updateOrInsert(['id' => 'trip-curated-return-flight'], [
                'number' => 'PS101',
                'direction' => 'in',
                'destination' => 'AMM',
                'days_json' => '[0,1,2,3,4,5,6]',
                'depart_time' => '14:00',
                'arrive_time' => '15:00',
                'aircraft' => 'Boeing 737-800',
                'aircraft_id' => 'ac-b738-1',
                'from_date' => '2026-01-01',
                'until_date' => '2027-12-31',
                'active' => true,
                'exceptions_json' => '[]',
            ]);

            // Same-direction schedule (for non-opposite test)
            DB::table('schedules')->updateOrInsert(['id' => 'trip-curated-flight-dup'], [
                'number' => 'PS102',
                'direction' => 'out',
                'destination' => 'AMM',
                'days_json' => '[0,1,2,3,4,5,6]',
                'depart_time' => '16:00',
                'arrive_time' => '17:00',
                'aircraft' => 'Boeing 737-800',
                'aircraft_id' => 'ac-b738-1',
                'from_date' => '2026-01-01',
                'until_date' => '2027-12-31',
                'active' => true,
                'exceptions_json' => '[]',
            ]);

            // Timezone boundary specimen: Outbound AMM -> GZA midnight (direction: in, destination: AMM)
            DB::table('schedules')->updateOrInsert(['id' => 'trip-amm-gza-midnight'], [
                'number' => 'PS201',
                'direction' => 'in',
                'destination' => 'AMM',
                'days_json' => '[0,1,2,3,4,5,6]',
                'depart_time' => '00:00',
                'arrive_time' => '00:55',
                'aircraft' => 'Boeing 737-800',
                'aircraft_id' => 'ac-b738-1',
                'from_date' => '2026-01-01',
                'until_date' => '2027-12-31',
                'active' => true,
                'exceptions_json' => '[]',
            ]);

            // Timezone boundary specimen: Return GZA -> AMM late night (direction: out, destination: AMM)
            DB::table('schedules')->updateOrInsert(['id' => 'trip-gza-amm-late'], [
                'number' => 'PS202',
                'direction' => 'out',
                'destination' => 'AMM',
                'days_json' => '[0,1,2,3,4,5,6]',
                'depart_time' => '23:59',
                'arrive_time' => '01:54',
                'aircraft' => 'Boeing 737-800',
                'aircraft_id' => 'ac-b738-1',
                'from_date' => '2026-01-01',
                'until_date' => '2027-12-31',
                'active' => true,
                'exceptions_json' => '[]',
            ]);

            if (!DB::table('meal_options')->where('id', 'meal-standard')->exists()) {
                DB::table('meal_options')->insert([
                    'id' => 'meal-standard',
                    'label_en' => 'Standard Meal',
                    'label_ar' => 'وجبة قياسية',
                    'active' => true,
                    'order_num' => 0,
                ]);
            }
        });
    }

    protected function tearDown(): void
    {
        while (DB::transactionLevel() > 0) {
            DB::rollBack();
        }
        parent::tearDown();
    }

    private function passenger(string $status = 'active', bool $verified = true): array
    {
        $id = (string) Str::uuid();
        self::$passengerHash ??= app(Argon2idPasswordHasher::class)->hash('Synthetic-passenger-pass-2026', 'passenger');

        DB::table('users')->insert([
            'id' => $id,
            'email' => 'passenger-' . $id . '@example.invalid',
            'password_hash' => self::$passengerHash,
            'status' => $status,
            'credential_epoch' => 1,
            'email_verified_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        DB::table('passenger_profiles')->insert([
            'user_id' => $id,
            'first_name' => 'Amina',
            'last_name' => 'Al-Saqqa',
            'phone' => '+970599000000',
            'seat_preference' => 'window',
            'meal_preference' => 'standard',
            'newsletter' => true,
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            'updated_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        $receipt = app(PassengerSessionStore::class)->issueFull($id, 1);
        if (!$verified) {
            DB::table('users')->where('id', $id)->update(['email_verified_at' => null]);
        }

        return [
            'owner' => $id,
            'id' => $receipt->sessionId,
            'cookie' => $receipt->getRawToken(),
            'csrf' => $receipt->getCsrfToken(),
        ];
    }

    private function guest(): array
    {
        $receipt = app(PassengerSessionStore::class)->issueAnonymous();
        return [
            'id' => $receipt->sessionId,
            'cookie' => $receipt->getRawToken(),
            'csrf' => $receipt->getCsrfToken(),
        ];
    }

    private function verifyGuestEmail(array $session, string $email): void
    {
        $challengeRes = $this->http('POST', '/guest-reservations/email-challenges', $session, [
            'email' => $email,
        ]);
        $challengeRes->assertStatus(202);
        $challengeId = $challengeRes->json('data.challengeId');
        self::assertNotEmpty($challengeId);

        // Read and decrypt OTP code ONLY from owned test mvp_guest_mail_outbox
        $outboxRow = DB::table('mvp_guest_mail_outbox')
            ->where('challenge_id', $challengeId)
            ->first();
        self::assertNotNull($outboxRow, 'Expected challenge outbox row for ' . $email);
        self::assertSame(strtolower(trim($email)), $outboxRow->recipient_email);

        $mailPayload = json_decode(app(Encrypter::class)->decrypt($outboxRow->encrypted_payload), true, 512, JSON_THROW_ON_ERROR);
        $code = (string) ($mailPayload['code'] ?? '');
        self::assertNotEmpty($code, 'Expected OTP code in outbox payload');

        $verifyRes = $this->http('POST', '/guest-reservations/email-verifications', $session, [
            'challengeId' => $challengeId,
            'code' => $code,
        ]);
        $verifyRes->assertStatus(200);
    }

    private function http(
        string $method,
        string $path,
        array $session = [],
        mixed $body = null,
        array $headers = [],
        ?string $raw = null,
        string $cookieName = 'gza_session'
    ): TestResponse {
        $this->flushHeaders();
        $cookieHeader = '';
        if (isset($session['cookie'])) {
            $cookieHeader = $cookieName . '=' . $session['cookie'];
        }

        $server = [
            'HTTPS' => 'on',
            'SERVER_PORT' => 443,
            'HTTP_HOST' => '127.0.0.1:18090',
            'HTTP_ORIGIN' => 'https://127.0.0.1:5173',
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
            'HTTP_COOKIE' => $cookieHeader,
            'HTTP_X_CSRF_TOKEN' => $session['csrf'] ?? '',
            'REMOTE_ADDR' => '2001:db8:' . bin2hex(random_bytes(2)) . '::9',
        ];

        return $this->call(
            $method,
            (($headers['HTTPS'] ?? 'on') === 'off' ? 'http://' : 'https://') . ($headers['HTTP_HOST'] ?? '127.0.0.1:18090') . '/api/v1' . $path,
            [],
            [],
            [],
            array_replace($server, $headers),
            $raw ?? ($body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR))
        );
    }

    private function makeServiceId(string $scheduleId, string $date): string
    {
        return 'svc1-' . rtrim(strtr(base64_encode($scheduleId), '+/', '-_'), '=') . '-' . $date;
    }

    private function buildTripPayload(
        string $submissionId,
        string $outboundSchedule = 'trip-curated-flight',
        string $outboundDate = '2026-12-20',
        string $returnSchedule = 'trip-curated-return-flight',
        string $returnDate = '2026-12-22',
        string $outboundSeat = '1A',
        string $returnSeat = '2B',
        string $contactEmail = 'traveler@example.test'
    ): array {
        $outServiceId = $this->makeServiceId($outboundSchedule, $outboundDate);
        $retServiceId = $this->makeServiceId($returnSchedule, $returnDate);

        return [
            'submissionId' => $submissionId,
            'contact' => [
                'email' => $contactEmail,
                'phone' => '+970599112233',
            ],
            'legs' => [
                [
                    'serviceId' => $outServiceId,
                    'passengers' => [
                        [
                            'id' => 'p-1',
                            'type' => 'adult',
                            'firstName' => 'Amina',
                            'lastName' => 'Al-Saqqa',
                            'dob' => '1995-04-12',
                            'nationality' => 'PS',
                            'document' => 'P12345678',
                            'seatCode' => $outboundSeat,
                            'mealId' => 'meal-standard',
                        ],
                    ],
                ],
                [
                    'serviceId' => $retServiceId,
                    'passengers' => [
                        [
                            'id' => 'p-1',
                            'type' => 'adult',
                            'firstName' => 'Amina',
                            'lastName' => 'Al-Saqqa',
                            'dob' => '1995-04-12',
                            'nationality' => 'PS',
                            'document' => 'P12345678',
                            'seatCode' => $returnSeat,
                            'mealId' => 'meal-standard',
                        ],
                    ],
                ],
            ],
        ];
    }

    // =========================================================================
    // Authenticated Account Test Suite
    // =========================================================================

    public function test_authenticated_round_trip_happy_path_creates_both_legs_and_two_mail_intents(): void
    {
        $session = $this->passenger();
        $subId = (string) Str::uuid();
        $payload = $this->buildTripPayload($subId);

        $response = $this->http('POST', '/reservation-trips', $session, $payload);
        $response->assertStatus(201);
        $response->assertJsonPath('success', true);

        $data = $response->json('data');
        self::assertIsArray($data);
        self::assertArrayHasKey('reservations', $data);
        self::assertArrayNotHasKey('isNew', $data); // Public envelope strips isNew

        $reservations = $data['reservations'];
        self::assertCount(2, $reservations);

        // Leg 0: GZA -> AMM
        $leg0 = $reservations[0]['reservation'];
        self::assertSame('GZA', $leg0['originCode']);
        self::assertSame('AMM', $leg0['destinationCode']);
        self::assertSame('PS100', $leg0['flightNumber']);

        // Leg 1: AMM -> GZA
        $leg1 = $reservations[1]['reservation'];
        self::assertSame('AMM', $leg1['originCode']);
        self::assertSame('GZA', $leg1['destinationCode']);
        self::assertSame('PS101', $leg1['flightNumber']);

        // Assert database state: 2 reservations owned by user
        $dbRes = DB::table('mvp_reservations')->where('owner_user_id', $session['owner'])->get();
        self::assertCount(2, $dbRes);

        // Assert deterministic child submissions
        $child0 = ReservationTripCommand::deriveChildSubmissionId($subId, 0);
        $child1 = ReservationTripCommand::deriveChildSubmissionId($subId, 1);

        self::assertTrue(DB::table('mvp_reservation_submissions')->where('submission_id', $child0)->exists());
        self::assertTrue(DB::table('mvp_reservation_submissions')->where('submission_id', $child1)->exists());

        // Assert exactly 2 mail intents (one per reservation)
        $mailIntents = DB::table('mvp_reservation_mail_intents')
            ->whereIn('reservation_id', [$leg0['id'], $leg1['id']])
            ->get();
        self::assertCount(2, $mailIntents);
        foreach ($mailIntents as $intent) {
            self::assertSame('pending', $intent->status);
            self::assertSame('traveler@example.test', $intent->recipient_email);
        }

        // Assert seat claims created
        self::assertTrue(DB::table('mvp_reservation_seat_claims')->where('seat_code', '1A')->exists());
        self::assertTrue(DB::table('mvp_reservation_seat_claims')->where('seat_code', '2B')->exists());
    }

    public function test_identical_replay_returns_original_pair_200_without_extra_writes(): void
    {
        $session = $this->passenger();
        $subId = (string) Str::uuid();
        $payload = $this->buildTripPayload($subId);

        // First creation
        $res1 = $this->http('POST', '/reservation-trips', $session, $payload);
        $res1->assertStatus(201);
        $origRefs = [
            $res1->json('data.reservations.0.reservation.reference'),
            $res1->json('data.reservations.1.reservation.reference'),
        ];

        $countsBefore = [
            'reservations' => DB::table('mvp_reservations')->count(),
            'submissions' => DB::table('mvp_reservation_submissions')->count(),
            'intents' => DB::table('mvp_reservation_mail_intents')->count(),
            'claims' => DB::table('mvp_reservation_seat_claims')->count(),
        ];

        // Idempotent replay
        $res2 = $this->http('POST', '/reservation-trips', $session, $payload);
        $res2->assertStatus(200);

        $replayRefs = [
            $res2->json('data.reservations.0.reservation.reference'),
            $res2->json('data.reservations.1.reservation.reference'),
        ];
        self::assertSame($origRefs, $replayRefs);

        // Verify zero new database rows
        self::assertSame($countsBefore['reservations'], DB::table('mvp_reservations')->count());
        self::assertSame($countsBefore['submissions'], DB::table('mvp_reservation_submissions')->count());
        self::assertSame($countsBefore['intents'], DB::table('mvp_reservation_mail_intents')->count());
        self::assertSame($countsBefore['claims'], DB::table('mvp_reservation_seat_claims')->count());
    }

    public function test_replay_with_changed_payload_rejects_409_without_writes(): void
    {
        $session = $this->passenger();
        $subId = (string) Str::uuid();
        $payload = $this->buildTripPayload($subId, outboundSeat: '1A', returnSeat: '2B');

        $res1 = $this->http('POST', '/reservation-trips', $session, $payload);
        $res1->assertStatus(201);

        $countsBefore = [
            'reservations' => DB::table('mvp_reservations')->count(),
            'claims' => DB::table('mvp_reservation_seat_claims')->count(),
        ];

        // Modify return seat with identical top submissionId
        $changedPayload = $this->buildTripPayload($subId, outboundSeat: '1A', returnSeat: '2C');

        $res2 = $this->http('POST', '/reservation-trips', $session, $changedPayload);
        $res2->assertStatus(409);
        $res2->assertJsonPath('error.code', 'conflict');

        // Verify no changes occurred
        self::assertSame($countsBefore['reservations'], DB::table('mvp_reservations')->count());
        self::assertSame($countsBefore['claims'], DB::table('mvp_reservation_seat_claims')->count());
    }

    public function test_cross_owner_proof_fail(): void
    {
        $userA = $this->passenger();
        $userB = $this->passenger();
        $subId = (string) Str::uuid();

        $payload = $this->buildTripPayload($subId);

        // User A creates the trip
        $resA = $this->http('POST', '/reservation-trips', $userA, $payload);
        $resA->assertStatus(201);

        // User B attempts to replay User A's submissionId
        $resB = $this->http('POST', '/reservation-trips', $userB, $payload);
        $resB->assertStatus(409);

        // Verify User B has zero reservations
        self::assertSame(0, DB::table('mvp_reservations')->where('owner_user_id', $userB['owner'])->count());
    }

    public function test_timezone_crossing_round_trip_where_return_local_date_precedes_outbound_is_valid(): void
    {
        $session = $this->passenger();
        $subId = (string) Str::uuid();

        // Outbound departs AMM on Jan 3 00:00@+03 (21:00 UTC Jan 2), arrives GZA Jan 2 23:55@+02 (21:55 UTC Jan 2)
        // Return departs GZA on Jan 2 23:59@+02 (21:59 UTC Jan 2) -> 4 minutes later in absolute time!
        // Local calendar date in service ID for return (2027-01-02) is lexically earlier than outbound (2027-01-03).
        // Parser must NOT reject this on date lexical check, and coordinator must accept it based on canonical absolute instants.
        $payload = $this->buildTripPayload(
            submissionId: $subId,
            outboundSchedule: 'trip-amm-gza-midnight',
            outboundDate: '2027-01-03',
            returnSchedule: 'trip-gza-amm-late',
            returnDate: '2027-01-02',
            outboundSeat: '3A',
            returnSeat: '3B'
        );

        $response = $this->http('POST', '/reservation-trips', $session, $payload);
        $response->assertStatus(201);
        $response->assertJsonPath('success', true);

        $reservations = $response->json('data.reservations');
        self::assertCount(2, $reservations);
        self::assertSame('AMM', $reservations[0]['reservation']['originCode']);
        self::assertSame('GZA', $reservations[0]['reservation']['destinationCode']);
        self::assertSame('GZA', $reservations[1]['reservation']['originCode']);
        self::assertSame('AMM', $reservations[1]['reservation']['destinationCode']);
    }

    public function test_reversed_route_and_same_airport_fail_validation_422(): void
    {
        $session = $this->passenger();
        $subId = (string) Str::uuid();

        // Both legs outbound GZA -> AMM (not opposite)
        $outService1 = $this->makeServiceId('trip-curated-flight', '2026-12-20');
        $outService2 = $this->makeServiceId('trip-curated-flight-dup', '2026-12-22');

        $payload = [
            'submissionId' => $subId,
            'contact' => ['email' => 'test@example.test', 'phone' => ''],
            'legs' => [
                [
                    'serviceId' => $outService1,
                    'passengers' => [
                        [
                            'id' => 'p-1', 'type' => 'adult', 'firstName' => 'Amina', 'lastName' => 'Saqqa',
                            'dob' => '1990-01-01', 'nationality' => 'PS', 'document' => 'DOC1', 'seatCode' => '1A', 'mealId' => null,
                        ],
                    ],
                ],
                [
                    'serviceId' => $outService2,
                    'passengers' => [
                        [
                            'id' => 'p-1', 'type' => 'adult', 'firstName' => 'Amina', 'lastName' => 'Saqqa',
                            'dob' => '1990-01-01', 'nationality' => 'PS', 'document' => 'DOC1', 'seatCode' => '1B', 'mealId' => null,
                        ],
                    ],
                ],
            ],
        ];

        $res = $this->http('POST', '/reservation-trips', $session, $payload);
        $res->assertStatus(422);
        $res->assertJsonPath('error.code', 'validation_error');

        self::assertSame(0, DB::table('mvp_reservations')->where('owner_user_id', $session['owner'])->count());
    }

    public function test_return_depart_at_or_before_outbound_arrive_fails_validation_422(): void
    {
        $session = $this->passenger();
        $subId = (string) Str::uuid();

        // Return departs at 14:00 on Dec 20, but outbound arrives at 15:00 on Dec 20 -> fails
        // Here outbound departs 08:00 arrives 09:00 on Dec 22, but return departs 14:00 on Dec 20 (earlier instant)
        $payload = $this->buildTripPayload(
            submissionId: $subId,
            outboundSchedule: 'trip-curated-flight',
            outboundDate: '2026-12-22',
            returnSchedule: 'trip-curated-return-flight',
            returnDate: '2026-12-20'
        );

        $res = $this->http('POST', '/reservation-trips', $session, $payload);
        $res->assertStatus(422);
        $res->assertJsonPath('error.code', 'validation_error');

        self::assertSame(0, DB::table('mvp_reservations')->where('owner_user_id', $session['owner'])->count());
    }

    public function test_second_leg_seat_collision_rolls_back_first_leg_completely(): void
    {
        $session = $this->passenger();
        $subId = (string) Str::uuid();

        $outServiceId = $this->makeServiceId('trip-curated-flight', '2026-12-20');
        $retServiceId = $this->makeServiceId('trip-curated-return-flight', '2026-12-22');

        // Pre-claim seat 2B on return service via canonical account reservation
        $blockerSession = $this->passenger();
        $blockerRes = $this->http('POST', '/reservations', $blockerSession, [
            'submissionId' => (string) Str::uuid(),
            'serviceId' => $retServiceId,
            'passengers' => [
                [
                    'id' => 'p-blocker',
                    'type' => 'adult',
                    'firstName' => 'Blocker',
                    'lastName' => 'Passenger',
                    'dob' => '1990-01-01',
                    'nationality' => 'PS',
                    'document' => 'DOC-BLOCK-ACCT',
                    'seatCode' => '2B',
                    'mealId' => 'meal-standard',
                ],
            ],
            'contact' => [
                'email' => 'blocker-acct@example.test',
                'phone' => '+970599000000',
            ],
        ]);
        $blockerRes->assertStatus(201);
        $blockerReservationId = $blockerRes->json('data.reservation.id');

        $countsBefore = [
            'reservations' => DB::table('mvp_reservations')->count(),
            'passengers' => DB::table('mvp_reservation_passengers')->count(),
            'submissions' => DB::table('mvp_reservation_submissions')->count(),
            'intents' => DB::table('mvp_reservation_mail_intents')->count(),
            'claims' => DB::table('mvp_reservation_seat_claims')->count(),
        ];

        $payload = $this->buildTripPayload($subId, outboundSeat: '1A', returnSeat: '2B');

        $response = $this->http('POST', '/reservation-trips', $session, $payload);
        $response->assertStatus(409);
        $response->assertJsonPath('error.code', 'conflict');

        // Verify atomic rollback of all Leg 0 writes
        self::assertSame($countsBefore['reservations'], DB::table('mvp_reservations')->count());
        self::assertSame($countsBefore['passengers'], DB::table('mvp_reservation_passengers')->count());
        self::assertSame($countsBefore['submissions'], DB::table('mvp_reservation_submissions')->count());
        self::assertSame($countsBefore['intents'], DB::table('mvp_reservation_mail_intents')->count());
        self::assertSame($countsBefore['claims'], DB::table('mvp_reservation_seat_claims')->count());

        // Leg 0 seat 1A must NOT remain claimed
        self::assertFalse(
            DB::table('mvp_reservation_seat_claims')
                ->where('service_id', $outServiceId)
                ->where('seat_code', '1A')
                ->exists()
        );

        // Existing blocker reservation and seat claim must remain untouched
        self::assertTrue(
            DB::table('mvp_reservation_seat_claims')
                ->where('service_id', $retServiceId)
                ->where('seat_code', '2B')
                ->where('reservation_id', $blockerReservationId)
                ->exists()
        );
    }

    public function test_payload_bounding_and_closed_shape_enforcement(): void
    {
        $session = $this->passenger();

        // 1. Oversized body > 64KB
        $huge = str_repeat('X', 65540);
        $resHuge = $this->http('POST', '/reservation-trips', $session, null, [], $huge);
        $resHuge->assertStatus(422);

        // 2. Unsupported media type
        $resMedia = $this->http('POST', '/reservation-trips', $session, [], ['CONTENT_TYPE' => 'text/plain']);
        $resMedia->assertStatus(415);

        // 3. Extra unexpected root key
        $subId = (string) Str::uuid();
        $payloadExtra = $this->buildTripPayload($subId);
        $payloadExtra['untrusted_extra_key'] = 'exploit';
        $resExtra = $this->http('POST', '/reservation-trips', $session, $payloadExtra);
        $resExtra->assertStatus(422);

        // 4. Passenger identity mismatch across legs (different firstName on return leg)
        $payloadMismatch = $this->buildTripPayload((string) Str::uuid());
        $payloadMismatch['legs'][1]['passengers'][0]['firstName'] = 'DifferentName';
        $resMismatch = $this->http('POST', '/reservation-trips', $session, $payloadMismatch);
        $resMismatch->assertStatus(422);
    }

    // =========================================================================
    // Guest Session Test Suite
    // =========================================================================

    public function test_guest_round_trip_happy_path_creates_null_owner_reservations_and_two_intents(): void
    {
        $guestSession = $this->guest();
        $email = 'guest-happy@example.test';
        $this->verifyGuestEmail($guestSession, $email);

        $subId = (string) Str::uuid();
        $payload = $this->buildTripPayload($subId, contactEmail: $email);

        $response = $this->http('POST', '/guest-reservation-trips', $guestSession, $payload);
        $response->assertStatus(201);
        $response->assertJsonPath('success', true);

        $reservations = $response->json('data.reservations');
        self::assertCount(2, $reservations);

        $id0 = $reservations[0]['reservation']['id'];
        $id1 = $reservations[1]['reservation']['id'];

        // Assert reservations in database have owner_user_id IS NULL
        $dbRows = DB::table('mvp_reservations')->whereIn('id', [$id0, $id1])->get();
        self::assertCount(2, $dbRows);
        foreach ($dbRows as $row) {
            self::assertNull($row->owner_user_id);
            self::assertSame($email, $row->contact_email);
        }

        // Assert exactly 2 mail intents
        $intents = DB::table('mvp_reservation_mail_intents')->whereIn('reservation_id', [$id0, $id1])->get();
        self::assertCount(2, $intents);

        // Replay with identical payload returns 200 OK without extra records
        $countsBefore = [
            'reservations' => DB::table('mvp_reservations')->count(),
            'intents' => DB::table('mvp_reservation_mail_intents')->count(),
        ];

        $replayRes = $this->http('POST', '/guest-reservation-trips', $guestSession, $payload);
        $replayRes->assertStatus(200);

        self::assertSame($countsBefore['reservations'], DB::table('mvp_reservations')->count());
        self::assertSame($countsBefore['intents'], DB::table('mvp_reservation_mail_intents')->count());
    }

    public function test_unverified_guest_fails_403(): void
    {
        $guestSession = $this->guest(); // Anonymous session without email verification
        $subId = (string) Str::uuid();
        $payload = $this->buildTripPayload($subId, contactEmail: 'unverified@example.test');

        $response = $this->http('POST', '/guest-reservation-trips', $guestSession, $payload);
        $response->assertStatus(403);
    }

    public function test_cross_session_guest_cannot_replay_or_access_submission(): void
    {
        $guestA = $this->guest();
        $this->verifyGuestEmail($guestA, 'guestA@example.test');

        $subId = (string) Str::uuid();
        $payload = $this->buildTripPayload($subId, contactEmail: 'guestA@example.test');

        $resA = $this->http('POST', '/guest-reservation-trips', $guestA, $payload);
        $resA->assertStatus(201);

        // Guest B (different session) tries to use same submissionId
        $guestB = $this->guest();
        $this->verifyGuestEmail($guestB, 'guestB@example.test');
        $payloadB = $this->buildTripPayload($subId, contactEmail: 'guestB@example.test');

        $resB = $this->http('POST', '/guest-reservation-trips', $guestB, $payloadB);
        // Guest B's attempt cannot access Guest A's submission, and fails due to seat claim collision (409)
        $resB->assertStatus(409);
    }

    public function test_guest_second_leg_collision_rolls_back_first_leg_completely(): void
    {
        $guestSession = $this->guest();
        $email = 'guest-collision@example.test';
        $this->verifyGuestEmail($guestSession, $email);

        $outServiceId = $this->makeServiceId('trip-curated-flight', '2026-12-20');
        $retServiceId = $this->makeServiceId('trip-curated-return-flight', '2026-12-22');

        // Pre-claim seat 2B on return service via canonical guest reservation
        $blockerGuest = $this->guest();
        $blockerEmail = 'blocker-guest@example.test';
        $this->verifyGuestEmail($blockerGuest, $blockerEmail);

        $blockerRes = $this->http('POST', '/guest-reservations', $blockerGuest, [
            'submissionId' => (string) Str::uuid(),
            'serviceId' => $retServiceId,
            'passengers' => [
                [
                    'id' => 'p-blocker',
                    'type' => 'adult',
                    'firstName' => 'Blocker',
                    'lastName' => 'Passenger',
                    'dob' => '1990-01-01',
                    'nationality' => 'PS',
                    'document' => 'DOC-BLOCK-GUEST',
                    'seatCode' => '2B',
                    'mealId' => 'meal-standard',
                ],
            ],
            'contact' => [
                'email' => $blockerEmail,
                'phone' => '+970599000000',
            ],
        ]);
        $blockerRes->assertStatus(201);
        $blockerReservationId = $blockerRes->json('data.reservation.id');

        $countsBefore = [
            'reservations' => DB::table('mvp_reservations')->count(),
            'passengers' => DB::table('mvp_reservation_passengers')->count(),
            'submissions' => DB::table('mvp_reservation_submissions')->count(),
            'intents' => DB::table('mvp_reservation_mail_intents')->count(),
            'claims' => DB::table('mvp_reservation_seat_claims')->count(),
        ];

        $subId = (string) Str::uuid();
        $payload = $this->buildTripPayload($subId, outboundSeat: '1A', returnSeat: '2B', contactEmail: $email);

        $response = $this->http('POST', '/guest-reservation-trips', $guestSession, $payload);
        $response->assertStatus(409);

        // Assert complete atomic rollback of all Leg 0 writes for guest
        self::assertSame($countsBefore['reservations'], DB::table('mvp_reservations')->count());
        self::assertSame($countsBefore['passengers'], DB::table('mvp_reservation_passengers')->count());
        self::assertSame($countsBefore['submissions'], DB::table('mvp_reservation_submissions')->count());
        self::assertSame($countsBefore['intents'], DB::table('mvp_reservation_mail_intents')->count());
        self::assertSame($countsBefore['claims'], DB::table('mvp_reservation_seat_claims')->count());

        // Leg 0 seat 1A must NOT remain claimed
        self::assertFalse(
            DB::table('mvp_reservation_seat_claims')
                ->where('service_id', $outServiceId)
                ->where('seat_code', '1A')
                ->exists()
        );

        // Existing blocker reservation and seat claim must remain untouched
        self::assertTrue(
            DB::table('mvp_reservation_seat_claims')
                ->where('service_id', $retServiceId)
                ->where('seat_code', '2B')
                ->where('reservation_id', $blockerReservationId)
                ->exists()
        );
    }

    public function test_guest_cancel_one_leg_and_replay_returns_mixed_status_pair(): void
    {
        $guestSession = $this->guest();
        $email = 'guest-cancel@example.test';
        $this->verifyGuestEmail($guestSession, $email);

        $subId = (string) Str::uuid();
        $payload = $this->buildTripPayload($subId, outboundSeat: '1A', returnSeat: '2B', contactEmail: $email);

        $response = $this->http('POST', '/guest-reservation-trips', $guestSession, $payload);
        $response->assertStatus(201);

        $ref0 = $response->json('data.reservations.0.reservation.reference');
        $ref1 = $response->json('data.reservations.1.reservation.reference');

        // Cancel leg 0 via guest cancellation endpoint
        $cancelRes = $this->http('POST', "/guest-reservations/{$ref0}/cancel", $guestSession);
        $cancelRes->assertStatus(200);
        $cancelRes->assertJsonPath('data.status', 'cancelled');

        // Replay original trip command
        $replayRes = $this->http('POST', '/guest-reservation-trips', $guestSession, $payload);
        $replayRes->assertStatus(200);

        // Verify original pair is returned with accurate mixed statuses
        $reservations = $replayRes->json('data.reservations');
        self::assertCount(2, $reservations);
        self::assertSame($ref0, $reservations[0]['reservation']['reference']);
        self::assertSame('cancelled', $reservations[0]['reservation']['status']);
        self::assertSame($ref1, $reservations[1]['reservation']['reference']);
        self::assertSame('confirmed', $reservations[1]['reservation']['status']);
    }

    public function test_guest_minimal_trip_stores_null_optionals_and_replays_cleanly(): void
    {
        $guestSession = $this->guest();
        $email = 'minimal-trip-' . Str::random(8) . '@example.test';
        $this->verifyGuestEmail($guestSession, $email);

        $outServiceId = $this->makeServiceId('trip-curated-flight', '2026-12-20');
        $retServiceId = $this->makeServiceId('trip-curated-return-flight', '2026-12-22');

        $subId = (string) Str::uuid();
        $payload = [
            'submissionId' => $subId,
            'contact' => [
                'email' => $email,
            ],
            'legs' => [
                [
                    'serviceId' => $outServiceId,
                    'passengers' => [
                        [
                            'id' => 'p-1',
                            'name' => 'Farah Husseini',
                            'seatCode' => '7A',
                        ],
                    ],
                ],
                [
                    'serviceId' => $retServiceId,
                    'passengers' => [
                        [
                            'id' => 'p-1',
                            'name' => 'Farah Husseini',
                            'seatCode' => '8B',
                        ],
                    ],
                ],
            ],
        ];

        // 1. Initial creation (201)
        $res = $this->http('POST', '/guest-reservation-trips', $guestSession, $payload);
        $res->assertStatus(201);
        $res->assertJsonPath('success', true);

        $reservations = $res->json('data.reservations');
        self::assertCount(2, $reservations);

        $id0 = $reservations[0]['reservation']['id'];
        $id1 = $reservations[1]['reservation']['id'];

        // 2. Verify database records: passenger optionals are canonically NULL
        foreach ([$id0, $id1] as $resId) {
            $p = DB::table('mvp_reservation_passengers')->where('reservation_id', $resId)->first();
            self::assertNotNull($p);
            self::assertSame('Farah Husseini', $p->first_name);
            self::assertNull($p->last_name);
            self::assertNull($p->dob);
            self::assertNull($p->nationality);
            self::assertNull($p->document);
            self::assertSame('adult', $p->type);
        }

        // 3. Response projection has null lastName
        self::assertSame('Farah Husseini', $reservations[0]['reservation']['passengers'][0]['firstName']);
        self::assertNull($reservations[0]['reservation']['passengers'][0]['lastName']);
        self::assertNull($reservations[0]['ticket']['tickets'][0]['passenger']['lastName']);
        self::assertNull($reservations[0]['ticket']['tickets'][0]['passenger']['nationality']);

        // 4. Idempotent replay of same minimal payload returns 200 with identical IDs
        $countsBefore = [
            'reservations' => DB::table('mvp_reservations')->count(),
            'passengers' => DB::table('mvp_reservation_passengers')->count(),
        ];

        $replayRes = $this->http('POST', '/guest-reservation-trips', $guestSession, $payload);
        $replayRes->assertStatus(200);
        self::assertSame($id0, $replayRes->json('data.reservations.0.reservation.id'));
        self::assertSame($id1, $replayRes->json('data.reservations.1.reservation.id'));
        self::assertSame($countsBefore['reservations'], DB::table('mvp_reservations')->count());
        self::assertSame($countsBefore['passengers'], DB::table('mvp_reservation_passengers')->count());

        // 5. Unknown key in trip command rejected with 422
        $badPayload = $payload;
        $badPayload['untrustedKey'] = 'exploit';
        $this->http('POST', '/guest-reservation-trips', $guestSession, $badPayload)->assertStatus(422);
    }
}
