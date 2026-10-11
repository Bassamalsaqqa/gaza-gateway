<?php

declare(strict_types=1);

namespace App\Identity\Staff;

use App\Identity\Sessions\SessionReceipt;

/** Explicit access only: cookie authority never appears in generic object serialization. */
final class StaffOperationResult implements \JsonSerializable
{
    private readonly \Closure $holder;

    public function __construct(
        #[\SensitiveParameter] array $data,
        #[\SensitiveParameter] ?SessionReceipt $session = null,
        #[\SensitiveParameter] ?string $pendingToken = null,
        public readonly ?string $challengeId = null,
    ) {
        $this->holder = static fn(): array => [$data, $session, $pendingToken];
    }

    public function data(): array { return ($this->holder)()[0]; }
    public function session(): ?SessionReceipt { return ($this->holder)()[1]; }
    public function pendingToken(): ?string { return ($this->holder)()[2]; }
    public function jsonSerialize(): array { return ['result' => '[REDACTED]']; }
    public function __debugInfo(): array { return $this->jsonSerialize(); }
    public function __serialize(): array { throw new \LogicException('Staff result serialization is prohibited.'); }
}
