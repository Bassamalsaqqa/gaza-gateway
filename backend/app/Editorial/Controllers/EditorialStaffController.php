<?php

declare(strict_types=1);

namespace App\Editorial\Controllers;

use App\Editorial\Exceptions\EditorialConflictException;
use App\Editorial\Exceptions\EditorialNotFoundException;
use App\Editorial\Exceptions\EditorialValidationException;
use App\Editorial\Services\EditorialCoordinator;
use App\Editorial\Shared\EditorialResponse;
use App\Http\Controllers\Controller;
use App\Identity\Sessions\StaffSessionContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use JsonException;

final class EditorialStaffController extends Controller
{
    private const MAX_BODY_BYTES = 262144; // 256 KiB
    private const JS_MAX_SAFE_INTEGER = 9007199254740991; // 2^53 - 1

    public function __construct(
        private readonly EditorialCoordinator $coordinator
    ) {
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        if (strlen($request->getContent()) > self::MAX_BODY_BYTES) {
            return EditorialResponse::error($request, 400, 'bad_request', 'Request payload exceeds 256KiB limit.');
        }

        try {
            $data = $this->coordinator->getEditorial($slug);
            return EditorialResponse::success($request, $data, 200);
        } catch (EditorialNotFoundException $e) {
            return EditorialResponse::error($request, 404, 'not_found', $e->getMessage());
        }
    }

    public function putDraft(Request $request, string $slug): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        $keys = array_keys($body);
        sort($keys);
        if ($keys !== ['expectedRevision', 'payload']) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision and payload.');
        }

        $expectedRevision = $body['expectedRevision'];
        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        if (!isset($obj->payload) || !is_object($obj->payload) || !is_array($body['payload']) || array_is_list($body['payload'])) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Field payload must be a JSON object.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $receipt = $this->coordinator->saveDraft(
                $slug,
                $body['payload'],
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return EditorialResponse::success($request, $receipt, 200);
        } catch (EditorialConflictException $e) {
            return EditorialResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (EditorialValidationException $e) {
            return EditorialResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        } catch (EditorialNotFoundException $e) {
            return EditorialResponse::error($request, 404, 'not_found', $e->getMessage());
        }
    }

    public function discardDraft(Request $request, string $slug): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        if (array_keys($body) !== ['expectedRevision']) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision.');
        }

        $expectedRevision = $body['expectedRevision'];
        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $doc = $this->coordinator->discardDraft(
                $slug,
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return EditorialResponse::success($request, $doc, 200);
        } catch (EditorialConflictException $e) {
            return EditorialResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (EditorialNotFoundException $e) {
            return EditorialResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (EditorialValidationException $e) {
            return EditorialResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        }
    }

    public function publish(Request $request, string $slug): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        if (array_keys($body) !== ['expectedRevision']) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision.');
        }

        $expectedRevision = $body['expectedRevision'];
        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $doc = $this->coordinator->publish(
                $slug,
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return EditorialResponse::success($request, $doc, 200);
        } catch (EditorialConflictException $e) {
            return EditorialResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (EditorialNotFoundException $e) {
            return EditorialResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (EditorialValidationException $e) {
            return EditorialResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        }
    }

    public function unpublish(Request $request, string $slug): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        if (array_keys($body) !== ['expectedRevision']) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision.');
        }

        $expectedRevision = $body['expectedRevision'];
        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $doc = $this->coordinator->unpublish(
                $slug,
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return EditorialResponse::success($request, $doc, 200);
        } catch (EditorialConflictException $e) {
            return EditorialResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (EditorialNotFoundException $e) {
            return EditorialResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (EditorialValidationException $e) {
            return EditorialResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        }
    }

    public function restore(Request $request, string $slug): JsonResponse
    {
        [$obj, $body, $err] = $this->parseJsonBody($request);
        if ($err !== null) {
            return $err;
        }

        $keys = array_keys($body);
        sort($keys);
        if ($keys !== ['expectedRevision', 'targetRevision']) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Invalid request fields: expected exactly expectedRevision and targetRevision.');
        }

        $expectedRevision = $body['expectedRevision'];
        $targetRevision = $body['targetRevision'];

        if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > self::JS_MAX_SAFE_INTEGER) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Field expectedRevision must be an integer between 0 and 9007199254740991.');
        }

        if (!is_int($targetRevision) || $targetRevision < 1 || $targetRevision > self::JS_MAX_SAFE_INTEGER) {
            return EditorialResponse::error($request, 422, 'validation_error', 'Field targetRevision must be an integer between 1 and 9007199254740991.');
        }

        /** @var StaffSessionContext $session */
        $session = $request->attributes->get('editorial_staff_session');
        /** @var callable $authorizer */
        $authorizer = $request->attributes->get('editorial_authorizer');

        try {
            $doc = $this->coordinator->restore(
                $slug,
                $targetRevision,
                $expectedRevision,
                $session->getStaffId() ?? '',
                $authorizer
            );
            return EditorialResponse::success($request, $doc, 200);
        } catch (EditorialConflictException $e) {
            return EditorialResponse::error($request, 409, 'conflict', $e->getMessage());
        } catch (EditorialNotFoundException $e) {
            return EditorialResponse::error($request, 404, 'not_found', $e->getMessage());
        } catch (EditorialValidationException $e) {
            return EditorialResponse::error($request, 422, 'validation_error', $e->getMessage(), $e->fields);
        }
    }

    /**
     * @return array{0: ?object, 1: ?array, 2: ?JsonResponse}
     */
    private function parseJsonBody(Request $request): array
    {
        $raw = $request->getContent();
        if (strlen($raw) > self::MAX_BODY_BYTES) {
            return [null, null, EditorialResponse::error($request, 400, 'bad_request', 'Request payload exceeds 256KiB limit.')];
        }

        $contentType = $request->header('Content-Type') ?? '';
        if (!preg_match('#^application/json(?:;|$)#i', $contentType)) {
            return [null, null, EditorialResponse::error($request, 400, 'bad_request', 'Content-Type must be application/json.')];
        }

        $trimmed = trim($raw);
        if ($trimmed === '' || !str_starts_with($trimmed, '{') || !str_ends_with($trimmed, '}')) {
            return [null, null, EditorialResponse::error($request, 422, 'validation_error', 'Request body must be a JSON object.')];
        }

        try {
            $obj = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
            $assoc = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return [null, null, EditorialResponse::error($request, 422, 'validation_error', 'Malformed JSON payload.')];
        }

        if (!is_object($obj) || !is_array($assoc) || array_is_list($assoc)) {
            return [null, null, EditorialResponse::error($request, 422, 'validation_error', 'Request body must be a JSON object.')];
        }

        return [$obj, $assoc, null];
    }
}
