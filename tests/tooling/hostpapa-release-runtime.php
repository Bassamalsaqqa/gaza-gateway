<?php
declare(strict_types=1);
// Disposable local release certification only. Never point this at owner credentials or hosting.
if (getenv('H3_DISPOSABLE_RELEASE_GATE') !== 'true') exit(1);
$home = '/home/owner'; $package = $home . '/package'; $app = $home . '/gaza-gateway'; $web = $home . '/public_html';
$manifest = json_decode(file_get_contents($package . '/release-manifest.json'), true, 64, JSON_THROW_ON_ERROR);
$count = 0;
$check = static function (bool $valid, string $name) use (&$count): void { if (!$valid) throw new RuntimeException('Probe failed: ' . $name); ++$count; echo 'PASS ' . $name . PHP_EOL; };
$command = static function (array $args): array {
 $pipes=[];$process=proc_open($args,[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
 if (!is_resource($process)) throw new RuntimeException('Probe process did not start.');
 fclose($pipes[0]);stream_set_blocking($pipes[1],false);stream_set_blocking($pipes[2],false);$out='';$err='';$exit=-1;$deadline=microtime(true)+100;
 try { do { $out.=stream_get_contents($pipes[1])?:'';$err.=stream_get_contents($pipes[2])?:'';$state=proc_get_status($process);if(!$state['running']){$exit=$state['exitcode'];break;}if(strlen($out)+strlen($err)>32768)break;usleep(20000); } while(microtime(true)<$deadline); }
 finally {if(proc_get_status($process)['running'])proc_terminate($process,9);fclose($pipes[1]);fclose($pipes[2]);proc_close($process);}
 return [$exit,$out,$err];
};
$check($manifest['source_sha'] === getenv('H3_EXPECTED_SHA') && hash_file('sha256',$package . '/release-manifest.json') === getenv('H3_EXPECTED_MANIFEST'), 'archive binds exact candidate source and manifest');
$db='gaza_h3_disposable'; $rootPassword=getenv('H3_ROOT_PASSWORD');
$root=new PDO('mysql:host=127.0.0.1;dbname=mysql','root',$rootPassword,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_TIMEOUT=>3]);
$ddlPassword=bin2hex(random_bytes(24));$runtimePassword=bin2hex(random_bytes(24));
$root->exec("CREATE DATABASE `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin");
foreach(['gaza_h3_ddl'=>$ddlPassword,'gaza_h3_runtime'=>$runtimePassword] as $user=>$pass) $root->exec('CREATE USER '.$root->quote($user)."@'%' IDENTIFIED BY ".$root->quote($pass));
$root->exec("GRANT ALL PRIVILEGES ON `$db`.* TO 'gaza_h3_ddl'@'%'");
$root->exec("GRANT SELECT,INSERT,UPDATE,DELETE ON `$db`.* TO 'gaza_h3_runtime'@'%'");
$runtimeTemplate=file_get_contents('/source/docs/production/hostpapa-runtime.env.example');
$env=str_replace(['REPLACE_WITH_BASE64_32_RANDOM_BYTES','REPLACE_WITH_EXACT_RELEASE_SOURCE_SHA','REPLACE_WITH_OWNER_DATABASE','REPLACE_WITH_RUNTIME_DML_USER','REPLACE_WITH_PRIVATE_RUNTIME_PASSWORD','REPLACE_WITH_SEPARATE_BASE64_32_RANDOM_BYTES'],['base64:'.base64_encode(random_bytes(32)),$manifest['source_sha'],$db,'gaza_h3_runtime',$runtimePassword,base64_encode(random_bytes(32))],$runtimeTemplate);
$envPath=$home.'/runtime.env';file_put_contents($envPath,$env);chmod($envPath,0600);
$approval=['schema_version'=>'1.0','action'=>'install','release_id'=>$manifest['release_id'],'source_sha'=>$manifest['source_sha'],'manifest_sha256'=>hash_file('sha256',$package.'/release-manifest.json'),'environment'=>'production','target_webroot'=>$web,'app_dir'=>$app,'database'=>['host'=>'127.0.0.1','port'=>3306,'database'=>$db,'username'=>'gaza_h3_ddl','password'=>$ddlPassword],'runtime_env_file'=>$envPath];
$approvalPath=$home.'/approval.json';
$save=static function()use(&$approval,$approvalPath):void{file_put_contents($approvalPath,json_encode($approval,JSON_THROW_ON_ERROR));chmod($approvalPath,0600);};$save();
$installer=$package.'/installer/hostpapa-install.php';
[$status,$out,$err]=$command([PHP_BINARY,$installer,'--action=verify','--package-dir='.$package]);$check($status===0,'actual package checksum inventory');
// A hostile profile must fail before touching any public bytes or pointer.
file_put_contents($envPath,str_replace('APP_ENV=production','APP_ENV=local',$env));
[$status,$out,$err]=$command([PHP_BINARY,$installer,'--action=install','--package-dir='.$package,'--approval-file='.$approvalPath]);
$check($status===1&&!file_exists($app.'/current-release.txt')&&!is_dir($web),'wrong profile refuses activation');
file_put_contents($app.'/shared/config/.env',$env);chmod($app.'/shared/config/.env',0600);
[$status,$out,$err]=$command([PHP_BINARY,$installer,'--action=install','--package-dir='.$package,'--approval-file='.$approvalPath]);
if($status!==0){
 echo $out . $err;
 try {
  require $app.'/releases/'.$manifest['release_id'].'/backend/vendor/autoload.php';
  $debugApp=require $app.'/releases/'.$manifest['release_id'].'/backend/bootstrap/app.php';
  $debugApp->useStoragePath($app.'/shared/storage');$debugApp->useEnvironmentPath($app.'/shared/config');$debugApp->loadEnvironmentFrom('.env');
  $debugApp->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
  echo 'Isolated bundled bootstrap passed; installer stage failed.\n';
 } catch(Throwable $e){echo 'Isolated diagnostic: '.get_class($e).' '.str_replace([$rootPassword,$ddlPassword,$runtimePassword], '[TEST_SECRET]', $e->getMessage()).PHP_EOL;}
}
$check($status===0,'real production-profile installation and migration UP');
$check(!str_contains($out.$err,$ddlPassword)&&!str_contains($out.$err,$runtimePassword),'installer output excludes credentials');
$check(trim(file_get_contents($app.'/current-release.txt'))===$manifest['release_id'],'code pointer binds actual source release');
$check((int)$root->query("SELECT COUNT(*) FROM `$db`.migrations")->fetchColumn()===18,'all 18 real migrations installed');
$check((int)$root->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db' AND TABLE_TYPE='BASE TABLE' AND ENGINE<>'InnoDB'")->fetchColumn()===0,'every installed base table is InnoDB');
$check(!str_contains(file_get_contents($app.'/shared/config/.env'),$ddlPassword),'DDL credentials never persisted in runtime env');
$release=$app.'/releases/'.$manifest['release_id'];$cli=$release.'/bin/hostpapa-cli';
[$status,$out,$err]=$command([PHP_BINARY,$cli,'shared-hosting:cron','--max-seconds=25','--batch-limit=1']);
$check($status===0,'real installed bounded cron command executes');
[$status,$out,$err]=$command([PHP_BINARY,$cli,'migrate','--force']);$check($status===1,'private wrapper prohibits direct migrations');
$probe=$home.'/http.php';file_put_contents($probe,"<?php \$_SERVER['HTTPS']='on'; \$_SERVER['SERVER_PORT']='443'; \$_SERVER['HTTP_HOST']='www.gazaairport.com'; \$_SERVER['REQUEST_METHOD']='GET'; \$_SERVER['REQUEST_URI']='/api/v1/health'; \$_SERVER['SCRIPT_NAME']='/index.php'; \$_SERVER['DOCUMENT_ROOT']='$web'; require '$web/index.php';");
[$status,$out,$err]=$command([PHP_BINARY,$probe]);$health=json_decode($out,true);
$check($status===0&&($health['success']??false)===true&&($health['data']['status']??'')==='ok','real public PHP bridge liveness in production profile');
// Model a later code/static release solely to exercise removal on rollback.
$later=$app.'/releases/rel_later_probe';mkdir($later.'/public_snapshot',0700,true);
file_put_contents($later.'/public_snapshot/obsolete-probe.txt','later');file_put_contents($web.'/obsolete-probe.txt','later');
file_put_contents($web.'/owner-unrelated-upload.txt','owner bytes');file_put_contents($app.'/current-release.txt','rel_later_probe');
$approval['action']='rollback';$save();
[$status,$out,$err]=$command([PHP_BINARY,$installer,'--action=rollback','--approval-file='.$approvalPath,'--confirm-rollback']);
$check($status===0,'real code/static rollback');
$check(!file_exists($web.'/obsolete-probe.txt')&&file_get_contents($web.'/owner-unrelated-upload.txt')==='owner bytes','rollback removes obsolete app files and preserves unrelated uploads');
$check(trim(file_get_contents($app.'/current-release.txt'))===$manifest['release_id']&&(int)$root->query("SELECT COUNT(*) FROM `$db`.migrations")->fetchColumn()===18,'rollback retains database and restores original pointer');
// Unix permission failure after one new file was copied. Container drops DAC override capabilities.
require $installer;
$broken=$app.'/releases/rel_failure_probe';mkdir($broken.'/public_snapshot',0700,true);
file_put_contents($broken.'/public_snapshot/000-new.txt','new');file_put_contents($broken.'/public_snapshot/zzz-readonly.txt','replacement');
file_put_contents($web.'/zzz-readonly.txt','original');chmod($web.'/zzz-readonly.txt',0444);
$instance=new HostPapaInstaller(['probe']);$reflection=new ReflectionClass($instance);
foreach(['app'=>$app,'web'=>$web] as $key=>$value)$reflection->getProperty($key)->setValue($instance,$value);
$failed=false;try{$reflection->getMethod('switchFiles')->invoke($instance,$broken,'rel_failure_probe');}catch(Throwable){$failed=true;}
$check($failed&&!file_exists($web.'/000-new.txt')&&file_get_contents($web.'/zzz-readonly.txt')==='original','mid-copy failure removes newly added file and preserves prior bytes');
$check(trim(file_get_contents($app.'/current-release.txt'))===$manifest['release_id'],'mid-copy failure preserves original code pointer');
$check(is_file($app.'/shared/storage/framework/maintenance.php'),'failed restoration retains maintenance and private backup');
echo 'PROBE_COUNT='.$count.PHP_EOL;
