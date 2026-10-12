<?php
// Disposable, synthetic SMTP acceptance only. Never a production/provider delivery certificate.
if (getenv('MVP_BROWSER_GATE_OWNED') !== '1' || getenv('APP_ENV') !== 'testing') exit(1);
$root='/tmp/mvp-smtp-sink'; if (!is_dir($root)) mkdir($root,0700,true);
$server=stream_socket_server('tcp://0.0.0.0:1025',$errno,$error); if (!$server) exit(1);
$deadline=microtime(true)+300; $count=0;
while (microtime(true)<$deadline && $count<20) {
    $c=@stream_socket_accept($server,1); if (!$c) continue;
    stream_set_timeout($c,10); fwrite($c,"220 synthetic.local ESMTP\r\n"); $data=false; $bytes='';
    while (($line=fgets($c,8192))!==false) {
        if ($data) {
            if ($line === ".\r\n") { $file=$root.'/'.bin2hex(random_bytes(16)).'.eml'; file_put_contents($file,$bytes,LOCK_EX); chmod($file,0600); $count++; fwrite($c,"250 Accepted by synthetic local sink\r\n"); $data=false; continue; }
            $bytes.=$line; if (strlen($bytes)>131072) break; continue;
        }
        $command=strtoupper(strtok($line,' '));
        if (str_starts_with($command,'EHLO') || str_starts_with($command,'HELO')) fwrite($c,"250 synthetic.local\r\n");
        elseif (str_starts_with($command,'DATA')) { $data=true; $bytes=''; fwrite($c,"354 End with dot\r\n"); }
        elseif (str_starts_with($command,'QUIT')) { fwrite($c,"221 Bye\r\n"); break; }
        else fwrite($c,"250 OK\r\n");
    }
    fclose($c);
}
fclose($server);
