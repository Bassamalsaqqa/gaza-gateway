<?php
require __DIR__.'/../../../vendor/autoload.php';
$app=require __DIR__.'/../../../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
require __DIR__.'/BrowserGateTarget.php';
assertOwnedBrowserDatabase();
$now = DB::connection()->getDriverName() === 'mysql' ? 'UTC_TIMESTAMP(6)' : 'clock_timestamp()';
try {
DB::beginTransaction();
$input=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
$hasher=app(\App\Identity\Password\Argon2idPasswordHasher::class);
$staff=(string)Str::uuid();
DB::table('staff_users')->insert(['id'=>$staff,'username'=>$input['username'],'email'=>'synthetic-owner@example.test','full_name_en'=>'Synthetic Owner','full_name_ar'=>'Synthetic Owner','password_hash'=>$hasher->hash($input['password'],'staff'),'role'=>'admin','status'=>'invited','created_at'=>DB::raw($now),'updated_at'=>DB::raw($now),'credential_epoch'=>1,'email_verified_at'=>DB::raw($now)]);
DB::table('staff_mfa_credentials')->insert(['staff_id'=>$staff,'version'=>1,'encrypted_secret'=>app(\Illuminate\Contracts\Encryption\Encrypter::class)->encrypt($input['secret']),'confirmed_at'=>DB::raw($now)]);
DB::table('staff_users')->where('id',$staff)->update(['status'=>'active','mfa_version'=>1]);
$stored=DB::table('staff_users')->where('id',$staff)->first();
if (!$hasher->verify($input['password'],$stored->password_hash) || $stored->role !== 'admin' || $stored->status !== 'active' || (int)$stored->mfa_version !== 1) throw new RuntimeException('Synthetic staff fixture validation failed.');
foreach ($input['emails'] as $email) {
 $id=(string)Str::uuid(); DB::table('users')->insert(['id'=>$id,'email'=>$email,'password_hash'=>$hasher->hash($input['password'],'passenger'),'status'=>'active','created_at'=>DB::raw($now),'updated_at'=>DB::raw($now),'credential_epoch'=>1,'email_verified_at'=>DB::raw($now)]);
 DB::table('passenger_profiles')->insert(['user_id'=>$id,'first_name'=>'Synthetic','last_name'=>'Passenger','phone'=>'','seat_preference'=>'window','meal_preference'=>'standard','newsletter'=>false]);
}
foreach (['GZA','AMM'] as $code) DB::table('airports')->insert(['code'=>$code,'airport_name_en'=>'Synthetic '.$code,'airport_name_ar'=>'Synthetic '.$code,'city_en'=>'Synthetic '.$code,'city_ar'=>'Synthetic '.$code,'country_en'=>'Synthetic country','country_ar'=>'Synthetic country','timezone'=>'Asia/Gaza','block_minutes'=>60,'active'=>true]);
DB::commit();
echo "Synthetic fixture initialized.\n";
} catch (\Throwable) { if (DB::transactionLevel()>0) DB::rollBack(); fwrite(STDERR,"Synthetic fixture initialization failed.\n"); exit(1); }
