<?php
declare(strict_types=1);

// Real production-profile engineering rehearsal on an owned, portless tmpfs instance.
if (getenv('HOSTPAPA_UPGRADE_REHEARSAL') !== 'owned-tmpfs' || getenv('HOME') !== '/home/gaza5045') exit(1);
$home = '/home/gaza5045'; $app = $home.'/gaza-gateway'; $kit = $home.'/gaza-upgrade-package';
$checks = 0;
function check(bool $valid, string $label): void {
    global $checks;
    if (!$valid) throw new RuntimeException('Rehearsal failed: '.$label);
    ++$checks; echo 'PASS '.$label."\n";
}
function command(array $argv, int $seconds = 180): array {
    $p = proc_open($argv, [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
    if (!is_resource($p)) throw new RuntimeException('Process unavailable.');
    fclose($pipes[0]); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false);
    $out = ''; $err = ''; $exit = -1; $end = microtime(true)+$seconds;
    try {
        do {
            $out .= stream_get_contents($pipes[1]) ?: ''; $err .= stream_get_contents($pipes[2]) ?: '';
            if (strlen($out)+strlen($err)>65536) break;
            $state = proc_get_status($p); if (!$state['running']) { $exit=$state['exitcode']; break; }
            usleep(20000);
        } while (microtime(true)<$end);
    } finally {
        if (proc_get_status($p)['running']) proc_terminate($p,9);
        fclose($pipes[1]); fclose($pipes[2]); proc_close($p);
    }
    return [$exit,$out,$err];
}
function writePrivate(string $file, string $bytes): void {
    if (!is_dir(dirname($file))) mkdir(dirname($file),0700,true);
    if (file_put_contents($file,$bytes)!==strlen($bytes) || !chmod($file,0600)) throw new RuntimeException('Fixture write failed.');
}

$old = $home.'/original-package';
$oldManifest = json_decode(file_get_contents($old.'/release-manifest.json'),true,64,JSON_THROW_ON_ERROR);
check($oldManifest['source_sha']==='7a8f0fa2f25851c4f75422f86139e0bb020ea4de'
    && hash_file('sha256',$old.'/release-manifest.json')==='f4950ad28949c874e8055cabe5af049d4467acee1583a8c916f96bb50c2f1cdf', 'exact original 7a8f0fa package and immutable manifest');
$root = new PDO('mysql:host=127.0.0.1;dbname=mysql','root',getenv('UPGRADE_TEST_ROOT_PASSWORD'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db = 'gaza5045_gateway_live'; $ddl = bin2hex(random_bytes(16)); $runtime = bin2hex(random_bytes(16));
$root->exec("CREATE DATABASE `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin");
foreach (['gaza5045_liveadmin'=>$ddl,'gaza5045_liveruntime'=>$runtime] as $user=>$pass) $root->exec('CREATE USER '.$root->quote($user)."@'%' IDENTIFIED BY ".$root->quote($pass));
$root->exec("GRANT ALL PRIVILEGES ON `$db`.* TO 'gaza5045_liveadmin'@'%'");
$root->exec("GRANT SELECT,INSERT,UPDATE,DELETE ON `$db`.* TO 'gaza5045_liveruntime'@'%'");
$env = str_replace(['REPLACE_WITH_BASE64_32_RANDOM_BYTES','REPLACE_WITH_EXACT_RELEASE_SOURCE_SHA','REPLACE_WITH_OWNER_DATABASE','REPLACE_WITH_RUNTIME_DML_USER','REPLACE_WITH_PRIVATE_RUNTIME_PASSWORD','REPLACE_WITH_SEPARATE_BASE64_32_RANDOM_BYTES'],
    ['base64:'.base64_encode(random_bytes(32)),$oldManifest['source_sha'],$db,'gaza5045_liveruntime',$runtime,base64_encode(random_bytes(32))],file_get_contents('/source/docs/production/hostpapa-runtime.env.example'));
writePrivate($home.'/runtime.env',$env);
$approval=['schema_version'=>'1.0','action'=>'install','release_id'=>$oldManifest['release_id'],'source_sha'=>$oldManifest['source_sha'],
    'manifest_sha256'=>hash_file('sha256',$old.'/release-manifest.json'),'environment'=>'production','target_webroot'=>$home.'/public_html','app_dir'=>$app,
    'database'=>['host'=>'127.0.0.1','port'=>3306,'database'=>$db,'username'=>'gaza5045_liveadmin','password'=>$ddl],'runtime_env_file'=>$home.'/runtime.env'];
writePrivate($home.'/gaza-live-package/live-approval.json',json_encode($approval,JSON_THROW_ON_ERROR));
[$code,$out,$err]=command([PHP_BINARY,$old.'/installer/hostpapa-install.php','--action=install','--package-dir='.$old,'--approval-file='.$home.'/gaza-live-package/live-approval.json']);
if($code!==0) echo 'SANITIZED BASELINE INSTALL: '.$err;
check($code===0,'real original production-profile install (no bootstrap)');
check((int)$root->query("SELECT COUNT(*) FROM `$db`.migrations")->fetchColumn()===19,'original 19 migrations');
$pdo=new PDO('mysql:host=127.0.0.1;dbname='.$db,'gaza5045_liveadmin',$ddl,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$uuid='11111111-1111-4111-8111-111111111111'; $staff='22222222-2222-4222-8222-222222222222';
$p=$pdo->prepare("INSERT INTO users(id,email,password_hash,status,email_verified_at,credential_epoch,created_at,updated_at) VALUES(?,?,?,'active',UTC_TIMESTAMP(6),1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
$p->execute([$uuid,'owned-synthetic@example.test',password_hash('synthetic-retained-password',PASSWORD_ARGON2ID)]);
$p=$pdo->prepare("INSERT INTO staff_users(id,username,email,full_name_en,full_name_ar,password_hash,role,status,credential_epoch,created_at,updated_at) VALUES(?,?,?,'Synthetic','Synthetic',?,'viewer','invited',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
$p->execute([$staff,'retained-staff','owned-staff@example.test',password_hash('synthetic-staff-password',PASSWORD_ARGON2ID)]);
require $app.'/releases/'.$oldManifest['release_id'].'/backend/vendor/autoload.php';
$parsedEnv=\Dotenv\Dotenv::parse($env);
$encrypter=new \Illuminate\Encryption\Encrypter(base64_decode(substr($parsedEnv['APP_KEY'],7)), 'AES-256-CBC');
$ciphertext=$encrypter->encryptString(json_encode(['driver'=>'smtp','host'=>'mail.gazaairport.com','port'=>465,'tls'=>'tls','username'=>'owned-synthetic@example.test',
    'password'=>'SYNTHETIC-NOT-A-PROVIDER-CREDENTIAL','senderName'=>'Synthetic','senderEmail'=>'owned-synthetic@example.test','replyTo'=>'','usernameSet'=>true,'passwordSet'=>true],JSON_THROW_ON_ERROR));
$p=$pdo->prepare('INSERT INTO mvp_mail_settings(id,revision,encrypted_config,updated_by) VALUES(1,17,?,?)');
$p->execute([$ciphertext,$staff]);
$userBefore=$pdo->query('SELECT * FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
$mailBefore=$pdo->query('SELECT * FROM mvp_mail_settings')->fetchAll(PDO::FETCH_ASSOC);
$envHash=hash_file('sha256',$app.'/shared/config/.env');
[$code]=command(['cp','-a','/candidate-kit/.',$kit]); check($code===0,'copy credential-free candidate kit into private synthetic account');
$runner=$kit.'/production-upgrade-runner.php';
[$code,$out,$err]=command([PHP_BINARY,$runner,'--check']);
check($code===0,'real complete non-destructive production preflight');
check(hash_file('sha256',$app.'/shared/config/.env')===$envHash && $pdo->query('SELECT * FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC)===$userBefore,'preflight preserves configuration and accounts');
file_put_contents($app.'/current-release.txt','unapproved-other-release');
[$code]=command([PHP_BINARY,$runner,'--check']);
check($code===1 && !file_exists($kit.'/production-upgrade-attempted') && (int)$pdo->query('SELECT COUNT(*) FROM migrations')->fetchColumn()===19,'complete wrong-baseline preflight blocks before migration/attempt');
file_put_contents($app.'/current-release.txt',$oldManifest['release_id']);
[$code,$out,$err]=command([PHP_BINARY,$runner,'--upgrade']);
check($code===1 && str_contains($err,'Explicit final owner GO') && !file_exists($kit.'/production-upgrade-attempted'),'missing release GO blocks execution before attempt');
[$code,$out,$err]=command([PHP_BINARY,$runner,'--upgrade','--confirm-upgrade'],390);
if($code!==0) { echo 'SANITIZED RUNNER: '.$err; }
check($code===0,'real production-profile upgrade with backups and inherited installer lock');
$receipt=json_decode(file_get_contents($kit.'/production-upgrade-result.json'),true,32,JSON_THROW_ON_ERROR);
check($receipt['outcome']==='DEPLOYED_OWNER_TESTING_PENDING' && (int)$pdo->query('SELECT COUNT(*) FROM migrations')->fetchColumn()===21,'exact target release and 19 to 21 additive migration');
check($pdo->query('SELECT * FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC)===$userBefore && $pdo->query('SELECT * FROM mvp_mail_settings')->fetchAll(PDO::FETCH_ASSOC)===$mailBefore && hash_file('sha256',$app.'/shared/config/.env')===$envHash,'accounts, staff-bound SMTP settings and secrets remain byte-identical');
check($encrypter->decryptString($pdo->query('SELECT encrypted_config FROM mvp_mail_settings')->fetchColumn())===$encrypter->decryptString($ciphertext),'retained SMTP ciphertext still decrypts with unchanged key');
$probe=$home.'/version-probe.php';
writePrivate($probe,"<?php \$_SERVER['HTTPS']='on'; \$_SERVER['SERVER_PORT']='443'; \$_SERVER['HTTP_HOST']='www.gazaairport.com'; \$_SERVER['REQUEST_METHOD']='GET'; \$_SERVER['REQUEST_URI']='/api/v1/version'; \$_SERVER['SCRIPT_NAME']='/index.php'; \$_SERVER['DOCUMENT_ROOT']='$home/public_html'; require '$home/public_html/index.php';");
[$code,$out]=command([PHP_BINARY,$probe]);$version=json_decode($out,true);
check($code===0 && ($version['data']['commit']??null)===$receipt['source_sha'],'actual production PHP bridge reports new immutable source despite old shared APP_COMMIT');
check(!file_exists($app.'/shared/storage/app/private/owner-bootstrap.json'),'no first-owner bootstrap or invitation');
[$code,$out]=command([PHP_BINARY,$runner,'--upgrade','--confirm-upgrade']);check($code===0 && str_contains($out,'SKIP'),'repeated cron cannot retry an attempted upgrade');
$backup=$app.'/shared/backups/'.$receipt['backups_retained'];
check(is_file($backup.'/preupgrade-database.sql') && is_file($backup.'/preupgrade-public.tar.gz') && is_file($backup.'/preupgrade-private-state.tar.gz'),'real private SQL/public/private backups retained');
// Restore only into a second explicitly disposable schema, never into the source DB.
$restore='gaza_upgrade_owned_restore';$root->exec("CREATE DATABASE `$restore` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin");
$rootPass=getenv('UPGRADE_TEST_ROOT_PASSWORD');writePrivate($home.'/restore.cnf',"[client]\nhost=127.0.0.1\nuser=root\npassword=\"$rootPass\"\n");
$sql=file_get_contents($backup.'/preupgrade-database.sql');$sql=str_replace('`'.$db.'`.','`'.$restore.'`.',$sql);writePrivate($home.'/restore.sql',$sql);
$process=proc_open(['mysql','--defaults-extra-file='.$home.'/restore.cnf',$restore],[0=>['file',$home.'/restore.sql','r'],1=>['file',$home.'/restore.out','w'],2=>['file',$home.'/restore.err','w']],$pipes);
check(is_resource($process) && proc_close($process)===0,'real database dump restores into second disposable schema');
check((int)$root->query("SELECT COUNT(*) FROM `$restore`.migrations")->fetchColumn()===19 && (int)$root->query("SELECT COUNT(*) FROM `$restore`.users")->fetchColumn()===1,'restored baseline schema and existing account');
[$code,$out,$err]=command([PHP_BINARY,$runner,'--rollback','--confirm-rollback']);if($code!==0) echo 'SANITIZED ROLLBACK: '.$err;
check($code===0,'guarded real code/static rollback without database rollback');
check(trim(file_get_contents($app.'/current-release.txt'))===$oldManifest['release_id'] && (int)$pdo->query('SELECT COUNT(*) FROM migrations')->fetchColumn()===21,'rollback restores prior pointer and preserves additive schema');
check($pdo->query('SELECT * FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC)===$userBefore && $pdo->query('SELECT * FROM mvp_mail_settings')->fetchAll(PDO::FETCH_ASSOC)===$mailBefore,'rollback preserves records and SMTP settings');
echo 'PROBES='.$checks."\n";
