<?php

declare(strict_types=1);

/**
 * Gaza Gateway - Development-only PHP probe adapter for cross-language parity testing.
 *
 * Reads JSON test specimens from STDIN or argv[1], runs IdentityCommandValidator,
 * and outputs deterministic JSON validation results.
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Identity\Contracts\IdentityCommandValidator;

$input = '';
if ($argc > 1 && file_exists($argv[1])) {
    $input = (string) file_get_contents($argv[1]);
} else {
    $input = (string) stream_get_contents(STDIN);
}

if (trim($input) === '') {
    fwrite(STDERR, "Error: No input provided to probe\n");
    exit(1);
}

/** @var mixed $specimens */
$specimens = json_decode($input, false, 512, JSON_THROW_ON_ERROR);

if (!is_array($specimens)) {
    $specimens = [$specimens];
}

$validator = new IdentityCommandValidator();
$results = [];

foreach ($specimens as $specimen) {
    $id = $specimen->id ?? 'unknown';
    $opId = $specimen->operationId ?? '';
    $payload = property_exists($specimen, 'payload') ? $specimen->payload : IdentityCommandValidator::NO_BODY;
    $rawParams = $specimen->parameters ?? new stdClass();
    $params = is_object($rawParams) ? get_object_vars($rawParams) : (array) $rawParams;

    if (isset($specimen->rawJson)) {
        $res = $validator->validateJson((string) $opId, $specimen->rawJson, $params);
    } elseif (!empty($specimen->useRoute)) {
        $res = $validator->validateRoute((string) ($specimen->method ?? ''), (string) ($specimen->path ?? ''), $payload, $params);
    } else {
        $res = $validator->validate((string) $opId, $payload, $params);
    }

    $results[] = [
        'id' => $id,
        'operationId' => $opId,
        'valid' => $res->isValid(),
        'violationCodes' => $res->getViolationCodes(),
        'violations' => $res->toArray()['violations'],
    ];
}

echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
