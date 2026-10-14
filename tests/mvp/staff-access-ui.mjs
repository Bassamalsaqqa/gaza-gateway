import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

// Synthetic frontend transport only; real recovery/alias/MFA/outbox flow is tested in MySQL.
const errorsOnly=process.argv.includes('--errors-only');
const output=errorsOnly?'scratch/staff-access-error-ui-evidence':'scratch/staff-access-ui-evidence'; fs.mkdirSync(output,{recursive:true});
const token='A'.repeat(43), csrf='B'.repeat(42)+'A';
const expired='C'.repeat(42)+'A';
const id='11111111-1111-4111-8111-111111111111';
const browser=await chromium.launch({channel:'msedge',headless:true}); const checks=[]; let active;
try {
 for(const locale of errorsOnly?['']:['', '/ar']) {
  const context=await browser.newContext({viewport:{width:1280,height:900}}); let authenticated=false; let requireMfa=false; const writes=[];
  await context.route('https://127.0.0.1:18449/api/v1/**',async route=>{
   const request=route.request(); const path=new URL(request.url()).pathname.replace('/api/v1','');
   const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:5181','Access-Control-Allow-Credentials':'true','Access-Control-Expose-Headers':'X-Request-Id','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Accept, Content-Type, X-Request-Id, X-CSRF-TOKEN'};
   if(request.method()==='OPTIONS') return route.fulfill({status:204,headers});
   const requestId=request.headers()['x-request-id']??crypto.randomUUID(); headers['X-Request-Id']=requestId;
   const meta={requestId,timestamp:new Date().toISOString()}; let status=404,data;
   if(path==='/staff/csrf') return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({csrfToken:csrf})});
   if(path==='/staff/me' && authenticated) { status=200;data={id,username:'owner',email:'staff@example.invalid',fullNameEn:'Synthetic Owner',fullNameAr:'مالك تجريبي',role:'admin',permissions:['dashboard.view','admin.manage','commercial.view','ops.view','content.view'],mfaEnabled:false}; }
   if(request.method()==='POST') {
    const body=request.postDataJSON(); writes.push({path,body});
    if(path==='/staff/password/forgot') {status=202;data={status:'reset_dispatched',message:'If an eligible account exists, reset instructions have been queued for dispatch.'};}
    if(path==='/staff/password/reset') { if(body.token===expired) status=401; else {assert.equal(body.token,token); status=200;data={reset:true};} authenticated=false;}
    if(path==='/staff/invitations/accept') {assert.equal(body.token,token); status=200;data={status:'authenticated',expiresAt:new Date(Date.now()+3600000).toISOString()}; authenticated=true;}
    if(path==='/staff/login') {if(body.password==='Rejected-staff-password') status=401; else {status=200;data={status:requireMfa?'mfa_required':'authenticated',expiresAt:new Date(Date.now()+300000).toISOString()};authenticated=!requireMfa;}}
   }
   if(path==='/staff/me' && !authenticated) status=401;
   await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data?{success:true,data,meta}:{success:false,error:{code:status===401?'unauthorized':'not_found',message:'Unavailable.'},meta})});
  });
  const page=await context.newPage(); active=page; page.setDefaultNavigationTimeout(120000);
  const nav=path=>page.goto('http://127.0.0.1:5181'+locale+path,{waitUntil:'domcontentloaded'});
  if(errorsOnly) {
   await nav('/admin/signin'); await page.getByLabel('Username or staff email',{exact:true}).fill('staff@example.invalid');
   await page.locator('input[type=password]').fill('Rejected-staff-password'); await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await page.getByRole('alert').getByText('Unable to sign in. Check your staff username/email and password.',{exact:true}).waitFor(); checks.push('staff invalid-credentials explanation');
   await nav('/admin/reset-password#token='+expired); await page.locator('input[type=password]').fill('New-staff-password-2026');
   await page.getByRole('button',{name:'Change password',exact:true}).click();
   await page.getByRole('alert').getByText('This link has expired, was already used or is no longer valid. Request a new link.',{exact:true}).waitFor();
   assert.equal(await page.getByRole('link',{name:'Request a new reset link',exact:true}).count(),1); checks.push('expired reset proof with actionable recovery link');
   await context.close(); active=null; continue;
  }
  await nav('/admin/signin');
  await page.getByLabel(locale?'اسم المستخدم أو بريد الموظف':'Username or staff email',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:locale?'نسيت كلمة المرور؟':'Forgot password?'}).count(),1);
  assert.equal(await page.getByRole('button',{name:/Request recovery|Accept invitation|طلب الاستعادة|قبول الدعوة/}).count(),0);
  checks.push(locale+' single staff sign-in and recovery link');
  await page.getByRole('link',{name:locale?'نسيت كلمة المرور؟':'Forgot password?'}).click();
  await page.locator('input[type=email]').fill('unknown@example.invalid');
  await page.getByRole('button',{name:locale?'إرسال رابط الاستعادة':'Send reset link',exact:true}).click();
  await page.getByText(locale?'إذا كان هذا البريد مرتبطاً بحساب موظف مؤهل، فسيُرسل رابط لإعادة تعيين كلمة المرور. تحقق من البريد الوارد ومجلد الرسائل غير المرغوب فيها.':'If this email belongs to an eligible staff account, a password-reset link will be emailed. Check your inbox and spam folder.',{exact:true}).waitFor();
  checks.push(locale+' generic forgot-password acknowledgement');
  const initial=writes.length;
  await nav('/admin/reset-password#token=bad');
  await page.getByRole('alert').waitFor(); assert.equal(new URL(page.url()).hash,'');
  assert.equal(await page.locator('input[type=password]').count(),0); assert.equal(writes.length,initial);
  checks.push(locale+' invalid link scrubbed without mutation');
  await nav('/admin/reset-password#token='+token); await page.locator('input[type=password]').waitFor();
  assert.equal(new URL(page.url()).hash,''); assert.equal(writes.length,initial);
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('A'.repeat(43))),false);
  await page.locator('input[type=password]').fill('Changed-staff-password-2026');
  await page.getByRole('button',{name:locale?'تغيير كلمة المرور':'Change password',exact:true}).click();
  await page.getByText(locale?'تم تغيير كلمة مرور الموظف. سجل الدخول بكلمة المرور الجديدة.':'Your staff password has been changed. Sign in with your new password.',{exact:true}).waitFor();
  checks.push(locale+' reset form consumes only on submit and confirms completion');
  await nav('/admin/accept-invitation#token='+token); await page.locator('input[type=password]').waitFor();
  assert.equal(new URL(page.url()).hash,'');
  await page.locator('input[type=password]').fill('Invited-staff-password-2026');
  await page.getByRole('button',{name:locale?'قبول الدعوة':'Accept invitation',exact:true}).click();
  await page.getByText(locale?'تم قبول دعوتك. تابع من صفحة دخول الموظفين للوصول إلى الإدارة.':'Your invitation has been accepted. Continue through staff sign-in to access Admin.',{exact:true}).waitFor();
  checks.push(locale+' invitation acceptance and staff context refresh');
  authenticated=false; requireMfa=true;
  await nav('/admin/signin'); await page.getByLabel(locale?'اسم المستخدم أو بريد الموظف':'Username or staff email',{exact:true}).fill('staff@example.invalid');
  await page.locator('input[type=password]').fill('Synthetic-staff-password-2026');
  await page.getByRole('button',{name:locale?'تسجيل الدخول':'Sign in',exact:true}).click();
  await page.getByText(locale?'أدخل رمز تطبيق المصادقة لإكمال تسجيل الدخول.':'Enter your authenticator code to finish signing in.',{exact:true}).waitFor();
  checks.push(locale+' enrolled MFA remains required');
  await page.screenshot({path:`${output}/${locale?'ar':'en'}-staff-mfa.png`,fullPage:true});
  await context.close(); active=null;
 }
 fs.writeFileSync(`${output}/receipt.json`,JSON.stringify({passed:true,checks,scope:'frontend synthetic transport; real MySQL reset/login/outbox evidence separate'},null,2)+'\n');
 console.log(`PASS ${checks.length} focused EN/AR staff access browser checks.`);
} catch(error) {if(active) {fs.writeFileSync(`${output}/failure-body.txt`,await active.locator('body').innerText()); await active.screenshot({path:`${output}/failure.png`,fullPage:true});} throw error;}
finally {await browser.close();}
