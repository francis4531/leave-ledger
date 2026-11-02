/* Leave Ledger notices: first drafts of the letters HR owes, written from the case and the rules engine.
   Shared by the browser and the server. Deterministic on purpose: no AI writes legal content. HR reviews,
   edits and sends every letter. Never includes a diagnosis or the manager's note. Not legal advice. */
import { RULES, REASONS, fmt, addDays, plural, money, relName, weeklyBenefit, pdlHours, weeklyOf } from "./engine.mjs";

// Which tasks have a letter, and its title.
export const LETTERS = {
  notice: "Eligibility and rights notice",
  designate: "Designation notice",
  return: "Return-to-work letter",
  confirm: "Leave confirmation",
  intake: "Check-in about time off",
};
export const hasLetter = (c, key) => !!LETTERS[key] && !(key === "confirm" && !["bereavement", "repro"].includes(c.reason)) && !(key === "intake" && c.reason !== "unknown");

const first = (n) => String(n || "").split(" ")[0];
const last = (end) => fmt(addDays(end, -1)); // plan end dates are exclusive
const segs = (P, cls) => P.segs.filter((s) => s.cls === cls);
const span = (list) => list.length ? { start: list[0].start, end: list[list.length - 1].end } : null;
const needs = {
  pregnancy_bonding: "your pregnancy, recovery from childbirth, and time to bond with your new child",
  own_health: "your own serious health condition",
  family_care: "caring for a family member with a serious health condition",
  bonding: "bonding with your new child",
  bereavement: "the death of a family member",
  repro: "a reproductive loss",
  sick: "sick leave",
};

function sign(co, hr, ask = true) {
  return `${ask ? "\nIf you have questions, or if your dates change, please contact me.\n" : ""}\nSincerely,\n${hr || co.hrContact || "HR"}\n${co.name}`;
}

// Returns { subject, body } for a task key, or null when the task has no letter.
export function draftLetter(key, c, emp, co, P, today, hr) {
  if (!hasLetter(c, key)) return null;
  const name = first(emp.name);
  const head = `${fmt(today)}\n\nDear ${name},\n\n`;
  const el = P && P.el;

  if (key === "intake") {
    return {
      subject: "Checking in about time off",
      body: `${head}We understand you may need some time away from work. We want to make sure you get any leave you are entitled to, and we may owe you information within the next few days.\n\nWhen you are ready, please let me know:\n- the first day you expect to be away, and about how long;\n- whether the time is for your own health, to care for a family member, for a new child, or for another reason.\n\nYou do not need to share a diagnosis or medical details. What you tell us stays with HR; your manager only sees the dates you are out.\n${sign(co, hr)}`,
    };
  }

  if (key === "confirm") {
    const isR = c.reason === "repro";
    const prot = span(segs(P, "short"));
    const days = Math.min(c.opts.days, RULES.bereave.days);
    const who = c.reason === "bereavement" && c.opts.relation ? ` We are very sorry for the loss of your ${relName(c.opts.relation).toLowerCase()}.` : isR ? " We are very sorry for your loss." : "";
    const dates = prot ? `${fmt(prot.start)} to ${last(prot.end)}` : `starting ${fmt(c.opts.start)}`;
    const lines = [
      `${head}This confirms your ${isR ? "reproductive loss" : "bereavement"} leave, ${dates} (${plural(days, "workday")}).${who}`,
      el && !el.short.ok ? `\nBecause you have worked here for less than 30 days, this leave is not required by law, and it is approved under company policy.` : `\nCalifornia law gives you up to 5 workdays for each ${isR ? "reproductive loss" : "death of a family member"}. The days do not need to be taken in a row, and they must be used within 3 months of the ${isR ? "event" : "death"}.`,
      `\nThis time is unpaid unless you choose to use sick leave, vacation, or other paid time off. Let me know which you would like to use.`,
      isR ? `\nYou do not need to give us any documentation. Your request is confidential.` : `\nWe may ask for documentation of the death, such as an obituary or funeral program, within 30 days of your first day of leave.`,
      `\nYour job is protected while you are away, and we will not treat you differently for taking this leave.`,
    ];
    return { subject: `Your ${isR ? "reproductive loss" : "bereavement"} leave`, body: lines.join("\n") + `\n${sign(co, hr)}` };
  }

  // Large leaves: pregnancy, own health, family care, bonding.
  const pdl = span(segs(P, "pdl")), cfra = span(segs(P, "cfra")), fmla = span(segs(P, "fmla"));
  const protectedEnd = [pdl, cfra].filter(Boolean).map((s) => s.end).sort().pop();
  const wba = weeklyBenefit(emp, co);
  const pay = [];
  if (P.pays.sdi) pay.push(`State Disability Insurance (SDI) may pay you while you cannot work. File with the Employment Development Department (EDD) at SDI Online within ${RULES.sdi.fileWithin} days of your first day out. The first 7 days are a waiting period; you may use sick leave or vacation for them.`);
  if (P.pays.pfl) pay.push(`Paid Family Leave (PFL) may pay you for up to 8 weeks. File with EDD at SDI Online within ${RULES.pfl.fileWithin} days of your first day of family leave.`);
  if (pay.length && wba) pay.push(`Based on the wages we have, EDD may pay about ${money(wba.amount)} a week. EDD decides the final amount.`);

  if (key === "notice") {
    const p = [`${head}We received your request for leave for ${needs[c.reason]}, starting ${fmt(c.opts.start)}. This letter explains the leave you qualify for and what happens next.`];
    if (c.reason === "pregnancy_bonding") {
      p.push(el.pdl.ok
        ? `\nPregnancy Disability Leave (PDL). You qualify. California law gives you up to 4 months of leave for any time you are unable to work because of pregnancy, childbirth, or a related condition. For your schedule of ${weeklyOf(emp)} hours a week, that is about ${pdlHours(emp)} hours. You do not need to have worked here for any minimum time.`
        : `\nPregnancy Disability Leave (PDL). Our company has fewer than 5 employees, so PDL does not apply. Please talk with me about other options.`);
    }
    if (c.reason !== "pregnancy_bonding" || c.opts.bondWeeks > 0) {
      const what = c.reason === "pregnancy_bonding" ? "after your pregnancy leave, to bond with your new child" : "for this leave";
      p.push(el.cfra.ok
        ? `\nCalifornia Family Rights Act (CFRA) leave. You qualify ${what}. You may take up to 12 weeks in a 12-month period; you have ${plural(el.cfra.remaining, "week")} available.${c.reason === "bonding" || c.reason === "pregnancy_bonding" ? " Bonding leave must be finished within one year of the birth or placement." : ""}`
        : `\nCalifornia Family Rights Act (CFRA) leave. You do not qualify yet. These requirements are not met:\n${el.cfra.checks.filter((x) => !x.ok).map((x) => `- ${x.t}`).join("\n")}\n${c.reason === "own_health" ? "If your condition is a disability, you may still be entitled to time off as a reasonable accommodation. Let's talk about what you need." : "We will let you know what other options may be available."}`);
    }
    if (el.fmla.covered) {
      p.push(el.fmla.ok
        ? `\nFamily and Medical Leave Act (FMLA). You also qualify for federal FMLA leave. It runs at the same time as your state leave, not in addition to it.`
        : `\nFamily and Medical Leave Act (FMLA). You do not qualify for federal FMLA leave. These requirements are not met:\n${el.fmla.checks.filter((x) => !x.ok).map((x) => `- ${x.t}`).join("\n")}`);
    }
    const cert = c.tasks.find((t) => t.key === "cert");
    if (cert && c.reason !== "bonding") {
      p.push(`\nMedical certification. Please ask your health care provider to complete the enclosed certification form and return it to me by ${fmt(cert.due)}. The form asks only whether there is a serious health condition, when it started, and how long you will need to be away. You do not need to share a diagnosis.`);
    }
    p.push(`\nYour rights while on leave.\n- Your group health coverage continues on the same terms as if you were working.\n- When you return, you will get the same job or a comparable one.\n- We will not retaliate against you for asking for or taking this leave.`);
    if (pay.length) p.push(`\nPay while you are away. We do not pay you during this leave, but the State of California may:\n${pay.map((x) => `- ${x}`).join("\n")}\nThe EDD brochures ${P.pays.sdi && P.pays.pfl ? "DE 2515 and DE 2511 are" : P.pays.sdi ? "DE 2515 is" : "DE 2511 is"} enclosed.`);
    return { subject: `Your leave request: what you qualify for`, body: p.join("\n") + `\n${sign(co, hr)}` };
  }

  if (key === "designate") {
    const p = [`${head}This letter confirms how your leave is counted.`];
    if (pdl) p.push(`\n- Pregnancy Disability Leave: ${fmt(pdl.start)} to ${last(pdl.end)}.`);
    if (cfra) p.push(`${pdl ? "" : "\n"}- California Family Rights Act leave: ${fmt(cfra.start)} to ${last(cfra.end)}. This counts as ${plural(Math.round((Date.parse(cfra.end) - Date.parse(cfra.start)) / 864e5 / 7 * 100) / 100, "week")} of your 12-week CFRA entitlement.`);
    if (fmla) p.push(`- Federal FMLA leave runs at the same time: ${fmt(fmla.start)} to ${last(fmla.end)}.`);
    if (!pdl && !cfra) p.push(`\nYour leave does not qualify as job-protected leave under California law. ${c.reason === "own_health" ? "We will continue to talk with you about any accommodation you need." : "Please talk with me about the options available."}`);
    if (protectedEnd) p.push(`\nYour expected return date is ${fmt(protectedEnd)}.${c.reason === "own_health" || c.reason === "pregnancy_bonding" ? " Before you return, please give us a note from your health care provider confirming that you can return to work, and listing any restrictions." : ""}`);
    if (pay.length) p.push(`\nReminder about state pay:\n${pay.map((x) => `- ${x}`).join("\n")}`);
    return { subject: `Your leave: dates and how they are counted`, body: p.join("\n") + `\n${sign(co, hr)}` };
  }

  if (key === "return") {
    const back = protectedEnd || P.end;
    return {
      subject: `Your return to work on ${fmt(back)}`,
      body: `${head}We are looking forward to having you back. Your return date is ${fmt(back)}.\n\nYou will return to your job as ${emp.role}${co.name ? ` at ${co.name}` : ""}, or a comparable one, with the same pay and benefits.${c.reason === "own_health" || c.reason === "pregnancy_bonding" ? "\n\nIf you have not already, please send a note from your health care provider confirming that you can return to work, and listing any restrictions. We will talk with you about any accommodation you need." : ""}\n\nIf you need to change your return date, please let me know as soon as you can.\n${sign(co, hr, false)}`,
    };
  }
  return null;
}
