<?php

declare(strict_types=1);

namespace Tests\SharedHostingMail;

use App\Mvp\Mail\MailSettings;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class MailSettingsSharedHostingTest extends SharedHostingMailTestCase
{
    public function test_mail_settings_save_and_read_roundtrip_in_mysql(): void
    {
        $staffId = $this->createStaffUser()['id'];
        $settings = app(MailSettings::class);

        $initial = $settings->read();
        $this->assertFalse($initial['configured']);

        $saved = $settings->save([
            'expectedRevision' => (int) $initial['revision'],
            'driver' => 'smtp',
            'host' => '127.0.0.1',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Gaza Airport Operations',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => 'contact@gazaairport.com',
            'username' => 'hostpapa-user',
            'password' => 'secret-hostpapa-pass',
        ], $staffId);

        $this->assertTrue($saved['configured']);
        $this->assertSame(1, $saved['revision']);
        $this->assertSame('127.0.0.1', $saved['host']);
        $this->assertSame(1025, $saved['port']);
        $this->assertSame('ops@gazaairport.com', $saved['senderEmail']);
        $this->assertTrue($saved['usernameSet']);
        $this->assertTrue($saved['passwordSet']);
        $this->assertArrayNotHasKey('username', $saved);
        $this->assertArrayNotHasKey('password', $saved);

        // Verify raw DB row has encrypted_config and no plaintext
        $row = DB::table('mvp_mail_settings')->where('id', 1)->first();
        $this->assertNotNull($row);
        $this->assertSame(1, (int) $row->revision);
        $this->assertStringNotContainsString('secret-hostpapa-pass', $row->encrypted_config);

        // Verify forWorker retrieves decrypted credentials
        $workerConfig = $settings->forWorker();
        $this->assertNotNull($workerConfig);
        $this->assertSame('hostpapa-user', $workerConfig['username']);
        $this->assertSame('secret-hostpapa-pass', $workerConfig['password']);
    }

    public function test_mail_settings_revision_conflict_throws_409(): void
    {
        $staffId = $this->createStaffUser()['id'];
        $settings = app(MailSettings::class);

        $read = $settings->read();

        // Save once to increment revision
        $settings->save([
            'expectedRevision' => (int) $read['revision'],
            'driver' => 'smtp',
            'host' => '127.0.0.1',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Gaza Airport',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => '',
        ], $staffId);

        // Second save using stale expectedRevision must throw 409
        $this->expectException(HttpException::class);
        $settings->save([
            'expectedRevision' => (int) $read['revision'], // Stale revision
            'driver' => 'smtp',
            'host' => '127.0.0.1',
            'port' => 1025,
            'tls' => 'none',
            'senderName' => 'Gaza Airport Stale',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => '',
        ], $staffId);
    }

    public function test_mail_settings_rejects_unauthorized_host(): void
    {
        $staffId = $this->createStaffUser()['id'];
        $settings = app(MailSettings::class);

        $read = $settings->read();

        $this->expectException(\InvalidArgumentException::class);
        $settings->save([
            'expectedRevision' => (int) $read['revision'],
            'driver' => 'smtp',
            'host' => 'unauthorized-external-relay.invalid',
            'port' => 25,
            'tls' => 'none',
            'senderName' => 'Gaza Airport',
            'senderEmail' => 'ops@gazaairport.com',
            'replyTo' => '',
        ], $staffId);
    }
}
