<?php
declare(strict_types=1);
require __DIR__.'/../../tools/hostpapa-release/production-upgrade/batch02-preservation.php';
$candidatePkgDir = '/candidate';
batch02LoadSnapshotDtos();
$checks=0;
function check(bool $ok,string $name):void{global $checks;if(!$ok)throw new RuntimeException($name);++$checks;echo "PASS $name\n";}
function rejected(callable $action,string $name):void{try{$action();}catch(RuntimeException $e){check(true,$name);return;}throw new RuntimeException('Accepted tampering: '.$name);}
function insert(PDO $db,string $table,array $row):void{$keys=array_keys($row);$q=$db->prepare('INSERT INTO '.$table.' (`'.implode('`,`',$keys).'`) VALUES ('.implode(',',array_fill(0,count($keys),'?')).')');$q->execute(array_values($row));}
function fixture(bool $partial=false):PDO{
 $db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
 $db->sqliteCreateFunction('UTC_TIMESTAMP',static fn($precision)=>'2030-01-01 12:00:01.000000',1);
 $approved=batch02ApprovedRows(null);
 foreach(['airports'=>'code','schedules'=>'id'] as $table=>$pk){
  $sample=reset($approved[$table]);$columns=[];
  foreach($sample as $k=>$v)$columns[]='`'.$k.'` '.(is_int($v)?'INTEGER':'TEXT').($k===$pk?' PRIMARY KEY':'');
  $db->exec('CREATE TABLE '.$table.' ('.implode(',',$columns).',created_at TEXT,updated_at TEXT)');
 }
 $db->exec('CREATE TABLE aircraft(id TEXT PRIMARY KEY,model TEXT,active INTEGER)');
 insert($db,'aircraft',['id'=>'a321neo','model'=>'Airbus A321neo','active'=>1]);insert($db,'aircraft',['id'=>'a320neo','model'=>'Airbus A320neo','active'=>1]);
 $db->exec('CREATE TABLE routes(id TEXT PRIMARY KEY,origin_code TEXT,destination_code TEXT,direction TEXT,block_minutes INTEGER,active INTEGER)');
 foreach(['network'=>'network','schedule'=>'schedules'] as $prefix=>$domain){$db->exec('CREATE TABLE '.$prefix.'_revision_control(domain TEXT PRIMARY KEY,revision INTEGER)');insert($db,$prefix.'_revision_control',['domain'=>$domain,'revision'=>4]);$db->exec('CREATE TABLE '.$prefix.'_revisions(domain TEXT,revision INTEGER,snapshot_json TEXT,snapshot_bytes TEXT,snapshot_hash TEXT,created_at TEXT,PRIMARY KEY(domain,revision))');}
 $seed=$approved['schedules']['memorial-b01-osl-out'];$seed['id']='memorial-b01-amm-out';$seed['destination']='AMM';$seed['from_date']='2029-11-01';$seed['until_date']='2031-11-01';
 insert($db,'schedules',$seed+['created_at'=>'2029-01-01 00:00:00.000000','updated_at'=>'2029-01-01 00:00:00.000000']);
 if($partial){$a=$approved['airports']['OSL'];$a['airport_name_en']='Owner existing Oslo';$a['block_minutes']=450;insert($db,'airports',$a+['created_at'=>'2029-01-01 00:00:00.000000','updated_at'=>'2029-01-01 00:00:00.000000']);$s=$approved['schedules']['memorial-b01-arn-in'];$s['depart_time']='15:45';$s['from_date']='2029-12-01';insert($db,'schedules',$s+['created_at'=>'2029-01-01 00:00:00.000000','updated_at'=>'2029-01-01 00:00:00.000000']);}
 return $db;
}
function apply(PDO $db,array $plan):void{
 foreach($plan['expected'] as $table=>$rows)foreach($rows as $row){$row['created_at']='2030-01-01 12:00:01.000000';if(in_array($table,['airports','schedules'],true))$row['updated_at']=$row['created_at'];insert($db,$table,$row);}
 foreach($plan['controls'] as $table=>[$domain,$old,$new]){$q=$db->prepare('UPDATE '.$table.' SET revision=? WHERE domain=?');$q->execute([$new,$domain]);}
}
function verify(PDO $db,array $plan):void{foreach($plan['exclude'] as $table=>[$column]){batch02PreservationQuery($db,$table,['`'.$column.'`'],$plan,true)->fetchAll();}}
check(batch02ApprovedRows(null)['schedules']['memorial-b01-osl-out']['depart_time']==='08:15','approved time matches VARCHAR5 HH:mm migration storage');
$db=fixture();$plan=batch02PreservationPlan($db);apply($db,$plan);verify($db,$plan);check(true,'complete approved additions and both canonical snapshots accepted');
check($plan['expected']['schedules']['memorial-b01-osl-out']['from_date']==='2029-11-01'&&$plan['expected']['schedules']['memorial-b01-osl-out']['until_date']==='2031-11-01','baseline dates captured before migration');
foreach([['airports','code','OSL','timezone','UTC'],['airports','code','OSL','airport_name_ar','wrong'],['airports','code','ARN','block_minutes',291],['schedules','id','memorial-b01-osl-out','depart_time','09:15'],['schedules','id','memorial-b01-arn-out','aircraft_id','other'],['schedules','id','memorial-b01-osl-in','active',0],['schedules','id','memorial-b01-arn-in','from_date','2029-10-01']] as [$table,$key,$id,$field,$bad]){
 $q=$db->prepare("SELECT `$field` FROM `$table` WHERE `$key`=?");$q->execute([$id]);$old=$q->fetchColumn();$u=$db->prepare("UPDATE `$table` SET `$field`=? WHERE `$key`=?");$u->execute([$bad,$id]);rejected(fn()=>verify($db,$plan),"$table $field tampering rejected with same IDs/counts");$u->execute([$old,$id]);
}
foreach(['network_revisions','schedule_revisions'] as $table){
 $original=$db->query("SELECT * FROM `$table`")->fetch(PDO::FETCH_ASSOC);
 foreach(['snapshot_json','snapshot_bytes','snapshot_hash','domain'] as $field){$bad=$field==='domain'?'wrong':($field==='snapshot_hash'?str_repeat('0',64):'{"tampered":true}');$q=$db->prepare("UPDATE `$table` SET `$field`=?");$q->execute([$bad]);rejected(fn()=>verify($db,$plan),"$table $field rejected");$q->execute([$original[$field]]);}
 // A payload + recomputed hash cannot hide a changed approved snapshot.
 $db->exec("UPDATE `$table` SET snapshot_json='{}',snapshot_bytes='{}',snapshot_hash='".hash('sha256','{}')."'");
 rejected(fn()=>verify($db,$plan),"$table internally consistent but wrong snapshot rejected");$q=$db->prepare("UPDATE `$table` SET snapshot_json=?,snapshot_bytes=?,snapshot_hash=?");$q->execute([$original['snapshot_json'],$original['snapshot_bytes'],$original['snapshot_hash']]);
}
foreach(['2029-01-01 00:00:00.000000','2030-01-01 12:00:02.000000','2030-02-31 00:00:00.000000'] as $bad){$q=$db->prepare("UPDATE airports SET created_at=?,updated_at=? WHERE code='OSL'");$q->execute([$bad,$bad]);rejected(fn()=>verify($db,$plan),'out-of-window or invalid timestamp rejected');}
$partial=fixture(true);$p=batch02PreservationPlan($partial);check(!isset($p['expected']['airports']['OSL'])&&!isset($p['expected']['schedules']['memorial-b01-arn-in']),'pre-existing subset is not an allowlisted addition');apply($partial,$p);verify($partial,$p);check($partial->query("SELECT airport_name_en FROM airports WHERE code='OSL'")->fetchColumn()==='Owner existing Oslo','custom baseline row remains untouched and appears in canonical revision');
$again=batch02PreservationPlan($partial);check($again['exclude']===[],'fully pre-existing reference set has no exemptions');
echo 'CHECKS='.$checks."\n";
