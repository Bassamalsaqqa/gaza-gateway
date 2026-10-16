<?php

declare(strict_types=1);

namespace Tests\Unit\Editorial;

use App\Editorial\Exceptions\EditorialValidationException;
use App\Editorial\Validation\EditorialValidator;
use PHPUnit\Framework\TestCase;

final class EditorialValidatorTest extends TestCase
{
    private EditorialValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = new EditorialValidator();
    }

    private function basePresentationPayload(array $assignments): array
    {
        return [
            'id' => 'destinations.presentation',
            'kind' => 'destinations.presentation',
            'schemaVersion' => 1,
            'seo' => [
                'title' => ['en' => 'Destinations', 'ar' => 'الوجهات'],
                'description' => ['en' => 'Destinations description', 'ar' => 'وصف الوجهات'],
                'socialTitle' => ['en' => 'Destinations Social', 'ar' => 'الوجهات'],
                'socialDescription' => ['en' => 'Social desc', 'ar' => 'وصف'],
            ],
            'assignments' => $assignments,
        ];
    }

    private function legacyCore7Assignments(): array
    {
        return [
            ['code' => 'AMM', 'photoId' => 'city-amman', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'CAI', 'photoId' => 'city-cairo', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'DOH', 'photoId' => 'city-doha', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'DXB', 'photoId' => 'city-dubai', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'IST', 'photoId' => 'city-istanbul', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'JED', 'photoId' => 'city-jeddah', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'RUH', 'photoId' => 'city-riyadh', 'focalPoint' => ['x' => 50, 'y' => 50]],
        ];
    }

    private function full20Assignments(): array
    {
        return [
            ...$this->legacyCore7Assignments(),
            ['code' => 'AUH', 'photoId' => 'city-abu-dhabi', 'focalPoint' => ['x' => 65, 'y' => 50]],
            ['code' => 'ATH', 'photoId' => 'city-athens', 'focalPoint' => ['x' => 55, 'y' => 50]],
            ['code' => 'BEY', 'photoId' => 'city-beirut', 'focalPoint' => ['x' => 45, 'y' => 55]],
            ['code' => 'FRA', 'photoId' => 'city-frankfurt', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'KUL', 'photoId' => 'city-kuala-lumpur', 'focalPoint' => ['x' => 50, 'y' => 45]],
            ['code' => 'KWI', 'photoId' => 'city-kuwait-city', 'focalPoint' => ['x' => 55, 'y' => 45]],
            ['code' => 'LHR', 'photoId' => 'city-london', 'focalPoint' => ['x' => 60, 'y' => 50]],
            ['code' => 'MAD', 'photoId' => 'city-madrid', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'BOM', 'photoId' => 'city-mumbai', 'focalPoint' => ['x' => 50, 'y' => 40]],
            ['code' => 'JFK', 'photoId' => 'city-new-york', 'focalPoint' => ['x' => 50, 'y' => 45]],
            ['code' => 'CDG', 'photoId' => 'city-paris', 'focalPoint' => ['x' => 60, 'y' => 50]],
            ['code' => 'FCO', 'photoId' => 'city-rome', 'focalPoint' => ['x' => 50, 'y' => 40]],
            ['code' => 'YYZ', 'photoId' => 'city-toronto', 'focalPoint' => ['x' => 50, 'y' => 52]],
        ];
    }

    public function test_admits_canonical_core_7_presentation(): void
    {
        $payload = $this->basePresentationPayload($this->legacyCore7Assignments());
        $this->validator->validate('destinations.presentation', $payload);
        $this->assertTrue(true);
    }

    public function test_admits_full_20_network_destination_presentation(): void
    {
        $payload = $this->basePresentationPayload($this->full20Assignments());
        $this->validator->validate('destinations.presentation', $payload);
        $this->assertTrue(true);
    }

    public function test_admits_partial_expansion_with_new_photo_id(): void
    {
        $assignments = [
            ...$this->legacyCore7Assignments(),
            ['code' => 'JFK', 'photoId' => 'city-new-york', 'focalPoint' => ['x' => 50, 'y' => 45]],
        ];
        $payload = $this->basePresentationPayload($assignments);
        $this->validator->validate('destinations.presentation', $payload);
        $this->assertTrue(true);
    }

    public function test_rejects_missing_required_core_code(): void
    {
        $this->expectException(EditorialValidationException::class);
        $this->expectExceptionMessage("Required core destination code 'AMM' is missing from assignments.");

        // 7 items, but AMM is replaced with JFK
        $assignments = [
            ['code' => 'JFK', 'photoId' => 'city-new-york', 'focalPoint' => ['x' => 50, 'y' => 45]],
            ['code' => 'CAI', 'photoId' => 'city-cairo', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'DOH', 'photoId' => 'city-doha', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'DXB', 'photoId' => 'city-dubai', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'IST', 'photoId' => 'city-istanbul', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'JED', 'photoId' => 'city-jeddah', 'focalPoint' => ['x' => 50, 'y' => 50]],
            ['code' => 'RUH', 'photoId' => 'city-riyadh', 'focalPoint' => ['x' => 50, 'y' => 50]],
        ];
        $payload = $this->basePresentationPayload($assignments);
        $this->validator->validate('destinations.presentation', $payload);
    }

    public function test_rejects_duplicate_destination_code(): void
    {
        $this->expectException(EditorialValidationException::class);
        $this->expectExceptionMessage("Invalid or duplicate destination code 'AMM'.");

        $assignments = [
            ...$this->legacyCore7Assignments(),
            ['code' => 'AMM', 'photoId' => 'city-amman', 'focalPoint' => ['x' => 50, 'y' => 50]],
        ];
        $payload = $this->basePresentationPayload($assignments);
        $this->validator->validate('destinations.presentation', $payload);
    }

    public function test_rejects_unknown_destination_code(): void
    {
        $this->expectException(EditorialValidationException::class);
        $this->expectExceptionMessage("Invalid or duplicate destination code 'XYZ'.");

        $assignments = [
            ...$this->legacyCore7Assignments(),
            ['code' => 'XYZ', 'photoId' => 'city-new-york', 'focalPoint' => ['x' => 50, 'y' => 50]],
        ];
        $payload = $this->basePresentationPayload($assignments);
        $this->validator->validate('destinations.presentation', $payload);
    }

    public function test_rejects_unknown_photo_id(): void
    {
        $this->expectException(EditorialValidationException::class);
        $this->expectExceptionMessage("Invalid destination photoId 'fake-photo'.");

        $assignments = [
            ...$this->legacyCore7Assignments(),
            ['code' => 'JFK', 'photoId' => 'fake-photo', 'focalPoint' => ['x' => 50, 'y' => 50]],
        ];
        $payload = $this->basePresentationPayload($assignments);
        $this->validator->validate('destinations.presentation', $payload);
    }

    public function test_rejects_out_of_range_focal_point(): void
    {
        $this->expectException(EditorialValidationException::class);
        $this->expectExceptionMessage("assignments[7].focalPoint x and y must be between 0 and 100.");

        $assignments = [
            ...$this->legacyCore7Assignments(),
            ['code' => 'JFK', 'photoId' => 'city-new-york', 'focalPoint' => ['x' => 150, 'y' => 50]],
        ];
        $payload = $this->basePresentationPayload($assignments);
        $this->validator->validate('destinations.presentation', $payload);
    }

    public function test_rejects_fewer_than_7_assignments(): void
    {
        $this->expectException(EditorialValidationException::class);
        $this->expectExceptionMessage("destinations.presentation 'assignments' must contain between 7 and 20 items.");

        $assignments = array_slice($this->legacyCore7Assignments(), 0, 6);
        $payload = $this->basePresentationPayload($assignments);
        $this->validator->validate('destinations.presentation', $payload);
    }

    public function test_destinations_editorial_preserves_closed_7_schema(): void
    {
        $this->expectException(EditorialValidationException::class);
        $this->expectExceptionMessage("destinations.editorial 'destinations' must have exactly 7 entries.");

        // An attempt to add JFK to destinations.editorial must be rejected
        $editorialPayload = [
            'id' => 'destinations.editorial',
            'kind' => 'destinations.editorial',
            'schemaVersion' => 1,
            'seo' => [
                'title' => ['en' => 'Destinations', 'ar' => 'الوجهات'],
                'description' => ['en' => 'Destinations description', 'ar' => 'وصف الوجهات'],
                'socialTitle' => ['en' => 'Destinations Social', 'ar' => 'الوجهات'],
                'socialDescription' => ['en' => 'Social desc', 'ar' => 'وصف'],
            ],
            'destinations' => [
                ['code' => 'AMM', 'seo' => ['title' => ['en' => 'Amman', 'ar' => 'عمان'], 'description' => ['en' => 'Desc', 'ar' => 'وصف']], 'blurb' => ['en' => 'B', 'ar' => 'ب'], 'goodToKnow' => []],
                ['code' => 'CAI', 'seo' => ['title' => ['en' => 'Cairo', 'ar' => 'القاهرة'], 'description' => ['en' => 'Desc', 'ar' => 'وصف']], 'blurb' => ['en' => 'B', 'ar' => 'ب'], 'goodToKnow' => []],
                ['code' => 'DOH', 'seo' => ['title' => ['en' => 'Doha', 'ar' => 'الدوحة'], 'description' => ['en' => 'Desc', 'ar' => 'وصف']], 'blurb' => ['en' => 'B', 'ar' => 'ب'], 'goodToKnow' => []],
                ['code' => 'DXB', 'seo' => ['title' => ['en' => 'Dubai', 'ar' => 'دبي'], 'description' => ['en' => 'Desc', 'ar' => 'وصف']], 'blurb' => ['en' => 'B', 'ar' => 'ب'], 'goodToKnow' => []],
                ['code' => 'IST', 'seo' => ['title' => ['en' => 'Istanbul', 'ar' => 'إسطنبول'], 'description' => ['en' => 'Desc', 'ar' => 'وصف']], 'blurb' => ['en' => 'B', 'ar' => 'ب'], 'goodToKnow' => []],
                ['code' => 'JED', 'seo' => ['title' => ['en' => 'Jeddah', 'ar' => 'جدة'], 'description' => ['en' => 'Desc', 'ar' => 'وصف']], 'blurb' => ['en' => 'B', 'ar' => 'ب'], 'goodToKnow' => []],
                ['code' => 'RUH', 'seo' => ['title' => ['en' => 'Riyadh', 'ar' => 'الرياض'], 'description' => ['en' => 'Desc', 'ar' => 'وصف']], 'blurb' => ['en' => 'B', 'ar' => 'ب'], 'goodToKnow' => []],
                ['code' => 'JFK', 'seo' => ['title' => ['en' => 'New York', 'ar' => 'نيويورك'], 'description' => ['en' => 'Desc', 'ar' => 'وصف']], 'blurb' => ['en' => 'B', 'ar' => 'ب'], 'goodToKnow' => []],
            ],
        ];
        $this->validator->validate('destinations.editorial', $editorialPayload);
    }
}
