<?php
declare(strict_types=1);
namespace Tests\Unit\Mvp;

use App\Mvp\Reservations\ReservationCommand;
use App\Mvp\Reservations\ReservationTripCommand;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ReservationCommandTest extends TestCase
{
    private static function input(): array
    {
        return ['submissionId' => 'c80f1c02-72b3-4c77-986a-d6ef1608ed20',
            'serviceId' => 'svc1-'.rtrim(strtr(base64_encode('owner-curated'), '+/', '-_'), '=').'-2026-12-20',
            'passengers' => [['id' => 'p-1', 'type' => 'adult', 'firstName' => 'Amina', 'lastName' => '',
                'dob' => '2000-02-29', 'nationality' => 'Palestinian', 'document' => 'SYNTHETIC-TEST', 'seatCode' => '1A']],
            'contact' => ['email' => 'synthetic@example.test', 'phone' => '+970 1234567']];
    }

    public function test_free_one_way_single_name_specimen_preserves_source_fields(): void
    {
        $result = ReservationCommand::parse(self::input());
        self::assertSame('Palestinian', $result['passengers'][0]['nationality']);
        self::assertSame('', $result['passengers'][0]['lastName']);
        self::assertNull($result['passengers'][0]['mealId']);
        self::assertArrayNotHasKey('price', $result);
        self::assertSame('owner-curated', ReservationCommand::service($result['serviceId'])['scheduleId']);
    }

    public static function invalidCommands(): iterable
    {
        $base = self::input();
        foreach (['price', 'paymentStatus', 'capacity', 'userId', 'ownerId', 'amountMinor', 'currency'] as $field) {
            yield 'reject authority injection '.$field => [array_replace($base, [$field => 1])];
        }
        $x=$base; $x['passengers'][0]['type']='infant'; yield 'infants unavailable' => [$x];
        $x=$base; $x['passengers'][0]['dob']='2000-02-30'; yield 'impossible DOB' => [$x];
        $x=$base; $x['passengers'][0]['dob']='2027-01-01'; yield 'future DOB' => [$x];
        $x=$base; $x['passengers'][0]['firstName']=' '; yield 'nameless' => [$x];
        $x=$base; $x['passengers'][]=array_replace($x['passengers'][0],['id'=>'p-2']); yield 'duplicate seat' => [$x];
        $x=$base; $x['passengers'][]=array_replace($x['passengers'][0],['seatCode'=>'1B']); yield 'duplicate passenger ID' => [$x];
        $x=$base; $x['passengers'][0]['type']='child'; $x['passengers'][0]['dob']='2020-01-01'; yield 'unaccompanied child' => [$x];
        $x=$base; $x['passengers'][0]['type']='child'; yield 'child/adult age mismatch' => [$x];
        $x=$base; $x['passengers'][0]['seatCode']='01A'; yield 'noncanonical seat' => [$x];
        $x=$base; $x['passengers'][0]['seatCode']='61A'; yield 'out of physical row bounds' => [$x];
        $x=$base; $x['passengers'][0]['id']='p/1'; yield 'unsafe local ID' => [$x];
        $x=$base; $x['passengers'][0]['amountMinor']=0; yield 'passenger price injection' => [$x];
        $x=$base; $x['contact']['email']='broken'; yield 'invalid mail' => [$x];
        $x=$base; $x['contact']['email']="synthetic@example.test\r\nBcc: foreign@example.test"; yield 'header injection' => [$x];
        $x=$base; $x['passengers']=[]; yield 'empty passengers' => [$x];
        $x=$base; $x['serviceId']='svc1-YQ==-2026-12-20'; yield 'noncanonical service encoding' => [$x];
        $x=$base; $x['serviceId']='svc1-YQ-2026-02-30'; yield 'impossible offering date' => [$x];
    }

    #[DataProvider('invalidCommands')]
    public function test_rejects_untrusted_authority_and_invalid_reservation_inputs(array $input): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid reservation command.');
        ReservationCommand::parse($input);
    }

    public function test_exact_unicode_schedule_codec_preserves_whitespace_and_utf16_bound(): void
    {
        $schedule="  curated \u{1F600}  ";
        $id='svc1-'.rtrim(strtr(base64_encode($schedule), '+/', '-_'), '=').'-2026-12-20';
        self::assertSame($schedule, ReservationCommand::service($id)['scheduleId']);
        $schedule=str_repeat("\u{1F600}",80);
        $id='svc1-'.rtrim(strtr(base64_encode($schedule), '+/', '-_'), '=').'-2026-12-20';
        self::assertSame($schedule, ReservationCommand::service($id)['scheduleId']);
        $schedule.="\u{1F600}";
        $this->expectException(InvalidArgumentException::class);
        ReservationCommand::service('svc1-'.rtrim(strtr(base64_encode($schedule), '+/', '-_'), '=').'-2026-12-20');
    }

    public function test_guest_minimal_name_and_email_one_way_parses_cleanly_with_canonical_nulls(): void
    {
        $input = [
            'submissionId' => 'c80f1c02-72b3-4c77-986a-d6ef1608ed20',
            'serviceId' => 'svc1-'.rtrim(strtr(base64_encode('owner-curated'), '+/', '-_'), '=').'-2026-12-20',
            'passengers' => [
                [
                    'id' => 'p-1',
                    'name' => 'Tariq Al-Husseini',
                    'seatCode' => '1A',
                ],
            ],
            'contact' => [
                'email' => 'guest@example.test',
            ],
        ];

        $result = ReservationCommand::parseGuest($input);
        self::assertSame('Tariq Al-Husseini', $result['passengers'][0]['firstName']);
        self::assertNull($result['passengers'][0]['lastName']);
        self::assertNull($result['passengers'][0]['dob']);
        self::assertNull($result['passengers'][0]['nationality']);
        self::assertNull($result['passengers'][0]['document']);
        self::assertSame('adult', $result['passengers'][0]['type']);
        self::assertNull($result['passengers'][0]['mealId']);
        self::assertSame('', $result['contact']['phone']);
    }

    public function test_guest_full_arabic_single_name_preserves_single_field_without_invented_last_name(): void
    {
        $arabicName = 'محمد عبد الله خليل النجار';
        $input = [
            'submissionId' => 'c80f1c02-72b3-4c77-986a-d6ef1608ed20',
            'serviceId' => 'svc1-'.rtrim(strtr(base64_encode('owner-curated'), '+/', '-_'), '=').'-2026-12-20',
            'passengers' => [
                [
                    'id' => 'p-1',
                    'name' => $arabicName,
                    'seatCode' => '1A',
                ],
            ],
            'contact' => [
                'email' => 'guest@example.test',
            ],
        ];

        $result = ReservationCommand::parseGuest($input);
        self::assertSame($arabicName, $result['passengers'][0]['firstName']);
        self::assertNull($result['passengers'][0]['lastName']);
    }

    public function test_guest_optional_fields_when_provided_are_parsed_and_validated(): void
    {
        $input = [
            'submissionId' => 'c80f1c02-72b3-4c77-986a-d6ef1608ed20',
            'serviceId' => 'svc1-'.rtrim(strtr(base64_encode('owner-curated'), '+/', '-_'), '=').'-2026-12-20',
            'passengers' => [
                [
                    'id' => 'p-1',
                    'firstName' => 'Amina',
                    'lastName' => 'Al-Saqqa',
                    'dob' => '1995-04-12',
                    'nationality' => 'Palestinian',
                    'document' => 'P12345678',
                    'seatCode' => '1A',
                    'type' => 'adult',
                ],
            ],
            'contact' => [
                'email' => 'guest@example.test',
                'phone' => '+970 599 123456',
            ],
        ];

        $result = ReservationCommand::parseGuest($input);
        self::assertSame('Amina', $result['passengers'][0]['firstName']);
        self::assertSame('Al-Saqqa', $result['passengers'][0]['lastName']);
        self::assertSame('1995-04-12', $result['passengers'][0]['dob']);
        self::assertSame('Palestinian', $result['passengers'][0]['nationality']);
        self::assertSame('P12345678', $result['passengers'][0]['document']);
        self::assertSame('+970 599 123456', $result['contact']['phone']);
    }

    public function test_guest_rejects_malformed_optional_dob_and_age_mismatch(): void
    {
        $base = [
            'submissionId' => 'c80f1c02-72b3-4c77-986a-d6ef1608ed20',
            'serviceId' => 'svc1-'.rtrim(strtr(base64_encode('owner-curated'), '+/', '-_'), '=').'-2026-12-20',
            'passengers' => [
                [
                    'id' => 'p-1',
                    'name' => 'Amina',
                    'seatCode' => '1A',
                ],
            ],
            'contact' => [
                'email' => 'guest@example.test',
            ],
        ];

        // Impossible date
        $badDate = $base;
        $badDate['passengers'][0]['dob'] = '2000-02-30';
        try {
            ReservationCommand::parseGuest($badDate);
            self::fail('Expected InvalidArgumentException for impossible DOB');
        } catch (InvalidArgumentException $e) {
            self::assertSame('Invalid reservation command.', $e->getMessage());
        }

        // Child age with adult type
        $ageMismatch = $base;
        $ageMismatch['passengers'][0]['dob'] = '2020-01-01';
        try {
            ReservationCommand::parseGuest($ageMismatch);
            self::fail('Expected InvalidArgumentException for child age with adult type');
        } catch (InvalidArgumentException $e) {
            self::assertSame('Invalid reservation command.', $e->getMessage());
        }
    }

    public function test_guest_rejects_unknown_keys_strictly(): void
    {
        $base = [
            'submissionId' => 'c80f1c02-72b3-4c77-986a-d6ef1608ed20',
            'serviceId' => 'svc1-'.rtrim(strtr(base64_encode('owner-curated'), '+/', '-_'), '=').'-2026-12-20',
            'passengers' => [
                [
                    'id' => 'p-1',
                    'name' => 'Amina',
                    'seatCode' => '1A',
                ],
            ],
            'contact' => [
                'email' => 'guest@example.test',
            ],
        ];

        // Root level injection
        $badRoot = $base;
        $badRoot['extraField'] = 'exploit';
        try {
            ReservationCommand::parseGuest($badRoot);
            self::fail('Expected InvalidArgumentException for unknown root key');
        } catch (InvalidArgumentException $e) {
            self::assertSame('Invalid reservation command.', $e->getMessage());
        }

        // Passenger level injection
        $badPassenger = $base;
        $badPassenger['passengers'][0]['injectedKey'] = 123;
        try {
            ReservationCommand::parseGuest($badPassenger);
            self::fail('Expected InvalidArgumentException for unknown passenger key');
        } catch (InvalidArgumentException $e) {
            self::assertSame('Invalid reservation command.', $e->getMessage());
        }

        // Contact level injection
        $badContact = $base;
        $badContact['contact']['untrusted'] = 'test';
        try {
            ReservationCommand::parseGuest($badContact);
            self::fail('Expected InvalidArgumentException for unknown contact key');
        } catch (InvalidArgumentException $e) {
            self::assertSame('Invalid reservation command.', $e->getMessage());
        }

        // Ambiguous simultaneous name and firstName
        $ambiguousName = $base;
        $ambiguousName['passengers'][0]['firstName'] = 'Amina';
        try {
            ReservationCommand::parseGuest($ambiguousName);
            self::fail('Expected InvalidArgumentException for ambiguous simultaneous name and firstName');
        } catch (InvalidArgumentException $e) {
            self::assertSame('Invalid reservation command.', $e->getMessage());
        }
    }

    public function test_account_command_strictly_rejects_omitted_dob_nationality_document(): void
    {
        $minimalGuestInput = [
            'submissionId' => 'c80f1c02-72b3-4c77-986a-d6ef1608ed20',
            'serviceId' => 'svc1-'.rtrim(strtr(base64_encode('owner-curated'), '+/', '-_'), '=').'-2026-12-20',
            'passengers' => [
                [
                    'id' => 'p-1',
                    'firstName' => 'Amina',
                    'seatCode' => '1A',
                ],
            ],
            'contact' => [
                'email' => 'user@example.test',
                'phone' => '+970 599 123456',
            ],
        ];

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid reservation command.');
        ReservationCommand::parse($minimalGuestInput);
    }

    public function test_guest_trip_command_minimal_passengers_parses_cleanly_across_legs(): void
    {
        $outService = 'svc1-'.rtrim(strtr(base64_encode('curated-flight'), '+/', '-_'), '=').'-2026-12-20';
        $retService = 'svc1-'.rtrim(strtr(base64_encode('curated-return-flight'), '+/', '-_'), '=').'-2026-12-25';

        $input = [
            'submissionId' => 'c80f1c02-72b3-4c77-986a-d6ef1608ed20',
            'contact' => [
                'email' => 'trip-guest@example.test',
            ],
            'legs' => [
                [
                    'serviceId' => $outService,
                    'passengers' => [
                        [
                            'id' => 'p-1',
                            'name' => 'Layla',
                            'seatCode' => '2A',
                        ],
                    ],
                ],
                [
                    'serviceId' => $retService,
                    'passengers' => [
                        [
                            'id' => 'p-1',
                            'name' => 'Layla',
                            'seatCode' => '3B',
                        ],
                    ],
                ],
            ],
        ];

        $parsed = ReservationTripCommand::parseGuest($input);
        self::assertCount(2, $parsed['legs']);
        self::assertSame('Layla', $parsed['legs'][0]['passengers'][0]['firstName']);
        self::assertNull($parsed['legs'][0]['passengers'][0]['lastName']);
        self::assertNull($parsed['legs'][0]['passengers'][0]['dob']);
        self::assertSame('Layla', $parsed['legs'][1]['passengers'][0]['firstName']);
        self::assertNull($parsed['legs'][1]['passengers'][0]['lastName']);
        self::assertNull($parsed['legs'][1]['passengers'][0]['dob']);
    }

    public function test_guest_trip_command_rejects_unknown_keys_and_mismatched_passenger_names(): void
    {
        $outService = 'svc1-'.rtrim(strtr(base64_encode('curated-flight'), '+/', '-_'), '=').'-2026-12-20';
        $retService = 'svc1-'.rtrim(strtr(base64_encode('curated-return-flight'), '+/', '-_'), '=').'-2026-12-25';

        $base = [
            'submissionId' => 'c80f1c02-72b3-4c77-986a-d6ef1608ed20',
            'contact' => [
                'email' => 'trip-guest@example.test',
            ],
            'legs' => [
                [
                    'serviceId' => $outService,
                    'passengers' => [
                        [
                            'id' => 'p-1',
                            'name' => 'Layla',
                            'seatCode' => '2A',
                        ],
                    ],
                ],
                [
                    'serviceId' => $retService,
                    'passengers' => [
                        [
                            'id' => 'p-1',
                            'name' => 'DifferentName',
                            'seatCode' => '3B',
                        ],
                    ],
                ],
            ],
        ];

        // Mismatched name across legs
        try {
            ReservationTripCommand::parseGuest($base);
            self::fail('Expected InvalidArgumentException for mismatched passenger name across legs');
        } catch (InvalidArgumentException $e) {
            self::assertSame('Invalid reservation trip command: passenger identity mismatch across legs.', $e->getMessage());
        }

        // Extra root key
        $badRoot = $base;
        $badRoot['legs'][1]['passengers'][0]['name'] = 'Layla';
        $badRoot['untrusted'] = 1;
        try {
            ReservationTripCommand::parseGuest($badRoot);
            self::fail('Expected InvalidArgumentException for unknown root key in trip command');
        } catch (InvalidArgumentException $e) {
            self::assertSame('Invalid reservation trip command: unexpected keys.', $e->getMessage());
        }
    }
}
