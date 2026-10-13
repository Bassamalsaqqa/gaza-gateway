import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {z} from 'zod';
import {AdminPanel} from './admin-kit';
import {Button,Code} from '@/components/kit';
import {useI18n} from '@/lib/i18n';
import {getMvpUiClient} from '@/lib/api/mvp-ui-runtime';
import {fleetSnapshotSchema,aircraftReceiptSchema} from '@/lib/api/reference-client';
import {airportWireSchema} from '@/lib/network/http-repository';
import {schedulesWireSchema,scheduleReceiptSchema} from '@/lib/offerings/schema';
import {encodeScheduleKey} from '@/lib/offerings/codec';
import {buildCurationPlan,applyCurationPlan,type CurationPlan,type CurationAdapter} from '../../../tools/memorial-curation/plan.mjs';

const airportReceipt = z.object({airport:airportWireSchema,changed:z.boolean(),revision:z.number().int().nonnegative()}).strict();
function adapter():CurationAdapter {
  const api=getMvpUiClient();
  return {
    async read() {
      const [airports,fleet,schedules]=await Promise.all([
        api.request({method:'GET',path:'/admin/network/airports',realm:'staff',schema:z.array(airportWireSchema)}),
        api.request({method:'GET',path:'/fleet/snapshot',realm:'public',schema:fleetSnapshotSchema}),
        api.request({method:'GET',path:'/admin/schedules',realm:'staff',schema:schedulesWireSchema}),
      ]);return {airports,fleet,schedules};
    },
    createAirport:airport=>api.request({method:'POST',path:'/admin/network/airports/receipt',realm:'staff',schema:airportReceipt,body:airport,statuses:[201]}),
    patchAircraft:(id,patch)=>api.request({method:'PATCH',path:`/admin/fleet/aircraft/${id}/receipt`,realm:'staff',schema:aircraftReceiptSchema,body:patch}),
    createSchedule:schedule=>api.request({method:'POST',path:'/admin/schedules',realm:'staff',schema:scheduleReceiptSchema,body:schedule,statuses:[201]}),
    patchSchedule:(id,patch)=>api.request({method:'PATCH',path:`/admin/schedules/${encodeScheduleKey(id)}`,realm:'staff',schema:scheduleReceiptSchema,body:patch}),
  };
}

/** Reviewed batch helper; every write uses normal staff cookies, CSRF, RBAC and audit routes. */
export function MvpMemorialCuration() {
  const {lang}=useI18n();const ar=lang==='ar';const query=useQueryClient();
  const [plan,setPlan]=useState<CurationPlan|null>(null);const [busy,setBusy]=useState(false);
  const [activate,setActivate]=useState(false);const [notice,setNotice]=useState('');
  async function preview() {
    setBusy(true);setNotice('');setPlan(null);
    try {setPlan(buildCurationPlan(await adapter().read(),{today:new Date().toISOString().slice(0,10),activateStandby:activate}));}
    catch {setNotice(ar?'تعذر إعداد المعاينة. يلزم أسطول معتمد من ثلاث طائرات نشطة بمخططات مقاعد، ووجهات أساسية نشطة، دون تعارضات أو تعديلات على الجداول المنسقة.':'Preview could not be prepared. Three approved active aircraft with layouts and active core destinations are required; existing timetable edits or conflicts require review.');}
    finally {setBusy(false);}
  }
  async function publish() {
    if(!plan||busy)return;
    setBusy(true);setNotice('');
    try {
      const result=await applyCurationPlan(plan,adapter());
      setNotice(ar?`تمت ${result.completed} تغييرات على الخادم. أعد المعاينة للتحقق من الحالة.`:`${result.completed} changes committed on the server. Preview again to verify the state.`);
      await query.invalidateQueries({predicate:entry=>['network','fleet','schedules','mvp'].includes(String(entry.queryKey[0]))});
    } catch {setNotice(ar?'توقف النشر. قد تكون تغييرات جزئية قد حُفظت. أعد المعاينة قبل المحاولة؛ لا تحذف سجلات أخرى.':'Publishing stopped. Some changes may already be committed. Preview again before retrying; do not delete other records.');}
    finally {setPlan(null);setBusy(false);}
  }
  return <AdminPanel className="space-y-4">
    <h2 className="type-title-section">{ar?'برنامج الرحلات التذكارية':'Memorial timetable'}</h2>
    <p className="text-sm text-muted-foreground">{ar?'أضف الوجهات الناقصة وجدولاً سنوياً للوجهات الأساسية السبع. الرحلات رمزية ومجانية؛ تبقى تعديلاتك وسجلات الحجوزات محفوظة.':'Add missing destinations and a year of recurring services for the seven core routes. These are free symbolic journeys; your edits and booking records are preserved.'}</p>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={activate} disabled={busy} className="mt-1 size-4 accent-brand" onChange={event=>{setActivate(event.target.checked);setPlan(null);}} />
      <span>{ar?'السماح بتفعيل طائرة Boeing 737-800 الاحتياطية المعتمدة عند الحاجة، دون تغيير مخططها.':'Allow activation of the approved standby Boeing 737-800 if needed, without changing its layout.'}</span></label>
    <Button variant="outline" disabled={busy} onClick={()=>void preview()}>{busy?(ar?'جارٍ العمل…':'Working…'):(ar?'معاينة التغييرات':'Preview changes')}</Button>
    {plan&&<div className="space-y-3 rounded-lg border border-border p-4">
      <p><Code>{plan.from} → {plan.until}</Code></p>
      <p className="text-sm">{ar?`${plan.additions.length} وجهة جديدة، ${plan.scheduleAdds.length} جدولاً جديداً، ${plan.scheduleExtensions.length} تمديداً، ${plan.fleetUpdates.length} تفعيل طائرة.`:`${plan.additions.length} new destinations, ${plan.scheduleAdds.length} new schedules, ${plan.scheduleExtensions.length} extensions, ${plan.fleetUpdates.length} aircraft activation.`}</p>
      <p className="text-sm">{ar?`فُحصت ${plan.verification.legCount} رحلة؛ أقل توقف بين الرحلات ${plan.verification.minimumTurnaroundMinutes} دقيقة.`:`${plan.verification.legCount} legs checked; minimum turnaround ${plan.verification.minimumTurnaroundMinutes} minutes.`}</p>
      <ul className="flex flex-wrap gap-2">{plan.additions.map(airport=><li key={airport.code}><Code>{airport.code}</Code></li>)}</ul>
      <Button disabled={busy||!(plan.additions.length+plan.scheduleAdds.length+plan.scheduleExtensions.length+plan.fleetUpdates.length)} onClick={()=>void publish()}>{ar?'نشر التغييرات المعروضة':'Publish previewed changes'}</Button>
    </div>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
  </AdminPanel>;
}
