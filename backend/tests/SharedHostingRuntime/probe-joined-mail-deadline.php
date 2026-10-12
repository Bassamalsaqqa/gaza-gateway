<?php
require '/source/SharedHosting/SharedHostingTimeoutException.php';
require '/source/SharedHosting/SharedHostingCronRunner.php';
require '/source/Deployment/SmtpDeadline.php';
use App\Deployment\SmtpDeadline;
use App\SharedHosting\SharedHostingTimeoutException;
$failures=[];
$original=pcntl_signal_get_handler(SIGALRM);
$async=pcntl_async_signals(true);
try {
 pcntl_signal(SIGALRM,static function(){throw new SharedHostingTimeoutException('synthetic-parent');});
 pcntl_alarm(1);
 try { SmtpDeadline::runWithDeadline(static function(){sleep(4);},8); $failures[]='outer not interrupted'; }
 catch(Throwable $e){if(!$e instanceof SharedHostingTimeoutException) $failures[]='wrong exception realm';}
 pcntl_alarm(0);
 pcntl_signal(SIGALRM,static function(){throw new SharedHostingTimeoutException('synthetic-parent');});
 pcntl_alarm(8);
 try {SmtpDeadline::runWithDeadline(static function(){sleep(4);},1);} catch(App\Deployment\SmtpDeadlineException){}
 $remaining=pcntl_alarm(0);
 if($remaining===0) $failures[]='inner timeout erased parent deadline';
 echo json_encode(['failures'=>$failures,'parentRemaining'=>$remaining]).PHP_EOL;
 exit($failures?1:0);
} finally {pcntl_alarm(0);pcntl_signal(SIGALRM,$original);pcntl_async_signals($async);}
