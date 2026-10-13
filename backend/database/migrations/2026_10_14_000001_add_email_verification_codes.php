<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("CREATE TABLE user_email_verification_codes (
            verification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
            code_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            failed_attempts INT NOT NULL DEFAULT 0,
            CONSTRAINT fk_email_code_proof FOREIGN KEY (verification_id) REFERENCES user_email_verifications(id) ON DELETE CASCADE,
            CONSTRAINT chk_email_code_attempts CHECK (failed_attempts BETWEEN 0 AND 5),
            CONSTRAINT chk_email_code_digest CHECK (REGEXP_LIKE(code_digest, '^[0-9a-f]{64}$', 'c'))
        ) ENGINE=InnoDB");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE user_email_verification_codes');
    }
};
