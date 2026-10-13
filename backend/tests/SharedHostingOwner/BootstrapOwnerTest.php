<?php

declare(strict_types=1);

namespace Tests\SharedHostingOwner;

use App\Mvp\Mail\MailSettings;
use Illuminate\Support\Facades\{Artisan, DB};
use Tests\TestCase;

/** Real transactions on the exact disposable DB, synthetic deployment-mode command admission; no network sends. */
final class BootstrapOwnerTest extends TestCase
{
    private string $root;
    private array $input;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('gaza_gateway_mysql_test', DB::selectOne('SELECT DATABASE() AS db')->db);
        $this->assertSame(0, DB::table('staff_users')->count(), 'Owner bootstrap requires a fresh gate database.');
        $this->root = '/tmp/hostpapa-owner-test-' . bin2hex(random_bytes(8));
        mkdir($this->root, 0700); mkdir($this->root . '/app', 0700); mkdir($this->root . '/app/private', 0700);
        $this->app->useStoragePath($this->root);
        $this->app->detectEnvironment(fn() => 'production');
        $sha = str_repeat('a', 40);
        config(['app.env' => 'production', 'app.commit' => $sha,
            'foundation-services.shared_hosting_enabled' => true,
            'mvp-mail.enabled' => true, 'mvp-mail.identity_smtp_enabled' => true,
            'mvp-mail.allowed_hosts' => ['mail.gazaairport.com']]);
        $this->input = ['purpose' => 'first_staff_invitation', 'releaseSha' => $sha, 'database' => 'gaza_gateway_mysql_test',
            'admin' => ['username' => 'fixture-owner', 'email' => 'owner@example.test', 'fullNameEn' => 'Synthetic Owner', 'fullNameAr' => 'Synthetic Owner'],
            'smtp' => ['host' => 'mail.gazaairport.com', 'port' => 465, 'tls' => 'tls', 'username' => 'notifications@gazaairport.com',
                'password' => 'SYNTHETIC-OWNER-SMTP-SECRET', 'senderName' => 'Gaza Gateway',
                'senderEmail' => 'notifications@gazaairport.com', 'replyTo' => '']];
    }

    private function writeInput(): string
    {
        $file = $this->root . '/app/private/owner-bootstrap.json';
        file_put_contents($file, json_encode($this->input, JSON_THROW_ON_ERROR)); chmod($file, 0600);
        return $file;
    }

    protected function tearDown(): void
    {
        $file = $this->root . '/app/private/owner-bootstrap.json';
        if (is_file($file)) { unlink($file); }
        rmdir($this->root . '/app/private'); rmdir($this->root . '/app'); rmdir($this->root);
        $this->app->detectEnvironment(fn() => 'testing'); config(['app.env' => 'testing']);
        parent::tearDown();
    }

    public function test_fault_rolls_back_owner_settings_proof_and_outbox_and_retains_private_input(): void
    {
        $tables = ['staff_users','mvp_mail_settings','staff_invitations','security_dispatch_outbox'];
        $before = [];
        foreach ($tables as $table) $before[$table] = DB::table($table)->count();
        $file = $this->writeInput();
        DB::unprepared("CREATE TRIGGER owner_bootstrap_fault BEFORE INSERT ON audit_events FOR EACH ROW
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic bootstrap audit failure'");
        try {
            $this->assertSame(1, Artisan::call('hostpapa:bootstrap-owner'));
            $this->assertStringNotContainsString($this->input['smtp']['password'], Artisan::output());
            foreach ($tables as $table) {
                $this->assertSame($before[$table], DB::table($table)->count(), $table . ' must preserve prior records on rollback.');
            }
            $this->assertFileExists($file);
        } finally { DB::unprepared('DROP TRIGGER owner_bootstrap_fault'); }
    }

    public function test_first_owner_remains_invited_with_encrypted_smtp_and_one_durable_proof(): void
    {
        $file = $this->writeInput();
        $this->assertSame(0, Artisan::call('hostpapa:bootstrap-owner'));
        $this->assertStringNotContainsString($this->input['smtp']['password'], Artisan::output());
        $owner = DB::table('staff_users')->sole();
        $this->assertSame('admin', $owner->role); $this->assertSame('invited', $owner->status);
        $this->assertNull($owner->password_hash); $this->assertNull($owner->mfa_version);
        $this->assertSame(0, DB::table('staff_mfa_credentials')->count());
        $this->assertSame(1, DB::table('staff_invitations')->count());
        $proof = DB::table('staff_invitations')->sole();
        $this->assertNull($proof->invited_by_staff_id);
        $this->assertSame(86400, strtotime($proof->expires_at) - strtotime($proof->issued_at));
        $this->assertSame(1, DB::table('security_dispatch_outbox')->where('staff_invitation_id', $proof->id)->count());
        $this->assertStringNotContainsString($this->input['smtp']['password'], DB::table('mvp_mail_settings')->value('encrypted_config'));
        $this->assertArrayNotHasKey('password', app(MailSettings::class)->read());
        $this->assertFileDoesNotExist($file);
        $this->writeInput();
        $this->assertSame(1, Artisan::call('hostpapa:bootstrap-owner'));
        $this->assertSame(1, DB::table('staff_users')->count());
        $this->assertSame(1, DB::table('staff_invitations')->count());
    }
}
