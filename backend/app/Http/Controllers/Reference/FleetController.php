<?php
declare(strict_types=1);

namespace App\Http\Controllers\Reference;

use App\Reference\Fleet\{FleetCoordinator, FleetValidationException, FleetDuplicateRegistrationException, FleetNotFoundException};
use App\Reference\Shared\ReferenceResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class FleetController
{
    public function __construct(private readonly FleetCoordinator $fleet) {}

    public function index(Request $request): JsonResponse
    {
        return ReferenceResponse::success($request, $this->fleet->aircraft());
    }

    public function layout(Request $request, string $id): JsonResponse
    {
        return $this->run($request, fn(): array => $this->fleet->layout($id));
    }

    public function create(Request $request): JsonResponse
    {
        return $this->run($request, fn(): array => $this->fleet->create($this->command($request),
            $request->attributes->get('reference_authorize')), 201);
    }

    public function patch(Request $request, string $id): JsonResponse
    {
        return $this->run($request, fn(): array => $this->fleet->patch($id, $this->command($request),
            $request->attributes->get('reference_authorize')));
    }

    public function putLayout(Request $request, string $id): JsonResponse
    {
        return $this->run($request, fn(): array => $this->fleet->putLayout($id, $this->command($request),
            $request->attributes->get('reference_authorize')));
    }

    public function snapshot(Request $request): JsonResponse
    {
        return ReferenceResponse::success($request, $this->fleet->snapshot());
    }

    public function patchReceipt(Request $request, string $id): JsonResponse
    {
        return $this->run($request, fn(): array => $this->fleet->patch($id, $this->command($request),
            $request->attributes->get('reference_authorize'), true));
    }

    public function layoutReceipt(Request $request, string $id): JsonResponse
    {
        return $this->run($request, fn(): array => $this->fleet->putLayout($id, $this->command($request),
            $request->attributes->get('reference_authorize'), true));
    }

    private function command(Request $request): array
    {
        $raw = $request->getContent();
        if (strlen($raw) > 65536 || $request->getContentTypeFormat() !== 'json') { throw new FleetValidationException(); }
        try { $object = json_decode($raw, false, 32, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { throw new FleetValidationException(); }
        if (!$object instanceof \stdClass) { throw new FleetValidationException(); }
        if (property_exists($object, 'aircraft') && !$object->aircraft instanceof \stdClass) { throw new FleetValidationException(); }
        $layout = property_exists($object, 'initialLayout') ? $object->initialLayout
            : ($request->isMethod('PUT') ? $object : null);
        if ($layout !== null) {
            if (!$layout instanceof \stdClass) { throw new FleetValidationException(); }
            foreach (['rows','letters','aisleAfter','zones','extraLegroomRows','unavailable'] as $key) {
                if (!property_exists($layout, $key)) { throw new FleetValidationException(); }
            }
            foreach (['letters','zones','extraLegroomRows','unavailable'] as $key) {
                if (!is_array($layout->$key)) { throw new FleetValidationException(); }
            }
            foreach ($layout->zones as $zone) {
                if (!$zone instanceof \stdClass) { throw new FleetValidationException(); }
            }
        } elseif (property_exists($object, 'initialLayout')) { throw new FleetValidationException(); }
        return json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    }

    private function run(Request $request, \Closure $operation, int $status = 200): JsonResponse
    {
        try { return ReferenceResponse::success($request, $operation(), $status); }
        catch (FleetValidationException) { return ReferenceResponse::error($request, 422, 'validation_error'); }
        catch (FleetDuplicateRegistrationException) { return ReferenceResponse::error($request, 409, 'conflict'); }
        catch (FleetNotFoundException) { return ReferenceResponse::error($request, 404, 'not_found'); }
    }
}
