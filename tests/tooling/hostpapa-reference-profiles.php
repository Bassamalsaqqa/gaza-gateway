<?php
declare(strict_types=1);
require $argv[1] . '/vendor/autoload.php';
$cases = [['local','false','false',true],['testing','false','false',true],['staging','true','true',true],['production','true','true',true],['production','false','true',false],['staging','true','false',false],['production','invalid','true',false],['unknown','true','true',false]];
foreach (['reference'=>'REFERENCE_ENABLED','meals'=>'MEALS_ENABLED','schedules'=>'SCHEDULES_ENABLED'] as $name=>$flag) {
 foreach ($cases as [$env,$shared,$feature,$expected]) {
  Illuminate\Support\Env::enablePutenv();
  foreach (['APP_ENV'=>$env,'HOSTPAPA_SHARED_ENABLED'=>$shared,$flag=>$feature] as $key=>$value) { putenv($key.'='.$value); $_ENV[$key]=$value; $_SERVER[$key]=$value; }
  $config=require __DIR__.'/../../backend/config/'.$name.'.php';
  if ($config['enabled']!==$expected) throw new RuntimeException($name.' profile failed: '.$env);
 }
}
echo "PASS: 24 actual reference deployment configuration cases.\n";
