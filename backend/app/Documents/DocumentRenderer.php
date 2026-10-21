<?php

declare(strict_types=1);

namespace App\Documents;

use ArPHP\I18N\Arabic;

final class DocumentRenderer implements \App\Mvp\Archive\ArchiveDocumentRendererContract
{
    public const TICKET_WIDTH = 1774;
    public const TICKET_HEIGHT = 887;
    public const ARCHIVE_WIDTH = 1122;
    public const ARCHIVE_HEIGHT = 1402;
    private const MAX_TEXT_LENGTH = 120;

    private readonly string $templateDir;
    private readonly string $fontDir;
    private ?string $fontLatinBold = null;
    private ?string $fontLatinReg = null;
    private ?string $fontArabicBold = null;
    private ?string $fontArabicReg = null;
    private ?Arabic $arabic = null;

    public function __construct(?string $templateDir = null, ?string $fontDir = null)
    {
        $baseResourceDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'resources' . DIRECTORY_SEPARATOR . 'documents';
        $this->templateDir = $templateDir ?? ($baseResourceDir . DIRECTORY_SEPARATOR . 'templates');
        $this->fontDir = $fontDir ?? ($baseResourceDir . DIRECTORY_SEPARATOR . 'fonts');
    }

    public static function isSupported(): bool
    {
        $cap = self::checkCapability();
        return $cap['gd_loaded']
            && $cap['freetype_supported']
            && $cap['imagepng_supported']
            && $cap['templates_present']
            && $cap['fonts_present']
            && $cap['ar_php_available'];
    }

    public static function checkCapability(?string $templateDir = null, ?string $fontDir = null): array
    {
        $baseResourceDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'resources' . DIRECTORY_SEPARATOR . 'documents';
        $tplDir = $templateDir ?? ($baseResourceDir . DIRECTORY_SEPARATOR . 'templates');
        $fDir = $fontDir ?? ($baseResourceDir . DIRECTORY_SEPARATOR . 'fonts');

        $ticketTpl = $tplDir . DIRECTORY_SEPARATOR . 'ticket-blank-approved.png';
        $archiveTpl = $tplDir . DIRECTORY_SEPARATOR . 'archive-thank-you-tag-template.png';
        $fontLatinBold = $fDir . DIRECTORY_SEPARATOR . 'NotoSans-Bold.ttf';
        $fontLatinReg = $fDir . DIRECTORY_SEPARATOR . 'NotoSans-Regular.ttf';
        $fontArabicBold = $fDir . DIRECTORY_SEPARATOR . 'NotoSansArabic-Bold.ttf';
        $fontArabicReg = $fDir . DIRECTORY_SEPARATOR . 'NotoSansArabic-Regular.ttf';

        return [
            'gd_loaded' => extension_loaded('gd'),
            'freetype_supported' => function_exists('imagettftext') && function_exists('imagettfbbox'),
            'imagepng_supported' => function_exists('imagepng') && function_exists('imagecreatefrompng'),
            'templates_present' => is_readable($ticketTpl) && is_readable($archiveTpl),
            'fonts_present' => is_readable($fontLatinBold) && is_readable($fontLatinReg)
                && is_readable($fontArabicBold) && is_readable($fontArabicReg),
            'ar_php_available' => class_exists(Arabic::class),
        ];
    }

    public static function assertSupported(?string $templateDir = null, ?string $fontDir = null): void
    {
        if (!extension_loaded('gd')) {
            throw DocumentCapabilityException::missingGd();
        }
        if (!function_exists('imagettftext') || !function_exists('imagettfbbox')) {
            throw DocumentCapabilityException::missingFreeType();
        }

        $cap = self::checkCapability($templateDir, $fontDir);
        if (!$cap['ar_php_available'] || !$cap['imagepng_supported']) {
            throw new DocumentCapabilityException('Document rendering requires PNG and Arabic shaping support.');
        }
        if (!$cap['templates_present'] || !$cap['fonts_present']) {
            $baseResourceDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'resources' . DIRECTORY_SEPARATOR . 'documents';
            $tplDir = $templateDir ?? ($baseResourceDir . DIRECTORY_SEPARATOR . 'templates');
            $fDir = $fontDir ?? ($baseResourceDir . DIRECTORY_SEPARATOR . 'fonts');

            $assets = [
                $tplDir . DIRECTORY_SEPARATOR . 'ticket-blank-approved.png',
                $tplDir . DIRECTORY_SEPARATOR . 'archive-thank-you-tag-template.png',
                $fDir . DIRECTORY_SEPARATOR . 'NotoSans-Bold.ttf',
                $fDir . DIRECTORY_SEPARATOR . 'NotoSans-Regular.ttf',
                $fDir . DIRECTORY_SEPARATOR . 'NotoSansArabic-Bold.ttf',
                $fDir . DIRECTORY_SEPARATOR . 'NotoSansArabic-Regular.ttf',
            ];
            foreach ($assets as $asset) {
                if (!is_readable($asset)) {
                    throw DocumentCapabilityException::missingAsset($asset);
                }
            }
        }
    }

    /**
     * Formats ISO date (YYYY-MM-DD) into authentic uppercase aviation date string.
     * Enforces Western Latin digits for numbers in both EN and AR.
     */
    public static function formatTicketDate(?string $iso, string $locale = 'en'): string
    {
        if ($iso === null || trim($iso) === '') {
            return '';
        }
        $iso = trim($iso);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $iso, $matches)) {
            return $iso;
        }

        $year = $matches[1];
        $monthIdx = (int) $matches[2] - 1;
        $day = (string) (int) $matches[3];

        if ($monthIdx < 0 || $monthIdx > 11) {
            return $iso;
        }

        $monthsEn = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        $monthsAr = [
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
        ];

        if ($locale === 'ar') {
            return sprintf('%s %s %s', $day, $monthsAr[$monthIdx], $year);
        }

        return sprintf('%s %s %s', $day, $monthsEn[$monthIdx], $year);
    }

    /**
     * Extracts and separates Latin and Arabic representations from passenger name strings.
     * Preserves full passenger names without data loss across non-Latin scripts.
     */
    public static function extractPassengerNames(string $name, ?string $arabicName = null): array
    {
        $name = trim($name);
        $arabicName = $arabicName !== null ? trim($arabicName) : null;

        if ($arabicName !== null && $arabicName !== '') {
            return [
                'latin' => $name,
                'arabic' => $arabicName,
                'fullName' => $name . ' / ' . $arabicName,
            ];
        }

        if ($name === '') {
            return ['latin' => '', 'arabic' => '', 'fullName' => ''];
        }

        if (preg_match('~^([^/(]+?)\s*[/|(]\s*([^/)]+?)\)?$~u', $name, $matches)) {
            $part1 = trim($matches[1]);
            $part2 = trim($matches[2]);
            $part1HasAr = (bool) preg_match('/[\x{0600}-\x{06FF}]/u', $part1);
            $part2HasAr = (bool) preg_match('/[\x{0600}-\x{06FF}]/u', $part2);

            if (!$part1HasAr && $part2HasAr) {
                return ['latin' => $part1, 'arabic' => $part2, 'fullName' => $name];
            }
            if ($part1HasAr && !$part2HasAr) {
                return ['latin' => $part2, 'arabic' => $part1, 'fullName' => $name];
            }
        }

        $hasArabic = (bool) preg_match('/[\x{0600}-\x{06FF}]/u', $name);
        $hasLatin = (bool) preg_match('/[A-Za-z]/', $name);

        if ($hasArabic && !$hasLatin) {
            return ['latin' => '', 'arabic' => $name, 'fullName' => $name];
        }
        if ($hasLatin && !$hasArabic) {
            return ['latin' => $name, 'arabic' => '', 'fullName' => $name];
        }

        return ['latin' => $name, 'arabic' => '', 'fullName' => $name];
    }

    public function renderTicket(array $data): string
    {
        self::assertSupported($this->templateDir, $this->fontDir);
        $this->initFonts();

        $templatePath = $this->templateDir . DIRECTORY_SEPARATOR . 'ticket-blank-approved.png';
        if (!is_readable($templatePath)) {
            throw DocumentCapabilityException::missingAsset($templatePath);
        }

        $locale = ($data['locale'] ?? $data['lang'] ?? 'en') === 'ar' ? 'ar' : 'en';
        $isRtl = $locale === 'ar';

        // Validate and sanitize required fields
        $passengerRaw = $this->sanitizeText($data['passenger'] ?? '', 'passenger', required: true);
        $passengerArabicRaw = $this->sanitizeText($data['passengerArabic'] ?? null, 'passengerArabic');
        $fromCode = strtoupper($this->sanitizeText($data['fromCode'] ?? '', 'fromCode', required: true, maxLen: 5));
        $toCode = strtoupper($this->sanitizeText($data['toCode'] ?? '', 'toCode', required: true, maxLen: 5));
        $fromCity = $this->sanitizeText($data['fromCity'] ?? '', 'fromCity', required: true, maxLen: 40);
        $toCity = $this->sanitizeText($data['toCity'] ?? '', 'toCity', required: true, maxLen: 40);
        $fromCityArabic = $this->sanitizeText($data['fromCityArabic'] ?? null, 'fromCityArabic', maxLen: 40);
        $toCityArabic = $this->sanitizeText($data['toCityArabic'] ?? null, 'toCityArabic', maxLen: 40);
        $flight = $this->sanitizeText($data['flight'] ?? '', 'flight', required: true, maxLen: 20);

        // Date handling: either formatted travelDate or ISO date formatted via formatTicketDate
        $rawDate = $data['date'] ?? null;
        $rawTravelDate = $data['travelDate'] ?? null;
        if ($rawDate !== null && $rawDate !== '') {
            $travelDate = self::formatTicketDate((string) $rawDate, $locale);
        } elseif ($rawTravelDate !== null && $rawTravelDate !== '') {
            $travelDate = self::formatTicketDate((string) $rawTravelDate, $locale);
        } else {
            throw new \InvalidArgumentException('Missing required field: travelDate or date');
        }
        $travelDate = $this->sanitizeText($travelDate, 'travelDate', required: true, maxLen: 30);

        $departure = $this->sanitizeText($data['departure'] ?? '', 'departure', required: true, maxLen: 15);
        $gate = $this->sanitizeText($data['gate'] ?? null, 'gate', maxLen: 15);
        $seat = $this->sanitizeText($data['seat'] ?? null, 'seat', maxLen: 15);

        // Cabin: strictly null / '—' when absent; NO fabricated Economy default!
        $cabin = $this->sanitizeText($data['cabin'] ?? null, 'cabin', maxLen: 30);
        $cabinDisplay = $cabin !== null && $cabin !== '' ? $cabin : '—';

        $reference = strtoupper($this->sanitizeText($data['reference'] ?? '', 'reference', required: true, maxLen: 35));

        $status = (string) ($data['status'] ?? 'confirmed');
        $isCancelled = $status === 'cancelled' || !empty($data['isCancelled']);

        $im = @imagecreatefrompng($templatePath);
        if ($im === false) {
            throw new \RuntimeException('Failed to load ticket template image.');
        }

        try {
            imagealphablending($im, true);
            imagesavealpha($im, true);

            $ink = imagecolorallocate($im, 18, 59, 53);          // #123b35
            $muted = imagecolorallocate($im, 25, 45, 48);        // #192d30
            $refLabelCol = imagecolorallocate($im, 86, 102, 95); // #56665f
            $clay = imagecolorallocate($im, 169, 45, 50);        // #A92D32
            $white = imagecolorallocate($im, 255, 255, 255);    // #FFFFFF

            // 1. Flight route (main card): calibrated coordinates
            $this->drawFittedText($im, $fromCode, 96, 522, maxWidth: 230, sizePx: 75, minSizePx: 45, color: $ink);
            $this->drawFittedText($im, $toCode, 569, 522, maxWidth: 230, sizePx: 75, minSizePx: 45, color: $ink);

            // Bilingual cities
            $this->drawBilingualCity($im, $fromCity, $fromCityArabic, 96, 558, maxWidth: 240, color: $muted);
            $this->drawBilingualCity($im, $toCity, $toCityArabic, 571, 558, maxWidth: 340, color: $muted);

            // 2. Lower information row: each column bounded by pre-printed gold rules
            $gateDisplay = $gate !== null && $gate !== '' ? $gate : '—';
            $seatDisplay = $isCancelled
                ? ($isRtl ? 'تم التحرير' : 'RELEASED')
                : ($seat !== null && $seat !== '' ? $seat : '—');
            $seatColor = $isCancelled ? $clay : $muted;

            $cols = [
                [$flight, 115, 653, 135, 34, $muted],
                [$travelDate, 285, 653, 165, 28, $muted],
                [$departure, 482, 653, 190, 34, $muted],
                [$gateDisplay, 717, 653, 136, 34, $muted],
                [$seatDisplay, 895, 653, 155, 34, $seatColor],
                [$cabinDisplay, 1082, 653, 213, 29, $muted],
            ];

            foreach ($cols as [$val, $colX, $colY, $colW, $colSz, $colColor]) {
                $this->drawFittedText($im, (string) $val, $colX, $colY, maxWidth: $colW, sizePx: $colSz, minSizePx: 16, color: $colColor);
            }

            // 3. Detachable right stub: coordinates calibrated with frontend painter (x=1390, width=226)
            // Dynamic labels use selected locale only (Invariant 3)
            $paxLabel = $isRtl ? 'المسافر' : 'PASSENGER';
            $this->drawFittedText($im, $paxLabel, 1390, 356, maxWidth: 226, sizePx: 15, minSizePx: 12, color: $muted);

            // Genuine names & script integrity: extract Latin and Arabic cleanly
            $paxNames = self::extractPassengerNames($passengerRaw, $passengerArabicRaw);

            if ($paxNames['latin'] !== '' && $paxNames['arabic'] !== '') {
                $this->drawFittedText($im, strtoupper($paxNames['latin']), 1390, 390, maxWidth: 226, sizePx: 27, minSizePx: 16, color: $ink);
                $this->drawFittedText($im, $paxNames['arabic'], 1390, 415, maxWidth: 218, sizePx: 18, minSizePx: 13, color: $muted, bold: false);
            } elseif ($paxNames['arabic'] !== '' && $paxNames['latin'] === '') {
                $this->drawFittedText($im, $paxNames['arabic'], 1390, 390, maxWidth: 226, sizePx: 25, minSizePx: 15, color: $ink);
            } else {
                $paxDisplay = $paxNames['latin'] !== '' ? $paxNames['latin'] : $passengerRaw;
                $this->drawFittedText($im, strtoupper($paxDisplay), 1390, 390, maxWidth: 226, sizePx: 27, minSizePx: 15, color: $ink);
            }

            $flightLabel = $isRtl ? 'الرحلة' : 'FLIGHT';
            $this->drawFittedText($im, $flightLabel, 1390, 440, maxWidth: 200, sizePx: 15, minSizePx: 12, color: $muted);
            $this->drawFittedText($im, strtoupper($flight), 1390, 471, maxWidth: 200, sizePx: 27, minSizePx: 16, color: $ink);

            $this->drawFittedText($im, $fromCode, 1390, 555, maxWidth: 86, sizePx: 33, minSizePx: 20, color: $ink);
            $this->drawFittedText($im, $toCode, 1545, 555, maxWidth: 73, sizePx: 33, minSizePx: 20, color: $ink);

            $this->drawFittedText($im, $travelDate, 1390, 638, maxWidth: 226, sizePx: 25, minSizePx: 14, color: $muted);
            $this->drawFittedText($im, $seatDisplay, 1390, 696, maxWidth: 108, sizePx: 25, minSizePx: 15, color: $seatColor);
            $this->drawFittedText($im, $cabinDisplay, 1480, 696, maxWidth: 111, sizePx: 23, minSizePx: 13, color: $muted);

            // 4. Booking reference lower-left panel: selected locale only
            $refLabel = $isRtl ? 'مرجع الحجز' : 'BOOKING REFERENCE';
            $this->drawFittedText($im, $refLabel, 108, 733, maxWidth: 340, sizePx: 17, minSizePx: 13, color: $refLabelCol);
            $this->drawFittedText($im, $reference, 109, 773, maxWidth: 340, sizePx: 37, minSizePx: 19, color: $ink);

            // 5. Stub scanner area intentionally blank: no fake operational barcode, no sample disclaimer

            // 6. Truthful cancellation representation (top banner + released seat semantics)
            if ($isCancelled) {
                imagefilledrectangle($im, 0, 0, self::TICKET_WIDTH, 44, $clay);
                $cancelBannerText = $isRtl
                    ? 'ملغى · تم إلغاء هذا الحجز والمقعد محرر'
                    : 'CANCELLED · RESERVATION CANCELLED — SEAT RELEASED';
                $renderBanner = $isRtl
                    ? $this->getArabicHelper()->utf8Glyphs($cancelBannerText, 200, false, true)
                    : $cancelBannerText;
                $bannerFont = $isRtl ? $this->fontArabicBold : $this->fontLatinBold;
                $box = imagettfbbox(17 * 0.75, 0, $bannerFont, $renderBanner);
                $bWidth = abs($box[2] - $box[0]);
                $bannerX = (int) max(0, (self::TICKET_WIDTH - $bWidth) / 2);
                imagettftext($im, 17 * 0.75, 0, $bannerX, 29, $white, $bannerFont, $renderBanner);
            }

            ob_start();
            imagepng($im);
            return (string) ob_get_clean();
        } finally {
            imagedestroy($im);
        }
    }

    public function renderArchiveThankYou(array $data): string
    {
        self::assertSupported($this->templateDir, $this->fontDir);
        $this->initFonts();

        $templatePath = $this->templateDir . DIRECTORY_SEPARATOR . 'archive-thank-you-tag-template.png';
        if (!is_readable($templatePath)) {
            throw DocumentCapabilityException::missingAsset($templatePath);
        }

        $contributorRaw = $this->sanitizeText($data['contributorName'] ?? '', 'contributorName', required: true, maxLen: 70);
        $contributorArabicRaw = $this->sanitizeText($data['contributorNameArabic'] ?? null, 'contributorNameArabic', maxLen: 70);
        $archiveId = strtoupper($this->sanitizeText($data['archiveId'] ?? '', 'archiveId', required: true, maxLen: 40));

        // Script integrity for contributor names
        $names = self::extractPassengerNames($contributorRaw, $contributorArabicRaw);
        $haveArabic = $names['arabic'] !== '';

        $im = @imagecreatefrompng($templatePath);
        if ($im === false) {
            throw new \RuntimeException('Failed to load archive thank-you template image.');
        }

        try {
            imagealphablending($im, true);
            imagesavealpha($im, true);

            $colorNameEn = imagecolorallocate($im, 18, 58, 48);   // #123a30
            $colorNameAr = imagecolorallocate($im, 21, 58, 48);   // #153a30
            $colorRef = imagecolorallocate($im, 24, 33, 32);      // #182120

            if ($names['latin'] !== '' && $names['arabic'] !== '') {
                // Latin contributor name: baseline 983
                $this->drawFittedText(
                    $im,
                    strtoupper($names['latin']),
                    x: 270,
                    y: 983,
                    maxWidth: 405,
                    sizePx: 28,
                    minSizePx: 16,
                    color: $colorNameEn
                );
                // Arabic contributor name: baseline 1007
                $this->drawFittedText(
                    $im,
                    $names['arabic'],
                    x: 270,
                    y: 1007,
                    maxWidth: 390,
                    sizePx: 18,
                    minSizePx: 15,
                    color: $colorNameAr,
                    bold: false
                );
            } elseif ($names['arabic'] !== '') {
                // Pure Arabic contributor name: baseline 995 with Arabic font
                $this->drawFittedText(
                    $im,
                    $names['arabic'],
                    x: 270,
                    y: 995,
                    maxWidth: 405,
                    sizePx: 28,
                    minSizePx: 16,
                    color: $colorNameAr
                );
            } else {
                // Pure Latin contributor name: baseline 995 with Latin font
                $this->drawFittedText(
                    $im,
                    strtoupper($names['latin'] !== '' ? $names['latin'] : $contributorRaw),
                    x: 270,
                    y: 995,
                    maxWidth: 405,
                    sizePx: 28,
                    minSizePx: 16,
                    color: $colorNameEn
                );
            }

            // Unique archive submission reference: baseline 1201 (Latin font, strictly LTR)
            $this->drawFittedText(
                $im,
                $archiveId,
                x: 269,
                y: 1201,
                maxWidth: 276,
                sizePx: 24,
                minSizePx: 16,
                color: $colorRef
            );

            ob_start();
            imagepng($im);
            return (string) ob_get_clean();
        } finally {
            imagedestroy($im);
        }
    }

    private function drawBilingualCity(
        \GdImage $im,
        string $cityEn,
        ?string $cityAr,
        int $x,
        int $cityY,
        int $maxWidth,
        int $color
    ): void {
        $cityEn = trim($cityEn);
        $boxEn = imagettfbbox(24 * 0.75, 0, $this->fontLatinBold, $cityEn);
        $usedEn = abs($boxEn[2] - $boxEn[0]);

        // Draw English city
        $this->drawFittedText($im, $cityEn, $x, $cityY, maxWidth: $maxWidth, sizePx: 24, minSizePx: 16, color: $color);

        if ($cityAr !== null && trim($cityAr) !== '') {
            $arStartX = $x + min($usedEn, $maxWidth - 80) + 14;
            $arMaxW = max(60, $maxWidth - min($usedEn, $maxWidth - 80) - 14);
            $this->drawFittedText($im, trim($cityAr), $arStartX, $cityY - 1, maxWidth: $arMaxW, sizePx: 22, minSizePx: 15, color: $color);
        }
    }

    private function drawFittedText(
        \GdImage $im,
        string $text,
        int $x,
        int $y,
        int $maxWidth,
        float $sizePx,
        float $minSizePx,
        int $color,
        bool $bold = true,
        float $angle = 0.0
    ): void {
        $text = trim($text);
        if ($text === '') {
            return;
        }

        $hasArabic = $this->containsArabic($text);
        // Correct script font selection: choose Arabic font whenever text contains Arabic characters
        $fontFile = $hasArabic
            ? ($bold ? $this->fontArabicBold : $this->fontArabicReg)
            : ($bold ? $this->fontLatinBold : $this->fontLatinReg);

        // Positional API call: hindo = false preserves Western digits (0-9) for code/date/time
        $renderText = $hasArabic ? $this->getArabicHelper()->utf8Glyphs($text, 200, false, true) : $text;

        $px = $sizePx;
        $pt = $px * 0.75;
        $box = imagettfbbox($pt, $angle, $fontFile, $renderText);
        $width = abs($box[2] - $box[0]);

        // Fit down to minSizePx
        $iterations = 0;
        while ($width > $maxWidth && $px > $minSizePx && $iterations < 40) {
            $px -= 1.0;
            $pt = $px * 0.75;
            $box = imagettfbbox($pt, $angle, $fontFile, $renderText);
            $width = abs($box[2] - $box[0]);
            $iterations++;
        }

        // Truncate with ellipsis if text still overflows at minSizePx
        if ($width > $maxWidth) {
            $chars = mb_str_split($text);
            while (count($chars) > 1 && $width > $maxWidth) {
                array_pop($chars);
                $candidate = implode('', $chars) . '…';
                $renderCandidate = $hasArabic ? $this->getArabicHelper()->utf8Glyphs($candidate, 200, false, true) : $candidate;
                $box = imagettfbbox($pt, $angle, $fontFile, $renderCandidate);
                $width = abs($box[2] - $box[0]);
                $renderText = $renderCandidate;
            }
        }

        imagettftext($im, $pt, $angle, $x, $y, $color, $fontFile, $renderText);
    }

    private function containsArabic(string $str): bool
    {
        return (bool) preg_match('/[\x{0600}-\x{06FF}\x{0750}-\x{077F}\x{FB50}-\x{FDFF}\x{FE70}-\x{FEFF}]/u', $str);
    }

    private function getArabicHelper(): Arabic
    {
        if ($this->arabic === null) {
            $this->arabic = new Arabic();
        }
        return $this->arabic;
    }

    private function sanitizeText(?string $val, string $fieldName, bool $required = false, int $maxLen = self::MAX_TEXT_LENGTH): ?string
    {
        if ($val === null) {
            if ($required) {
                throw new \InvalidArgumentException(sprintf('Missing required field: %s', $fieldName));
            }
            return null;
        }

        $trimmed = trim(normalizer_normalize($val, \Normalizer::FORM_C) ?: $val);
        if ($trimmed === '') {
            if ($required) {
                throw new \InvalidArgumentException(sprintf('Required field cannot be empty: %s', $fieldName));
            }
            return null;
        }

        if (mb_strlen($trimmed) > $maxLen) {
            $trimmed = mb_substr($trimmed, 0, $maxLen);
        }

        return $trimmed;
    }

    private function initFonts(): void
    {
        $this->fontLatinBold ??= $this->getFontPath('NotoSans-Bold.ttf');
        $this->fontLatinReg ??= $this->getFontPath('NotoSans-Regular.ttf');
        $this->fontArabicBold ??= $this->getFontPath('NotoSansArabic-Bold.ttf');
        $this->fontArabicReg ??= $this->getFontPath('NotoSansArabic-Regular.ttf');
    }

    private function getFontPath(string $filename): string
    {
        $path = $this->fontDir . DIRECTORY_SEPARATOR . $filename;
        if (!is_readable($path)) {
            throw DocumentCapabilityException::missingAsset($path);
        }
        return $path;
    }
}
