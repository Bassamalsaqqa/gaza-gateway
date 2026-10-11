<?php

declare(strict_types=1);

namespace App\Reference\Schedules;

use App\Reference\Schedules\Exceptions\ScheduleDuplicateException;
use App\Reference\Schedules\Exceptions\ScheduleNotFoundException;
use App\Reference\Schedules\Exceptions\ScheduleValidationException;
use App\Reference\Shared\ReferenceResponse;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ScheduleController
{
    public function __construct(
        private readonly ScheduleCoordinator $coordinator,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ReferenceResponse::success($request, $this->coordinator->schedules(true));
    }

    public function adminIndex(Request $request): JsonResponse
    {
        return ReferenceResponse::success($request, $this->coordinator->schedules(false));
    }

    public function create(Request $request): JsonResponse
    {
        return $this->run($request, fn(): array => $this->coordinator->create(
            $this->command($request),
            $request->attributes->get('reference_authorize')
        ), 201);
    }

    public function patch(Request $request, string $key): JsonResponse
    {
        return $this->run($request, fn(): array => $this->coordinator->patch(
            $key,
            $this->command($request),
            $request->attributes->get('reference_authorize')
        ), 200);
    }

    private function command(Request $request): array
    {
        $raw = $request->getContent();
        if (strlen($raw) > 65536 || $request->getContentTypeFormat() !== 'json') {
            throw new ScheduleValidationException('Malformed payload or content-type');
        }
        try {
            $object = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
            if (!is_object($object)) throw new ScheduleValidationException('Schedule input must be a JSON object');
            $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ScheduleValidationException('Invalid JSON payload');
        }
        if (!is_array($decoded)) {
            throw new ScheduleValidationException('Schedule input must be a JSON object');
        }
        return $decoded;
    }

    private function run(Request $request, Closure $operation, int $status = 200): JsonResponse
    {
        try {
            return ReferenceResponse::success($request, $operation(), $status);
        } catch (ScheduleValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        } catch (ScheduleDuplicateException) {
            return ReferenceResponse::error($request, 409, 'conflict');
        } catch (ScheduleNotFoundException) {
            return ReferenceResponse::error($request, 404, 'not_found');
        }
    }
}
