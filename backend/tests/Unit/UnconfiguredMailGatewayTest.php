<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Contracts\Mail\Exceptions\UnconfiguredMailProviderException;
use App\Contracts\Mail\MailMessage;
use App\Services\Foundation\Mail\UnconfiguredMailGateway;
use PHPUnit\Framework\TestCase;

class UnconfiguredMailGatewayTest extends TestCase
{
    public function test_submit_throws_dedicated_unconfigured_exception(): void
    {
        $gateway = new UnconfiguredMailGateway();

        $message = new MailMessage(
            recipient: 'passenger@example.com',
            subject: 'Flight Update',
            body: 'Status changed to scheduled.',
        );

        $this->expectException(UnconfiguredMailProviderException::class);
        $this->expectExceptionMessage('Mail submission is unconfigured in this environment. No email was sent or captured.');

        $gateway->submit($message);
    }

    public function test_send_alias_throws_dedicated_unconfigured_exception(): void
    {
        $gateway = new UnconfiguredMailGateway();

        $message = new MailMessage(
            recipient: 'passenger@example.com',
            subject: 'Flight Update',
            body: 'Status changed to scheduled.',
        );

        $this->expectException(UnconfiguredMailProviderException::class);
        $this->expectExceptionMessage('Mail submission is unconfigured in this environment. No email was sent or captured.');

        $gateway->send($message);
    }
}
