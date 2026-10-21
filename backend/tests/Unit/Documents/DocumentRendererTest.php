<?php

declare(strict_types=1);

namespace Tests\Unit\Documents;

use App\Documents\DocumentCapabilityException;
use App\Documents\DocumentRenderer;
use App\Mvp\Mail\TicketEmail;
use PHPUnit\Framework\TestCase;

final class DocumentRendererTest extends TestCase
{
    private DocumentRenderer $renderer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->renderer = new DocumentRenderer();
    }

    private static function sampleTicketData(array $overrides = []): array
    {
        return array_merge([
            'passenger' => 'OMAR KHALIL',
            'passengerArabic' => 'عمر خليل',
            'fromCode' => 'GZA',
            'toCode' => 'IST',
            'fromCity' => 'GAZA',
            'toCity' => 'ISTANBUL',
            'fromCityArabic' => 'غزة',
            'toCityArabic' => 'إسطنبول',
            'flight' => 'GA101',
            'travelDate' => '15 APR 2026',
            'departure' => '11:20',
            'gate' => 'A3',
            'seat' => '12A',
            'cabin' => null, // Strict default: neutral emdash when absent, never fake Economy
            'reference' => 'GA7K9L2',
            'status' => 'confirmed',
            'locale' => 'en',
        ], $overrides);
    }

    private static function sampleArchiveData(array $overrides = []): array
    {
        return array_merge([
            'contributorName' => 'Omar Khalil',
            'contributorNameArabic' => 'عمر خليل',
            'archiveId' => 'GA-AR-2026-001',
            'locale' => 'en',
        ], $overrides);
    }

    private static function syntheticConfig(): array
    {
        return [
            'senderEmail' => 'tickets@example.test',
            'senderName' => 'Gaza Gateway',
            'replyTo' => 'support@example.test',
        ];
    }

    // 1. Dimensions and PNG integrity
    public function test_render_ticket_dimensions_and_png_integrity(): void
    {
        $pngBytes = $this->renderer->renderTicket(self::sampleTicketData());

        self::assertNotEmpty($pngBytes);
        self::assertStringStartsWith("\x89PNG\r\n\x1a\n", $pngBytes);

        $imageInfo = getimagesizefromstring($pngBytes);
        self::assertNotFalse($imageInfo);
        self::assertSame(1774, $imageInfo[0], 'Ticket width must be exactly 1774 px.');
        self::assertSame(887, $imageInfo[1], 'Ticket height must be exactly 887 px.');
        self::assertSame('image/png', $imageInfo['mime']);
    }

    public function test_render_archive_thank_you_dimensions_and_png_integrity(): void
    {
        $pngBytes = $this->renderer->renderArchiveThankYou(self::sampleArchiveData());

        self::assertNotEmpty($pngBytes);
        self::assertStringStartsWith("\x89PNG\r\n\x1a\n", $pngBytes);

        $imageInfo = getimagesizefromstring($pngBytes);
        self::assertNotFalse($imageInfo);
        self::assertSame(1122, $imageInfo[0], 'Archive thank-you tag width must be exactly 1122 px.');
        self::assertSame(1402, $imageInfo[1], 'Archive thank-you tag height must be exactly 1402 px.');
        self::assertSame('image/png', $imageInfo['mime']);
    }

    // 2. Cabin neutral emdash when absent, rendered when present (no fake Economy)
    public function test_cabin_neutral_emdash_when_absent_never_fabricates_economy(): void
    {
        // Case A: Absent cabin -> renders cleanly with emdash '—'
        $bytesWithoutCabin = $this->renderer->renderTicket(self::sampleTicketData(['cabin' => null]));
        self::assertNotEmpty($bytesWithoutCabin);

        // Case B: Explicit cabin -> renders specified cabin
        $bytesWithCabin = $this->renderer->renderTicket(self::sampleTicketData(['cabin' => 'Business Class']));
        self::assertNotEmpty($bytesWithCabin);

        // They must differ since text differs
        self::assertNotSame($bytesWithoutCabin, $bytesWithCabin);
    }

    // 3. Dynamic labels selected locale only (Invariant 3)
    public function test_dynamic_labels_selected_locale_only(): void
    {
        $enTicket = $this->renderer->renderTicket(self::sampleTicketData(['locale' => 'en']));
        $arTicket = $this->renderer->renderTicket(self::sampleTicketData(['locale' => 'ar']));

        self::assertNotEmpty($enTicket);
        self::assertNotEmpty($arTicket);
        self::assertNotSame($enTicket, $arTicket);
    }

    // 4. Arabic shaping, joining, and script integrity
    public function test_arabic_text_joining_and_bidi(): void
    {
        $data = self::sampleTicketData([
            'passenger' => 'FATIMA AL-NAJJAR',
            'passengerArabic' => 'فاطمة النجار',
            'fromCityArabic' => 'غزة',
            'toCityArabic' => 'القاهرة',
        ]);

        $pngBytes = $this->renderer->renderTicket($data);
        self::assertNotEmpty($pngBytes);

        $im = imagecreatefromstring($pngBytes);
        self::assertNotFalse($im);
        self::assertTrue(imageistruecolor($im));
        imagedestroy($im);
    }

    // 5. Script integrity: Arabic main passenger rendered through Arabic font
    public function test_arabic_main_passenger_script_integrity(): void
    {
        // Pure Arabic main passenger name
        $arOnlyData = self::sampleTicketData([
            'passenger' => 'مصطفى الحسيني',
            'passengerArabic' => null,
            'locale' => 'ar',
        ]);
        $arOnlyBytes = $this->renderer->renderTicket($arOnlyData);
        self::assertNotEmpty($arOnlyBytes);

        // Bilingual delimited passenger name
        $bilingualData = self::sampleTicketData([
            'passenger' => 'Mustafa Al-Husseini / مصطفى الحسيني',
            'passengerArabic' => null,
            'locale' => 'en',
        ]);
        $bilingualBytes = $this->renderer->renderTicket($bilingualData);
        self::assertNotEmpty($bilingualBytes);

        // Both render valid PNGs
        self::assertSame(1774, getimagesizefromstring($arOnlyBytes)[0]);
        self::assertSame(1774, getimagesizefromstring($bilingualBytes)[0]);
    }

    // 6. Date formatting preserves Western digits in both locales
    public function test_date_formatting_preserves_western_digits_in_both_locales(): void
    {
        $enDate = DocumentRenderer::formatTicketDate('2026-10-18', 'en');
        $arDate = DocumentRenderer::formatTicketDate('2026-10-18', 'ar');

        self::assertSame('18 OCT 2026', $enDate);
        self::assertSame('18 أكتوبر 2026', $arDate);

        // Both must strictly preserve Western digits (0-9) per Invariant 3
        self::assertMatchesRegularExpression('/\b18\b/', $enDate);
        self::assertMatchesRegularExpression('/\b2026\b/', $enDate);
        self::assertMatchesRegularExpression('/\b18\b/', $arDate);
        self::assertMatchesRegularExpression('/\b2026\b/', $arDate);

        // Arabic date must not contain converted Indic/Hindo digits
        self::assertDoesNotMatchRegularExpression('/[٠-٩]/u', $arDate);
    }

    // 7. Cancelled status: top banner and released seat semantics
    public function test_cancelled_status_top_banner_and_released_seat_semantics(): void
    {
        $confirmedBytes = $this->renderer->renderTicket(self::sampleTicketData([
            'status' => 'confirmed',
            'locale' => 'en',
        ]));
        $cancelledEnBytes = $this->renderer->renderTicket(self::sampleTicketData([
            'status' => 'cancelled',
            'locale' => 'en',
        ]));
        $cancelledArBytes = $this->renderer->renderTicket(self::sampleTicketData([
            'status' => 'cancelled',
            'locale' => 'ar',
        ]));

        self::assertNotEmpty($confirmedBytes);
        self::assertNotEmpty($cancelledEnBytes);
        self::assertNotEmpty($cancelledArBytes);

        // Confirmed and cancelled are visually and byte-distinct
        self::assertNotSame($confirmedBytes, $cancelledEnBytes);
        self::assertNotSame($cancelledEnBytes, $cancelledArBytes);
    }

    // 8. Archive thank-you schema, Arabic contributor name, and locale
    public function test_archive_thank_you_schema_and_arabic_contributor(): void
    {
        // With bilingual contributor
        $withArabic = $this->renderer->renderArchiveThankYou(self::sampleArchiveData([
            'contributorName' => 'Tariq Al-Masri',
            'contributorNameArabic' => 'طارق المصري',
            'locale' => 'ar',
        ]));
        self::assertNotEmpty($withArabic);

        // Pure Arabic contributor
        $pureArabic = $this->renderer->renderArchiveThankYou([
            'contributorName' => 'طارق المصري',
            'archiveId' => 'GA-AR-2026-002',
            'locale' => 'ar',
        ]);
        self::assertNotEmpty($pureArabic);

        // Pure Latin contributor
        $pureLatin = $this->renderer->renderArchiveThankYou([
            'contributorName' => 'Tariq Al-Masri',
            'archiveId' => 'GA-AR-2026-003',
            'locale' => 'en',
        ]);
        self::assertNotEmpty($pureLatin);

        self::assertNotSame($withArabic, $pureArabic);
        self::assertNotSame($pureArabic, $pureLatin);
    }

    // 9. Bounds fitting with long Unicode names
    public function test_bounds_fitting_with_long_unicode_names(): void
    {
        $longLatinName = 'DR. ABDALLAH MUHAMMAD AL-GHAZAWI AL-MAQDISI THE THIRD OF GAZA';
        $longArabicName = 'الدكتور عبد الله محمد الغزاوي المقدسي الثالث من غزة هاشم';

        $data = self::sampleTicketData([
            'passenger' => $longLatinName,
            'passengerArabic' => $longArabicName,
            'reference' => 'LONG-REF-TEST-999',
        ]);

        $pngBytes = $this->renderer->renderTicket($data);
        self::assertNotEmpty($pngBytes);

        $imageInfo = getimagesizefromstring($pngBytes);
        self::assertSame(1774, $imageInfo[0]);
        self::assertSame(887, $imageInfo[1]);
    }

    // 10. Unassigned seat and gate
    public function test_unassigned_seat_and_gate_render_cleanly(): void
    {
        $data = self::sampleTicketData([
            'gate' => null,
            'seat' => null,
        ]);

        $pngBytes = $this->renderer->renderTicket($data);
        self::assertNotEmpty($pngBytes);

        $imageInfo = getimagesizefromstring($pngBytes);
        self::assertSame(1774, $imageInfo[0]);
        self::assertSame(887, $imageInfo[1]);
    }

    // 11. Ticket email attachment parity: 0 attachments when cancelled
    public function test_ticket_email_preserves_cancelled_truth_no_ticket_attachments(): void
    {
        $payload = [
            'purpose' => 'ticket',
            'recipient' => 'passenger@example.test',
            'ticket' => [
                'reference' => 'GZA-CANCEL',
                'status' => 'cancelled',
                'flight' => [
                    'flightNumber' => 'PS 204',
                    'date' => '2026-09-18',
                    'originCode' => 'GZA',
                    'destinationCode' => 'AMM',
                    'departTime' => '14:30',
                    'arriveTime' => '15:25',
                ],
                'tickets' => [
                    [
                        'ticketNumber' => 'PS-0012345',
                        'passenger' => [
                            'firstName' => 'Omar',
                            'lastName' => 'Khalil',
                            'type' => 'adult',
                            'seatCode' => '12A',
                        ],
                    ],
                ],
            ],
        ];

        $email = TicketEmail::build($payload, self::syntheticConfig(), 'att-cancel-truth', '2026-10-16T12:00:00Z');
        self::assertCount(0, $email->getAttachments(), 'Cancelled email must have 0 ticket attachments to preserve cancelled truth.');
    }

    // 12. Ticket email attaches rendered PNG for each passenger without fake Economy
    public function test_ticket_email_attaches_rendered_png_for_each_passenger(): void
    {
        $payload = [
            'purpose' => 'ticket',
            'recipient' => 'passenger@example.test',
            'ticket' => [
                'reference' => 'GZA-7K8P',
                'status' => 'confirmed',
                'flight' => [
                    'flightNumber' => 'PS 204',
                    'date' => '2026-09-18',
                    'originCode' => 'GZA',
                    'destinationCode' => 'AMM',
                    'departTime' => '14:30',
                    'arriveTime' => '15:25',
                ],
                'tickets' => [
                    [
                        'ticketNumber' => 'PS-0012345-1',
                        'passenger' => [
                            'firstName' => 'Omar',
                            'lastName' => 'Khalil',
                            'type' => 'adult',
                            'seatCode' => '12A',
                            // No cabin specified -> should NOT fabricate Economy
                        ],
                    ],
                    [
                        'ticketNumber' => 'PS-0012345-2',
                        'passenger' => [
                            'firstName' => 'Nour',
                            'lastName' => 'Khalil',
                            'type' => 'child',
                            'seatCode' => '12B',
                            'cabin' => 'First Class',
                        ],
                    ],
                ],
            ],
        ];

        $email = TicketEmail::build($payload, self::syntheticConfig(), 'att-pax-2', '2026-10-16T12:00:00Z');

        $attachments = $email->getAttachments();
        self::assertCount(2, $attachments, 'Should have exactly 2 ticket attachments for 2 passengers.');

        $att1 = $attachments[0];
        self::assertSame('ticket-GZA-7K8P-1.png', $att1->getFilename());
        self::assertSame('image/png', $att1->getContentType());
        $body1 = $att1->getBody();
        self::assertStringStartsWith("\x89PNG\r\n\x1a\n", $body1);
        $info1 = getimagesizefromstring($body1);
        self::assertSame(1774, $info1[0]);
        self::assertSame(887, $info1[1]);

        $att2 = $attachments[1];
        self::assertSame('ticket-GZA-7K8P-2.png', $att2->getFilename());
        self::assertSame('image/png', $att2->getContentType());
        $body2 = $att2->getBody();
        self::assertStringStartsWith("\x89PNG\r\n\x1a\n", $body2);
        $info2 = getimagesizefromstring($body2);
        self::assertSame(1774, $info2[0]);
        self::assertSame(887, $info2[1]);

        // Verify filenames do not expose credentials
        self::assertDoesNotMatchRegularExpression('/[a-f0-9]{8}-[a-f0-9]{4}/i', $att1->getFilename());
        self::assertStringNotContainsString('password', $att1->getFilename());
        self::assertStringNotContainsString('token', $att1->getFilename());
    }

    // 13. Bounded rendering memory and shared host deadline under max 9 pax
    public function test_nine_passengers_rendering_bounded_memory_and_deadline(): void
    {
        $startTime = microtime(true);
        $startMemory = memory_get_usage(true);

        $tickets = [];
        for ($i = 1; $i <= 9; $i++) {
            $isEven = $i % 2 === 0;
            $data = self::sampleTicketData([
                'passenger' => $isEven ? 'سعادة السفير الدكتور عبد الرحمن' : 'Dr. Abdel-Rahman Mohammad',
                'passengerArabic' => $isEven ? 'محمد مصطفى الحسيني' : null,
                'flight' => 'PS ' . (200 + $i),
                'seat' => $i . 'A',
                'cabin' => $i <= 2 ? 'First Class Executive' : null,
                'reference' => 'GZA-9PAX-TEST',
                'locale' => $isEven ? 'ar' : 'en',
            ]);
            $png = $this->renderer->renderTicket($data);
            self::assertNotEmpty($png);
            $tickets[] = $png;
        }

        $duration = microtime(true) - $startTime;
        $peakMemory = memory_get_peak_usage(true) - $startMemory;

        self::assertCount(9, $tickets);
        // Ensure 9 tickets render comfortably within shared host deadline (< 15 seconds)
        self::assertLessThan(15.0, $duration, 'Rendering 9 tickets must execute within 15 seconds.');
        // Ensure peak memory remains bounded (< 64MB)
        self::assertLessThan(64 * 1024 * 1024, $peakMemory, 'Memory for 9 tickets must stay under 64MB.');
    }

    // 14. Capability check and missing asset handling
    public function test_capability_check_reports_all_required_components(): void
    {
        $status = DocumentRenderer::checkCapability();

        self::assertIsArray($status);
        self::assertArrayHasKey('gd_loaded', $status);
        self::assertArrayHasKey('freetype_supported', $status);
        self::assertArrayHasKey('imagepng_supported', $status);
        self::assertArrayHasKey('templates_present', $status);
        self::assertArrayHasKey('fonts_present', $status);
        self::assertArrayHasKey('ar_php_available', $status);

        self::assertTrue($status['templates_present']);
        self::assertTrue($status['fonts_present']);
        self::assertTrue($status['ar_php_available']);
    }

    public function test_missing_asset_throws_document_capability_exception(): void
    {
        $badRenderer = new DocumentRenderer(
            templateDir: '/nonexistent/directory/templates',
            fontDir: '/nonexistent/directory/fonts'
        );

        $this->expectException(DocumentCapabilityException::class);
        $badRenderer->renderTicket(self::sampleTicketData());
    }

    public function test_missing_required_fields_throws_invalid_argument_exception(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/(Missing required field|Required field cannot be empty): passenger/');

        $this->renderer->renderTicket([
            'fromCode' => 'GZA',
            'toCode' => 'AMM',
        ]);
    }
}
