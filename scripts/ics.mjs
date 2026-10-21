// Tworzy pliki kalendarza (.ics) z planem zajęć, po jednym na grupę i podgrupę laboratoryjną:
//   kalendarz/C112-A.ics, kalendarz/C112-B.ics, kalendarz/C112.ics (obie podgrupy)
// Google, Apple i Outlook subskrybują je pod stałym adresem i same pobierają nowszą wersję,
// więc zmiana planu na stronie uczelni trafia też do kalendarzy studentów.
// Bez internetu: korzysta tylko z plan.json (z dołączonym kalendarzem roku).
import fs from "node:fs";

const SITE = "https://plan.skrotbm.pl";
const SLOTS = [["8:15","9:45"],["10:00","11:30"],["12:00","13:30"],["13:45","15:15"],["15:30","17:00"],["17:15","18:45"],["19:00","20:30"]];
const KIND = { W: "wykład", CW: "ćwiczenia", LAB: "laboratorium", K: "konwersatorium", S: "seminarium" };
const SHORT = { W: "W", CW: "ĆW", LAB: "LAB", K: "K", S: "S" };

const plan = JSON.parse(fs.readFileSync("plan.json", "utf8"));
const kal = plan.kalendarz;
if (!kal?.tygodnie?.length) throw new Error("plan.json nie ma kalendarza roku (uruchom najpierw scripts/kalendarz.mjs)");

// ---------- daty: ta sama logika co w index.html ----------
const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

const PAR = {}, OFF = kal.wolne || {}, SWAP = kal.zamiany || {};
let first = "9999", last = "";
for (const [a, b, p] of kal.tygodnie) {
  for (let d = parse(a); key(d) <= b; d = addDays(d, 1)) if (d.getUTCDay() % 6) PAR[key(d)] = p;
  if (a < first) first = a;
  if (b > last) last = b;
}
for (const d of Object.keys(OFF)) delete PAR[d];
for (const [d, v] of Object.entries(SWAP)) PAR[d] = v.p;

function dayInfo(k) {
  if (SWAP[k]) return { p: SWAP[k].p, asDay: SWAP[k].asDay, n: SWAP[k].n };
  if (PAR[k]) return { p: PAR[k] };
  return null;
}

// ---------- format iCalendar ----------
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {
  // linie dłuższe niż 75 bajtów zawijamy (RFC 5545), nie tnąc znaków UTF-8
  const out = []; let cur = "", len = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (len + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; len = 0; }
    cur += ch; len += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const hm = (t) => t.split(":").map((x) => pad(Number(x))).join("") + "00";
const ymd = (k) => k.replace(/-/g, "");
const stamp = (plan.changedAt || "2026-10-01T00:00:00Z").replace(/[-:]/g, "").replace(/\.\d+/, "").replace(/Z?$/, "Z");
function hash(s) { let h = 5381; for (const c of s) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return h.toString(36); }

const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Warsaw",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

function build(group, sub) {
  const grp = plan.groups[group];
  const name = `Plan zajęć ${group}${sub ? " · laby " + sub : ""}`;
  const L = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//plan.skrotbm.pl//Plan zajec BM//PL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Europe/Warsaw",
    `X-WR-CALDESC:${esc(`Business Management, I rok, US WEFiZ. Aktualizuje się sam, gdy zmieni się plan na stronie uczelni. ${SITE}`)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
    ...VTIMEZONE,
  ];
  let count = 0;
  for (let d = parse(first); key(d) <= last; d = addDays(d, 1)) {
    const k = key(d), info = dayInfo(k);
    if (!info) continue;
    const day = info.asDay ?? (d.getUTCDay() + 6) % 7;
    const items = (grp[info.p] || [])
      .filter((e) => e.d === day)
      .filter((e) => !sub || !e.g || e.g === sub)
      .filter((e) => !e.dates || e.dates.includes(k));
    for (const e of items) {
      const [t0, t1] = e.time || SLOTS[e.s];
      const kind = KIND[e.k];
      const title = `${e.pl || e.en}${SHORT[e.k] ? " · " + SHORT[e.k] : ""}${e.g && !sub ? " (laby " + e.g + ")" : ""}`;
      const desc = [
        kind ? kind[0].toUpperCase() + kind.slice(1) + (e.g ? `, podgrupa ${e.g}` : "") : null,
        e.en && e.en !== e.pl ? e.en : null,
        e.p ? `Prowadzi: ${e.p}` : null,
        info.n || null,
        e.n || null,
        `Plan: ${SITE}`,
      ].filter(Boolean).join("\n");
      L.push(
        "BEGIN:VEVENT",
        `UID:${k}-${group}-${e.s}-${e.g || "x"}-${hash((e.pl || "") + e.k)}@plan.skrotbm.pl`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/Warsaw:${ymd(k)}T${hm(t0)}`,
        `DTEND;TZID=Europe/Warsaw:${ymd(k)}T${hm(t1)}`,
        `SUMMARY:${esc(title)}`,
        e.r ? `LOCATION:${esc(/ul\.|Szczecin/.test(e.r) ? e.r : e.r + ", ul. Cukrowa 8, Szczecin")}` : null,
        `DESCRIPTION:${esc(desc)}`,
        `CATEGORIES:${esc(kind || "zajęcia")}`,
        "TRANSP:OPAQUE",
        "END:VEVENT",
      );
      count++;
    }
  }
  // Dni wolne i przerwy jako wydarzenia całodniowe, żeby było widać, czemu nie ma zajęć
  const allDay = (od, doo, txt, id) => L.push(
    "BEGIN:VEVENT", `UID:${id}@plan.skrotbm.pl`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(od)}`, `DTEND;VALUE=DATE:${ymd(key(addDays(parse(doo), 1)))}`,
    `SUMMARY:${esc(txt)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
  for (const [k, txt] of Object.entries(OFF)) allDay(k, k, `Bez zajęć: ${txt}`, `wolne-${k}`);
  for (const o of kal.okresy || []) {
    if (o.od.startsWith("0000") || o.do.startsWith("9999")) continue;
    allDay(o.od, o.do, o.opis, `okres-${o.od}`);
  }
  L.push("END:VCALENDAR");
  return { text: L.filter(Boolean).map(fold).join("\r\n") + "\r\n", count };
}

fs.mkdirSync("kalendarz", { recursive: true });
const made = [];
for (const group of Object.keys(plan.groups).sort()) {
  const hasSubs = ["odd", "even"].some((w) => (plan.groups[group][w] || []).some((e) => e.g));
  for (const sub of hasSubs ? ["A", "B", ""] : [""]) {
    const file = `kalendarz/${group}${sub ? "-" + sub : ""}.ics`;
    const { text, count } = build(group, sub);
    if (count < 10) throw new Error(`${file}: podejrzanie mało zajęć (${count}), nie zapisuję`);
    const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (old !== text) fs.writeFileSync(file, text);
    made.push(`${file} (${count} zajęć${old === text ? ", bez zmian" : ""})`);
  }
}
console.log("Kalendarze:\n  " + made.join("\n  "));
