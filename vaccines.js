// Vaccination schedules. KidLog shows a published standard schedule next to what a parent has recorded.
// It does not decide what a child should have: the page, the calendar file and the emails all say to
// confirm with the paediatrician. A paediatrician should review these tables before any change ships.
//
// `at` and `until` are ages: [number, unit] with unit 'd' (days), 'w' (weeks), 'm' (months) or 'y' (years).
// A visit with `until` is due anywhere in that age range. Dose ids are permanent: saved records refer to them.

const visit = (id, label, at, until, doses) => ({ id, label, at, until, doses: doses.map(([d, name, note]) => ({ id: `${id}.${d}`, name, note: note || '' })) });
const ENDEMIC = 'Only in districts where Japanese encephalitis is common';

export const SCHEDULES = {
  nis: {
    name: 'Government schedule',
    full: 'National Immunization Schedule (Universal Immunisation Programme)',
    about: 'The vaccines given free at government health centres.',
    source: 'Ministry of Health and Family Welfare, Government of India, as set out in the Press Information Bureau note "Celebrating the Power of Vaccines", 17 March 2026',
    sourceUrl: 'https://static.pib.gov.in/WriteReadData/specificdocs/documents/2026/mar/doc2026320830601.pdf',
    visits: [
      visit('birth', 'At birth', [0, 'd'], null, [['bcg', 'BCG'], ['opv0', 'OPV, birth dose'], ['hepb0', 'Hepatitis B, birth dose']]),
      visit('6w', '6 weeks', [6, 'w'], null, [['opv1', 'OPV, dose 1'], ['penta1', 'Pentavalent, dose 1'], ['rvv1', 'Rotavirus, dose 1'], ['fipv1', 'IPV (fractional), dose 1'], ['pcv1', 'PCV, dose 1']]),
      visit('10w', '10 weeks', [10, 'w'], null, [['opv2', 'OPV, dose 2'], ['penta2', 'Pentavalent, dose 2'], ['rvv2', 'Rotavirus, dose 2']]),
      visit('14w', '14 weeks', [14, 'w'], null, [['opv3', 'OPV, dose 3'], ['penta3', 'Pentavalent, dose 3'], ['fipv2', 'IPV (fractional), dose 2'], ['rvv3', 'Rotavirus, dose 3'], ['pcv2', 'PCV, dose 2']]),
      visit('9m', '9 to 12 months', [9, 'm'], [12, 'm'], [['mr1', 'Measles-Rubella, dose 1'], ['je1', 'Japanese encephalitis, dose 1', ENDEMIC], ['pcvb', 'PCV, booster']]),
      visit('16m', '16 to 24 months', [16, 'm'], [24, 'm'], [['mr2', 'Measles-Rubella, dose 2'], ['je2', 'Japanese encephalitis, dose 2', ENDEMIC], ['dptb1', 'DPT, booster 1'], ['opvb', 'OPV, booster']]),
      visit('5y', '5 to 6 years', [5, 'y'], [6, 'y'], [['dptb2', 'DPT, booster 2']]),
      visit('10y', '10 years', [10, 'y'], null, [['td10', 'Td']]),
      visit('16y', '16 years', [16, 'y'], null, [['td16', 'Td']]),
    ],
  },
  iap: {
    name: 'IAP schedule',
    full: 'Indian Academy of Pediatrics recommended schedule (ACVIP 2023)',
    about: 'Followed by many private paediatricians. It includes more vaccines than the government schedule.',
    source: 'Indian Academy of Pediatrics, Advisory Committee on Vaccines and Immunization Practices: Recommended Immunization Schedule (2023), Indian Pediatrics, 15 February 2024',
    sourceUrl: 'https://www.indianpediatrics.net/feb2024/113.pdf',
    visits: [
      visit('birth', 'At birth', [0, 'd'], null, [['bcg', 'BCG'], ['opv0', 'OPV'], ['hepb1', 'Hepatitis B, dose 1']]),
      visit('6w', '6 weeks', [6, 'w'], null, [['dtp1', 'DTwP or DTaP, dose 1'], ['ipv1', 'IPV, dose 1'], ['hib1', 'Hib, dose 1'], ['hepb2', 'Hepatitis B, dose 2'], ['rv1', 'Rotavirus, dose 1'], ['pcv1', 'PCV, dose 1']]),
      visit('10w', '10 weeks', [10, 'w'], null, [['dtp2', 'DTwP or DTaP, dose 2'], ['ipv2', 'IPV, dose 2'], ['hib2', 'Hib, dose 2'], ['hepb3', 'Hepatitis B, dose 3'], ['rv2', 'Rotavirus, dose 2'], ['pcv2', 'PCV, dose 2']]),
      visit('14w', '14 weeks', [14, 'w'], null, [['dtp3', 'DTwP or DTaP, dose 3'], ['ipv3', 'IPV, dose 3'], ['hib3', 'Hib, dose 3'], ['hepb4', 'Hepatitis B, dose 4'], ['rv3', 'Rotavirus, dose 3', 'Not needed with a two-dose brand'], ['pcv3', 'PCV, dose 3']]),
      visit('6m', '6 months', [6, 'm'], null, [['flu1', 'Influenza, dose 1', 'Then once every year until age 5']]),
      visit('7m', '7 months', [7, 'm'], null, [['flu2', 'Influenza, dose 2']]),
      visit('6-9m', '6 to 9 months', [6, 'm'], [9, 'm'], [['tcv', 'Typhoid conjugate vaccine']]),
      visit('9m', '9 months', [9, 'm'], null, [['mmr1', 'MMR, dose 1']]),
      visit('12m', '12 months', [12, 'm'], null, [['hepa1', 'Hepatitis A, dose 1']]),
      visit('15m', '15 months', [15, 'm'], null, [['mmr2', 'MMR, dose 2'], ['var1', 'Varicella, dose 1'], ['pcvb', 'PCV, booster']]),
      visit('16m', '16 to 18 months', [16, 'm'], [18, 'm'], [['dtpb1', 'DTwP or DTaP, booster 1'], ['hibb1', 'Hib, booster'], ['ipvb1', 'IPV, booster 1']]),
      visit('18m', '18 to 19 months', [18, 'm'], [19, 'm'], [['hepa2', 'Hepatitis A, dose 2', 'Only if the first dose was the inactivated vaccine'], ['var2', 'Varicella, dose 2']]),
      visit('4y', '4 to 6 years', [4, 'y'], [6, 'y'], [['dtpb2', 'DTwP or DTaP, booster 2'], ['ipvb2', 'IPV, booster 2'], ['mmr3', 'MMR, dose 3']]),
      visit('9y', '9 to 14 years', [9, 'y'], [14, 'y'], [['hpv1', 'HPV, dose 1'], ['hpv2', 'HPV, dose 2', '6 months after dose 1']]),
      visit('10y', '10 years', [10, 'y'], null, [['tdap', 'Tdap']]),
      visit('16y', '16 to 18 years', [16, 'y'], [18, 'y'], [['td', 'Td']]),
    ],
  },
};
export const SCHEDULE_IDS = Object.keys(SCHEDULES);
export const DISCLAIMER = "This is a published standard schedule, not medical advice. Your child's doctor may advise different vaccines or dates. Always confirm with your paediatrician.";

// ---- Dates (plain YYYY-MM-DD text, no time zones) ----
const DAY = 86400000;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => fmt(new Date(parse(s).getTime() + n * DAY));
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);

// The date a child born on `dob` reaches an age. Month and year ages keep the day of the month,
// stepping back to the month's last day when it has no such day (31 Jan + 1 month = 28 or 29 Feb).
export function ageDate(dob, [n, unit]) {
  if (unit === 'd') return addDays(dob, n);
  if (unit === 'w') return addDays(dob, n * 7);
  const [y, m, d] = dob.split('-').map(Number);
  const months = (m - 1) + (unit === 'y' ? n * 12 : n);
  const last = new Date(Date.UTC(y, months + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, months, Math.min(d, last))));
}

const SOON_DAYS = 14;  // "due soon" starts this many days before the due date
const GRACE_DAYS = 28; // a visit with a single due date counts as "due now" for this long, then "overdue"

// The child's schedule with dates and what has been recorded. `given` maps dose id -> { given_on } (given_on may be null).
// Each visit gets a status: 'given', 'partly', 'overdue', 'due', 'soon' or 'upcoming'.
export function childSchedule(scheduleId, dob, given, today) {
  const s = SCHEDULES[scheduleId] || SCHEDULES.nis;
  return s.visits.map((v) => {
    const from = ageDate(dob, v.at);
    const to = v.until ? ageDate(dob, v.until) : addDays(from, GRACE_DAYS);
    const doses = v.doses.map((d) => ({ ...d, given: Object.hasOwn(given, d.id), given_on: given[d.id]?.given_on ?? null }));
    const pending = doses.filter((d) => !d.given);
    const status = !pending.length ? 'given'
      : today > to ? 'overdue'
        : today >= from ? 'due'
          : today >= addDays(from, -SOON_DAYS) ? 'soon'
            : pending.length < doses.length ? 'partly' : 'upcoming';
    return { id: v.id, label: v.label, from, until: v.until ? to : null, doses, pending, status };
  });
}

// The next visit that still has doses to give: an overdue or due one first, otherwise the next coming up.
export function nextVisit(visits) {
  return visits.find((v) => v.status === 'due' || v.status === 'overdue') || visits.find((v) => v.pending.length);
}

// ---- Calendar file (.ics) ----
const icsText = (t) => String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDate = (s) => s.replace(/-/g, '');
// Calendar apps expect long lines to be broken, each continuation starting with a space.
function fold(line) {
  const parts = [line.slice(0, 60)];
  for (let at = 60; at < line.length; at += 60) parts.push(line.slice(at, at + 60));
  return parts.join('\r\n ');
}

// All-day events for every visit that still has doses to give and is not yet over, each with a reminder a week before and on the day.
export function calendarFile({ child, scheduleId, visits, today, url }) {
  const s = SCHEDULES[scheduleId] || SCHEDULES.nis;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const events = visits.filter((v) => v.pending.length && (v.until || v.from) >= today).map((v) => [
    'BEGIN:VEVENT',
    `UID:kidlog-${child.id}-${scheduleId}-${v.id}@kidlog`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(v.from)}`,
    `DTEND;VALUE=DATE:${icsDate(addDays(v.from, 1))}`,
    `SUMMARY:${icsText(`${child.child}: vaccines due (${v.label})`)}`,
    `DESCRIPTION:${icsText(`${s.name}, ${v.label}:\n${v.pending.map((d) => `- ${d.name}${d.note ? ` (${d.note})` : ''}`).join('\n')}${v.until ? `\n\nDue any time until ${v.until}.` : ''}\n\n${DISCLAIMER}\n\n${url}`)}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`${child.child}: vaccines due in a week`)}`, 'TRIGGER:-P6DT15H', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`${child.child}: vaccines due today`)}`, 'TRIGGER:PT9H', 'END:VALARM',
    'END:VEVENT',
  ]);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KidLog//Vaccines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(`${child.child}'s vaccines`)}`, ...events.flat(), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
