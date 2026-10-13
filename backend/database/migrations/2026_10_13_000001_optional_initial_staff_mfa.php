<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Classify existing full sessions by their real MFA proof; never invent password proof.
        DB::statement("ALTER TABLE staff_sessions ADD assurance VARCHAR(16) NOT NULL DEFAULT 'anonymous', ADD password_verified_at DATETIME(6) NULL");
        DB::statement("UPDATE staff_sessions SET assurance = 'mfa' WHERE auth_level = 'full'");
        DB::statement("ALTER TABLE staff_sessions DROP CHECK chk_staff_sessions_mfa, ADD CONSTRAINT chk_staff_sessions_assurance CHECK (
            (auth_level = 'anonymous' AND assurance = 'anonymous' AND password_verified_at IS NULL AND mfa_version IS NULL AND mfa_verified_at IS NULL)
            OR (auth_level = 'full' AND assurance = 'password' AND password_verified_at IS NOT NULL AND mfa_version IS NULL AND mfa_verified_at IS NULL)
            OR (auth_level = 'full' AND assurance = 'mfa' AND mfa_version IS NOT NULL AND mfa_verified_at IS NOT NULL))");
        DB::statement("ALTER TABLE staff_users DROP CHECK chk_staff_users_active_requirements, ADD CONSTRAINT chk_staff_users_active_requirements CHECK (status <> 'active' OR (email_verified_at IS NOT NULL AND password_hash IS NOT NULL))");
    }

    public function down(): void
    {
        // Refuse a rollback that would silently strand password-only active accounts.
        if (DB::table('staff_users')->where('status', 'active')->whereNull('mfa_version')->exists()
            || DB::table('staff_sessions')->where('assurance', 'password')->exists()) {
            throw new RuntimeException('Optional staff MFA rollback requires explicit account/session remediation.');
        }
        DB::statement("ALTER TABLE staff_users DROP CHECK chk_staff_users_active_requirements, ADD CONSTRAINT chk_staff_users_active_requirements CHECK (status <> 'active' OR (email_verified_at IS NOT NULL AND password_hash IS NOT NULL AND mfa_version IS NOT NULL))");
        DB::statement("ALTER TABLE staff_sessions DROP CHECK chk_staff_sessions_assurance, ADD CONSTRAINT chk_staff_sessions_mfa CHECK (auth_level <> 'full' OR (mfa_version IS NOT NULL AND mfa_verified_at IS NOT NULL)), DROP COLUMN password_verified_at, DROP COLUMN assurance");
    }
};
