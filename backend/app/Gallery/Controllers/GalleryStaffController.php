<?php

declare(strict_types=1);

namespace App\Gallery\Controllers;

use App\Gallery\Exceptions\GalleryConflictException;
use App\Gallery\Exceptions\GalleryNotFoundException;
use App\Gallery\Exceptions\GalleryValidationException;
use App\Gallery\Services\GalleryCoordinator;
use App\Gallery\Shared\GalleryResponse;
use App\Http\Controllers\Controller;
use App\Identity\Sessions\StaffSessionContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use JsonException;

final class GalleryStaffController extends Controller
{
    private const MAX_BODY_BYTES = 262144; // 256 KiB
    private const JS_MAX_SAFE_INTEGER = 9007199254740991; // 2^53 - 1

    public function __construct(
        private readonly GalleryCoordinator $coordinator
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        if (strlen($request->getContent()) > self::MAX_BODY_BYTES) {
            return GalleryResponse::error($request, 400, 'bad_request', 'Request payload exceeds 256KiB limit.');
        }

        foreach ($request->headers->all() as $values) {
            foreach ((array) $values as $val) {
                if (strlen((string) $val) > 8192) {
                    return GalleryResponse::error($request, 400, 'bad_request', 'Header size exceeds limit.');
                }
            }
        }

        try {
            $data = $this->coordinator->getEditorial();
            return GalleryResponse::success($request, $data, 200);
        } catch (GalleryNotFoundException $e) {
            return GalleryResponse::error($request, 404, 'not_found', $e->getMessage());
        }
    }

    public function putDraft(Request $request): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        $keys = array_keys($body);
        sort($keys);
        if ($keys !== ['expectedRevision', 'payload']) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision and payload.');
        }

        $expectedRevision = $body['expectedRevision'];
        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        if (!isset($obj->payload) || !is_object($obj->payload) || !is_array($body['payload']) || array_is_list($body['payload'])) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Field payload must be a JSON object.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $receipt = $this->coordinator->saveDraft(
                $body['payload'],
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return GalleryResponse::success($request, $receipt, 200);
        } catch (GalleryConflictException $e) {
            return GalleryResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (GalleryValidationException $e) {
            return GalleryResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        } catch (GalleryNotFoundException $e) {
            return GalleryResponse::error($request, 404, 'not_found', $e->getMessage());
        }
    }

    public function discardDraft(Request $request): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        if (array_keys($body) !== ['expectedRevision']) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision.');
        }

        $expectedRevision = $body['expectedRevision'];
        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $doc = $this->coordinator->discardDraft(
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return GalleryResponse::success($request, $doc, 200);
        } catch (GalleryConflictException $e) {
            return GalleryResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (GalleryNotFoundException $e) {
            return GalleryResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (GalleryValidationException $e) {
            return GalleryResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        }
    }

    public function publish(Request $request): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        if (array_keys($body) !== ['expectedRevision']) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision.');
        }

        $expectedRevision = $body['expectedRevision'];
        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $doc = $this->coordinator->publish(
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return GalleryResponse::success($request, $doc, 200);
        } catch (GalleryConflictException $e) {
            return GalleryResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (GalleryNotFoundException $e) {
            return GalleryResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (GalleryValidationException $e) {
            return GalleryResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        }
    }

    public function unpublish(Request $request): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        if (array_keys($body) !== ['expectedRevision']) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision.');
        }

        $expectedRevision = $body['expectedRevision'];
        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $doc = $this->coordinator->unpublish(
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return GalleryResponse::success($request, $doc, 200);
        } catch (GalleryConflictException $e) {
            return GalleryResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (GalleryNotFoundException $e) {
            return GalleryResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (GalleryValidationException $e) {
            return GalleryResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        }
    }

    public function restore(Request $request): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        $keys = array_keys($body);
        sort($keys);
        if ($keys !== ['expectedRevision', 'targetRevision']) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision and targetRevision.');
        }

        $expectedRevision = $body['expectedRevision'];
        $targetRevision = $body['targetRevision'];

        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        if (!is_int($targetRevision) || $targetRevision < 1 || $targetRevision > self::JS_MAX_SAFE_INTEGER) {
            return GalleryResponse::error($request, 422, 'validation_error', 'Field targetRevision must be an integer between 1 and 9007199254740991.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $doc = $this->coordinator->restore(
                $targetRevision,
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return GalleryResponse::success($request, $doc, 200);
        } catch (GalleryConflictException $e) {
            return GalleryResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (GalleryNotFoundException $e) {
            return GalleryResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (GalleryValidationException $e) {
            return GalleryResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        }
    }

    /**
     * @return array{0: ?object, 1: ?array, 2: ?JsonResponse}
     */
    private function parseJsonBody(Request $request): array
    {
        $raw = $request->getContent();
        if (strlen($raw) > self::MAX_BODY_BYTES) {
            return [null, null, GalleryResponse::error($request, 400, 'bad_request', 'Request payload exceeds 256KiB limit.')];
        }

        $contentType = $request->header('Content-Type') ?? '';
        if (!preg_match('#^application/json(?:;|$)#i', $contentType)) {
            return [null, null, GalleryResponse::error($request, 400, 'bad_request', 'Content-Type must be application/json.')];
        }

        $trimmed = trim($raw);
        if ($trimmed === '' || !str_starts_with($trimmed, '{') || !str_ends_with($trimmed, '}')) {
            return [null, null, GalleryResponse::error($request, 422, 'validation_error', 'Request body must be a JSON object.')];
        }

        try {
            $obj = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
            $assoc = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return [null, null, GalleryResponse::error($request, 422, 'validation_error', 'Malformed JSON payload.')];
        }

        if (!is_object($obj) || !is_array($assoc) || array_is_list($assoc)) {
            return [null, null, GalleryResponse::error($request, 422, 'validation_error', 'Request body must be a JSON object.')];
        }

        return [$obj, $assoc, null];
    }
}
