<?php
require __DIR__.'/../../../vendor/autoload.php';
$app=require __DIR__.'/../../../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;
require __DIR__.'/BrowserGateTarget.php';
assertOwnedBrowserDatabase();
$input=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$staff=DB::table('staff_users')->where('username',$input['username'])->first();
$sessions=DB::table('staff_sessions')->get();
echo json_encode(['passwordMatches'=> $staff && app(\App\Identity\Password\Argon2idPasswordHasher::class)->verify($input['password'],$staff->password_hash),
 'role'=>$staff?->role,'status'=>$staff?->status,'mfaVersion'=>$staff?->mfa_version,'sessions'=>$sessions->map(fn($s)=>['authLevel'=>$s->auth_level,'revoked'=>$s->revoked_at!==null,'expired'=>strtotime($s->absolute_expires_at)<=time()])->all(),
 'auditOutcomes'=>DB::table('audit_events')->pluck('outcome')->all()],JSON_THROW_ON_ERROR)."\n";
