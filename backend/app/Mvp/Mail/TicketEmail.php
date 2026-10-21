<?php
declare(strict_types=1);

namespace App\Mvp\Mail;

use App\Documents\DocumentRenderer;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

final class TicketEmail
{
    public const MAX_RAW_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MiB aggregate raw limit (~14 MiB MIME)
    public const MAX_ATTACHMENT_PASSENGERS = 9;
    public const MAX_RENDER_SECONDS = 4.0;
    public static function build(#[\SensitiveParameter] array $payload, #[\SensitiveParameter] array $config, string $attemptId, string $createdAt): Email
    {
        $email = (new Email())->from(new Address($config['senderEmail'], $config['senderName']))->to($payload['recipient'])
            ->date(new \DateTimeImmutable($createdAt));
        if ($config['replyTo'] !== '') $email->replyTo($config['replyTo']);
        $email->getHeaders()->addIdHeader('Message-ID', $attemptId.'@gazaairport.com');
        if ($payload['purpose'] === 'test') {
            return $email->subject('Gaza Gateway email configuration test')
                ->text("Gaza International Airport\nThis is a requested email configuration test.\n")
                ->html('<html lang="en"><body style="background:#eee7d8;color:#25352b;font-family:Arial,sans-serif;padding:32px"><h1>Gaza International Airport</h1><p>This is a requested email configuration test.</p></body></html>');
        }

        $ticket = $payload['ticket'] ?? [];
        if (!is_array($ticket)) {
            throw new \InvalidArgumentException('Invalid ticket payload.');
        }

        // Schema authority requires status: fail closed on missing or unvalidated status
        $status = (string) ($ticket['status'] ?? '');
        if ($status !== 'confirmed' && $status !== 'cancelled') {
            throw new \InvalidArgumentException('Invalid or missing ticket status: ' . $status);
        }
        $isCancelled = $status === 'cancelled';

        $escape = static fn(?string $s): string => htmlspecialchars((string) ($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $airports = [
            'GZA' => ['city' => ['en' => 'Gaza', 'ar' => 'غزة'], 'name' => ['en' => 'Gaza International Airport', 'ar' => 'مطار غزة الدولي']],
            'AMM' => ['city' => ['en' => 'Amman', 'ar' => 'عمّان'], 'name' => ['en' => 'Queen Alia International', 'ar' => 'مطار الملكة علياء الدولي']],
            'CAI' => ['city' => ['en' => 'Cairo', 'ar' => 'القاهرة'], 'name' => ['en' => 'Cairo International', 'ar' => 'مطار القاهرة الدولي']],
            'IST' => ['city' => ['en' => 'Istanbul', 'ar' => 'إسطنبول'], 'name' => ['en' => 'Istanbul Airport', 'ar' => 'مطار إسطنبول']],
            'DOH' => ['city' => ['en' => 'Doha', 'ar' => 'الدوحة'], 'name' => ['en' => 'Hamad International', 'ar' => 'مطار حمد الدولي']],
            'DXB' => ['city' => ['en' => 'Dubai', 'ar' => 'دبي'], 'name' => ['en' => 'Dubai International', 'ar' => 'مطار دبي الدولي']],
            'JED' => ['city' => ['en' => 'Jeddah', 'ar' => 'جدة'], 'name' => ['en' => 'King Abdulaziz International', 'ar' => 'مطار الملك عبد العزيز الدولي']],
            'RUH' => ['city' => ['en' => 'Riyadh', 'ar' => 'الرياض'], 'name' => ['en' => 'King Khalid International', 'ar' => 'مطار الملك خالد الدولي']],
            'BEY' => ['city' => ['en' => 'Beirut', 'ar' => 'بيروت'], 'name' => ['en' => 'Beirut–Rafic Hariri International', 'ar' => 'مطار رفيق الحريري الدولي']],
            'KWI' => ['city' => ['en' => 'Kuwait City', 'ar' => 'الكويت'], 'name' => ['en' => 'Kuwait International', 'ar' => 'مطار الكويت الدولي']],
            'AUH' => ['city' => ['en' => 'Abu Dhabi', 'ar' => 'أبوظبي'], 'name' => ['en' => 'Zayed International', 'ar' => 'مطار زايد الدولي']],
            'ATH' => ['city' => ['en' => 'Athens', 'ar' => 'أثينا'], 'name' => ['en' => 'Athens International', 'ar' => 'مطار أثينا الدولي']],
            'FCO' => ['city' => ['en' => 'Rome', 'ar' => 'روما'], 'name' => ['en' => 'Leonardo da Vinci–Fiumicino', 'ar' => 'مطار ليوناردو دا فينشي']],
            'CDG' => ['city' => ['en' => 'Paris', 'ar' => 'باريس'], 'name' => ['en' => 'Charles de Gaulle', 'ar' => 'مطار شارل ديغول']],
            'LHR' => ['city' => ['en' => 'London', 'ar' => 'لندن'], 'name' => ['en' => 'Heathrow', 'ar' => 'مطار هيثرو']],
            'FRA' => ['city' => ['en' => 'Frankfurt', 'ar' => 'فرانكفورت'], 'name' => ['en' => 'Frankfurt Airport', 'ar' => 'مطار فرانكفورت']],
            'MAD' => ['city' => ['en' => 'Madrid', 'ar' => 'مدريد'], 'name' => ['en' => 'Adolfo Suárez Madrid–Barajas', 'ar' => 'مطار مدريد باراخاس الدولي']],
            'BOM' => ['city' => ['en' => 'Mumbai', 'ar' => 'مومباي'], 'name' => ['en' => 'Chhatrapati Shivaji Maharaj', 'ar' => 'مطار تشاتراباتي شيفاجي الدولي']],
            'KUL' => ['city' => ['en' => 'Kuala Lumpur', 'ar' => 'كوالالمبور'], 'name' => ['en' => 'Kuala Lumpur International', 'ar' => 'مطار كوالالمبور الدولي']],
            'JFK' => ['city' => ['en' => 'New York', 'ar' => 'نيويورك'], 'name' => ['en' => 'John F. Kennedy International', 'ar' => 'مطار جون إف كينيدي الدولي']],
            'YYZ' => ['city' => ['en' => 'Toronto', 'ar' => 'تورونتو'], 'name' => ['en' => 'Toronto Pearson International', 'ar' => 'مطار تورونتو بيرسون الدولي']],
            'OSL' => ['city' => ['en' => 'Oslo', 'ar' => 'أوسلو'], 'name' => ['en' => 'Oslo Airport, Gardermoen', 'ar' => 'مطار أوسلو، غاردرموين']],
            'ARN' => ['city' => ['en' => 'Stockholm', 'ar' => 'ستوكهولم'], 'name' => ['en' => 'Stockholm Arlanda Airport', 'ar' => 'مطار ستوكهولم أرلاندا']],
        ];

        $resolveCity = static function (string $code, string $lang) use ($airports): string {
            $upper = strtoupper(trim($code));
            return $airports[$upper]['city'][$lang] ?? $upper;
        };

        $reference = (string) ($ticket['reference'] ?? '');

        $flight = $ticket['flight'] ?? [];
        $originCode = (string) ($flight['originCode'] ?? '');
        $destCode = (string) ($flight['destinationCode'] ?? '');
        $flightNum = (string) ($flight['flightNumber'] ?? '');
        $flightDate = (string) ($flight['date'] ?? '');
        $departTime = (string) ($flight['departTime'] ?? '');
        $arriveTime = (string) ($flight['arriveTime'] ?? '');
        $arrivalDate = (string) ($flight['arrivalDate'] ?? $flightDate);

        // Canonical signed calendar day difference (e.g. +1, +2, -1, or 0)
        $dayOffset = 0;
        if ($arrivalDate !== '' && $flightDate !== '') {
            $fDateObj = \DateTimeImmutable::createFromFormat('!Y-m-d', $flightDate);
            $aDateObj = \DateTimeImmutable::createFromFormat('!Y-m-d', $arrivalDate);
            if ($fDateObj !== false && $aDateObj !== false) {
                $interval = $fDateObj->diff($aDateObj);
                $dayOffset = ($interval->invert === 1 ? -1 : 1) * $interval->days;
            }
        }
        $dayOffsetLabel = $dayOffset > 0 ? "+{$dayOffset}" : ($dayOffset < 0 ? (string) $dayOffset : '');

        $originTz = (string) ($flight['originTimezone'] ?? '');
        $destTz = (string) ($flight['destinationTimezone'] ?? '');

        // Canonical required aircraft model only; omit when absent/empty (no fabricated fallbacks)
        $rawAircraft = trim((string) ($flight['aircraftModel'] ?? ''));
        $aircraftModel = $rawAircraft !== '' ? $rawAircraft : null;

        $manageUrl = 'https://www.gazaairport.com/manage';

        $htmlBlocks = '';
        $text = '';

        $ticketsList = $ticket['tickets'] ?? [];
        if (!is_array($ticketsList) || count($ticketsList) === 0) {
            throw new \InvalidArgumentException('Ticket must contain at least one passenger ticket.');
        }

        $renderedAttachments = [];
        $attachmentsOmitted = false;
        $totalRawBytes = 0;

        if (!$isCancelled && DocumentRenderer::isSupported()) {
            if (count($ticketsList) > self::MAX_ATTACHMENT_PASSENGERS) {
                // Maximum 9 passengers supported for email attachments
                $attachmentsOmitted = true;
            } else {
                $renderer = new DocumentRenderer();
                $safeRef = preg_replace('/[^a-zA-Z0-9_-]/', '-', $reference);
                if ($safeRef === '') {
                    $safeRef = 'ticket';
                }

                $renderSucceeded = true;
                $candidateAttachments = [];
                $renderStarted = hrtime(true);

                try {
                    foreach ($ticketsList as $idx => $item) {
                        if ((hrtime(true) - $renderStarted) / 1e9 >= self::MAX_RENDER_SECONDS) {
                            $renderSucceeded = false;
                            $candidateAttachments = [];
                            break;
                        }
                        $p = $item['passenger'] ?? [];
                        $firstName = trim((string) ($p['firstName'] ?? ''));
                        $lastName = trim((string) ($p['lastName'] ?? ''));
                        $name = trim($firstName . ' ' . $lastName);
                        if ($name === '') {
                            $name = 'Passenger';
                        }

                        $rawSeat = trim((string) ($p['seatCode'] ?? ''));
                        $cabin = null;
                        if (!empty($item['cabin']) && is_string($item['cabin'])) {
                            $cabin = trim($item['cabin']);
                        } elseif (!empty($p['cabin']) && is_string($p['cabin'])) {
                            $cabin = trim($p['cabin']);
                        }

                        // Pass actual selected $ar locale and relevant date; preserve English default
                        $selectedLocale = (string) (
                            $item['locale']
                            ?? $item['lang']
                            ?? $p['locale']
                            ?? $p['lang']
                            ?? $payload['locale']
                            ?? $payload['lang']
                            ?? $ticket['locale']
                            ?? $ticket['lang']
                            ?? 'en'
                        );
                        $itemLocale = $selectedLocale === 'ar' ? 'ar' : 'en';

                        $ticketData = [
                            'passenger' => $name,
                            'passengerArabic' => !empty($p['passengerArabic']) ? (string) $p['passengerArabic'] : (!empty($p['arabicName']) ? (string) $p['arabicName'] : null),
                            'fromCode' => $originCode,
                            'toCode' => $destCode,
                            'fromCity' => $resolveCity($originCode, 'en'),
                            'toCity' => $resolveCity($destCode, 'en'),
                            'fromCityArabic' => $resolveCity($originCode, 'ar'),
                            'toCityArabic' => $resolveCity($destCode, 'ar'),
                            'flight' => $flightNum,
                            'travelDate' => DocumentRenderer::formatTicketDate($flightDate, $itemLocale),
                            'date' => $flightDate,
                            'departure' => $departTime,
                            'gate' => !empty($flight['gate']) ? (string) $flight['gate'] : null,
                            'seat' => $rawSeat !== '' ? $rawSeat : null,
                            'cabin' => $cabin,
                            'reference' => $reference,
                            'status' => $status,
                            'locale' => $itemLocale,
                        ];

                        $pngBytes = $renderer->renderTicket($ticketData);
                        $totalRawBytes += strlen($pngBytes);

                        if ($totalRawBytes > self::MAX_RAW_ATTACHMENT_BYTES
                            || (hrtime(true) - $renderStarted) / 1e9 >= self::MAX_RENDER_SECONDS) {
                            // Aggregate max 10 MiB raw exceeded!
                            // Do NOT silently attach partial passengers!
                            $renderSucceeded = false;
                            $candidateAttachments = [];
                            break;
                        }

                        $filename = sprintf('ticket-%s-%d.png', $safeRef, $idx + 1);
                        $candidateAttachments[] = [
                            'bytes' => $pngBytes,
                            'filename' => $filename,
                        ];
                    }
                } catch (\App\SharedHosting\SharedHostingTimeoutException $e) {
                    throw $e;
                } catch (\Throwable) {
                    // Clean images on exceptions; bounded cleanup, no partial attachments
                    $renderSucceeded = false;
                    $candidateAttachments = [];
                }

                if ($renderSucceeded && count($candidateAttachments) === count($ticketsList)) {
                    $renderedAttachments = $candidateAttachments;
                } else {
                    $attachmentsOmitted = true;
                    $renderedAttachments = [];
                }
            }
        } elseif (!$isCancelled) {
            $attachmentsOmitted = true;
        }

        foreach (['en', 'ar'] as $lang) {
            $ar = $lang === 'ar';
            $dir = $ar ? 'rtl' : 'ltr';
            $textAlign = $ar ? 'right' : 'left';

            $airportBrand = $ar ? 'مطار غزة الدولي' : 'Gaza International Airport';
            $carrierName = $ar ? 'الخطوط الجوية الفلسطينية' : 'Palestine Airways Limited';
            $docTitle = $ar ? 'التذكرة / مسار الرحلة' : 'Ticket / Itinerary';
            $statusLabel = $isCancelled ? ($ar ? 'ملغى' : 'Cancelled') : ($ar ? 'مؤكد' : 'Confirmed');
            $refLabel = $ar ? 'مرجع الحجز' : 'Booking reference';
            $originCity = $resolveCity($originCode, $lang);
            $destCity = $resolveCity($destCode, $lang);

            $text .= "==================================================\n";
            $text .= "$airportBrand · $carrierName\n";
            $text .= "$docTitle\n";
            $text .= "==================================================\n";
            $text .= "$refLabel: $reference\n";
            $text .= ($ar ? 'الحالة: ' : 'Status: ') . $statusLabel . "\n\n";
            $text .= ($ar ? 'المسار: ' : 'Route: ') . "$originCode ($originCity) → $destCode ($destCity)\n";
            $text .= ($ar ? 'الرحلة: ' : 'Flight: ') . $flightNum . ($aircraftModel !== null ? " · $aircraftModel" : "") . "\n";
            $text .= ($ar ? 'التاريخ: ' : 'Date: ') . "$flightDate\n";
            $text .= ($ar ? 'المغادرة: ' : 'Departure: ') . "$departTime" . ($originTz !== '' ? " ($originTz)" : '') . "\n";
            $text .= ($ar ? 'الوصول: ' : 'Arrival: ') . "$arriveTime" . ($dayOffsetLabel !== '' ? " ($arrivalDate $dayOffsetLabel)" : '') . ($destTz !== '' ? " ($destTz)" : '') . "\n\n";

            $passengerCardsHtml = '';
            foreach ($ticketsList as $idx => $item) {
                $p = $item['passenger'] ?? [];
                $name = trim(($p['firstName'] ?? '') . ' ' . ($p['lastName'] ?? ''));
                if ($name === '') $name = $ar ? 'مسافر' : 'Passenger';
                $pType = ($p['type'] ?? 'adult') === 'child' ? ($ar ? 'طفل' : 'Child') : ($ar ? 'بالغ' : 'Adult');
                $rawSeat = trim((string) ($p['seatCode'] ?? ''));
                if ($isCancelled) {
                    $seat = $ar ? 'محرر' : 'Released';
                } elseif ($rawSeat === '') {
                    $seat = $ar ? 'غير محدد' : 'Not assigned';
                } else {
                    $seat = $rawSeat;
                }

                $mealLabel = $ar ? 'بدون وجبة' : 'No meal';
                if (isset($p['meal']['label'])) {
                    $mealLabel = $ar ? ($p['meal']['label']['ar'] ?? $p['meal']['label']['en'] ?? $mealLabel) : ($p['meal']['label']['en'] ?? $mealLabel);
                }

                $ticketNum = (string) ($item['ticketNumber'] ?? '');

                // Canonical cabin check: ONLY render if canonical data explicitly provides it
                $cabin = null;
                if (!empty($item['cabin']) && is_string($item['cabin'])) {
                    $cabin = trim($item['cabin']);
                } elseif (!empty($p['cabin']) && is_string($p['cabin'])) {
                    $cabin = trim($p['cabin']);
                }

                $text .= "--- " . ($ar ? 'المسافر ' : 'Passenger ') . ($idx + 1) . ": $name ($pType) ---\n";
                $text .= ($ar ? 'المقعد: ' : 'Seat: ') . "$seat\n";
                $text .= ($ar ? 'الوجبة: ' : 'Meal: ') . "$mealLabel\n";
                if ($cabin !== null) {
                    $text .= ($ar ? 'الدرجة: ' : 'Cabin: ') . "$cabin\n";
                }
                $text .= ($ar ? 'رقم التذكرة: ' : 'Ticket number: ') . "$ticketNum\n\n";

                $seatDisplayColor = $isCancelled ? '#A92D32' : ($rawSeat === '' ? '#5B625D' : '#171A18');
                $seatDirAttr = ($isCancelled && $ar) ? '' : ' dir="ltr"';

                $cabinHtml = '';
                if ($cabin !== null) {
                    $cabinHtml = '<td style="padding:4px 8px 4px 0;color:#5B625D;font-size:12px;vertical-align:top;">'
                        . '<strong style="color:#23372D;">' . ($ar ? 'الدرجة' : 'Cabin') . ':</strong> '
                        . $escape($cabin) . '</td>';
                }

                $passengerCardsHtml .= '<tr style="border-bottom:1px solid #E3DCCF;">'
                    . '<td class="email-pad-body" style="padding:14px 20px;">'
                    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="' . $dir . '" style="text-align:' . $textAlign . ';">'
                    . '<tr>'
                    . '<td style="font-size:15px;font-weight:bold;color:#171A18;padding-bottom:4px;line-height:1.3;word-break:break-word;">'
                    . $escape($name) . ' <span style="font-size:12px;font-weight:normal;color:#5B625D;">(' . $escape($pType) . ')</span>'
                    . '</td>'
                    . '</tr>'
                    . '<tr>'
                    . '<td style="font-size:12px;color:#5B625D;padding-bottom:8px;line-height:1.4;">'
                    . '<strong style="color:#23372D;">' . ($ar ? 'التذكرة' : 'Ticket') . ':</strong> <span dir="ltr" style="font-family:monospace,Courier,sans-serif;font-weight:bold;color:#171A18;">' . $escape($ticketNum) . '</span>'
                    . '</td>'
                    . '</tr>'
                    . '<tr>'
                    . '<td style="border-top:1px dashed #E3DCCF;padding-top:6px;">'
                    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="' . $dir . '" style="text-align:' . $textAlign . ';font-size:12px;color:#171A18;">'
                    . '<tr>'
                    . '<td style="padding:4px 8px 4px 0;color:#5B625D;font-size:12px;vertical-align:top;white-space:nowrap;">'
                    . '<strong style="color:#23372D;">' . ($ar ? 'المقعد' : 'Seat') . ':</strong> <span' . $seatDirAttr . ' style="font-weight:bold;color:' . $seatDisplayColor . ';">' . $escape($seat) . '</span>'
                    . '</td>'
                    . '<td style="padding:4px 8px 4px 0;color:#5B625D;font-size:12px;vertical-align:top;word-break:break-word;">'
                    . '<strong style="color:#23372D;">' . ($ar ? 'الوجبة' : 'Meal') . ':</strong> ' . $escape($mealLabel)
                    . '</td>'
                    . $cabinHtml
                    . '</tr>'
                    . '</table>'
                    . '</td>'
                    . '</tr>'
                    . '</table>'
                    . '</td>'
                    . '</tr>';
            }

            $text .= ($ar ? 'عرض / طباعة تذكرتك: ' : 'View / print your ticket: ') . "$manageUrl\n";
            $text .= ($ar
                ? 'لحجوزات الضيوف، أدخل مرجع حجزك وتحقق من بريدك الإلكتروني لعرض التذكرة أو طباعتها. يمكن لأصحاب الحسابات أيضاً تسجيل الدخول مباشرة.'
                : 'For guest bookings, enter your reference and verify your email to view or print your ticket. Account holders may also sign in directly.') . "\n";
            if ($attachmentsOmitted) {
                $text .= ($ar
                    ? "ملاحظة: صور التذاكر التذكارية متاحة للعرض والتحميل عبر الإنترنت من خلال بوابة إدارة الحجز أعلاه.\n"
                    : "Notice: Commemorative ticket images are available to view and download online via the booking management portal above.\n");
            }
            $text .= ($ar ? 'رحلات تربط الناس بمستقبل أجمل' : 'PEOPLE · PLACES · A BRIGHTER TOMORROW') . "\n\n";

            $statusBadgeColor = $isCancelled ? '#A92D32' : '#2F684A';

            $aircraftHeaderHtml = $aircraftModel !== null
                ? '<span style="font-size:11px;color:#C7A46A;font-weight:normal;"> · ' . $escape($aircraftModel) . '</span>'
                : '';

            $htmlBlocks .= '<table role="presentation" class="email-card" width="100%" cellpadding="0" cellspacing="0" border="0" dir="' . $dir . '" style="max-width:620px;margin:0 auto 32px;background:#FCF9F2;border:1px solid #CEC5B7;border-radius:18px;overflow:hidden;text-align:' . $textAlign . ';box-shadow:0 6px 24px rgba(35,55,45,0.08);">'
                // Header Banner
                . '<tr style="background:#23372D;color:#FCF9F2;">'
                . '<td class="email-pad-header" style="padding:22px 22px;">'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="' . $dir . '" style="text-align:' . $textAlign . ';">'
                // Brand / Title Row (Full width)
                . '<tr>'
                . '<td style="padding-bottom:14px;">'
                . '<div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#C7A46A;font-weight:bold;">' . $escape($carrierName) . '</div>'
                . '<h1 style="margin:4px 0 2px;font-size:20px;font-weight:bold;color:#FCF9F2;line-height:1.25;">' . $escape($airportBrand) . '</h1>'
                . '<div style="font-size:13px;color:#CEC5B7;line-height:1.35;">' . $escape($docTitle) . '</div>'
                . '</td>'
                . '</tr>'
                // Status / Reference Row (Separate following row)
                . '<tr>'
                . '<td style="border-top:1px solid rgba(206,197,183,0.25);padding-top:12px;">'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="' . $dir . '" style="text-align:' . $textAlign . ';">'
                . '<tr>'
                . '<td valign="middle">'
                . '<div style="display:inline-block;padding:5px 12px;background:' . $statusBadgeColor . ';color:#FFFFFF;border-radius:4px;font-size:11px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;">' . $escape($statusLabel) . '</div>'
                . '</td>'
                . '<td align="' . ($ar ? 'left' : 'right') . '" valign="middle" style="font-size:12px;color:#CEC5B7;">'
                . $escape($refLabel) . ': <strong dir="ltr" style="font-size:15px;color:#FCF9F2;letter-spacing:0.06em;">' . $escape($reference) . '</strong>'
                . '</td>'
                . '</tr>'
                . '</table>'
                . '</td>'
                . '</tr>'
                . '</table>'
                . '</td>'
                . '</tr>'
                // Route Bar
                . '<tr style="background:#FCF9F2;border-bottom:1px solid #D4CCBF;">'
                . '<td class="email-pad-body" style="padding:18px 22px;">'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="' . $dir . '" style="text-align:' . $textAlign . ';">'
                . '<tr>'
                . '<td width="42%" valign="middle" style="word-break:break-word;">'
                . '<div style="font-size:10px;color:#5B625D;letter-spacing:0.12em;text-transform:uppercase;font-weight:bold;">' . ($ar ? 'من' : 'FROM') . '</div>'
                . '<div style="font-size:32px;font-weight:800;color:#23372D;line-height:1.1;" dir="ltr">' . $escape($originCode) . '</div>'
                . '<div style="font-size:13px;font-weight:bold;color:#171A18;word-break:break-word;">' . $escape($originCity) . '</div>'
                . '</td>'
                . '<td width="16%" align="center" valign="middle" style="font-size:22px;color:#C7A46A;line-height:1;">✈</td>'
                . '<td width="42%" align="' . ($ar ? 'left' : 'right') . '" valign="middle" style="word-break:break-word;">'
                . '<div style="font-size:10px;color:#5B625D;letter-spacing:0.12em;text-transform:uppercase;font-weight:bold;">' . ($ar ? 'إلى' : 'TO') . '</div>'
                . '<div style="font-size:32px;font-weight:800;color:#23372D;line-height:1.1;" dir="ltr">' . $escape($destCode) . '</div>'
                . '<div style="font-size:13px;font-weight:bold;color:#171A18;word-break:break-word;">' . $escape($destCity) . '</div>'
                . '</td>'
                . '</tr>'
                . '</table>'
                . '</td>'
                . '</tr>'
                // Flight Timing Grid (2 columns x 2 rows: Flight/Date then Depart/Arrive)
                . '<tr style="background:#F7F2E8;border-bottom:1px solid #D4CCBF;">'
                . '<td class="email-pad-body" style="padding:14px 22px;">'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:12px;color:#171A18;" dir="' . $dir . '">'
                // Row 1: Flight & Date
                . '<tr>'
                . '<td width="50%" style="padding:6px 8px;vertical-align:top;">'
                . '<span style="color:#5B625D;display:block;font-size:10px;text-transform:uppercase;font-weight:bold;letter-spacing:0.06em;">' . ($ar ? 'الرحلة' : 'FLIGHT') . '</span>'
                . '<strong dir="ltr" style="font-size:15px;color:#23372D;line-height:1.2;">' . $escape($flightNum) . '</strong>'
                . $aircraftHeaderHtml
                . '</td>'
                . '<td width="50%" style="padding:6px 8px;vertical-align:top;">'
                . '<span style="color:#5B625D;display:block;font-size:10px;text-transform:uppercase;font-weight:bold;letter-spacing:0.06em;">' . ($ar ? 'التاريخ' : 'DATE') . '</span>'
                . '<strong dir="ltr" style="font-size:15px;color:#171A18;white-space:nowrap;line-height:1.2;">' . $escape($flightDate) . '</strong>'
                . '</td>'
                . '</tr>'
                // Row 2: Departure & Arrival
                . '<tr>'
                . '<td width="50%" style="padding:8px 8px 4px;vertical-align:top;border-top:1px dashed #D4CCBF;">'
                . '<span style="color:#5B625D;display:block;font-size:10px;text-transform:uppercase;font-weight:bold;letter-spacing:0.06em;">' . ($ar ? 'المغادرة' : 'DEPART') . '</span>'
                . '<strong dir="ltr" style="font-size:15px;color:#171A18;line-height:1.2;">' . $escape($departTime) . '</strong>'
                . ($originTz !== '' ? '<div style="font-size:11px;color:#5B625D;margin-top:2px;" dir="ltr">' . $escape($originTz) . '</div>' : '')
                . '</td>'
                . '<td width="50%" style="padding:8px 8px 4px;vertical-align:top;border-top:1px dashed #D4CCBF;">'
                . '<span style="color:#5B625D;display:block;font-size:10px;text-transform:uppercase;font-weight:bold;letter-spacing:0.06em;">' . ($ar ? 'الوصول' : 'ARRIVE') . '</span>'
                . '<strong dir="ltr" style="font-size:15px;color:#171A18;line-height:1.2;">' . $escape($arriveTime) . ($dayOffsetLabel !== '' ? ' <span style="color:#A92D32;font-size:11px;">' . $escape($dayOffsetLabel) . '</span>' : '') . '</strong>'
                . ($dayOffset !== 0 ? '<div style="font-size:11px;color:#5B625D;margin-top:2px;" dir="ltr"><span style="white-space:nowrap;">' . $escape($arrivalDate) . '</span>' . ($destTz !== '' ? ' · ' . $escape($destTz) : '') . '</div>' : ($destTz !== '' ? '<div style="font-size:11px;color:#5B625D;margin-top:2px;" dir="ltr">' . $escape($destTz) . '</div>' : ''))
                . '</td>'
                . '</tr>'
                . '</table>'
                . '</td>'
                . '</tr>'
                // Passenger Tickets List
                . '<tr>'
                . '<td>'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
                . $passengerCardsHtml
                . '</table>'
                . '</td>'
                . '</tr>'
                // CTA Action Area
                . '<tr style="background:#FCF9F2;">'
                . '<td class="email-pad-body" style="padding:22px 20px;text-align:center;">'
                . '<a href="' . $escape($manageUrl) . '" class="email-cta-btn" style="display:inline-block;padding:12px 28px;background:#23372D;color:#FCF9F2;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;letter-spacing:0.04em;">'
                . ($ar ? 'عرض / طباعة تذكرتك' : 'View / print your ticket')
                . '</a>'
                . '<div style="margin-top:10px;font-size:11px;line-height:1.5;color:#5B625D;max-width:460px;margin-left:auto;margin-right:auto;">'
                . ($ar
                    ? 'لحجوزات الضيوف، أدخل مرجع حجزك وتحقق من بريدك الإلكتروني لعرض التذكرة أو طباعتها. يمكن لأصحاب الحسابات أيضاً تسجيل الدخول مباشرة.'
                    : 'For guest bookings, enter your reference and verify your email to view or print your ticket. Account holders may also sign in directly.')
                . '</div>'
                . ($attachmentsOmitted
                    ? '<div style="margin-top:12px;padding:10px 14px;background:#F0ECE1;border:1px solid #D4CCBF;border-radius:6px;font-size:12px;color:#23372D;line-height:1.4;">'
                        . ($ar
                            ? '<strong>ملاحظة:</strong> صور التذاكر التذكارية بدقة عالية متاحة للعرض والتحميل عبر الإنترنت من خلال بوابة إدارة الحجز.'
                            : '<strong>Notice:</strong> High-resolution commemorative ticket images are available to view and download online via the booking management portal.')
                        . '</div>'
                    : '')
                . '</td>'
                . '</tr>'
                // Footer Slogan
                . '<tr style="background:#F7F2E8;border-top:1px solid #D4CCBF;">'
                . '<td class="email-pad-body" style="padding:16px 22px;text-align:center;font-size:11px;color:#5B625D;">'
                . '<div style="font-size:13px;font-weight:bold;color:#23372D;margin-bottom:4px;">' . ($ar ? 'رحلات تربط الناس بمستقبل أجمل' : 'PEOPLE · PLACES · A BRIGHTER TOMORROW') . '</div>'
                . '<div>' . ($ar ? 'الخطوط الجوية الفلسطينية · مطار غزة الدولي' : 'Gaza International Airport · Palestine Airways Limited') . '</div>'
                . '</td>'
                . '</tr>'
                . '</table>';
        }

        $cssMedia = '<style>'
            . 'body{margin:0;padding:24px 12px;background:#E7E1D7;color:#171A18;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;}'
            . '@media only screen and (max-width:480px){'
            . '  .email-container{width:100% !important;max-width:100% !important;}'
            . '  .email-card{border-radius:12px !important;margin-bottom:20px !important;}'
            . '  .email-pad-header{padding:16px 14px !important;}'
            . '  .email-pad-body{padding:12px 14px !important;}'
            . '  .email-cta-btn{display:block !important;width:100% !important;box-sizing:border-box !important;text-align:center !important;padding:12px 16px !important;}'
            . '}'
            . '</style>';

        $fullHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>Gaza Gateway · ' . $escape($reference) . '</title>'
            . $cssMedia
            . '</head><body style="margin:0;padding:24px 12px;background:#E7E1D7;color:#171A18;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">'
            . '<center style="width:100%;background:#E7E1D7;">'
            . '<div class="email-container" style="max-width:620px;margin:0 auto;text-align:left;">'
            . $htmlBlocks
            . '</div>'
            . '</center>'
            . '</body></html>';

        $email->subject('Gaza Gateway · '.$ticket['reference'])
            ->text($text)
            ->html($fullHtml);

        foreach ($renderedAttachments as $att) {
            $email->attach($att['bytes'], $att['filename'], 'image/png');
        }
        unset($renderedAttachments);

        return $email;
    }
}
