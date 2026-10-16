<?php
declare(strict_types=1);

namespace Tests\Unit\Mvp;

use App\Mvp\Mail\TicketEmail;
use PHPUnit\Framework\TestCase;

final class TicketEmailPresentationTest extends TestCase
{
    private static function syntheticConfig(): array
    {
        return [
            'senderEmail' => 'tickets@example.test',
            'senderName' => 'Gaza Gateway',
            'replyTo' => 'support@example.test',
        ];
    }

    private static function syntheticPayload(array $overrides = []): array
    {
        $status = $overrides['status'] ?? 'confirmed';
        $arrivalDate = $overrides['arrivalDate'] ?? '2026-09-18';
        $flight = array_merge([
            'flightNumber' => 'PS 204',
            'date' => '2026-09-18',
            'originCode' => 'GZA',
            'destinationCode' => 'AMM',
            'departTime' => '14:30',
            'arriveTime' => '15:25',
            'arrivalDate' => $arrivalDate,
            'originTimezone' => 'Asia/Gaza',
            'destinationTimezone' => 'Asia/Amman',
            'aircraftModel' => 'Airbus A320',
        ], $overrides['flight'] ?? []);

        $tickets = $overrides['tickets'] ?? [
            [
                'ticketNumber' => 'PS-0012345',
                'passenger' => [
                    'firstName' => 'Omar',
                    'lastName' => 'Khalil',
                    'type' => 'adult',
                    'seatCode' => '12A',
                    'meal' => [
                        'id' => 'meal-veg',
                        'label' => [
                            'en' => 'Standard Vegetarian',
                            'ar' => 'نباتي عادي',
                        ],
                    ],
                ],
            ],
        ];

        return [
            'purpose' => $overrides['purpose'] ?? 'ticket',
            'recipient' => $overrides['recipient'] ?? 'passenger@example.test',
            'ticket' => [
                'reference' => $overrides['reference'] ?? 'GZA-7K8P',
                'status' => $status,
                'flight' => $flight,
                'tickets' => $tickets,
            ],
        ];
    }

    public function test_purpose_test_branch_returns_standard_test_email(): void
    {
        $payload = [
            'purpose' => 'test',
            'recipient' => 'admin@example.test',
        ];
        $email = TicketEmail::build($payload, self::syntheticConfig(), 'attempt-001', '2026-10-16T12:00:00Z');

        self::assertSame('Gaza Gateway email configuration test', $email->getSubject());
        self::assertStringContainsString('This is a requested email configuration test.', (string) $email->getTextBody());
        self::assertStringContainsString('This is a requested email configuration test.', (string) $email->getHtmlBody());
        self::assertSame('admin@example.test', $email->getTo()[0]->getAddress());
        self::assertSame('tickets@example.test', $email->getFrom()[0]->getAddress());
        self::assertSame('Gaza Gateway', $email->getFrom()[0]->getName());
        self::assertSame('support@example.test', $email->getReplyTo()[0]->getAddress());
    }

    public function test_canonical_confirmed_ticket_presentation(): void
    {
        $payload = self::syntheticPayload();
        $email = TicketEmail::build($payload, self::syntheticConfig(), 'attempt-002', '2026-10-16T12:00:00Z');

        self::assertSame('Gaza Gateway · GZA-7K8P', $email->getSubject());
        self::assertStringContainsString('attempt-002@gazaairport.com', (string) $email->getHeaders()->get('Message-ID')?->getBodyAsString());

        $html = (string) $email->getHtmlBody();
        $text = (string) $email->getTextBody();

        // Header / Identity
        self::assertStringContainsString('Gaza International Airport', $html);
        self::assertStringContainsString('مطار غزة الدولي', $html);
        self::assertStringContainsString('Palestinian Airlines', $html);
        self::assertStringContainsString('الخطوط الجوية الفلسطينية', $html);

        // Core dynamic booking fields
        self::assertStringContainsString('GZA-7K8P', $html);
        self::assertStringContainsString('PS 204', $html);
        self::assertStringContainsString('Omar Khalil', $html);
        self::assertStringContainsString('PS-0012345', $html);
        self::assertStringContainsString('12A', $html);
        self::assertStringContainsString('Standard Vegetarian', $html);
        self::assertStringContainsString('نباتي عادي', $html);
        self::assertStringContainsString('Airbus A320', $html);

        // Owner-approved ticket wording
        self::assertStringNotContainsString('AI-generated illustrative future concept', $html);
        self::assertStringContainsString('Ticket / Itinerary', $html);
        self::assertStringContainsString('التذكرة / مسار الرحلة', $html);
        self::assertStringNotContainsString('تصوّر معماري مستقبلي مُولَّد بالذكاء الاصطناعي', $html);

        // Trusted CTA without PII
        self::assertStringContainsString('https://www.gazaairport.com/manage', $html);
        self::assertStringNotContainsString('passenger@example.test', $html); // No email query param in CTA
        self::assertStringContainsString('View / print your ticket', $html);
        self::assertStringContainsString('عرض / طباعة تذكرتك', $html);
        self::assertStringContainsString('For guest bookings, enter your reference and verify your email to view or print your ticket', $html);
        self::assertStringContainsString('Account holders may also sign in directly', $html);
        self::assertStringContainsString('لحجوزات الضيوف، أدخل مرجع حجزك وتحقق من بريدك الإلكتروني لعرض التذكرة أو طباعتها', $html);
        self::assertStringNotContainsString('no direct link bypass', strtolower($html));
        self::assertStringNotContainsString('التجاوز المباشر', $html);

        // Text fallback parity
        self::assertStringContainsString('GZA-7K8P', $text);
        self::assertStringContainsString('Omar Khalil', $text);
        self::assertStringContainsString('PS 204', $text);
        self::assertStringContainsString('Standard Vegetarian', $text);
        self::assertStringContainsString('View / print your ticket: https://www.gazaairport.com/manage', $text);
        self::assertStringContainsString('عرض / طباعة تذكرتك: https://www.gazaairport.com/manage', $text);
        self::assertStringContainsString('For guest bookings, enter your reference and verify your email to view or print your ticket', $text);
        self::assertStringContainsString('لحجوزات الضيوف، أدخل مرجع حجزك وتحقق من بريدك الإلكتروني لعرض التذكرة أو طباعتها', $text);
        self::assertStringNotContainsString('no direct link bypass', strtolower($text));
        self::assertStringNotContainsString('التجاوز المباشر', $text);
    }

    public function test_fails_closed_on_missing_or_invalid_status(): void
    {
        $payloadNoStatus = self::syntheticPayload();
        unset($payloadNoStatus['ticket']['status']);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid or missing ticket status:');
        TicketEmail::build($payloadNoStatus, self::syntheticConfig(), 'att-fail-1', '2026-10-16T12:00:00Z');
    }

    public function test_fails_closed_on_unrecognized_status(): void
    {
        $payloadPending = self::syntheticPayload(['status' => 'pending']);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid or missing ticket status: pending');
        TicketEmail::build($payloadPending, self::syntheticConfig(), 'att-fail-2', '2026-10-16T12:00:00Z');
    }

    public function test_fails_closed_on_missing_ticket_payload(): void
    {
        $payloadNoTicket = ['purpose' => 'ticket', 'recipient' => 'test@example.test'];

        $this->expectException(\InvalidArgumentException::class);
        TicketEmail::build($payloadNoTicket, self::syntheticConfig(), 'att-fail-3', '2026-10-16T12:00:00Z');
    }

    public function test_fails_closed_on_empty_passengers_list(): void
    {
        $payloadEmptyPax = self::syntheticPayload(['tickets' => []]);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Ticket must contain at least one passenger ticket.');
        TicketEmail::build($payloadEmptyPax, self::syntheticConfig(), 'att-fail-4', '2026-10-16T12:00:00Z');
    }

    public function test_cancelled_status_shows_explicit_text_and_badge_color(): void
    {
        $payload = self::syntheticPayload(['status' => 'cancelled']);
        $email = TicketEmail::build($payload, self::syntheticConfig(), 'attempt-cancel', '2026-10-16T12:00:00Z');

        $html = (string) $email->getHtmlBody();
        $text = (string) $email->getTextBody();

        self::assertStringContainsString('Cancelled', $html);
        self::assertStringContainsString('ملغى', $html);
        self::assertStringContainsString('#A92D32', $html); // Cancelled badge color

        self::assertStringContainsString('Status: Cancelled', $text);
        self::assertStringContainsString('الحالة: ملغى', $text);

        // Cancelled seat must show released not assigned (in both HTML and text fallback)
        self::assertStringContainsString('Released', $html);
        self::assertStringContainsString('محرر', $html);
        self::assertStringNotContainsString('Not assigned', $html);
        self::assertStringNotContainsString('غير محدد', $html);
        self::assertStringContainsString('Seat: Released', $text);
        self::assertStringContainsString('المقعد: محرر', $text);
    }

    public function test_signed_calendar_day_offsets_overnight_multiday_and_westward(): void
    {
        // Case 1: Same day -> no +1, +2, or -1 offset label badge
        $sameDay = self::syntheticPayload([
            'flight' => ['date' => '2026-10-15', 'arrivalDate' => '2026-10-15', 'arriveTime' => '17:00'],
        ]);
        $emailSameDay = TicketEmail::build($sameDay, self::syntheticConfig(), 'att-sameday', '2026-10-16T12:00:00Z');
        self::assertStringNotContainsString('<span style="color:#A92D32;font-size:11px;">', (string) $emailSameDay->getHtmlBody());
        self::assertStringNotContainsString('(+1)', (string) $emailSameDay->getTextBody());
        self::assertStringNotContainsString('(+2)', (string) $emailSameDay->getTextBody());
        self::assertStringNotContainsString('(-1)', (string) $emailSameDay->getTextBody());

        // Case 2: Overnight (+1)
        $overnight = self::syntheticPayload([
            'flight' => ['date' => '2026-10-15', 'arrivalDate' => '2026-10-16', 'arriveTime' => '02:30'],
        ]);
        $emailOvernight = TicketEmail::build($overnight, self::syntheticConfig(), 'att-overnight', '2026-10-16T12:00:00Z');
        self::assertStringContainsString('<span style="color:#A92D32;font-size:11px;">+1</span>', (string) $emailOvernight->getHtmlBody());
        self::assertStringContainsString('2026-10-16', (string) $emailOvernight->getHtmlBody());
        self::assertStringContainsString('+1', (string) $emailOvernight->getTextBody());

        // Case 3: Multi-day (+2)
        $multiDay = self::syntheticPayload([
            'flight' => ['date' => '2026-10-15', 'arrivalDate' => '2026-10-17', 'arriveTime' => '08:00'],
        ]);
        $emailMultiDay = TicketEmail::build($multiDay, self::syntheticConfig(), 'att-multiday', '2026-10-16T12:00:00Z');
        self::assertStringContainsString('<span style="color:#A92D32;font-size:11px;">+2</span>', (string) $emailMultiDay->getHtmlBody());
        self::assertStringContainsString('2026-10-17', (string) $emailMultiDay->getHtmlBody());
        self::assertStringContainsString('+2', (string) $emailMultiDay->getTextBody());

        // Case 4: Westward cross-day (-1)
        $westward = self::syntheticPayload([
            'flight' => ['date' => '2026-10-15', 'arrivalDate' => '2026-10-14', 'arriveTime' => '23:30'],
        ]);
        $emailWestward = TicketEmail::build($westward, self::syntheticConfig(), 'att-westward', '2026-10-16T12:00:00Z');
        self::assertStringContainsString('<span style="color:#A92D32;font-size:11px;">-1</span>', (string) $emailWestward->getHtmlBody());
        self::assertStringContainsString('2026-10-14', (string) $emailWestward->getHtmlBody());
        self::assertStringContainsString('-1', (string) $emailWestward->getTextBody());
    }

    public function test_canonical_aircraft_model_only_omits_when_absent_never_fabricates(): void
    {
        // Case 1: Canonical aircraft present
        $withAircraft = self::syntheticPayload([
            'flight' => ['aircraftModel' => 'Boeing 737-800'],
        ]);
        $emailWith = TicketEmail::build($withAircraft, self::syntheticConfig(), 'att-aircraft-1', '2026-10-16T12:00:00Z');
        self::assertStringContainsString('Boeing 737-800', (string) $emailWith->getHtmlBody());
        self::assertStringContainsString('Boeing 737-800', (string) $emailWith->getTextBody());

        // Case 2: Canonical aircraft absent -> must NOT fabricate "Airbus A320neo"
        $withoutAircraft = self::syntheticPayload([
            'flight' => ['aircraftModel' => ''],
        ]);
        $emailWithout = TicketEmail::build($withoutAircraft, self::syntheticConfig(), 'att-aircraft-2', '2026-10-16T12:00:00Z');
        self::assertStringNotContainsString('Airbus A320neo', (string) $emailWithout->getHtmlBody());
        self::assertStringNotContainsString('Airbus A320neo', (string) $emailWithout->getTextBody());
    }

    public function test_cabin_rendered_only_when_canonical_data_specifies_it(): void
    {
        // Case 1: Cabin present
        $withCabin = self::syntheticPayload([
            'tickets' => [
                [
                    'ticketNumber' => 'PS-100',
                    'cabin' => 'Business Class',
                    'passenger' => ['firstName' => 'Sara', 'lastName' => 'Husseini', 'seatCode' => '1A'],
                ],
            ],
        ]);
        $emailWith = TicketEmail::build($withCabin, self::syntheticConfig(), 'att-cabin-1', '2026-10-16T12:00:00Z');
        self::assertStringContainsString('Business Class', (string) $emailWith->getHtmlBody());
        self::assertStringContainsString('Cabin: Business Class', (string) $emailWith->getTextBody());

        // Case 2: Cabin absent -> no fake Economy
        $withoutCabin = self::syntheticPayload();
        $emailWithout = TicketEmail::build($withoutCabin, self::syntheticConfig(), 'att-cabin-2', '2026-10-16T12:00:00Z');
        self::assertStringNotContainsString('Economy', (string) $emailWithout->getHtmlBody());
        self::assertStringNotContainsString('Cabin:', (string) $emailWithout->getTextBody());
    }

    public function test_html_escaping_and_unicode_name_handling(): void
    {
        $payload = self::syntheticPayload([
            'tickets' => [
                [
                    'ticketNumber' => 'PS-999',
                    'passenger' => [
                        'firstName' => '<script>alert("xss")</script>',
                        'lastName' => 'O\'Connor & Sons',
                        'seatCode' => '3B',
                    ],
                ],
                [
                    'ticketNumber' => 'PS-1000',
                    'passenger' => [
                        'firstName' => 'طارق',
                        'lastName' => 'البرغوثي',
                        'seatCode' => '3C',
                    ],
                ],
            ],
        ]);

        $email = TicketEmail::build($payload, self::syntheticConfig(), 'att-escaping', '2026-10-16T12:00:00Z');
        $html = (string) $email->getHtmlBody();

        // Must escape HTML special chars
        self::assertStringNotContainsString('<script>alert("xss")</script>', $html);
        self::assertStringContainsString('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', $html);
        self::assertStringContainsString('O&#039;Connor &amp; Sons', $html);

        // Unicode Arabic names preserved
        self::assertStringContainsString('طارق البرغوثي', $html);
    }

    public function test_long_names_and_nine_passengers_payload_under_128kb(): void
    {
        $ninePassengers = [];
        for ($i = 1; $i <= 9; $i++) {
            $ninePassengers[] = [
                'ticketNumber' => sprintf('PS-%07d', 1000 + $i),
                'passenger' => [
                    'firstName' => $i % 2 === 0 ? 'سعادة السفير الدكتور عبد الرحمن' : 'Dr. Abdel-Rahman Mohammad',
                    'lastName' => $i % 2 === 0 ? 'محمد مصطفى الحسيني' : 'Mustafa Al-Husseini',
                    'type' => $i === 9 ? 'child' : 'adult',
                    'seatCode' => $i . 'A',
                    'meal' => [
                        'id' => 'meal-veg',
                        'label' => [
                            'en' => 'Vegetarian Lacto-Ovo Meal with Fresh Herbs',
                            'ar' => 'وجبة نباتية خالية من المشتقات الحيوانية بالأعشاب',
                        ],
                    ],
                ],
                'cabin' => $i <= 2 ? 'First Class Executive' : null,
            ];
        }

        $payload = self::syntheticPayload([
            'reference' => 'GZA-9PAX',
            'tickets' => $ninePassengers,
        ]);

        $email = TicketEmail::build($payload, self::syntheticConfig(), 'attempt-nine-pax', '2026-10-16T12:00:00Z');
        $html = (string) $email->getHtmlBody();
        $text = (string) $email->getTextBody();

        // All 9 passengers must be rendered
        for ($i = 1; $i <= 9; $i++) {
            self::assertStringContainsString(sprintf('PS-%07d', 1000 + $i), $html);
            self::assertStringContainsString(sprintf('PS-%07d', 1000 + $i), $text);
        }

        // Long names must be present and escaped
        self::assertStringContainsString('Dr. Abdel-Rahman Mohammad', $html);
        self::assertStringContainsString('Mustafa Al-Husseini', $html);
        self::assertStringContainsString('سعادة السفير الدكتور عبد الرحمن', $html);
        self::assertStringContainsString('محمد مصطفى الحسيني', $html);

        // Strict size ceiling under 128KB (131,072 bytes)
        $htmlBytes = strlen($html);
        self::assertLessThan(128 * 1024, $htmlBytes, 'Nine-passenger email HTML body must remain under 128KB');
        self::assertLessThan(32 * 1024, strlen($text), 'Nine-passenger text fallback must remain compact');
    }
}
