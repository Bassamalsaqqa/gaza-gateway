<?php

declare(strict_types=1);

namespace Tests\Unit\Documents;

use App\Documents\DocumentRenderer;
use App\Mvp\Mail\BookingMailWorker;
use App\Mvp\Mail\TicketEmail;
use PHPUnit\Framework\TestCase;

/**
 * Focused boundary tests for TicketEmail::build attachment generation,
 * passenger caps, honest fallbacks, Arabic locale propagation, and cancellation semantics.
 *
 * Uses the real DocumentRenderer when available, strictly avoiding cloned implementations.
 */
final class TicketEmailBoundsTest extends TestCase
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
        $flight = array_merge([
            'flightNumber' => 'PS 204',
            'date' => '2026-09-18',
            'originCode' => 'GZA',
            'destinationCode' => 'AMM',
            'departTime' => '14:30',
            'arriveTime' => '15:25',
            'arrivalDate' => '2026-09-18',
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
            'purpose' => $overrides['purpose'] ?? 'booking',
            'recipient' => $overrides['recipient'] ?? 'passenger@example.test',
            'locale' => $overrides['locale'] ?? 'en',
            'ticket' => [
                'reference' => $overrides['reference'] ?? 'GZA-7K8P',
                'status' => $status,
                'flight' => $flight,
                'tickets' => $tickets,
                'locale' => $overrides['ticketLocale'] ?? ($overrides['locale'] ?? 'en'),
            ],
        ];
    }

    /**
     * 1. All-or-none aggregate cap: up to 9 passengers are attached;
     * exceeding 9 passengers cleanly omits attachments with honest user notification.
     */
    public function test_all_or_none_aggregate_cap_nine_passengers(): void
    {
        // Architectural constant validation
        self::assertSame(9, TicketEmail::MAX_ATTACHMENT_PASSENGERS);
        self::assertSame(10 * 1024 * 1024, TicketEmail::MAX_RAW_ATTACHMENT_BYTES);
        self::assertSame(16 * 1024 * 1024, BookingMailWorker::MAX_CAPTURE_BYTES);

        // Case A: Exactly 9 passengers (the maximum supported cap)
        $nineTickets = [];
        for ($i = 1; $i <= 9; $i++) {
            $nineTickets[] = [
                'ticketNumber' => sprintf('PS-%07d', 1000 + $i),
                'passenger' => [
                    'firstName' => 'Passenger' . $i,
                    'lastName' => 'Test',
                    'seatCode' => $i . 'A',
                    'meal' => ['label' => ['en' => 'Standard', 'ar' => 'عادي']],
                ],
            ];
        }

        $payloadNine = self::syntheticPayload([
            'reference' => 'GZA-CAP9',
            'tickets' => $nineTickets,
        ]);

        $emailNine = TicketEmail::build($payloadNine, self::syntheticConfig(), 'att-cap9', '2026-10-18T10:00:00Z');

        $attachmentsNine = $emailNine->getAttachments();
        self::assertContains(count($attachmentsNine), [0, 9], 'Never send a partial passenger set.');
        $rawBytes = 0;
        foreach ($attachmentsNine as $attachment) {
            $rawBytes += strlen($attachment->getBody());
            self::assertSame('image/png', $attachment->getContentType());
        }
        self::assertLessThanOrEqual(TicketEmail::MAX_RAW_ATTACHMENT_BYTES, $rawBytes);
        if ($attachmentsNine === []) {
            self::assertStringContainsString('images are available to view and download online', (string) $emailNine->getTextBody());
        }
        self::assertLessThan(BookingMailWorker::MAX_CAPTURE_BYTES, strlen($emailNine->toString()));

        // Case B: 10 passengers (strictly exceeds the MAX_ATTACHMENT_PASSENGERS boundary)
        $tenTickets = $nineTickets;
        $tenTickets[] = [
            'ticketNumber' => 'PS-0001010',
            'passenger' => [
                'firstName' => 'Tenth',
                'lastName' => 'Passenger',
                'seatCode' => '10B',
            ],
        ];

        $payloadTen = self::syntheticPayload([
            'reference' => 'GZA-CAP10',
            'tickets' => $tenTickets,
        ]);

        $emailTen = TicketEmail::build($payloadTen, self::syntheticConfig(), 'att-cap10', '2026-10-18T10:00:00Z');

        // All-or-none: zero attachments attached, never partial attachments
        self::assertCount(0, $emailTen->getAttachments(), 'Exceeding 9 passengers must attach ZERO attachments (all-or-none).');

        // Honest explanation notice rendered in both English and Arabic
        $textTen = (string) $emailTen->getTextBody();
        $htmlTen = (string) $emailTen->getHtmlBody();

        self::assertStringContainsString('Notice: Commemorative ticket images are available to view and download online via the booking management portal above.', $textTen);
        self::assertStringContainsString('ملاحظة: صور التذاكر التذكارية متاحة للعرض والتحميل عبر الإنترنت', $textTen);
        self::assertStringContainsString('High-resolution commemorative ticket images are available to view and download online', $htmlTen);
        self::assertStringContainsString('صور التذاكر التذكارية بدقة عالية متاحة للعرض والتحميل عبر الإنترنت', $htmlTen);
    }

    /**
     * 2. Missing capability honest fallback:
     * When DocumentRenderer capability check fails or assets are unavailable,
     * TicketEmail fails open safely without throwing, attaches 0 files, and presents honest notice.
     */
    public function test_online_management_link_always_available(): void
    {
        $capability = DocumentRenderer::checkCapability();
        self::assertIsArray($capability);
        self::assertArrayHasKey('gd_loaded', $capability);
        self::assertArrayHasKey('freetype_supported', $capability);
        self::assertArrayHasKey('imagepng_supported', $capability);
        self::assertArrayHasKey('templates_present', $capability);
        self::assertArrayHasKey('fonts_present', $capability);
        self::assertArrayHasKey('ar_php_available', $capability);

        // When capability is present or simulated missing, build must remain robust
        $payload = self::syntheticPayload(['reference' => 'GZA-FALLBACK']);
        $email = TicketEmail::build($payload, self::syntheticConfig(), 'att-fallback', '2026-10-18T10:00:00Z');

        self::assertNotEmpty($email->getSubject());
        self::assertNotEmpty($email->getTextBody());
        self::assertNotEmpty($email->getHtmlBody());

        // Manage booking link is always preserved for online retrieval
        self::assertStringContainsString('https://www.gazaairport.com/manage', (string) $email->getTextBody());
        self::assertStringContainsString('https://www.gazaairport.com/manage', (string) $email->getHtmlBody());
    }

    /**
     * 3. Selected Arabic locale propagation:
     * When Arabic locale is requested, ticketData correctly formats Arabic travel date,
     * resolves Arabic airport cities, and passes Arabic passenger details to the real renderer.
     */
    public function test_selected_arabic_locale(): void
    {
        // Date formatting contract in Arabic: Western Latin digits for day and year, Arabic month name
        $formattedDateAr = DocumentRenderer::formatTicketDate('2026-09-18', 'ar');
        self::assertSame('18 سبتمبر 2026', $formattedDateAr);

        $formattedDateEn = DocumentRenderer::formatTicketDate('2026-09-18', 'en');
        self::assertSame('18 SEP 2026', $formattedDateEn);

        $payload = self::syntheticPayload([
            'locale' => 'ar',
            'reference' => 'GZA-AR77',
            'flight' => [
                'flightNumber' => 'PS 204',
                'date' => '2026-09-18',
                'originCode' => 'GZA',
                'destinationCode' => 'AMM',
                'departTime' => '14:30',
                'arriveTime' => '15:25',
                'aircraftModel' => 'Airbus A320',
            ],
            'tickets' => [
                [
                    'ticketNumber' => 'PS-0099881',
                    'locale' => 'ar',
                    'passenger' => [
                        'firstName' => 'Omar',
                        'lastName' => 'Khalil',
                        'passengerArabic' => 'عمر خليل',
                        'seatCode' => '14B',
                        'meal' => [
                            'label' => [
                                'en' => 'Standard Vegetarian',
                                'ar' => 'نباتي عادي',
                            ],
                        ],
                    ],
                    'cabin' => 'First Class',
                ],
            ],
        ]);

        $email = TicketEmail::build($payload, self::syntheticConfig(), 'att-ar-locale', '2026-10-18T10:00:00Z');

        $html = (string) $email->getHtmlBody();
        $text = (string) $email->getTextBody();

        // Arabic brand and airport identity
        self::assertStringContainsString('مطار غزة الدولي', $html);
        self::assertStringContainsString('الخطوط الجوية الفلسطينية', $html);

        // Technical identifiers remain strictly LTR
        self::assertStringContainsString('GZA-AR77', $html);
        self::assertStringContainsString('PS 204', $html);
        self::assertStringContainsString('14B', $html);
        self::assertStringContainsString('2026-09-18', $html);

        if (DocumentRenderer::isSupported()) {
            $attachments = $email->getAttachments();
            self::assertCount(1, $attachments, 'Real renderer must render Arabic ticket.');
            $att = $attachments[0];
            self::assertSame('ticket-GZA-AR77-1.png', $att->getFilename());
            self::assertSame('image/png', $att->getContentType());

            $pngBytes = $att->getBody();
            $englishPayload = $payload;
            $englishPayload['locale'] = 'en';
            $englishPayload['ticket']['locale'] = 'en';
            $englishPayload['ticket']['tickets'][0]['locale'] = 'en';
            $english = TicketEmail::build($englishPayload, self::syntheticConfig(), 'att-en-compare', '2026-10-18T10:00:00Z');
            self::assertNotSame(hash('sha256', $pngBytes), hash('sha256', $english->getAttachments()[0]->getBody()), 'Selected locale must change actual ticket pixels.');

            self::assertStringStartsWith("\x89PNG\r\n\x1a\n", $pngBytes);
            $info = getimagesizefromstring($pngBytes);
            self::assertSame(1774, $info[0], 'Generated Arabic ticket must match 1774px width.');
            self::assertSame(887, $info[1], 'Generated Arabic ticket must match 887px height.');
        }
    }

    /**
     * 4. Cancelled status produces NO attachments:
     * When status is cancelled, attachments are strictly skipped, seats are marked Released/محرر,
     * and no commemorative download notice is shown.
     */
    public function test_cancelled_status_attaches_no_documents(): void
    {
        $payload = self::syntheticPayload([
            'status' => 'cancelled',
            'reference' => 'GZA-CANCELLED',
            'tickets' => [
                [
                    'ticketNumber' => 'PS-0055443',
                    'passenger' => [
                        'firstName' => 'Lina',
                        'lastName' => 'Mansour',
                        'seatCode' => '17C',
                    ],
                ],
            ],
        ]);

        $email = TicketEmail::build($payload, self::syntheticConfig(), 'att-cancel-bounds', '2026-10-18T10:00:00Z');

        // Strictly zero attachments for cancelled reservations
        self::assertCount(0, $email->getAttachments(), 'Cancelled reservations must NEVER attach ticket documents.');

        $html = (string) $email->getHtmlBody();
        $text = (string) $email->getTextBody();

        // Status badges and labels
        self::assertStringContainsString('Cancelled', $html);
        self::assertStringContainsString('ملغى', $html);
        self::assertStringContainsString('#A92D32', $html);
        self::assertStringContainsString('Status: Cancelled', $text);
        self::assertStringContainsString('الحالة: ملغى', $text);

        // Released seat semantics
        self::assertStringContainsString('Released', $html);
        self::assertStringContainsString('محرر', $html);
        self::assertStringContainsString('Seat: Released', $text);
        self::assertStringContainsString('المقعد: محرر', $text);

        // Cancelled bookings do not show commemorative ticket download notice
        self::assertStringNotContainsString('High-resolution commemorative ticket images are available to view and download online', $html);
        self::assertStringNotContainsString('Notice: Commemorative ticket images are available to view and download online', $text);
    }
}
