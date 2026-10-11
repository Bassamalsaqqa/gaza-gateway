<?php

declare(strict_types=1);

namespace App\Reference\Meals;

use App\Reference\Meals\Exceptions\MealDuplicateException;
use App\Reference\Meals\Exceptions\MealNotFoundException;
use App\Reference\Meals\Exceptions\MealValidationException;
use App\Reference\Shared\ReferenceResponse;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MealController
{
    public function __construct(
        private readonly MealCoordinator $coordinator,
        private readonly MealValidator $validator,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ReferenceResponse::success($request, $this->coordinator->publicSnapshot());
    }

    public function adminIndex(Request $request): JsonResponse
    {
        return ReferenceResponse::success($request, $this->coordinator->adminSnapshot());
    }

    public function create(Request $request): JsonResponse
    {
        return $this->run($request, fn(): array => $this->coordinator->create(
            $this->command($request),
            $request->attributes->get('reference_authorize')
        ), 201);
    }

    public function patch(Request $request, string $id): JsonResponse
    {
        return $this->run($request, fn(): array => $this->coordinator->patch(
            $id,
            $this->command($request),
            $request->attributes->get('reference_authorize')
        ));
    }

    public function reorder(Request $request): JsonResponse
    {
        return $this->run($request, function () use ($request): array {
            $input = $this->command($request, true);
            if (array_is_list($input)) {
                $input = ['ids' => $input];
            }
            $ids = $this->validator->validateReorder($input);
            return $this->coordinator->reorder($ids, $request->attributes->get('reference_authorize'));
        });
    }

    public function setDefault(Request $request): JsonResponse
    {
        return $this->run($request, function () use ($request): array {
            $input = $this->command($request);
            $id = $this->validator->validateSetDefault($input);
            return $this->coordinator->setDefault($id, $request->attributes->get('reference_authorize'));
        });
    }

    private function command(Request $request, bool $allowList = false): array
    {
        $raw = $request->getContent();
        if (strlen($raw) > 65536 || $request->getContentTypeFormat() !== 'json') {
            throw new MealValidationException();
        }
        try {
            $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new MealValidationException();
        }
        if (!is_array($decoded)) {
            throw new MealValidationException();
        }
        if (!$allowList && array_is_list($decoded)) {
            throw new MealValidationException();
        }
        if (isset($decoded['option']) && is_array($decoded['option'])) {
            $decoded = $decoded['option'];
        } elseif (isset($decoded['meal']) && is_array($decoded['meal'])) {
            $decoded = $decoded['meal'];
        }
        return $decoded;
    }

    private function run(Request $request, Closure $operation, int $status = 200): JsonResponse
    {
        try {
            return ReferenceResponse::success($request, $operation(), $status);
        } catch (MealValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        } catch (MealDuplicateException) {
            return ReferenceResponse::error($request, 409, 'conflict');
        } catch (MealNotFoundException) {
            return ReferenceResponse::error($request, 404, 'not_found');
        }
    }
}
