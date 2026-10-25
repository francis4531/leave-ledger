/* Leave Ledger engine: California leave rules, plan builder, compliance clock.
   Shared by the browser app and the Netlify function. Rules checked October 2026; not legal advice. */
/* ---------- Dates (all ISO yyyy-mm-dd, computed in UTC) ---------- */
export const DAY = 86400000;
export const parse = s => { const [y,m,d] = s.split('-').map(Number); return Date.UTC(y, m-1, d); };
export const iso = t => new Date(t).toISOString().slice(0,10);
export const addDays = (s,n) => iso(parse(s) + n*DAY);
export const diffDays = (a,b) => Math.round((parse(b) - parse(a)) / DAY);
export const dow = s => new Date(parse(s)).getUTCDay();
export const isBiz = (s,hol) => { const d = dow(s); return d !== 0 && d !== 6 && !(hol||[]).includes(s); };
export function addBiz(s,n,hol){ let c=s,k=0; while(k<n){ c=addDays(c,1); if(isBiz(c,hol)) k++; } return c; }
export function bizSpan(start,n,hol){ let d=start; while(!isBiz(d,hol)) d=addDays(d,1); const first=d; let c=1; while(c<n){ d=addDays(d,1); if(isBiz(d,hol)) c++; } return {start:first,end:addDays(d,1)}; }
export const fmt = s => s ? new Date(parse(s)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : '';
export const fmtS = s => s ? new Date(parse(s)).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}) : '';
export const localToday = () => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
export const money = n => '$' + Math.round(n).toLocaleString('en-US');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const wk = w => Math.round(w*7);
export const plural = (n,w) => `${+n.toFixed(2)} ${w}${n===1?'':'s'}`;

/* ---------- Rules (checked October 2026; not legal advice) ---------- */
export const RULES = {
  cfra:{weeks:12, minCo:5, hours:1250, cite:'Gov. Code § 12945.2'},
  fmla:{weeks:12, minCo:50, hours:1250, cite:'29 U.S.C. § 2612'},
  pdl:{weeks:17.33, minCo:5, cite:'Gov. Code § 12945'},
  bereave:{days:5, tenure:30, minCo:5, cite:'Gov. Code § 12945.7'},
  repro:{days:5, cap:20, tenure:30, minCo:5, cite:'Gov. Code § 12945.6'},
  sick:{use:40, accrualCap:80, perHours:30, useAfter:90, cite:'Lab. Code § 246'},
  sdi:{wait:7, maxWeeks:52, fileWithin:49, cite:'UI Code § 2601 et seq.'},
  pfl:{maxWeeks:8, fileWithin:41, cite:'UI Code § 3300 et seq.'},
  cert:{calDays:15, cite:'2 CCR § 11091'},
  notice:{bizDays:5, cite:'2 CCR § 11091(a)(6)'}
};
export const REASONS = {
  pregnancy_bonding:{hr:'Pregnancy disability, then bonding', emp:'Pregnancy, recovery from childbirth, and bonding', unit:'two'},
  own_health:{hr:'Own serious health condition', emp:'My own health condition', unit:'weeks'},
  family_care:{hr:'Care for a family member', emp:'Caring for a family member', unit:'weeks', rel:'care'},
  bonding:{hr:'Bonding with a new child', emp:'Bonding with a new child (birth, adoption, or foster)', unit:'weeks'},
  bereavement:{hr:'Bereavement', emp:'Death of a family member', unit:'days', rel:'bereave'},
  repro:{hr:'Reproductive loss', emp:'Reproductive loss', unit:'days'},
  sick:{hr:'Paid sick leave', emp:'Sick day or caring for a sick family member', unit:'hours'},
  unknown:{hr:'Needs intake', emp:'Time off', unit:'none'}
};
export const REL = {
  care:[['spouse','Spouse'],['partner','Registered domestic partner'],['child','Child'],['parent','Parent'],['inlaw','Parent-in-law'],['grandparent','Grandparent'],['grandchild','Grandchild'],['sibling','Sibling'],['designated','Designated individual']],
  bereave:[['spouse','Spouse'],['partner','Registered domestic partner'],['child','Child'],['parent','Parent'],['inlaw','Parent-in-law'],['grandparent','Grandparent'],['grandchild','Grandchild'],['sibling','Sibling']]
};
export const relName = (k) => (REL.care.find(r=>r[0]===k)||[,k])[1];

/* ---------- Pay estimate ---------- */
export function weeklyBenefit(emp, co){
  const hq = emp.hiQuarter || 0;
  if (hq <= 0) return null;
  const rate = hq <= co.band90 ? 0.9 : 0.7;
  const raw = hq/13*rate;
  return {amount: Math.max(co.wbaMin, Math.min(co.wbaMax, raw)), rate, weekly: hq/13, capped: raw > co.wbaMax};
}

/* ---------- Eligibility ---------- */
export function eligibility(emp, co, start){
  const tenure = diffDays(emp.hire, start);
  const yr = tenure >= 365, hrs = emp.hours12 >= RULES.cfra.hours;
  const cfraCo = co.headcount >= RULES.cfra.minCo, fmlaCo = co.headcount >= RULES.fmla.minCo && co.within75;
  const tenureTxt = tenure >= 365 ? `${(tenure/365).toFixed(1)} years` : `${Math.max(0,Math.floor(tenure/30.44))} months`;
  return {
    tenure,
    cfra:{ok:cfraCo&&yr&&hrs, remaining:Math.max(0,RULES.cfra.weeks-emp.cfraUsed), checks:[
      {t:`Employer has 5 or more employees (${co.headcount})`, ok:cfraCo},
      {t:`12 months of service by start date (${tenureTxt})`, ok:yr},
      {t:`1,250 hours in the last 12 months (${emp.hours12.toLocaleString()})`, ok:hrs}]},
    fmla:{ok:fmlaCo&&yr&&hrs, covered:fmlaCo, remaining:Math.max(0,RULES.fmla.weeks-emp.fmlaUsed), checks:[
      {t:`50 or more employees within 75 miles`, ok:fmlaCo},
      {t:`12 months of service`, ok:yr},
      {t:`1,250 hours in the last 12 months`, ok:hrs}]},
    pdl:{ok:cfraCo, checks:[{t:`Employer has 5 or more employees`, ok:cfraCo},{t:'No minimum service or hours required', ok:true}]},
    short:{ok:cfraCo && tenure>=30, checks:[{t:`Employer has 5 or more employees`, ok:cfraCo},{t:`Employed 30 days before leave (${Math.max(0,tenure)} days)`, ok:tenure>=30}]},
    sick:{ok:tenure>=RULES.sick.useAfter, checks:[{t:`Employed 90 days before using sick leave (${Math.max(0,tenure)} days)`, ok:tenure>=RULES.sick.useAfter}]}
  };
}

/* ---------- Plan engine ---------- */
export function buildPlan(emp, co, reason, o){
  const el = eligibility(emp, co, o.start);
  const P = {segs:[], warnings:[], facts:[], el, start:o.start, end:o.start, pays:{sdi:false,pfl:false}, laws:[]};
  const wba = weeklyBenefit(emp, co);
  const amt = wba ? `${money(wba.amount)}/wk est.` : 'amount set by EDD';
  const seg = (lane,cls,label,start,end,sub) => { if (diffDays(start,end)>0) P.segs.push({lane,cls,label,start,end,sub}); };
  const hol = co.holidays;
  const fmlaAlong = (start, weeks) => {
    if (!el.fmla.ok) return;
    const w = Math.min(weeks, el.fmla.remaining);
    if (w>0){ seg('concurrent','fmla','Federal FMLA', start, addDays(start,wk(w)), `Runs at the same time · ${plural(w,'week')} counted`); P.laws.push('FMLA'); }
  };
  const protectCFRA = (start, weeks, label) => {
    if (el.cfra.ok){
      const w = Math.min(weeks, el.cfra.remaining);
      const e = addDays(start, wk(w));
      seg('protect','cfra',label||'Family and medical leave', start, e, `CFRA · ${plural(w,'week')} of ${el.cfra.remaining} left`);
      P.laws.push('CFRA');
      if (weeks > el.cfra.remaining){
        seg('protect','none','Not job protected', e, addDays(start,wk(weeks)), 'Past the CFRA balance');
        P.warnings.push({bad:true, t:`Request is ${plural(weeks,'week')} but only ${plural(el.cfra.remaining,'week')} of CFRA remain in the 12-month period. Time past ${fmt(e)} is not CFRA protected.`});
      }
      return addDays(start,wk(weeks));
    }
    seg('protect','none','Not job protected', start, addDays(start,wk(weeks)), 'Does not qualify for CFRA yet');
    return addDays(start,wk(weeks));
  };

  if (reason==='pregnancy_bonding'){
    const dis = Math.min(o.disWeeks, RULES.pdl.weeks);
    const pdlEnd = addDays(o.start, wk(dis));
    if (el.pdl.ok){ seg('protect','pdl','Pregnancy leave', o.start, pdlEnd, `PDL · ${plural(+dis.toFixed(2),'week')} of up to 4 months`); P.laws.push('PDL'); }
    if (o.disWeeks > RULES.pdl.weeks) P.warnings.push({t:'Disability runs past 4 months of PDL. CFRA does not cover pregnancy disability, but more leave may be a reasonable accommodation under FEHA. Start the interactive process.'});
    fmlaAlong(o.start, dis + o.bondWeeks);
    const bondEnd = protectCFRA(pdlEnd, o.bondWeeks, 'Bonding leave');
    if (!el.cfra.ok) P.warnings.push({bad:true, t:'Not eligible for CFRA, so bonding time after PDL is not job protected under state law. PFL can still pay. Check company policy before setting a return date.'});
    // pay
    const w1 = addDays(o.start, RULES.sdi.wait);
    seg('pay','wait','Waiting week', o.start, w1 < pdlEnd ? w1 : pdlEnd, 'State pay starts day 8 · sick leave or PTO can cover');
    if (w1 < pdlEnd){ seg('pay','sdi','Disability pay', w1, pdlEnd, `SDI from the state · ${amt}`); P.pays.sdi=true; }
    const pflW = Math.min(RULES.pfl.maxWeeks, o.bondWeeks);
    const pflEnd = addDays(pdlEnd, wk(pflW));
    seg('pay','pfl','Family leave pay', pdlEnd, pflEnd, `PFL from the state · ${plural(pflW,'week')} · ${amt}`); P.pays.pfl = pflW>0;
    seg('pay','unpaid','Unpaid', pflEnd, bondEnd, 'Vacation or PTO can cover');
    P.end = bondEnd;
    P.facts.push({t:'PDL and CFRA bonding are separate entitlements. Together they can reach about 7 months of job protection.', c:RULES.pdl.cite});
    P.facts.push({t:'CFRA bonding must be finished within one year of the birth.', c:RULES.cfra.cite});
    P.facts.push({t:'Keep group health coverage on the same terms during PDL and CFRA.', c:'Gov. Code § 12945(a)(2)'});
  }
  else if (reason==='own_health' || reason==='family_care' || reason==='bonding'){
    const fmlaCovers = reason!=='family_care' || ['spouse','child','parent'].includes(o.relation);
    const pflCovers = reason!=='own_health' && o.relation!=='designated';
    const label = reason==='bonding' ? 'Bonding leave' : 'Family and medical leave';
    const end = protectCFRA(o.start, o.weeks, label);
    if (fmlaCovers) fmlaAlong(o.start, o.weeks);
    else if (el.fmla.ok) P.facts.push({t:`FMLA does not cover care for a ${relName(o.relation).toLowerCase()}, so this time counts only against CFRA.`, c:RULES.fmla.cite});
    if (!el.cfra.ok){
      if (reason==='own_health') P.warnings.push({bad:true, t:'Not eligible for CFRA. If the condition is a disability, leave may still be required as a reasonable accommodation under FEHA. Start the interactive process before denying.'});
      else P.warnings.push({bad:true, t:'Not eligible for CFRA, so this leave is not job protected under state law. PFL can still pay. Send the eligibility notice with the reason.'});
    }
    if (reason==='own_health'){
      if (o.weeks > el.cfra.remaining && el.cfra.ok) P.warnings.push({t:'Leave past the CFRA balance may still be a reasonable accommodation under FEHA.'});
      const w1 = addDays(o.start, RULES.sdi.wait);
      seg('pay','wait','Waiting week', o.start, w1 < end ? w1 : end, 'State pay starts day 8 · sick leave or PTO can cover');
      if (w1 < end){ seg('pay','sdi','Disability pay', w1, end, `SDI from the state · ${amt}`); P.pays.sdi = true; }
    } else {
      if (pflCovers){
        const pflW = Math.min(RULES.pfl.maxWeeks, o.weeks);
        const pe = addDays(o.start, wk(pflW));
        seg('pay','pfl','Family leave pay', o.start, pe, `PFL from the state · ${plural(pflW,'week')} · ${amt}`); P.pays.pfl = true;
        seg('pay','unpaid','Unpaid', pe, end, 'Vacation or PTO can cover');
      } else {
        seg('pay','unpaid','Unpaid', o.start, end, 'PFL does not yet cover a designated individual');
        P.facts.push({t:'PFL starts covering a designated individual on July 1, 2028. Until then CFRA protects the job but PFL does not pay.', c:'SB 590'});
      }
    }
    if (reason==='family_care' && o.relation==='designated') P.facts.push({t:'CFRA lets the employee name one designated individual per 12-month period. You may limit it to one.', c:RULES.cfra.cite});
    if (reason==='bonding') P.facts.push({t:'If both parents work here, each gets their own 12 weeks of CFRA bonding.', c:RULES.cfra.cite});
    P.facts.push({t:'Keep group health coverage on the same terms during CFRA leave.', c:RULES.cfra.cite});
    P.end = end;
  }
  else if (reason==='bereavement' || reason==='repro'){
    const isR = reason==='repro';
    const days = Math.min(o.days, RULES.bereave.days);
    const sp = bizSpan(o.start, Math.max(1,o.days), hol);
    const okDays = bizSpan(o.start, Math.max(1,days), hol);
    if (el.short.ok){
      seg('protect','short', isR?'Reproductive loss leave':'Bereavement leave', okDays.start, okDays.end, `${plural(days,'workday')}`);
      if (o.days>5) seg('protect','none','Past 5 days', okDays.end, sp.end, 'Not required by law');
    } else seg('protect','none','Not eligible', sp.start, sp.end, 'Employed under 30 days');
    seg('pay','unpaid','Unpaid unless policy pays', sp.start, sp.end, 'Employee may use sick leave, vacation, or PTO');
    if (!el.short.ok) P.warnings.push({bad:true, t:'Employee has worked here under 30 days, so this leave is not required by law. Company policy may still allow it.'});
    if (o.days>5) P.warnings.push({t:'The law requires 5 days. Anything more comes from company policy.'});
    if (isR){
      if (emp.reproUsed + days > RULES.repro.cap) P.warnings.push({bad:true, t:`This would bring reproductive loss leave to ${emp.reproUsed+days} days in 12 months. You may cap it at 20.`});
      P.facts.push({t:'Do not ask for documentation. Keep the request confidential.', c:RULES.repro.cite});
      P.facts.push({t:'Days can be taken apart and must be used within 3 months of the event (longer if the employee is on another protected leave).', c:RULES.repro.cite});
    } else {
      P.facts.push({t:'Days can be taken apart and must be used within 3 months of the death.', c:RULES.bereave.cite});
      P.facts.push({t:'You may ask for documentation of the death, due within 30 days of the first day of leave.', c:RULES.bereave.cite});
    }
    P.end = sp.end;
  }
  else if (reason==='sick'){
    const days = Math.max(1, Math.ceil(o.hours/8));
    const sp = bizSpan(o.start, days, hol);
    const avail = Math.min(emp.sick, Math.max(0, RULES.sick.use - emp.sickUsedYr));
    seg('protect','short','Sick leave', sp.start, sp.end, `${o.hours} hours`);
    seg('pay','sick','Paid from sick balance', sp.start, sp.end, `${Math.min(o.hours, avail)} of ${o.hours} hours paid`);
    if (!el.sick.ok) P.warnings.push({bad:true, t:'Employee can start using sick leave on day 90 of employment.'});
    if (o.hours > avail) P.warnings.push({t:`Only ${avail} hours are usable (balance ${emp.sick}, ${emp.sickUsedYr} of 40 used this year). The rest may be unpaid or PTO.`});
    P.facts.push({t:'Usable for the employee or a family member, including kin care. Do not require a doctor note as a condition of using it.', c:RULES.sick.cite});
    P.facts.push({t:'Pay at the regular rate by the next regular payday, and show the balance on the pay stub.', c:'Lab. Code §§ 246(i), 246(l)'});
    P.end = sp.end;
  }
  P.wba = wba;
  return P;
}

/* ---------- Tasks (compliance clock) ---------- */
export function makeTasks(reason, req, plan, co){
  const hol = co.holidays, bd = n => addBiz(req, n, hol), t = [];
  const fmlaOn = co.headcount>=50 && co.within75;
  const big = ['pregnancy_bonding','own_health','family_care','bonding'].includes(reason);
  if (big){
    const notice = reason==='pregnancy_bonding' ? `Send the pregnancy leave and CFRA rights notices${fmlaOn?' and the FMLA notice':''}` : `Send the eligibility and rights notice (${fmlaOn?'CFRA and FMLA':'CFRA'})`;
    t.push({key:'notice', label:notice, hint:'Tell the employee what they qualify for. If they do not qualify, say why.', due:bd(5), legal:true});
    const br = reason==='pregnancy_bonding' ? 'Give the state pay brochures (DE 2515 and DE 2511)' : reason==='own_health' ? 'Give the disability pay brochure (DE 2515)' : 'Give the family leave pay brochure (DE 2511)';
    t.push({key:'brochure', label:br, hint:'Hand it over when you learn of the leave.', due:bd(5), legal:true});
    if (reason!=='bonding'){
      t.push({key:'cert', label:'Get the medical certification back', hint:'Give the employee at least 15 calendar days.', due:addDays(req, RULES.cert.calDays), legal:false});
      t.push({key:'designate', label:'Send designation notice', hint:'Confirm in writing how the time is counted, within 5 business days of the certification.', due:null, after:'cert', legal:true});
    } else {
      t.push({key:'designate', label:'Send designation notice', hint:'Confirm in writing how the time is counted.', due:bd(5), legal:true});
    }
    t.push({key:'benefits', label:'Keep health coverage going', hint:'Same terms as if the employee were working.', due:bd(5), legal:true});
    t.push({key:'return', label:'Plan the return to work', hint:'Confirm the date and the same or a comparable role.', due:addDays(plan.end,-7), legal:false});
  } else if (reason==='bereavement'){
    t.push({key:'confirm', label:'Confirm leave dates with employee', hint:'Must be used within 3 months of the death.', due:bd(2), legal:false});
    t.push({key:'doc', label:'Documentation of death (only if you ask for it)', hint:'Due within 30 days of the first day of leave.', due:addDays(plan.start,30), legal:false, optional:true});
  } else if (reason==='repro'){
    t.push({key:'confirm', label:'Confirm leave dates with employee', hint:'No documentation may be requested. Keep it confidential.', due:bd(2), legal:false});
  } else if (reason==='sick'){
    t.push({key:'record', label:'Record sick hours used', hint:'Show the updated balance on the next pay stub.', due:bd(3), legal:true});
  } else if (reason==='unknown'){
    t.push({key:'intake', label:'Contact employee and identify the leave type', hint:'The 5 business day clock started when the manager learned of it.', due:bd(2), legal:false});
    t.push({key:'notice', label:'Send eligibility and rights notice if leave may qualify', hint:'Within 5 business days of the employer learning of the need.', due:bd(5), legal:true});
  }
  return t.map(x => ({...x, done:false, doneOn:null}));
}

/* ---------- Sample data ---------- */
export function sampleData(TODAY){
  const T = n => addDays(TODAY, n);
  const company = {name:'Mesa Verde Coffee Roasters', city:'Oakland, CA', headcount:38, within75:true,
    holidays:['2026-11-26','2026-11-27','2026-12-25','2027-01-01','2027-01-18','2027-02-15','2027-05-31'],
    band90:19936.80, wbaMax:1765, wbaMin:50, hrContact:'Grace Okafor'};
  const employees = [
    {id:'e1', name:'Priya Raman', role:'Roaster', hire:'2023-03-14', hours12:1980, cfraUsed:0, fmlaUsed:0, sick:32, sickUsedYr:8, reproUsed:0, hiQuarter:17550, mgr:'e9'},
    {id:'e2', name:'Marcus Bell', role:'Barista lead', hire:'2025-08-04', hours12:1410, cfraUsed:0, fmlaUsed:0, sick:24, sickUsedYr:16, reproUsed:0, hiQuarter:13200, mgr:'e10'},
    {id:'e3', name:'Sofia Delgado', role:'Barista, part time', hire:'2026-02-02', hours12:820, cfraUsed:0, fmlaUsed:0, sick:18, sickUsedYr:6, reproUsed:0, hiQuarter:7900, mgr:'e10'},
    {id:'e4', name:'Jordan Kim', role:'Wholesale accounts', hire:'2021-06-01', hours12:2050, cfraUsed:4, fmlaUsed:0, sick:40, sickUsedYr:0, reproUsed:0, hiQuarter:24600, mgr:'e9'},
    {id:'e5', name:'Alana Fuentes', role:'Packaging', hire:'2026-09-28', hours12:140, cfraUsed:0, fmlaUsed:0, sick:4, sickUsedYr:0, reproUsed:0, hiQuarter:9800, mgr:'e9'},
    {id:'e6', name:'Tomás Herrera', role:'Delivery driver', hire:'2022-11-10', hours12:1190, cfraUsed:0, fmlaUsed:0, sick:40, sickUsedYr:24, reproUsed:0, hiQuarter:11400, mgr:'e9'},
    {id:'e7', name:'Grace Okafor', role:'Bookkeeper and HR', hire:'2019-01-07', hours12:1560, cfraUsed:0, fmlaUsed:0, sick:56, sickUsedYr:0, reproUsed:0, hiQuarter:19100, mgr:null},
    {id:'e8', name:'Ben Whitaker', role:'Roaster', hire:'2024-05-20', hours12:2010, cfraUsed:0, fmlaUsed:0, sick:36, sickUsedYr:12, reproUsed:0, hiQuarter:16900, mgr:'e9'},
    {id:'e9', name:'Dana Ortiz', role:'Roastery lead', hire:'2018-09-04', hours12:2100, cfraUsed:0, fmlaUsed:0, sick:64, sickUsedYr:8, reproUsed:0, hiQuarter:26300, mgr:null, isMgr:true},
    {id:'e10', name:'Mei Lin', role:'Café manager', hire:'2020-04-01', hours12:2080, cfraUsed:0, fmlaUsed:0, sick:48, sickUsedYr:0, reproUsed:0, hiQuarter:22400, mgr:null, isMgr:true}
  ];
  const D = {company, employees, cases:[]};
  const mk = (id, empId, reason, requested, opts, source) => {
    const emp = employees.find(e=>e.id===empId);
    const plan = buildPlan(emp, company, reason, opts);
    const c = {id, empId, reason, requested, opts, source, tasks:makeTasks(reason, requested, plan, company), coverage:'', notes:''};
    D.cases.push(c); return c;
  };
  const done = (c, key, on) => { const t=c.tasks.find(x=>x.key===key); if(!t) return; t.done=true; t.doneOn=on; if(key==='cert'){ const d=c.tasks.find(x=>x.after==='cert'); if(d) d.due=addBiz(on,5,company.holidays);} };
  const a = mk('c1','e1','pregnancy_bonding',T(-16),{start:T(-5),disWeeks:10,bondWeeks:12},'employee');
  ['notice','brochure','benefits'].forEach(k=>done(a,k,T(-13))); done(a,'cert',T(-9)); done(a,'designate',T(-7));
  a.coverage = 'Ben covers Tuesday to Thursday roasts. Temp roaster starts the week of the 9th.';
  const b = mk('c2','e2','family_care',T(-2),{start:T(10),weeks:6,relation:'parent'},'employee');
  const c = mk('c3','e4','own_health',T(-20),{start:T(-14),weeks:6},'hr');
  ['notice','brochure','benefits'].forEach(k=>done(c,k,T(-17))); done(c,'cert',T(-9));
  c.coverage = 'Dana takes the three largest wholesale accounts. Others on hold.';
  mk('c4','e6','bereavement',T(-1),{start:T(1),days:5,relation:'grandparent'},'employee');
  mk('c5','e3','bonding',TODAY,{start:T(21),weeks:8},'employee');
  return D;
}


/* ---------- Case helpers (shared by browser and server) ---------- */
export function planFor(c, D){ return c.reason==='unknown' ? null : buildPlan(D.employees.find(e=>e.id===c.empId), D.company, c.reason, c.opts); }
export function caseDates(c, D){
  if (c.reason==='unknown') return {start:c.requested, end:null};
  const p = planFor(c, D);
  const s = p.segs.length ? p.segs.reduce((m,x)=>x.start<m?x.start:m, p.segs[0].start) : c.opts.start;
  return {start:s, end:p.end};
}
export function caseStatus(c, D, today){
  if (c.reason==='unknown') return {t:'Needs intake', cls:'warn'};
  const {start,end} = caseDates(c, D);
  if (today < start) return {t:'Upcoming', cls:'acc'};
  if (today < end) return {t:'On leave', cls:'poppy'};
  return {t:'Returned', cls:''};
}
export function markTask(c, key, done, on, hol){
  const t = c.tasks.find(x=>x.key===key); if (!t) return false;
  t.done = !!done; t.doneOn = done ? on : null;
  if (key==='cert') c.tasks.filter(x=>x.after==='cert').forEach(d=>{ d.due = done ? addBiz(on,5,hol) : null; });
  return true;
}

