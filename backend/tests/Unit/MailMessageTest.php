<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Contracts\Mail\Exceptions\InvalidMailMessageException;
use App\Contracts\Mail\MailMessage;
use PHPUnit\Framework\TestCase;

class MailMessageTest extends TestCase
{
    public function test_valid_mail_message_is_instantiated(): void
    {
        $message = new MailMessage(
            recipient: 'passenger@example.com',
            subject: 'Flight Confirmation PS 204',
            body: 'Your flight is confirmed.',
        );

        $this->assertSame('passenger@example.com', $message->recipient);
        $this->assertSame('Flight Confirmation PS 204', $message->subject);
        $this->assertSame('Your flight is confirmed.', $message->body);
    }

    public function test_rejects_empty_or_whitespace_recipient(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('Recipient email cannot be empty');

        new MailMessage(
            recipient: '   ',
            subject: 'Test Subject',
            body: 'Test Body',
        );
    }

    public function test_rejects_invalid_email_format(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('not a valid email');

        new MailMessage(
            recipient: 'not-an-email',
            subject: 'Test Subject',
            body: 'Test Body',
        );
    }

    public function test_rejects_crlf_header_injection_in_recipient(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('forbidden control or CRLF');

        new MailMessage(
            recipient: "victim@example.com\r\nBcc: attacker@example.com",
            subject: 'Test Subject',
            body: 'Test Body',
        );
    }

    public function test_rejects_newline_in_recipient(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('forbidden control or CRLF');

        new MailMessage(
            recipient: "victim@example.com\n",
            subject: 'Test Subject',
            body: 'Test Body',
        );
    }

    public function test_rejects_crlf_header_injection_in_subject(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('forbidden control or CRLF');

        new MailMessage(
            recipient: 'passenger@example.com',
            subject: "Confirmation\r\nSubject-Injection: true",
            body: 'Test Body',
        );
    }

    public function test_rejects_newline_in_subject(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('forbidden control or CRLF');

        new MailMessage(
            recipient: 'passenger@example.com',
            subject: "Line 1\nLine 2",
            body: 'Test Body',
        );
    }

    public function test_rejects_empty_subject(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('Subject cannot be empty');

        new MailMessage(
            recipient: 'passenger@example.com',
            subject: '   ',
            body: 'Test Body',
        );
    }

    public function test_rejects_oversized_recipient(): void
    {
        $longLocal = str_repeat('a', 250);
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('maximum allowed bound');

        new MailMessage(
            recipient: $longLocal . '@example.com',
            subject: 'Test Subject',
            body: 'Test Body',
        );
    }

    public function test_rejects_oversized_subject(): void
    {
        $longSubject = str_repeat('S', 256);
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('maximum allowed bound');

        new MailMessage(
            recipient: 'passenger@example.com',
            subject: $longSubject,
            body: 'Test Body',
        );
    }

    public function test_rejects_null_bytes_in_body(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('null byte characters');

        new MailMessage(
            recipient: 'passenger@example.com',
            subject: 'Test Subject',
            body: "Hello\0World",
        );
    }

    public function test_rejects_oversized_body(): void
    {
        $oversizedBody = str_repeat('A', 65537);
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('maximum allowed bound');

        new MailMessage(
            recipient: 'passenger@example.com',
            subject: 'Test Subject',
            body: $oversizedBody,
        );
    }

    public function test_rejects_custom_limits_exceeding_architectural_ceilings(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('architectural ceiling');

        new MailMessage(
            recipient: 'test@example.com',
            subject: 'Subject',
            body: 'Body',
            maxBodyBytes: 100000, // Exceeds 65536
        );
    }

    public function test_rejects_custom_recipient_limit_exceeding_ceiling(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('architectural ceiling');

        new MailMessage(
            recipient: 'test@example.com',
            subject: 'Subject',
            body: 'Body',
            maxRecipientLength: 300, // Exceeds 254
        );
    }

    public function test_rejects_custom_subject_limit_exceeding_ceiling(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('architectural ceiling');

        new MailMessage(
            recipient: 'test@example.com',
            subject: 'Subject',
            body: 'Body',
            maxSubjectLength: 500, // Exceeds 255
        );
    }

    public function test_rejects_non_utf8_subject(): void
    {
        $this->expectException(InvalidMailMessageException::class);
        $this->expectExceptionMessage('valid UTF-8');

        new MailMessage(
            recipient: 'test@example.com',
            subject: "Invalid \xC3\x28 Subject",
            body: 'Body',
        );
    }

    public function test_debug_info_redacts_recipient_and_subject(): void
    {
        $message = new MailMessage(
            recipient: 'sensitive-passenger@example.com',
            subject: 'Secret Reservation Code',
            body: 'Hello passenger, here is your secret code.',
        );

        $debug = $message->__debugInfo();

        $this->assertSame('[REDACTED]', $debug['recipient']);
        $this->assertSame('[REDACTED]', $debug['subject']);
        $this->assertArrayNotHasKey('body', $debug);
        $this->assertSame(strlen('Hello passenger, here is your secret code.'), $debug['body_bytes']);
    }
}
