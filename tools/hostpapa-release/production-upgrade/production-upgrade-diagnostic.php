<?php
declare(strict_types=1);

// Private CLI-only incident diagnosis. No application boot, SQL writes, migrations,
// maintenance removal, credential output, or changes to existing receipts/markers.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
ini_set('display_errors', '0');
umask(0077);
$home = '/home/gaza5045';
if (getenv('HOME') !== $home || !is_dir($home)) { fwrite(STDERR, "Wrong private HOME.\n"); exit(1); }
$kit = $home.'/gaza-upgrade-package'; $app = $home.'/gaza-gateway';
$old = $app.'/releases/rel_20261013T082656_7a8f0fa_clean';
$report = ['kind'=>'READ_ONLY_UPGRADE_DIAGNOSTIC', 'time'=>gmdate('c'), 'php'=>PHP_VERSION, 'checks'=>[]];
function assertProbe(bool $ok, string $code): void { if (!$ok) throw new RuntimeException($code); }
function probe(string $name, callable $run): void {
    global $report;
    try { $detail = $run(); $report['checks'][$name] = ['status'=>'PASS', 'detail'=>$detail]; }
    catch (Throwable $e) {
        // Only our fixed machine codes are printable; library messages may contain secrets.
        $message = $e->getMessage();
        $code = preg_match('/^[A-Z][A-Z0-9_]{1,90}$/D', $message) ? $message : 'CHECK_FAILED';
        $report['checks'][$name] = ['status'=>'FAIL', 'code'=>$code];
        if ($e instanceof PDOException) $report['checks'][$name]['sqlstate'] = substr((string)$e->getCode(), 0, 5);
    }
}
function inspectFile(string $file): array {
    return ['exists'=>is_file($file), 'symlink'=>is_link($file),
        'permissions'=>is_file($file) ? sprintf('%04o', fileperms($file)&0777) : null,
        'readable'=>is_readable($file), 'bytes'=>is_file($file) ? filesize($file) : null,
        'owned_by_current_process'=>is_file($file) && function_exists('posix_geteuid') ? fileowner($file)===posix_geteuid() : null];
}
function privateRead(string $file, int $max): string {
    assertProbe(!is_link($file) && is_file($file) && is_readable($file) && filesize($file)<=$max, 'PRIVATE_FILE_UNREADABLE');
    $raw = file_get_contents($file); assertProbe($raw !== false, 'PRIVATE_FILE_READ_FAILED'); return $raw;
}
function processProbe(array $args, int $seconds): array {
    assertProbe(function_exists('proc_open'), 'PROC_OPEN_UNAVAILABLE');
    $p = proc_open($args, [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes);
    assertProbe(is_resource($p), 'PROCESS_START_FAILED'); fclose($pipes[0]);
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $start = microtime(true); $exit=-1; $out='';
    try {
        do {
            $chunk=stream_get_contents($pipes[1]); if ($chunk!==false) $out.=substr($chunk,0,max(0,4096-strlen($out)));
            stream_get_contents($pipes[2]); // Drain but never retain or print raw errors.
            $state=proc_get_status($p);
            if (!$state['running']) { $exit=$state['exitcode']; break; }
            if (microtime(true)-$start>$seconds) { proc_terminate($p,9); throw new RuntimeException('PROCESS_TIMEOUT'); }
            usleep(20000);
        } while (true);
    } finally { fclose($pipes[1]); fclose($pipes[2]); proc_close($p); }
    return ['exit_code'=>$exit,'seconds'=>round(microtime(true)-$start,2),
        'verifier_pass'=>str_contains($out,'PASS: exact package file inventory')];
}
probe('filesystem_state', function () use ($kit,$app,$old,$home): array {
    $state=[];
    foreach (['maintenance'=>$app.'/shared/storage/framework/maintenance.php',
        'laravel_down'=>$app.'/shared/storage/framework/down',
        'attempt'=>$kit.'/production-upgrade-attempted',
        'runtime_env'=>$app.'/shared/config/.env',
        'runtime_env_fallback'=>$app.'/shared/.env',
        'ddl_approval'=>$home.'/gaza-live-package/live-approval.json',
        'old_manifest'=>$old.'/release-manifest.json'] as $name=>$file) $state[$name]=inspectFile($file);
    return $state;
});
probe('active_pointer', function () use ($app): array {
    $pointer=trim(privateRead($app.'/current-release.txt',512));
    assertProbe((bool)preg_match('/^[A-Za-z0-9_]{1,128}$/D',$pointer), 'INVALID_POINTER');
    return ['release_id'=>$pointer,'is_expected_baseline'=>$pointer==='rel_20261013T082656_7a8f0fa_clean'];
});
foreach (['tar','mysqldump'] as $binary) probe('binary_'.$binary, function () use ($binary): array {
    $result=processProbe([$binary,'--version'],5); assertProbe($result['exit_code']===0,'BACKUP_BINARY_UNAVAILABLE'); return $result;
});
probe('candidate_verifier', function () use ($kit): array {
    $manifest=json_decode(privateRead($kit.'/upgrade-manifest.json',65536),true,32,JSON_THROW_ON_ERROR);
    assertProbe(($manifest['target_release']['source_sha']??'')==='b3afa9cf08fc746a9ff7e3e9fbee66c38244fb87','UNEXPECTED_CANDIDATE_SOURCE');
    assertProbe(hash_file('sha256',$kit.'/release/release-manifest.json')===($manifest['target_release']['manifest_sha256']??null),'CANDIDATE_MANIFEST_MISMATCH');
    $installer=$kit.'/release/installer/hostpapa-install.php';
    assertProbe(hash_file('sha256',$installer)===($manifest['installer']['sha256']??null),'CANDIDATE_INSTALLER_MISMATCH');
    $result=processProbe([PHP_BINARY,'-d','display_errors=0',$installer,'--action=verify','--package-dir='.$kit.'/release'],180);
    assertProbe($result['exit_code']===0 && $result['verifier_pass'],'CANDIDATE_VERIFICATION_FAILED'); return $result;
});
probe('baseline_private_integrity', function () use ($old): array {
    $raw=privateRead($old.'/release-manifest.json',4000000);
    assertProbe(hash('sha256',$raw)==='f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf','BASELINE_MANIFEST_MISMATCH');
    $manifest=json_decode($raw,true,64,JSON_THROW_ON_ERROR); $bad=[];
    foreach ($manifest['private_files']??[] as $rel=>$entry) {
        assertProbe((bool)preg_match('#^[A-Za-z0-9_./@+ -]+$#D',$rel) && !str_contains($rel,'..'),'INVALID_MANIFEST_PATH');
        $file=$old.'/'.$rel;
        if (!is_file($file) || hash_file('sha256',$file)!==$entry['sha256']) { if(count($bad)<10) $bad[]=$rel; }
    }
    return ['matches'=>$bad===[], 'first_mismatched_paths'=>$bad];
});
probe('ddl_database', function () use ($home,$old): array {
    $approval=json_decode(privateRead($home.'/gaza-live-package/live-approval.json',32768),true,32,JSON_THROW_ON_ERROR);
    $db=$approval['database']??[];
    assertProbe(($db['database']??'')==='gaza5045_gateway_live' && ($db['username']??'')==='gaza5045_liveadmin','DDL_BINDING_INVALID');
    assertProbe(in_array($db['host']??'', ['localhost','127.0.0.1'],true),'DDL_HOST_INVALID');
    $pdo=new PDO('mysql:host='.$db['host'].';port='.($db['port']??3306).';dbname=gaza5045_gateway_live;charset=utf8mb4',$db['username'],$db['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_TIMEOUT=>5]);
    $actual=$pdo->query('SELECT migration FROM migrations ORDER BY migration')->fetchAll(PDO::FETCH_COLUMN);
    $manifest=json_decode(privateRead($old.'/release-manifest.json',4000000),true,64,JSON_THROW_ON_ERROR); $names=[];
    foreach(array_keys($manifest['private_files']??[]) as $file) if(preg_match('#^backend/database/migrations/([a-zA-Z0-9_]+)\.php$#D',$file,$m)) $names[]=$m[1];
    sort($names,SORT_STRING);
    return ['migration_count'=>count($actual),'matches_original_19'=>$actual===$names,
        'migration_names'=>$actual,'database_matches'=>$pdo->query('SELECT DATABASE()')->fetchColumn()==='gaza5045_gateway_live'];
});
probe('runtime_database', function () use ($app,$old): array {
    require_once $old.'/backend/vendor/autoload.php';
    $file=is_file($app.'/shared/config/.env') ? $app.'/shared/config/.env' : $app.'/shared/.env';
    $env=\Dotenv\Dotenv::parse(privateRead($file,16384));
    assertProbe(($env['APP_ENV']??'')==='production' && ($env['DB_DATABASE']??'')==='gaza5045_gateway_live' && ($env['DB_USERNAME']??'')==='gaza5045_liveruntime','RUNTIME_BINDING_INVALID');
    $pdo=new PDO('mysql:host='.($env['DB_HOST']??'127.0.0.1').';port='.($env['DB_PORT']??3306).';dbname=gaza5045_gateway_live;charset=utf8mb4',$env['DB_USERNAME'],$env['DB_PASSWORD'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_TIMEOUT=>5]);
    return ['database_matches'=>$pdo->query('SELECT DATABASE()')->fetchColumn()==='gaza5045_gateway_live'];
});
$output=$kit.'/production-upgrade-diagnostic-result.json';
if (!is_dir($kit) || is_link($kit) || is_link($output)) { fwrite(STDERR,"Unsafe diagnostic output.\n"); exit(1); }
$bytes=json_encode($report,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";
file_put_contents($output,$bytes,LOCK_EX); chmod($output,0600);
echo $bytes;
