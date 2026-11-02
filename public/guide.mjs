/* Leave Ledger guide: plain-language California leave explainer and EDD filing steps.
   EDD details checked against edd.ca.gov in November 2026. Not legal advice. */
import { addDays, fmt } from "./engine.mjs";

export const EDD = {
  diOnline: "https://edd.ca.gov/en/Disability/How_to_File_a_DI_Claim_in_SDI_Online",
  pflOnline: "https://edd.ca.gov/en/Disability/How_to_File_a_PFL_Claim_in_SDI_Online",
  diMail: "https://edd.ca.gov/en/Disability/How_to_File_a_DI_Claim_by_Mail",
  pflMail: "https://edd.ca.gov/en/Disability/How_to_File_a_PFL_Claim_by_Mail",
  pregnancy: "https://edd.ca.gov/en/disability/FAQ_DI_Pregnancy",
  myedd: "https://myedd.edd.ca.gov",
  de2515: "https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de2515.pdf",
  de2511: "https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de2511.pdf",
  pay: "https://edd.ca.gov/en/disability/Calculating_PFL_Benefit_Payment_Amounts",
};

// The leaves, in the words an employee would use. Shown on the Guide tab.
export const LEAVES = [
  { key: "health", title: "Your own health", law: "CFRA, and FMLA at 50+ employees", time: "Up to 12 weeks a year, job protected", pay: "State Disability Insurance (SDI) pays about 70 to 90% of wages after a 7-day wait",
    who: "Worked here 12 months and 1,250 hours in the last year, at a company with 5 or more employees", more: "Includes surgery, a serious illness or injury, and mental health care. You never have to tell your employer the diagnosis." },
  { key: "pregnancy", title: "Pregnancy and childbirth", law: "Pregnancy Disability Leave (PDL)", time: "Up to 4 months while you cannot work, from your first day on the job", pay: "SDI usually pays from 4 weeks before the due date to 6 weeks after birth (8 after a cesarean)",
    who: "Anyone at a company with 5 or more employees. No minimum time on the job", more: "Covers prenatal care, severe morning sickness, bed rest, birth and recovery. Baby bonding time comes after, as its own leave." },
  { key: "bonding", title: "A new child", law: "CFRA bonding", time: "Up to 12 weeks, within a year of the birth, adoption or foster placement", pay: "Paid Family Leave (PFL) pays up to 8 weeks, with no waiting week",
    who: "Every parent, after 12 months and 1,250 hours. Each parent gets their own 12 weeks", more: "Can come right after pregnancy leave, so a birth parent may have about 7 months of job protection in total." },
  { key: "care", title: "Caring for family", law: "CFRA, and FMLA for a spouse, child or parent", time: "Up to 12 weeks a year, job protected", pay: "PFL pays up to 8 weeks",
    who: "After 12 months and 1,250 hours. Covers a spouse, registered domestic partner, child, parent, parent-in-law, grandparent, grandchild, sibling, or someone you name", more: "The one you name can be anyone you are close to. PFL pay for someone you name starts July 1, 2028." },
  { key: "bereavement", title: "A death in the family", law: "Bereavement leave", time: "Up to 5 workdays per death, within 3 months", pay: "Unpaid, but you can use sick leave or vacation",
    who: "After 30 days on the job, at a company with 5 or more employees", more: "The days do not have to be in a row. Your employer may ask for proof, such as an obituary, within 30 days." },
  { key: "repro", title: "Pregnancy loss", law: "Reproductive loss leave", time: "Up to 5 days per loss, up to 20 days a year", pay: "Unpaid, but you can use sick leave or vacation",
    who: "After 30 days on the job, at a company with 5 or more employees", more: "Covers miscarriage, stillbirth, and a failed adoption, surrogacy or IVF transfer. Nobody may ask for proof, and it stays confidential." },
  { key: "sick", title: "Sick days", law: "Paid sick leave", time: "At least 40 hours or 5 days a year, whichever is more", pay: "Paid at your regular rate",
    who: "Everyone. You earn 1 hour for every 30 worked and can use it from your 90th day", more: "For you or a family member, including appointments. You do not need a doctor's note to use it." },
];

export const RIGHTS = [
  "Your job, or one just like it, is waiting when you come back from protected leave.",
  "Your health coverage continues on the same terms while you are on CFRA or pregnancy leave.",
  "Your employer cannot punish you for asking for or taking leave.",
  "Your manager sees only your dates. The reason stays with HR.",
];

// EDD steps for one leave, with dates from its plan. Returns null when the state does not pay for this leave.
// Each step has an id the employee can tick off; HR sees the same ticks.
export function eddSteps(c, P) {
  const sdi = P.segs.find((s) => s.cls === "sdi"), pfl = P.segs.find((s) => s.cls === "pfl");
  if (!sdi && !pfl) return null;
  const out = { claims: [] };
  if (sdi) {
    const start = c.opts.start; // first day of the disability
    const preg = c.reason === "pregnancy_bonding";
    out.claims.push({
      kind: "sdi", title: "State Disability Insurance (SDI)", link: EDD.diOnline, mail: EDD.diMail,
      window: { from: addDays(start, 9), to: addDays(start, 49) },
      steps: [
        { id: "sdi-account", t: "Create a myEDD account and register for SDI Online", d: "You may need to verify your identity with ID.me. Do this ahead of time; it can take a few days.", link: EDD.myedd },
        { id: "sdi-file", t: `File your claim between ${fmt(addDays(start, 9))} and ${fmt(addDays(start, 49))}`, d: `EDD asks you to wait 9 days after your disability begins, and to file within 49 days. Have ready: your Social Security number, this employer's name, phone and address (from a pay stub), and your last day of normal work.${preg ? " For pregnancy, your claim usually starts the day your doctor says you stop working, up to 4 weeks before the due date." : ""}`, link: EDD.diOnline },
        { id: "sdi-receipt", t: "Save the receipt number and give it to your doctor", d: "Your doctor or licensed health professional uses it to find your claim online." },
        { id: "sdi-doctor", t: `Make sure your doctor certifies the claim by ${fmt(addDays(start, 49))}`, d: "EDD does not process the claim until both your part and the medical certification arrive. EDD does not share medical details with your employer." },
        { id: "sdi-paid", t: "Watch for EDD's decision, usually within 14 days", d: "The first 7 days are an unpaid waiting period. You can use sick leave or vacation for them, and EDD will ask about any pay you receive." },
      ],
      note: preg ? "Pregnancy claims are usually 10 to 12 weeks: up to 4 weeks before the due date and 6 weeks after (8 after a cesarean), longer if your doctor certifies it." : null,
      notes: preg ? EDD.pregnancy : null,
    });
  }
  if (pfl) {
    const start = pfl.start, after = c.reason === "pregnancy_bonding";
    const care = c.reason === "family_care";
    out.claims.push({
      kind: "pfl", title: "Paid Family Leave (PFL)", link: EDD.pflOnline, mail: EDD.pflMail,
      window: { from: start, to: addDays(start, 41) },
      steps: after ? [
        { id: "pfl-form", t: "Watch for the bonding claim form after your disability claim ends", d: "When your last disability payment is made, EDD sends the New Mother claim (DE 2501FP) to your SDI Online inbox or by mail." },
        { id: "pfl-file", t: `Complete it by ${fmt(addDays(start, 41))}`, d: "No extra documents are needed when it follows your own pregnancy claim. There is no waiting week for PFL.", link: EDD.pflOnline },
        { id: "pfl-paid", t: "Watch for EDD's decision, usually within 14 days", d: "PFL pays up to 8 weeks. It does not have to be taken all at once." },
      ] : [
        { id: "pfl-account", t: "Create a myEDD account and register for SDI Online", d: "You may need to verify your identity with ID.me. Do this ahead of time.", link: EDD.myedd },
        { id: "pfl-file", t: `File your claim between ${fmt(start)} and ${fmt(addDays(start, 41))}`, d: `File no earlier than your first day of family leave and no later than 41 days after it starts. Have ready: your Social Security number, this employer's name, phone and address, and your last day of normal work.`, link: EDD.pflOnline },
        care
          ? { id: "pfl-docs", t: "Get the care forms signed", d: `The family member you care for (or their representative) signs Part C, the Statement of Care Recipient, which you mail to EDD. Their doctor completes Part D, the medical certification, by ${fmt(addDays(start, 41))}. Both are on form DE 2501F.`, link: EDD.pflMail }
          : { id: "pfl-docs", t: "Send proof of relationship", d: "A birth certificate, adoption or foster placement record. Upload it in SDI Online under Add Bonding Document, or mail it. A birth mother who did not have a pregnancy claim does not need to send one." },
        { id: "pfl-receipt", t: "Save the receipt number", d: care ? "Give it to the doctor so they can find the claim online." : "You will need it if EDD contacts you." },
        { id: "pfl-paid", t: "Watch for EDD's decision, usually within 14 days", d: "There is no waiting week for PFL. It pays up to 8 weeks, which you can take all at once or in parts." },
      ],
    });
  }
  return out;
}
export const eddIds = (c, P) => { const e = eddSteps(c, P); return e ? e.claims.flatMap((x) => x.steps.map((s) => s.id)) : []; };
