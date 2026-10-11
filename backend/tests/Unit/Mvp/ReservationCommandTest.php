<?php
declare(strict_types=1);
namespace Tests\Unit\Mvp;

use App\Mvp\Reservations\ReservationCommand;
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
}
