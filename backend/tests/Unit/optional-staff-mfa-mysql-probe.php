<?php
/** Standalone bounded DDL probe; no Laravel/vendor substitutes are used to claim HTTP authority. */
declare(strict_types=1);
namespace Illuminate\Database\Migrations { abstract class Migration {} }
namespace Illuminate\Support\Facades {
    final class DB {
        public static \PDO $pdo;
        public static function statement(string $sql): void { self::$pdo->exec($sql); }
        public static function table(string $table): object {
            return new class($table) {
                private array $clauses = [];
                private array $values = [];
                public function __construct(private string $table) {}
                public function where(string $column, string $value): self { $this->clauses[] = "`{$column}` = ?"; $this->values[] = $value; return $this; }
                public function whereNull(string $column): self { $this->clauses[] = "`{$column}` IS NULL"; return $this; }
                public function exists(): bool {
                    $stmt = DB::$pdo->prepare("SELECT EXISTS(SELECT 1 FROM `{$this->table}` WHERE " . implode(' AND ', $this->clauses) . ')');
                    $stmt->execute($this->values); return (bool) $stmt->fetchColumn();
                }
            };
        }
    }
}
namespace {
    use Illuminate\Support\Facades\DB;
    if (getenv('OPTIONAL_MFA_DISPOSABLE') !== '1') { throw new RuntimeException('Explicit disposable admission required.'); }
    DB::$pdo = new PDO('mysql:host=mysql;dbname=gaza_gateway_mysql_test;charset=utf8mb4', 'gaza_app_user', 'Synthetic-optional-mfa-db-password', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    if (DB::$pdo->query('SELECT DATABASE()')->fetchColumn() !== 'gaza_gateway_mysql_test') { throw new RuntimeException('Wrong live target.'); }
    function check(bool $value, string $label): void { if (!$value) { throw new RuntimeException($label); } echo "PASS {$label}\n"; }
    function rejects(string $sql, string $label): void {
        try { DB::statement($sql); } catch (PDOException $e) { check($e->getCode() === 'HY000' || $e->getCode() === '23000', $label); return; }
        throw new RuntimeException("Constraint accepted {$label}");
    }
    $core = require __DIR__ . '/../../database/migrations/2026_10_09_000001_create_identity_core_tables.php';
    $core->up();
    $id = '00000000-0000-4000-8000-000000000001';
    $password = '00000000-0000-4000-8000-000000000002';
    $session = '00000000-0000-4000-8000-000000000003';
    $pwdSession = '00000000-0000-4000-8000-000000000004';
    DB::statement("INSERT INTO staff_users (id,username,email,full_name_en,full_name_ar,password_hash,role,status,email_verified_at,credential_epoch,created_at,updated_at) VALUES ('{$id}','legacy','legacy@example.invalid','Synthetic','Synthetic','synthetic hash','admin','pending_enrollment',UTC_TIMESTAMP(6),1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
    DB::statement("INSERT INTO staff_mfa_credentials (staff_id,version,encrypted_secret,confirmed_at) VALUES ('{$id}',1,'synthetic encrypted secret',UTC_TIMESTAMP(6))");
    DB::statement("UPDATE staff_users SET mfa_version=1,status='active' WHERE id='{$id}'");
    DB::statement("INSERT INTO staff_sessions (id,lookup_digest,staff_id,auth_level,credential_epoch,encrypted_payload,issued_at,absolute_expires_at,idle_expires_at,last_seen_at,mfa_version,mfa_verified_at) VALUES ('{$session}',REPEAT('a',64),'{$id}','full',1,'synthetic payload',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 8 HOUR,UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,UTC_TIMESTAMP(6),1,UTC_TIMESTAMP(6))");
    $migration = require __DIR__ . '/../../database/migrations/2026_10_13_000001_optional_initial_staff_mfa.php';
    $migration->up();
    $legacy = DB::$pdo->query("SELECT assurance,password_verified_at,mfa_verified_at FROM staff_sessions WHERE id='{$session}'")->fetch(PDO::FETCH_ASSOC);
    check($legacy['assurance'] === 'mfa' && $legacy['password_verified_at'] === null && $legacy['mfa_verified_at'] !== null, 'existing MFA session retains true assurance');
    DB::statement("INSERT INTO staff_users (id,username,email,full_name_en,full_name_ar,password_hash,role,status,email_verified_at,credential_epoch,created_at,updated_at) VALUES ('{$password}','password','password@example.invalid','Synthetic','Synthetic','synthetic hash','admin','active',UTC_TIMESTAMP(6),1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
    DB::statement("INSERT INTO staff_sessions (id,lookup_digest,staff_id,auth_level,credential_epoch,encrypted_payload,issued_at,absolute_expires_at,idle_expires_at,last_seen_at,assurance,password_verified_at) VALUES ('{$pwdSession}',REPEAT('b',64),'{$password}','full',1,'synthetic payload',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 8 HOUR,UTC_TIMESTAMP(6)+INTERVAL 1 HOUR,UTC_TIMESTAMP(6),'password',UTC_TIMESTAMP(6))");
    check(DB::$pdo->query("SELECT mfa_verified_at FROM staff_sessions WHERE id='{$pwdSession}'")->fetchColumn() === null, 'password session does not invent MFA proof');
    rejects("UPDATE staff_sessions SET password_verified_at=NULL WHERE id='{$pwdSession}'", 'password assurance requires real password timestamp');
    rejects("UPDATE staff_sessions SET assurance='mfa' WHERE id='{$pwdSession}'", 'MFA assurance requires credential and timestamp');
    rejects("UPDATE staff_sessions SET mfa_verified_at=UTC_TIMESTAMP(6) WHERE id='{$pwdSession}'", 'password assurance cannot carry fabricated MFA proof');
    rejects("UPDATE staff_sessions SET assurance='anonymous' WHERE id='{$pwdSession}'", 'full sessions cannot claim anonymous assurance');
    rejects("UPDATE staff_users SET email_verified_at=NULL WHERE id='{$password}'", 'active staff must remain verified');
    try { $migration->down(); throw new RuntimeException('Unsafe rollback allowed'); }
    catch (RuntimeException $e) { check(str_contains($e->getMessage(), 'remediation'), 'rollback refuses stranded password authority'); }
    DB::statement("DELETE FROM staff_sessions WHERE id='{$pwdSession}'"); DB::statement("DELETE FROM staff_users WHERE id='{$password}'");
    $migration->down(); $migration->up();
    check(DB::$pdo->query("SELECT assurance FROM staff_sessions WHERE id='{$session}'")->fetchColumn() === 'mfa', 'additive migration rollback and reapply preserves existing MFA');
    $other = new PDO('mysql:host=mysql;dbname=gaza_gateway_mysql_test;charset=utf8mb4', 'gaza_app_user', 'Synthetic-optional-mfa-db-password', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    DB::$pdo->beginTransaction(); DB::$pdo->query('SELECT id FROM staff_directory_control WHERE id=1 FOR UPDATE')->fetchColumn();
    $other->exec('SET SESSION innodb_lock_wait_timeout=1'); $other->beginTransaction();
    try { $other->query('SELECT id FROM staff_directory_control WHERE id=1 FOR UPDATE'); throw new RuntimeException('Sentinel failed to serialize contenders'); }
    catch (PDOException $e) { check(($e->errorInfo[1] ?? null) === 1205, 'InnoDB sentinel serializes concurrent eligibility writers'); }
    $other->rollBack(); DB::$pdo->commit();
    $other->beginTransaction(); check((int) $other->query('SELECT id FROM staff_directory_control WHERE id=1 FOR UPDATE')->fetchColumn() === 1, 'sentinel becomes available after owner commit'); $other->commit();
    echo 'MySQL ' . DB::$pdo->query('SELECT VERSION()')->fetchColumn() . '; PHP ' . PHP_VERSION . "; DDL probe complete\n";
}
