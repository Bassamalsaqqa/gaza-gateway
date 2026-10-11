<?php

declare(strict_types=1);

namespace App\Http\Controllers\Reference;

use App\Reference\Network\NetworkCoordinator;
use App\Reference\Network\NetworkDuplicateCodeException;
use App\Reference\Network\NetworkNotFoundException;
use App\Reference\Network\NetworkValidationException;
use App\Reference\Shared\ReferenceResponse;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use JsonException;
use stdClass;

final class NetworkController
{
    public function __construct(private readonly NetworkCoordinator $network) {}

    public function index(Request $request): JsonResponse
    {
        return ReferenceResponse::success($request, $this->network->airports(true));
    }

    public function adminIndex(Request $request): JsonResponse
    {
        return ReferenceResponse::success($request, $this->network->airports(false));
    }

    public function create(Request $request): JsonResponse
    {
        return $this->run(
            $request,
            fn(): array => $this->network->create(
                $this->command($request),
                $request->attributes->get('network_authorize')
            ),
            201
        );
    }

    public function patch(Request $request, string $code): JsonResponse
    {
        return $this->run(
            $request,
            fn(): array => $this->network->patch(
                $code,
                $this->command($request),
                $request->attributes->get('network_authorize')
            )
        );
    }

    public function routes(Request $request): JsonResponse
    {
        return ReferenceResponse::success($request, $this->network->routes(true));
    }

    /**
     * @return array<string, mixed>
     */
    private function command(Request $request): array
    {
        $raw = $request->getContent();
        if (strlen($raw) > 65536 || $request->getContentTypeFormat() !== 'json') {
            throw new NetworkValidationException();
        }
        try {
            $object = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new NetworkValidationException();
        }
        if (!$object instanceof stdClass) {
            throw new NetworkValidationException();
        }
        return json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    }

    private function run(Request $request, Closure $operation, int $status = 200): JsonResponse
    {
        try {
            return ReferenceResponse::success($request, $operation(), $status);
        } catch (NetworkValidationException) {
            return ReferenceResponse::error($request, 422, 'validation_error');
        } catch (NetworkDuplicateCodeException) {
            return ReferenceResponse::error($request, 409, 'conflict');
        } catch (NetworkNotFoundException) {
            return ReferenceResponse::error($request, 404, 'not_found');
        }
    }
}
