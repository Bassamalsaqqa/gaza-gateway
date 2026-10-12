<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Deployment\OwnerBootstrapConfiguration;
use App\Deployment\PrivateOwnerInput;
use App\Identity\Audit\{AuditActor, AuditOutcome, AuditTargetType, AuditWriter};
use App\Identity\Dispatch\OutboxService;
use App\Identity\Proofs\{ProofPurpose, ProofService};
use App\Mvp\Mail\MailSettings;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Creates no password/MFA secret. Normal invitation acceptance and enrollment remain required. */
final class BootstrapSharedHostingOwner extends Command
{
    protected $signature = 'hostpapa:bootstrap-owner';
    protected $description = 'Issue the first staff invitation from private release-bound owner configuration';

    public function handle(): int
    {
        try {
            if (PHP_SAPI !== 'cli' || !app()->environment(['staging', 'production'])
                || DB::connection()->getDriverName() !== 'mysql' || DB::transactionLevel() !== 0) {
                throw new \RuntimeException();
            }
            $path = storage_path('app/private/owner-bootstrap.json');
            $input = PrivateOwnerInput::read($path);
            $database = (string) DB::selectOne('SELECT DATABASE() AS name')->name;
            $input = OwnerBootstrapConfiguration::validate($input, (string) config('app.commit'), $database);
            if (config('mvp-mail.enabled') !== true || config('mvp-mail.identity_smtp_enabled') !== true) {
                throw new \RuntimeException();
            }
            DB::transaction(function () use ($input): void {
                if (!DB::table('staff_directory_control')->where('id', 1)->lockForUpdate()->first()
                    || DB::table('staff_users')->exists() || DB::table('mvp_mail_settings')->exists()) {
                    throw new \RuntimeException();
                }
                $now = DB::selectOne('SELECT UTC_TIMESTAMP(6) AS now')->now;
                $id = (string) Str::uuid();
                $admin = $input['admin'];
                DB::table('staff_users')->insert([
                    'id' => $id, 'username' => $admin['username'], 'email' => $admin['email'],
                    'full_name_en' => $admin['fullNameEn'], 'full_name_ar' => $admin['fullNameAr'],
                    'role' => 'admin', 'status' => 'invited', 'credential_epoch' => 1,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
                app(MailSettings::class)->save(['expectedRevision' => 0, 'driver' => 'smtp', ...$input['smtp']], $id);
                $proof = app(ProofService::class)->issue(ProofPurpose::StaffInvitation, $id, DB::connection());
                app(OutboxService::class)->enqueueProof($proof, DB::connection());
                app(AuditWriter::class)->record(AuditActor::system(), 'postStaffUserInvite', AuditOutcome::Success,
                    AuditTargetType::StaffUser, $id, ['success' => true], (string) Str::uuid(), DB::connection());
            });
            // Do not send while holding identity locks; the shared cron dispatcher handles delivery.
            // Keep a fixed output even if erasing the owner file needs operator attention.
            $erased = @unlink($path);
            $this->info('First staff invitation queued; normal password setup and MFA enrollment are required.');
            if (!$erased) {
                $this->warn('Remove the private owner-bootstrap configuration after successful setup.');
            }
            return self::SUCCESS;
        } catch (\Throwable) {
            $this->error('Owner bootstrap refused or failed; no credential details are printed.');
            return self::FAILURE;
        }
    }
}
