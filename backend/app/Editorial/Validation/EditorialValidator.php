<?php

declare(strict_types=1);

namespace App\Editorial\Validation;

use App\Editorial\Exceptions\EditorialValidationException;

final class EditorialValidator
{
    public const ALLOWED_SLUGS = [
        'home',
        'travel',
        'airport.past',
        'airport.present',
        'airport.future',
        'destinations.presentation',
        'destinations.editorial',
        'pages.information',
    ];

    public const SOURCE_REGISTRY_KEYS = [
        'src-oslo-ii-1995',
        'src-ap-1998-opening',
        'src-ap-1998-clinton',
        'src-icao-council-2002',
        'src-gisha-2008',
        'src-saleh-hegab-airport',
        'src-worldbank-2007',
        'src-unsco-2000',
        'src-unrwa-2001',
        'src-video-ap-1998-opening',
        'src-video-clinton-1998',
        'src-video-aljazeera-2009',
        'src-video-afp-2018',
    ];

    public const ALL_APPROVED_MEDIA_IDS = [
        'home-hero', 'aerial-day', 'aerial-night', 'landside-day', 'landside-night',
        'runway-day', 'runway-night', 'concourse-day', 'concourse-night', 'interior-wide-a',
        'interior-wide-b', 'passenger-assistance', 'logo', 'brand-mark',
        'airport-archive-hero-2000', 'gallery-aircraft-archive-2000', 'airport-present-ruins-2008',
        'destinations-hero', 'travel-info-hero', 'manage-booking-hero', 'check-in-hero',
        'signin-photo', 'past-003', 'past-005', 'past-006', 'past-007', 'past-008',
        'past-009', 'past-010', 'past-011', 'past-012', 'past-014', 'past-015',
        'past-016', 'past-021', 'past-022', 'past-023', 'past-024', 'past-026',
        'past-028', 'past-029', 'past-030', 'past-031', 'past-032', 'past-033',
        'past-038', 'past-040', 'past-042', 'past-043', 'past-044', 'past-045',
        'past-046', 'past-049', 'past-050', 'past-051', 'past-053', 'past-054',
        'past-056', 'past-058',
    ];

    public const HISTORICAL_DOCUMENTARY_MEDIA_IDS = [
        'airport-archive-hero-2000', 'gallery-aircraft-archive-2000', 'airport-present-ruins-2008',
        'past-003', 'past-005', 'past-006', 'past-007', 'past-008', 'past-009',
        'past-010', 'past-011', 'past-012', 'past-014', 'past-015', 'past-016',
        'past-021', 'past-022', 'past-023', 'past-024', 'past-026', 'past-028',
        'past-029', 'past-030', 'past-031', 'past-032', 'past-033', 'past-038',
        'past-040', 'past-042', 'past-043', 'past-044', 'past-045', 'past-046',
        'past-049', 'past-050', 'past-051', 'past-053', 'past-054', 'past-056',
        'past-058',
    ];

    public const DESTINATION_CODES = ['AMM', 'CAI', 'DOH', 'DXB', 'IST', 'JED', 'RUH'];

    public const DESTINATION_PHOTO_IDS = [
        'city-amman', 'city-cairo', 'city-doha', 'city-dubai',
        'city-istanbul', 'city-jeddah', 'city-riyadh',
    ];

    public const HOME_COPY_KEYS = [
        'h1', 'sub', 'heritageSpotlightTitle', 'heritageSpotlightDesc',
        'past', 'pastSub', 'present', 'presentSub', 'future', 'futureSub',
        'destTitle', 'destSub', 'manageTitle', 'manageSub', 'infoTitle',
        'archiveTitle', 'archiveSub',
    ];

    public const FUTURE_COPY_KEYS = [
        'title', 'subtitle', 'notice', 'terminalTitle', 'terminalBody',
        'hospitalityTitle', 'hospitalityBody', 'masterplanTitle', 'masterplanBody',
        'networkTitle', 'networkBody',
    ];

    // ---------------------------------------------------------------------------
    // Root allowed keys per document type (strict closed sets)
    // ---------------------------------------------------------------------------

    private const HOME_ROOT_KEYS              = ['id', 'kind', 'schemaVersion', 'seo', 'copy', 'sections'];
    private const TRAVEL_ROOT_KEYS            = ['id', 'kind', 'schemaVersion', 'seo', 'intro', 'sections'];
    private const AIRPORT_PAST_ROOT_KEYS      = ['id', 'kind', 'schemaVersion', 'seo', 'intro', 'timeline'];
    private const AIRPORT_PRESENT_ROOT_KEYS   = ['id', 'kind', 'schemaVersion', 'seo', 'intro', 'facts', 'dossiers', 'spatial', 'globalHorizons'];
    private const AIRPORT_FUTURE_ROOT_KEYS    = ['id', 'kind', 'schemaVersion', 'seo', 'copy'];
    private const DEST_PRESENTATION_ROOT_KEYS = ['id', 'kind', 'schemaVersion', 'seo', 'assignments'];
    private const DEST_EDITORIAL_ROOT_KEYS    = ['id', 'kind', 'schemaVersion', 'seo', 'destinations'];
    private const PAGES_INFO_ROOT_KEYS        = ['id', 'kind', 'schemaVersion', 'seo', 'pages'];

    // Allowed keys for reusable nested shapes
    private const SEO_KEYS                   = ['title', 'description', 'socialTitle', 'socialDescription', 'socialMediaId'];
    private const LOCALIZED_KEYS             = ['en', 'ar'];
    private const HOME_SECTION_KEYS          = ['id', 'visible'];
    private const TRAVEL_SECTION_KEYS        = ['id', 'visible', 'title', 'body', 'points'];
    private const TRAVEL_POINT_KEYS          = ['id', 'visible', 'text'];
    private const AIRPORT_PAST_INTRO_KEYS    = ['title', 'description', 'notice'];
    private const PAST_TIMELINE_KEYS         = ['id', 'visible', 'period', 'title', 'body', 'evidence', 'sourceRefs', 'media'];
    private const PAST_TIMELINE_MEDIA_KEYS   = ['kind', 'id'];
    private const PRESENT_INTRO_KEYS         = ['title', 'subtitle', 'notice'];
    private const PRESENT_FACT_KEYS          = ['id', 'label', 'value', 'detail', 'sourceRefs'];
    private const PRESENT_DOSSIER_KEYS       = ['id', 'title', 'paragraphs', 'sourceRefs'];
    private const PRESENT_SPATIAL_KEYS       = ['title', 'description', 'evidentiaryRuleTitle', 'evidentiaryRuleBody', 'sourceRefs'];
    private const PRESENT_GLOBAL_HORIZONS_KEYS = ['eyebrow', 'title', 'description'];
    private const DEST_ASSIGN_KEYS           = ['code', 'photoId', 'focalPoint'];
    private const FOCAL_POINT_KEYS           = ['x', 'y'];
    private const DEST_EDITORIAL_ITEM_KEYS   = ['code', 'seo', 'blurb', 'goodToKnow'];
    private const GOOD_TO_KNOW_KEYS          = ['id', 'visible', 'text'];
    private const PAGE_KEYS                  = ['id', 'seo', 'title', 'description', 'blocks'];
    private const BLOCK_KEYS                 = ['id', 'visible', 'title', 'paragraphs'];

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    public function validate(string $slug, array $payload): void
    {
        if (!in_array($slug, self::ALLOWED_SLUGS, true)) {
            throw new EditorialValidationException("Unsupported editorial document key '$slug'.");
        }

        if (($payload['id'] ?? null) !== $slug) {
            throw new EditorialValidationException("Payload ID must match slug '$slug'.");
        }

        if (($payload['kind'] ?? null) !== $slug) {
            throw new EditorialValidationException("Payload kind must match slug '$slug'.");
        }

        if (($payload['schemaVersion'] ?? null) !== 1) {
            throw new EditorialValidationException('schemaVersion must be 1.');
        }

        if (!isset($payload['seo']) || !is_array($payload['seo'])) {
            throw new EditorialValidationException('seo metadata is required.');
        }

        // 1. Enforce closed root schema BEFORE content validation.
        //    This rejects payload.ownerApproved, payload.seo.secretValue, etc.
        $this->validateClosedShape($payload, $this->rootKeysForSlug($slug), 'payload');

        // 2. Validate seo (including its own closed shape)
        $this->validateSeo($payload['seo'], 'seo');

        // 3. Validate document-type body
        match ($slug) {
            'home'                     => $this->validateHome($payload),
            'travel'                   => $this->validateTravel($payload),
            'airport.past'             => $this->validateAirportPast($payload),
            'airport.present'          => $this->validateAirportPresent($payload),
            'airport.future'           => $this->validateAirportFuture($payload),
            'destinations.presentation'=> $this->validateDestinationsPresentation($payload),
            'destinations.editorial'   => $this->validateDestinationsEditorial($payload),
            'pages.information'        => $this->validatePagesInformation($payload),
        };
    }

    private function validateClosedShape(array $actual, array $allowed, string $path): void
    {
        foreach (array_keys($actual) as $key) {
            if (!in_array($key, $allowed, true)) {
                throw new EditorialValidationException(
                    "Field '$path' contains unknown key '$key'. Only these keys are accepted: " . implode(', ', $allowed) . '.'
                );
            }
        }
    }

    private function rootKeysForSlug(string $slug): array
    {
        return match ($slug) {
            'home'                      => self::HOME_ROOT_KEYS,
            'travel'                    => self::TRAVEL_ROOT_KEYS,
            'airport.past'              => self::AIRPORT_PAST_ROOT_KEYS,
            'airport.present'           => self::AIRPORT_PRESENT_ROOT_KEYS,
            'airport.future'            => self::AIRPORT_FUTURE_ROOT_KEYS,
            'destinations.presentation' => self::DEST_PRESENTATION_ROOT_KEYS,
            'destinations.editorial'    => self::DEST_EDITORIAL_ROOT_KEYS,
            'pages.information'         => self::PAGES_INFO_ROOT_KEYS,
            default                     => [],
        };
    }

    private function validatePlainText(mixed $value, string $path): void
    {
        if (!is_string($value)) {
            throw new EditorialValidationException("Field '$path' must be a string.");
        }
        $len = mb_strlen($value, 'UTF-8');
        if ($len < 1 || $len > 5000 || trim($value) === '') {
            throw new EditorialValidationException("Field '$path' must be non-empty and up to 5000 characters.");
        }
        if (preg_match('/<\s*\/?\s*[a-z][^>]*>/i', $value)) {
            throw new EditorialValidationException("Field '$path' contains forbidden HTML tags.");
        }
        if (preg_match('/javascript:|data:text\/html/i', $value)) {
            throw new EditorialValidationException("Field '$path' contains forbidden script URI.");
        }
    }

    private function validateLocalized(mixed $value, string $path): void
    {
        if (!is_array($value) || !isset($value['en']) || !isset($value['ar'])) {
            throw new EditorialValidationException("Field '$path' must be a localized text object with 'en' and 'ar'.");
        }
        // Closed shape: localized objects must only have 'en' and 'ar'
        $this->validateClosedShape($value, self::LOCALIZED_KEYS, $path);
        $this->validatePlainText($value['en'], "$path.en");
        $this->validatePlainText($value['ar'], "$path.ar");
    }

    private function validateSeo(array $seo, string $path): void
    {
        // Closed shape: reject any SEO key not in the allowed set
        $this->validateClosedShape($seo, self::SEO_KEYS, $path);

        if (!isset($seo['title']) || !isset($seo['description'])) {
            throw new EditorialValidationException("Field '$path' requires 'title' and 'description'.");
        }
        $this->validateLocalized($seo['title'], "$path.title");
        $this->validateLocalized($seo['description'], "$path.description");

        if (isset($seo['socialTitle'])) {
            $this->validateLocalized($seo['socialTitle'], "$path.socialTitle");
        }
        if (isset($seo['socialDescription'])) {
            $this->validateLocalized($seo['socialDescription'], "$path.socialDescription");
        }
        if (isset($seo['socialMediaId'])) {
            if (!is_string($seo['socialMediaId']) || !in_array($seo['socialMediaId'], self::ALL_APPROVED_MEDIA_IDS, true)) {
                throw new EditorialValidationException("Field '$path.socialMediaId' must be an approved media ID.");
            }
        }
    }

    private function validateSlug(mixed $value, string $path): void
    {
        if (!is_string($value) || !preg_match('/^[a-z][a-z0-9-]{0,63}$/', $value)) {
            throw new EditorialValidationException("Field '$path' must be a lowercase slug format.");
        }
    }

    // ---------------------------------------------------------------------------
    // Private — document-type validators
    // ---------------------------------------------------------------------------

    private function validateHome(array $payload): void
    {
        if (!isset($payload['copy']) || !is_array($payload['copy'])) {
            throw new EditorialValidationException("home 'copy' object is required.");
        }
        $copyKeys = array_keys($payload['copy']);
        sort($copyKeys);
        $expectedCopyKeys = self::HOME_COPY_KEYS;
        sort($expectedCopyKeys);
        if ($copyKeys !== $expectedCopyKeys) {
            throw new EditorialValidationException("home 'copy' must contain exactly the 17 defined keys.");
        }
        foreach (self::HOME_COPY_KEYS as $k) {
            $this->validateLocalized($payload['copy'][$k], "copy.$k");
        }

        if (!isset($payload['sections']) || !is_array($payload['sections']) || count($payload['sections']) !== 8) {
            throw new EditorialValidationException("home 'sections' must be an array of exactly 8 items.");
        }

        $allowedSectionIds = ['hero', 'search', 'board', 'heritage', 'destinations', 'manage', 'travel', 'archive'];
        $seen = [];
        foreach ($payload['sections'] as $i => $sec) {
            if (!is_array($sec) || !isset($sec['id']) || !isset($sec['visible']) || !is_bool($sec['visible'])) {
                throw new EditorialValidationException("home sections[$i] must have id and visible boolean.");
            }
            // Closed shape for each home section
            $this->validateClosedShape($sec, self::HOME_SECTION_KEYS, "sections[$i]");
            if (!in_array($sec['id'], $allowedSectionIds, true)) {
                throw new EditorialValidationException("Invalid home section id '{$sec['id']}'.");
            }
            if (in_array($sec['id'], $seen, true)) {
                throw new EditorialValidationException("Duplicate home section id '{$sec['id']}'.");
            }
            $seen[] = $sec['id'];
        }

        if ($payload['sections'][0]['id'] !== 'hero' ||
            $payload['sections'][1]['id'] !== 'search' ||
            $payload['sections'][2]['id'] !== 'board') {
            throw new EditorialValidationException("home sections must begin with 'hero', 'search', 'board' in order.");
        }

        if (!$payload['sections'][0]['visible'] ||
            !$payload['sections'][1]['visible'] ||
            !$payload['sections'][2]['visible']) {
            throw new EditorialValidationException("Required home sections ('hero', 'search', 'board') cannot be hidden.");
        }
    }

    private function validateTravel(array $payload): void
    {
        if (!isset($payload['intro']) || !is_array($payload['intro'])) {
            throw new EditorialValidationException("travel 'intro' is required.");
        }
        // Closed shape: intro must only have title and description
        $this->validateClosedShape($payload['intro'], ['title', 'description'], 'intro');
        $this->validateLocalized($payload['intro']['title'] ?? null, 'intro.title');
        $this->validateLocalized($payload['intro']['description'] ?? null, 'intro.description');

        if (!isset($payload['sections']) || !is_array($payload['sections']) || count($payload['sections']) !== 5) {
            throw new EditorialValidationException("travel 'sections' must have exactly 5 sections.");
        }

        $allowedIds = ['prepare', 'documents', 'baggage', 'airport', 'accessibility'];
        $seenSecIds = [];
        $seenPointIds = [];
        foreach ($payload['sections'] as $i => $sec) {
            if (!is_array($sec) || !isset($sec['id']) || !isset($sec['visible']) || !is_bool($sec['visible'])) {
                throw new EditorialValidationException("travel sections[$i] invalid structure.");
            }
            // Closed shape for each travel section
            $this->validateClosedShape($sec, self::TRAVEL_SECTION_KEYS, "sections[$i]");
            if (!in_array($sec['id'], $allowedIds, true) || in_array($sec['id'], $seenSecIds, true)) {
                throw new EditorialValidationException("Invalid or duplicate travel section id '{$sec['id']}'.");
            }
            $seenSecIds[] = $sec['id'];
            $this->validateLocalized($sec['title'] ?? null, "sections[$i].title");
            $this->validateLocalized($sec['body'] ?? null, "sections[$i].body");

            if (!isset($sec['points']) || !is_array($sec['points'])) {
                throw new EditorialValidationException("travel sections[$i].points must be an array.");
            }
            foreach ($sec['points'] as $j => $pt) {
                if (!is_array($pt) || !isset($pt['id']) || !isset($pt['visible']) || !is_bool($pt['visible'])) {
                    throw new EditorialValidationException("travel sections[$i].points[$j] invalid structure.");
                }
                // Closed shape for each point
                $this->validateClosedShape($pt, self::TRAVEL_POINT_KEYS, "sections[$i].points[$j]");
                $this->validateSlug($pt['id'], "sections[$i].points[$j].id");
                if (in_array($pt['id'], $seenPointIds, true)) {
                    throw new EditorialValidationException("Duplicate point id '{$pt['id']}' in travel guide.");
                }
                $seenPointIds[] = $pt['id'];
                $this->validateLocalized($pt['text'] ?? null, "sections[$i].points[$j].text");
            }
        }
    }

    private function validateAirportPast(array $payload): void
    {
        if (!isset($payload['intro']) || !is_array($payload['intro'])) {
            throw new EditorialValidationException("airport.past 'intro' is required.");
        }
        // Closed shape for intro
        $this->validateClosedShape($payload['intro'], self::AIRPORT_PAST_INTRO_KEYS, 'intro');
        $this->validateLocalized($payload['intro']['title'] ?? null, 'intro.title');
        $this->validateLocalized($payload['intro']['description'] ?? null, 'intro.description');
        $this->validateLocalized($payload['intro']['notice'] ?? null, 'intro.notice');

        if (!isset($payload['timeline']) || !is_array($payload['timeline']) || count($payload['timeline']) !== 5) {
            throw new EditorialValidationException("airport.past 'timeline' must have exactly 5 entries.");
        }

        $allowedIds = ['planning', 'opening', 'operations', 'closure', 'memory'];
        $seen = [];
        foreach ($payload['timeline'] as $i => $entry) {
            if (!is_array($entry) || !isset($entry['id']) || !isset($entry['visible']) || !is_bool($entry['visible'])) {
                throw new EditorialValidationException("airport.past timeline[$i] invalid structure.");
            }
            // Closed shape for each timeline entry
            $this->validateClosedShape($entry, self::PAST_TIMELINE_KEYS, "timeline[$i]");
            if (!in_array($entry['id'], $allowedIds, true) || in_array($entry['id'], $seen, true)) {
                throw new EditorialValidationException("Invalid or duplicate timeline entry id '{$entry['id']}'.");
            }
            $seen[] = $entry['id'];
            $this->validatePlainText($entry['period'] ?? null, "timeline[$i].period");
            $this->validateLocalized($entry['title'] ?? null, "timeline[$i].title");
            $this->validateLocalized($entry['body'] ?? null, "timeline[$i].body");

            $evidence = $entry['evidence'] ?? null;
            if (!in_array($evidence, ['verified', 'provisional', 'placeholder'], true)) {
                throw new EditorialValidationException("timeline[$i].evidence must be verified, provisional, or placeholder.");
            }

            if (!isset($entry['sourceRefs']) || !is_array($entry['sourceRefs'])) {
                throw new EditorialValidationException("timeline[$i].sourceRefs must be an array.");
            }
            if ($evidence === 'verified' && count($entry['sourceRefs']) === 0) {
                throw new EditorialValidationException("Verified timeline entry '{$entry['id']}' must cite at least one sourceRef.");
            }
            foreach ($entry['sourceRefs'] as $ref) {
                $this->validateSlug($ref, "timeline[$i].sourceRefs");
                if (!in_array($ref, self::SOURCE_REGISTRY_KEYS, true)) {
                    throw new EditorialValidationException("Unresolved sourceRef '$ref' in timeline entry '{$entry['id']}'.");
                }
            }

            if (isset($entry['media'])) {
                if (!is_array($entry['media']) || ($entry['media']['kind'] ?? null) !== 'media') {
                    throw new EditorialValidationException("timeline[$i].media must be {kind: 'media', id: ...}.");
                }
                // Closed shape for the media object
                $this->validateClosedShape($entry['media'], self::PAST_TIMELINE_MEDIA_KEYS, "timeline[$i].media");
                $mediaId = $entry['media']['id'] ?? null;
                if (!is_string($mediaId) || !in_array($mediaId, self::HISTORICAL_DOCUMENTARY_MEDIA_IDS, true)) {
                    throw new EditorialValidationException("timeline[$i].media must be an approved historical-documentary asset.");
                }
            }
        }
    }

    private function validateAirportPresent(array $payload): void
    {
        if (!isset($payload['intro']) || !is_array($payload['intro'])) {
            throw new EditorialValidationException("airport.present 'intro' is required.");
        }
        // Closed shape for intro
        $this->validateClosedShape($payload['intro'], self::PRESENT_INTRO_KEYS, 'intro');
        $this->validateLocalized($payload['intro']['title'] ?? null, 'intro.title');
        $this->validateLocalized($payload['intro']['subtitle'] ?? null, 'intro.subtitle');
        $this->validateLocalized($payload['intro']['notice'] ?? null, 'intro.notice');

        if (!isset($payload['facts']) || !is_array($payload['facts']) || count($payload['facts']) !== 4) {
            throw new EditorialValidationException("airport.present 'facts' must have exactly 4 items.");
        }
        $seenFactIds = [];
        foreach ($payload['facts'] as $i => $fact) {
            if (!is_array($fact) || !isset($fact['id']) || !is_string($fact['id']) || in_array($fact['id'], $seenFactIds, true)) {
                throw new EditorialValidationException("airport.present facts[$i] has missing or duplicate id.");
            }
            // Closed shape for each fact
            $this->validateClosedShape($fact, self::PRESENT_FACT_KEYS, "facts[$i]");
            $seenFactIds[] = $fact['id'];
            $this->validateLocalized($fact['label'] ?? null, "facts[$i].label");
            $this->validateLocalized($fact['value'] ?? null, "facts[$i].value");
            $this->validateLocalized($fact['detail'] ?? null, "facts[$i].detail");
            if (!isset($fact['sourceRefs']) || !is_array($fact['sourceRefs']) || count($fact['sourceRefs']) === 0) {
                throw new EditorialValidationException("facts[$i] must cite at least one sourceRef.");
            }
            foreach ($fact['sourceRefs'] as $ref) {
                $this->validateSlug($ref, "facts[$i].sourceRefs");
                if (!in_array($ref, self::SOURCE_REGISTRY_KEYS, true)) {
                    throw new EditorialValidationException("Unresolved sourceRef '$ref' in fact '{$fact['id']}'.");
                }
            }
        }

        if (!isset($payload['dossiers']) || !is_array($payload['dossiers']) || count($payload['dossiers']) !== 3) {
            throw new EditorialValidationException("airport.present 'dossiers' must have exactly 3 items.");
        }
        $seenDossierIds = [];
        foreach ($payload['dossiers'] as $i => $dossier) {
            if (!is_array($dossier) || !isset($dossier['id']) || !is_string($dossier['id']) || in_array($dossier['id'], $seenDossierIds, true)) {
                throw new EditorialValidationException("airport.present dossiers[$i] has missing or duplicate id.");
            }
            // Closed shape for each dossier
            $this->validateClosedShape($dossier, self::PRESENT_DOSSIER_KEYS, "dossiers[$i]");
            $seenDossierIds[] = $dossier['id'];
            $this->validateLocalized($dossier['title'] ?? null, "dossiers[$i].title");
            if (!isset($dossier['paragraphs']) || !is_array($dossier['paragraphs']) || count($dossier['paragraphs']) === 0) {
                throw new EditorialValidationException("dossiers[$i].paragraphs must have at least one paragraph.");
            }
            foreach ($dossier['paragraphs'] as $pIndex => $p) {
                $this->validateLocalized($p, "dossiers[$i].paragraphs[$pIndex]");
            }
            if (!isset($dossier['sourceRefs']) || !is_array($dossier['sourceRefs']) || count($dossier['sourceRefs']) === 0) {
                throw new EditorialValidationException("dossiers[$i] must cite at least one sourceRef.");
            }
            foreach ($dossier['sourceRefs'] as $ref) {
                $this->validateSlug($ref, "dossiers[$i].sourceRefs");
                if (!in_array($ref, self::SOURCE_REGISTRY_KEYS, true)) {
                    throw new EditorialValidationException("Unresolved sourceRef '$ref' in dossier '{$dossier['id']}'.");
                }
            }
        }

        if (!isset($payload['spatial']) || !is_array($payload['spatial'])) {
            throw new EditorialValidationException("airport.present 'spatial' is required.");
        }
        // Closed shape for spatial
        $this->validateClosedShape($payload['spatial'], self::PRESENT_SPATIAL_KEYS, 'spatial');
        $this->validateLocalized($payload['spatial']['title'] ?? null, 'spatial.title');
        $this->validateLocalized($payload['spatial']['description'] ?? null, 'spatial.description');
        $this->validateLocalized($payload['spatial']['evidentiaryRuleTitle'] ?? null, 'spatial.evidentiaryRuleTitle');
        $this->validateLocalized($payload['spatial']['evidentiaryRuleBody'] ?? null, 'spatial.evidentiaryRuleBody');
        if (!isset($payload['spatial']['sourceRefs']) || !is_array($payload['spatial']['sourceRefs']) || count($payload['spatial']['sourceRefs']) === 0) {
            throw new EditorialValidationException("spatial must cite at least one sourceRef.");
        }
        foreach ($payload['spatial']['sourceRefs'] as $ref) {
            $this->validateSlug($ref, "spatial.sourceRefs");
            if (!in_array($ref, self::SOURCE_REGISTRY_KEYS, true)) {
                throw new EditorialValidationException("Unresolved sourceRef '$ref' in spatial.");
            }
        }

        if (!isset($payload['globalHorizons']) || !is_array($payload['globalHorizons'])) {
            throw new EditorialValidationException("airport.present 'globalHorizons' is required.");
        }
        // Closed shape for globalHorizons
        $this->validateClosedShape($payload['globalHorizons'], self::PRESENT_GLOBAL_HORIZONS_KEYS, 'globalHorizons');
        $this->validateLocalized($payload['globalHorizons']['eyebrow'] ?? null, 'globalHorizons.eyebrow');
        $this->validateLocalized($payload['globalHorizons']['title'] ?? null, 'globalHorizons.title');
        $this->validateLocalized($payload['globalHorizons']['description'] ?? null, 'globalHorizons.description');
    }

    private function validateAirportFuture(array $payload): void
    {
        if (!isset($payload['copy']) || !is_array($payload['copy'])) {
            throw new EditorialValidationException("airport.future 'copy' object is required.");
        }
        $copyKeys = array_keys($payload['copy']);
        sort($copyKeys);
        $expectedCopyKeys = self::FUTURE_COPY_KEYS;
        sort($expectedCopyKeys);
        if ($copyKeys !== $expectedCopyKeys) {
            throw new EditorialValidationException("airport.future 'copy' must contain exactly the 10 defined keys.");
        }
        foreach (self::FUTURE_COPY_KEYS as $k) {
            $this->validateLocalized($payload['copy'][$k], "copy.$k");
        }
    }

    private function validateDestinationsPresentation(array $payload): void
    {
        if (!isset($payload['assignments']) || !is_array($payload['assignments']) || count($payload['assignments']) !== 7) {
            throw new EditorialValidationException("destinations.presentation 'assignments' must have exactly 7 items.");
        }
        $seen = [];
        foreach ($payload['assignments'] as $i => $item) {
            if (!is_array($item) || !isset($item['code']) || !isset($item['photoId'])) {
                throw new EditorialValidationException("assignments[$i] invalid structure.");
            }
            // Closed shape for each assignment
            $this->validateClosedShape($item, self::DEST_ASSIGN_KEYS, "assignments[$i]");
            if (!in_array($item['code'], self::DESTINATION_CODES, true) || in_array($item['code'], $seen, true)) {
                throw new EditorialValidationException("Invalid or duplicate destination code '{$item['code']}'.");
            }
            $seen[] = $item['code'];
            if (!in_array($item['photoId'], self::DESTINATION_PHOTO_IDS, true)) {
                throw new EditorialValidationException("Invalid destination photoId '{$item['photoId']}'.");
            }
            if (isset($item['focalPoint'])) {
                if (!is_array($item['focalPoint']) || !isset($item['focalPoint']['x']) || !isset($item['focalPoint']['y'])) {
                    throw new EditorialValidationException("assignments[$i].focalPoint must have x and y numbers.");
                }
                // Closed shape for focalPoint
                $this->validateClosedShape($item['focalPoint'], self::FOCAL_POINT_KEYS, "assignments[$i].focalPoint");
                $x = $item['focalPoint']['x'];
                $y = $item['focalPoint']['y'];
                if (!is_numeric($x) || $x < 0 || $x > 100 || !is_numeric($y) || $y < 0 || $y > 100) {
                    throw new EditorialValidationException("assignments[$i].focalPoint x and y must be between 0 and 100.");
                }
            }
        }
    }

    private function validateDestinationsEditorial(array $payload): void
    {
        if (!isset($payload['destinations']) || !is_array($payload['destinations']) || count($payload['destinations']) !== 7) {
            throw new EditorialValidationException("destinations.editorial 'destinations' must have exactly 7 entries.");
        }
        $seenCodes = [];
        $seenPointIds = [];
        foreach ($payload['destinations'] as $i => $item) {
            if (!is_array($item) || !isset($item['code']) || !in_array($item['code'], self::DESTINATION_CODES, true)) {
                throw new EditorialValidationException("destinations[$i] invalid code.");
            }
            // Closed shape for each destination editorial item
            $this->validateClosedShape($item, self::DEST_EDITORIAL_ITEM_KEYS, "destinations[$i]");
            if (in_array($item['code'], $seenCodes, true)) {
                throw new EditorialValidationException("Duplicate destination code '{$item['code']}'.");
            }
            $seenCodes[] = $item['code'];
            if (!isset($item['seo']) || !is_array($item['seo'])) {
                throw new EditorialValidationException("destinations[$i].seo is required.");
            }
            $this->validateSeo($item['seo'], "destinations[$i].seo");
            $this->validateLocalized($item['blurb'] ?? null, "destinations[$i].blurb");

            if (!isset($item['goodToKnow']) || !is_array($item['goodToKnow']) || count($item['goodToKnow']) > 50) {
                throw new EditorialValidationException("destinations[$i].goodToKnow must be array up to 50 items.");
            }
            foreach ($item['goodToKnow'] as $j => $pt) {
                if (!is_array($pt) || !isset($pt['id']) || !isset($pt['visible']) || !is_bool($pt['visible'])) {
                    throw new EditorialValidationException("destinations[$i].goodToKnow[$j] invalid structure.");
                }
                // Closed shape for each goodToKnow point
                $this->validateClosedShape($pt, self::GOOD_TO_KNOW_KEYS, "destinations[$i].goodToKnow[$j]");
                $this->validateSlug($pt['id'], "destinations[$i].goodToKnow[$j].id");
                if (in_array($pt['id'], $seenPointIds, true)) {
                    throw new EditorialValidationException("Duplicate point id '{$pt['id']}' across goodToKnow.");
                }
                $seenPointIds[] = $pt['id'];
                $this->validateLocalized($pt['text'] ?? null, "destinations[$i].goodToKnow[$j].text");
            }
        }
    }

    private function validatePagesInformation(array $payload): void
    {
        if (!isset($payload['pages']) || !is_array($payload['pages']) || count($payload['pages']) !== 4) {
            throw new EditorialValidationException("pages.information 'pages' must have exactly 4 pages.");
        }
        $allowedPageIds = ['about', 'contact', 'privacy', 'terms'];
        $seenPageIds = [];
        $seenBlockIds = [];
        foreach ($payload['pages'] as $i => $page) {
            if (!is_array($page) || !isset($page['id']) || !in_array($page['id'], $allowedPageIds, true)) {
                throw new EditorialValidationException("pages[$i] invalid id.");
            }
            // Closed shape for each page
            $this->validateClosedShape($page, self::PAGE_KEYS, "pages[$i]");
            if (in_array($page['id'], $seenPageIds, true)) {
                throw new EditorialValidationException("Duplicate page id '{$page['id']}'.");
            }
            $seenPageIds[] = $page['id'];
            if (!isset($page['seo']) || !is_array($page['seo'])) {
                throw new EditorialValidationException("pages[$i].seo is required.");
            }
            $this->validateSeo($page['seo'], "pages[$i].seo");
            $this->validateLocalized($page['title'] ?? null, "pages[$i].title");
            $this->validateLocalized($page['description'] ?? null, "pages[$i].description");

            if (!isset($page['blocks']) || !is_array($page['blocks']) || count($page['blocks']) > 40) {
                throw new EditorialValidationException("pages[$i].blocks must be array up to 40 blocks.");
            }
            foreach ($page['blocks'] as $j => $b) {
                if (!is_array($b) || !isset($b['id']) || !isset($b['visible']) || !is_bool($b['visible'])) {
                    throw new EditorialValidationException("pages[$i].blocks[$j] invalid structure.");
                }
                // Closed shape for each block
                $this->validateClosedShape($b, self::BLOCK_KEYS, "pages[$i].blocks[$j]");
                $this->validateSlug($b['id'], "pages[$i].blocks[$j].id");
                if (in_array($b['id'], $seenBlockIds, true)) {
                    throw new EditorialValidationException("Duplicate block id '{$b['id']}' across information pages.");
                }
                $seenBlockIds[] = $b['id'];
                $this->validateLocalized($b['title'] ?? null, "pages[$i].blocks[$j].title");

                if (!isset($b['paragraphs']) || !is_array($b['paragraphs']) || count($b['paragraphs']) < 1 || count($b['paragraphs']) > 50) {
                    throw new EditorialValidationException("pages[$i].blocks[$j].paragraphs must have 1..50 paragraphs.");
                }
                foreach ($b['paragraphs'] as $pIndex => $p) {
                    $this->validateLocalized($p, "pages[$i].blocks[$j].paragraphs[$pIndex]");
                }
            }
        }
    }
}
