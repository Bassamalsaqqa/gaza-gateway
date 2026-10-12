<?php

declare(strict_types=1);

namespace Tests\SharedHostingMail;

use App\Mvp\Mail\BookingMailWorker;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class BookingMailWorkerSharedHostingTest extends SharedHostingMailTestCase
{
    private function sampleTicketPayload(string $ref): array
    {
        return [
            'reference' => $ref,
            'tickets' => [
                [
                    'passenger' => [
                        'firstName' => 'Ahmad',
                        'lastName' => 'Al-Khatib',
                        'seatCode' => '12A',
                        'meal' => [
                            'label' => ['en' => 'Standard Meal', 'ar' => 'وجبة عادية'],
                        ],
                    ],
                    'flight' => [
                        'originCode' => 'GZA',
                        'destinationCode' => 'AMM',
                        'flightNumber' => 'PS 204',
                        'date' => '2026-10-15',
                        'departTime' => '10:00',
                        'arriveTime' => '11:15',
                    ],
                    'ticketNumber' => 'ETK-99001',
                ],
            ],
        ];
    }

    public function test_booking_mail_intent_dispatched_and_accepted(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('accept');

        try {
            $resId = (string) Str::uuid();
            $ref = 'GZA-' . strtoupper(bin2hex(random_bytes(3)));
            $this->createMailReservation($resId, $ref);

            $intentId = (string) Str::uuid();
            $email = 'passenger_' . bin2hex(random_bytes(4)) . '@example.test';
            DB::table('mvp_reservation_mail_intents')->insert([
                'id' => $intentId,
                'reservation_id' => $resId,
                'recipient_email' => $email,
                'payload' => json_encode($this->sampleTicketPayload($ref), JSON_THROW_ON_ERROR),
                'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);

            $worker = app(BookingMailWorker::class);
            $this->assertTrue($worker->runOne());

            $message = DB::table('mvp_mail_messages')->where('intent_id', $intentId)->first();
            $this->assertNotNull($message);
            $this->assertSame('accepted', $message->status);
            $this->assertNotNull($message->accepted_at);

            $attempt = DB::table('mvp_mail_attempts')->where('message_id', $message->id)->first();
            $this->assertNotNull($attempt);
            $this->assertSame('accepted', $attempt->outcome);

            $root = sys_get_temp_dir() . '/shared-hosting-mail-sink';
            $emlFiles = glob($root . '/*.eml') ?: [];
            $this->assertCount(1, $emlFiles);
            $content = file_get_contents($emlFiles[0]);
            $this->assertStringContainsString($email, $content);
        } finally {
            $this->stopSink($sink);
        }
    }

    public function test_booking_retained_on_mail_failure(): void
    {
        $this->configureSmtp();
        // Smtp sink NOT running -> connection failure
        $resId = (string) Str::uuid();
        $ref = 'GZA-' . strtoupper(bin2hex(random_bytes(3)));
        $this->createMailReservation($resId, $ref);

        $intentId = (string) Str::uuid();
        DB::table('mvp_reservation_mail_intents')->insert([
            'id' => $intentId,
            'reservation_id' => $resId,
            'recipient_email' => 'passenger@example.test',
            'payload' => json_encode($this->sampleTicketPayload($ref), JSON_THROW_ON_ERROR),
            'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);

        $worker = app(BookingMailWorker::class);
        $this->assertTrue($worker->runOne());

        // Mail message marked failed
        $message = DB::table('mvp_mail_messages')->where('intent_id', $intentId)->first();
        $this->assertNotNull($message);
        $this->assertSame('failed', $message->status);

        // Crucial invariant: Booking reservation is RETAINED as confirmed, never cancelled or deleted!
        $reservation = DB::table('mvp_reservations')->where('id', $resId)->first();
        $this->assertNotNull($reservation);
        $this->assertSame('confirmed', $reservation->status);
    }

    public function test_booking_mail_uncertain_outcome_not_auto_retried(): void
    {
        $this->configureSmtp();
        $sink = $this->startSink('fail_after_data');

        try {
            $resId = (string) Str::uuid();
            $ref = 'GZA-' . strtoupper(bin2hex(random_bytes(3)));
            $this->createMailReservation($resId, $ref);

            $intentId = (string) Str::uuid();
            DB::table('mvp_reservation_mail_intents')->insert([
                'id' => $intentId,
                'reservation_id' => $resId,
                'recipient_email' => 'passenger@example.test',
                'payload' => json_encode($this->sampleTicketPayload($ref), JSON_THROW_ON_ERROR),
                'created_at' => DB::raw('UTC_TIMESTAMP(6)'),
            ]);

            $worker = app(BookingMailWorker::class);
            $this->assertTrue($worker->runOne());

            $message = DB::table('mvp_mail_messages')->where('intent_id', $intentId)->first();
            $this->assertSame('uncertain', $message->status);

            // Uncertain status is not replayed
            $this->assertFalse($worker->runOne());
        } finally {
            $this->stopSink($sink);
        }
    }
}
