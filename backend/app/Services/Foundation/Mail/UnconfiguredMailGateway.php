<?php

declare(strict_types=1);

namespace App\Services\Foundation\Mail;

use App\Contracts\Mail\Exceptions\UnconfiguredMailProviderException;
use App\Contracts\Mail\MailMessage;
use App\Contracts\Mail\MailReceipt;
use App\Contracts\Mail\MailSubmissionInterface;

/**
 * Fail-closed unconfigured mail provider adapter.
 *
 * Enforces production/staging isolation by throwing dedicated exceptions on invocation.
 * Performs zero filesystem I/O, zero network dispatch, and zero credential exposure.
 */
class UnconfiguredMailGateway implements MailSubmissionInterface
{
    public function submit(MailMessage $message): MailReceipt
    {
        throw new UnconfiguredMailProviderException(
            'Mail submission is unconfigured in this environment. No email was sent or captured.'
        );
    }

    public function send(MailMessage $message): MailReceipt
    {
        return $this->submit($message);
    }
}
