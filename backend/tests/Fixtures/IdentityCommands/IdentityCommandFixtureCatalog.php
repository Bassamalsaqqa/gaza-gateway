<?php

declare(strict_types=1);

namespace Tests\Fixtures\IdentityCommands;

use stdClass;

final class IdentityCommandFixtureCatalog
{
    public const string SPECIMENS_FILE = __DIR__ . '/specimens.json';

    /**
     * @return list<array{
     *     id: string,
     *     family: string,
     *     operationId: string,
     *     method: string,
     *     path: string,
     *     expectedValid: bool,
     *     expectedCode: string|null,
     *     payload: mixed,
     *     parameters: array<string, mixed>,
     *     rawJson: string|null
     * }>
     */
    public static function loadAllSpecimens(): array
    {
        $raw = (string) file_get_contents(self::SPECIMENS_FILE);
        /** @var list<stdClass> $items */
        $items = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);

        $specimens = [];
        foreach ($items as $item) {
            $rawParams = $item->parameters ?? new stdClass();
            $params = is_object($rawParams) ? get_object_vars($rawParams) : (array) $rawParams;

            $specimens[] = [
                'id' => (string) $item->id,
                'family' => (string) $item->family,
                'operationId' => (string) $item->operationId,
                'method' => (string) $item->method,
                'path' => (string) $item->path,
                'expectedValid' => (bool) $item->expectedValid,
                'expectedCode' => isset($item->expectedCode) ? (string) $item->expectedCode : null,
                'payload' => $item->payload ?? null,
                'parameters' => $params,
                'rawJson' => isset($item->rawJson) ? (string) $item->rawJson : null,
            ];
        }

        return $specimens;
    }

    /**
     * Returns specimens formatted for PHPUnit dataProvider.
     *
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function provideSpecimens(): array
    {
        $specimens = self::loadAllSpecimens();
        $provider = [];
        foreach ($specimens as $specimen) {
            $provider[$specimen['id']] = [$specimen];
        }

        return $provider;
    }
}
