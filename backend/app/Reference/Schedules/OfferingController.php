<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

use App\Reference\Schedules\Exceptions\OfferingAvailabilityException;
use App\Reference\Schedules\Exceptions\OfferingNotFoundException;
use App\Reference\Schedules\Exceptions\ScheduleValidationException;
use App\Reference\Shared\ReferenceResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class OfferingController
{
    public function __construct(
        private readonly ScheduleCoordinator $coordinator,
        private readonly OfferingResolver $resolver,
        private readonly OfferingAvailabilityHelper $availabilityHelper,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $date = $request->query('date');
        if (!is_string($date) || !ScheduleIdentityCodec::isValidISODate($date)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $origin = $request->query('origin');
        $destination = $request->query('destination');
        $direction = $request->query('direction');

        if ($origin !== null && !is_string($origin)) return ReferenceResponse::error($request, 422, 'validation_error');
        if ($destination !== null && !is_string($destination)) return ReferenceResponse::error($request, 422, 'validation_error');
        if ($direction !== null && !is_string($direction)) return ReferenceResponse::error($request, 422, 'validation_error');
        if (is_string($origin) && !preg_match('/^[A-Z]{3}$/', $origin)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }
        if (is_string($destination) && !preg_match('/^[A-Z]{3}$/', $destination)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }
        if (is_string($direction) && !in_array($direction, ['out', 'in'], true)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        try {
            $offerings = $this->coordinator->offerings(
                $date,
                is_string($origin) ? $origin : null,
                is_string($destination) ? $destination : null,
                is_string($direction) ? $direction : null,
            );
            return ReferenceResponse::success($request, $offerings);
        } catch (ScheduleValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }
    }

    public function availability(Request $request): JsonResponse
    {
        $origin = $request->query('origin');
        $destination = $request->query('destination');
        $date = $request->query('date');
        $rawDays = $request->query('days', '28');

        if (!is_string($origin) || !preg_match('/^[A-Z]{3}$/', $origin)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        if (!is_string($destination) || !preg_match('/^[A-Z]{3}$/', $destination)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        if (!is_string($date) || !ScheduleIdentityCodec::isValidISODate($date)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        if (!is_string($rawDays) || !preg_match('/^[1-9][0-9]?$/', $rawDays)) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        $days = (int) $rawDays;
        if ($days < 1 || $days > 60) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }

        try {
            $data = $this->availabilityHelper->getAvailability($origin, $destination, $date, $days);
            return ReferenceResponse::success($request, $data);
        } catch (ScheduleValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        }
    }

    public function show(Request $request, string $id): JsonResponse
    {
        try {
            $offering = $this->resolver->resolveId($id);
            return ReferenceResponse::success($request, $offering->toArray());
        } catch (OfferingNotFoundException | OfferingAvailabilityException) {
            return ReferenceResponse::error($request, 404, 'not_found');
        }
    }
}
