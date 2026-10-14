<?php
declare(strict_types=1);
require '/vendor/autoload.php';
require '/source/backend/app/SharedHosting/SharedHostingProfile.php';
require '/source/backend/app/Support/ReferenceWriteBarrier.php';
use App\Support\ReferenceWriteBarrier;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

function loadRunnerFunction(string $name): void {
    $tokens = token_get_all(file_get_contents('/source/tools/hostpapa-release/production-upgrade/production-upgrade-runner.php'));
    foreach ($tokens as $i => $token) {
        if (!is_array($token) || $token[0] !== T_FUNCTION) continue;
        $j = $i + 1;
        while (is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++;
        if (!is_array($tokens[$j]) || $tokens[$j][1] !== $name) continue;
        $code = ''; $depth = 0; $opened = false;
        for ($k = $i; $k < count($tokens); $k++) {
            $t = $tokens[$k];
            $code .= is_array($t) ? $t[1] : $t;
            if ($t === '{' || (is_array($t) && in_array($t[0], [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) { $opened = true; $depth++; }
            if ($t === '}' && --$depth === 0 && $opened) { eval($code); return; }
        }
    }
    throw new RuntimeException('Named runner function not found.');
}
foreach (['beginRollbackReferenceBarrier', 'assertRollbackMigrationLedger', 'assertRollbackCompatible'] as $fn) loadRunnerFunction($fn);
function db(): PDO {
    return new PDO('mysql:host='.getenv('MYSQL_HOST').';dbname=rollback_test', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
}
function ok(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); echo "PASS ".$message."\n"; }
function unavailable(Closure $call, string $message): void {
    try { $call(); } catch (ServiceUnavailableHttpException $e) { ok($e->getStatusCode() === 503, $message); return; }
    throw new RuntimeException('Expected unavailable: '.$message);
}
function setupApp(): Illuminate\Foundation\Application {
    $root = '/tmp/guard/app';
    @mkdir($root.'/releases/rel_new/backend', 0700, true);
    @mkdir($root.'/shared/storage/framework', 0700, true);
    $app = new Illuminate\Foundation\Application($root.'/releases/rel_new/backend');
    $app->useStoragePath($root.'/shared/storage');
    $app->instance('config', new Illuminate\Config\Repository(['foundation-services'=>['shared_hosting_enabled'=>true]]));
    $app->instance(Illuminate\Contracts\Foundation\MaintenanceMode::class, new Illuminate\Foundation\FileBasedMaintenanceMode());
    return $app;
}
$app = setupApp();
$root = '/tmp/guard/app';
$pointer = $root.'/current-release.txt';
$maint = $root.'/shared/storage/framework/maintenance.php';
if (($argv[1] ?? '') === 'barrier') {
    echo "ATTEMPT\n"; flush();
    $pdo = db();
    try {
        beginRollbackReferenceBarrier($pdo);
        assertRollbackCompatible($pdo);
        throw new RuntimeException('Expanded committed authority accepted.');
    } catch (RuntimeException $e) {
        if (!str_contains($e->getMessage(), 'Expanded reference')) throw $e;
        echo "INCOMPATIBLE\n";
    } finally { if ($pdo->inTransaction()) $pdo->rollBack(); }
    exit;
}
if (($argv[1] ?? '') === 'writer') {
    echo "ATTEMPT\n"; flush();
    $pdo = db(); $pdo->beginTransaction();
    $pdo->query("SELECT domain FROM network_revision_control WHERE domain='network' FOR UPDATE")->fetch();
    try {
        ReferenceWriteBarrier::guard();
        $pdo->exec("INSERT INTO airports VALUES ('BEY',120)");
        throw new RuntimeException('Obsolete request wrote after rollback.');
    } catch (ServiceUnavailableHttpException $e) { ok($e->getStatusCode() === 503, 'waiting writer rejected after maintenance removal/source change'); }
    finally { $pdo->rollBack(); }
    exit;
}
function child(string $mode): array {
    $process = proc_open([PHP_BINARY, __FILE__, $mode], [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes);
    fclose($pipes[0]);
    if (trim((string)fgets($pipes[1])) !== 'ATTEMPT') throw new RuntimeException('Child handshake failed.');
    return [$process, $pipes];
}
function waiting(PDO $pdo): void {
    $end = microtime(true)+5;
    do {
        if ((int)$pdo->query('SELECT COUNT(*) FROM performance_schema.data_lock_waits')->fetchColumn() > 0) { ok(true,'real InnoDB lock wait observed'); return; }
        usleep(20000);
    } while (microtime(true) < $end);
    throw new RuntimeException('Child did not block behind domain barrier.');
}
function finish(array $child): string {
    [$process,$pipes] = $child;
    $out=stream_get_contents($pipes[1]); $err=stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]); $code=proc_close($process);
    if ($code !== 0) throw new RuntimeException('Child failed: '.$err.$out);
    return $out;
}
$pdo=db();
foreach (['reference_revision_control'=>'fleet','network_revision_control'=>'network','schedule_revision_control'=>'schedules'] as $table=>$domain) {
    $pdo->exec("CREATE TABLE {$table} (domain VARCHAR(20) PRIMARY KEY, revision BIGINT NOT NULL) ENGINE=InnoDB");
    $pdo->prepare("INSERT INTO {$table} VALUES (?,1)")->execute([$domain]);
}
$pdo->exec("CREATE TABLE airports (code CHAR(3) PRIMARY KEY, block_minutes INT NOT NULL) ENGINE=InnoDB");
$pdo->exec("INSERT INTO airports VALUES ('GZA',20),('AMM',120)");
$pdo->exec("CREATE TABLE migrations (migration VARCHAR(100) PRIMARY KEY) ENGINE=InnoDB");
$pdo->exec("INSERT INTO migrations VALUES ('m1'),('m2')");
file_put_contents($pointer,"rel_new\n");
ReferenceWriteBarrier::guard();
ok(true,'current release may write');
$app['config']->set('foundation-services.shared_hosting_enabled',false);
file_put_contents($maint,'<?php exit;');
unavailable(fn()=>ReferenceWriteBarrier::guard(),'local maintenance refuses writes');
unlink($maint);
$app['config']->set('foundation-services.shared_hosting_enabled',true);
foreach (['rel_old', '../bad', ''] as $value) {
    file_put_contents($pointer,$value);
    unavailable(fn()=>ReferenceWriteBarrier::guard(),'changed or invalid pointer refuses writes');
}
unlink($pointer);
unavailable(fn()=>ReferenceWriteBarrier::guard(),'missing pointer refuses writes');
symlink('/tmp/nonexistent',$pointer);
unavailable(fn()=>ReferenceWriteBarrier::guard(),'symlink pointer refuses writes');
unlink($pointer); file_put_contents($pointer,"rel_new\n");
file_put_contents(dirname($maint).'/down','{}');
unavailable(fn()=>ReferenceWriteBarrier::guard(),'Laravel down refuses writes'); unlink(dirname($maint).'/down');
beginRollbackReferenceBarrier($pdo);
assertRollbackCompatible($pdo);
assertRollbackMigrationLedger($pdo,['m2','m1']);
ok(true,'compatible reference and exact migration names pass under barrier');
try { assertRollbackMigrationLedger($pdo,['m1','wrong']); throw new LogicException('ledger accepted'); }
catch (RuntimeException $e) { ok(str_contains($e->getMessage(),'exact candidate'),'same-count wrong migration names refused'); }
$pdo->commit();

// Writer admitted before maintenance owns its network row lock and commits later.
$writer=db(); $writer->beginTransaction();
$writer->query("SELECT domain FROM network_revision_control WHERE domain='network' FOR UPDATE")->fetch();
$writer->exec("INSERT INTO airports VALUES ('BEY',120)");
$child=child('barrier'); waiting($pdo); $writer->commit();
ok(str_contains(finish($child),'INCOMPATIBLE'),'compatibility waits then observes committed expanded authority');
ok((int)$pdo->query("SELECT COUNT(*) FROM airports WHERE code='BEY'")->fetchColumn()===1,'refusal preserves committed writer data');
$pdo->exec("DELETE FROM airports WHERE code='BEY'");

// A waiting request executes new-code guard after switch, even with maintenance removed.
beginRollbackReferenceBarrier($pdo);
file_put_contents($maint,'<?php exit;');
$child=child('writer'); waiting(db());
file_put_contents($pointer,"rel_old\n"); unlink($maint); $pdo->commit();
ok(str_contains(finish($child),'waiting writer rejected'),'obsolete waiting writer cannot mutate after barrier release');
ok((int)$pdo->query("SELECT COUNT(*) FROM airports")->fetchColumn()===2,'waiting writer leaves authority unchanged');
foreach (['reference_revision_control'=>'fleet','network_revision_control'=>'network','schedule_revision_control'=>'schedules'] as $table=>$domain) {
    $pdo->prepare("DELETE FROM {$table} WHERE domain=?")->execute([$domain]);
    try { beginRollbackReferenceBarrier($pdo); throw new LogicException('missing sentinel accepted'); }
    catch (RuntimeException $e) { ok(str_contains($e->getMessage(),'Missing rollback'),'missing '.$domain.' sentinel fails closed'); }
    finally { if ($pdo->inTransaction()) $pdo->rollBack(); }
    $pdo->prepare("INSERT INTO {$table} VALUES (?,1)")->execute([$domain]);
}
$pdo->exec("UPDATE airports SET block_minutes=601 WHERE code='AMM'");
beginRollbackReferenceBarrier($pdo);
try { assertRollbackCompatible($pdo); throw new LogicException('expanded duration accepted'); }
catch (RuntimeException $e) { ok(str_contains($e->getMessage(),'Expanded reference'),'expanded block duration refused'); }
finally { $pdo->rollBack(); }
ok((int)$pdo->query("SELECT COUNT(*) FROM migrations")->fetchColumn()===2,'migration ledger preserved');
echo "SERIALIZATION_PROOF_PASS\n";
