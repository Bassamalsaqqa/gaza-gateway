<?php

declare(strict_types=1);

namespace App\Contracts\Mail;

use App\Contracts\Mail\Exceptions\InvalidMailMessageException;
use App\Contracts\Mail\Exceptions\MailCaptureException;
use App\Contracts\Mail\Exceptions\UnconfiguredMailProviderException;

/**
 * Seam contract for mail submission.
 *
 * Provides safe local capture in development and fail-closed unconfigured behavior in staging/production.
 */
interface MailSubmissionInterface
{
    /**
     * Submit a bounded plain-text mail message to the provider seam.
     *
     * @throws InvalidMailMessageException If message fails structural or security bounds.
     * @throws UnconfiguredMailProviderException If called on an unconfigured provider adapter.
     * @throws MailCaptureException If local persistence I/O fails.
     */
    public function submit(MailMessage $message): MailReceipt;

    /**
     * Semantic alias for submit().
     *
     * @throws InvalidMailMessageException If message fails structural or security bounds.
     * @throws UnconfiguredMailProviderException If called on an unconfigured provider adapter.
     * @throws MailCaptureException If local persistence I/O fails.
     */
    public function send(MailMessage $message): MailReceipt;
}
