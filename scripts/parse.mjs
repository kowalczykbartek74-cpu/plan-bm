// Parser planu zajęć WEFiZ US (planyzajec-efz.usz.edu.pl).
// Czysty JavaScript bez zależności: działa w Node i w przeglądarce.

export const SLOTS = ["8.15-9.45", "10.00-11.30", "12.00-13.30", "13.45-15.15", "15.30-17.00", "17.15-18.45", "19.00-20.30"];
const TYPES = { "W": "W", "ĆW": "CW", "LB": "LAB", "K": "K", "S": "S" };
const ACRONYMS = new Set(["IT", "ICT", "HR", "HRM", "WNS", "CSR", "ESG", "AI", "UE", "EU", "IT/ICT", "SWFIS"]);
const SMALL_EN = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with", "vs"]);

const decode = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const bare = w => w.toUpperCase().replace(/[^A-ZĄĆĘŁŃÓŚŹŻ/]/g, "");

// Tekst z HTML z zachowaniem podziału na linie
function toText(html) {
  return decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\r]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
}

export function plCase(s) {
  const out = s.toLowerCase().split(" ").map(w => ACRONYMS.has(bare(w)) ? w.toUpperCase() : w).join(" ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function enCase(s) {
  return s.toLowerCase().split(" ").map((w, i) => {
    if (ACRONYMS.has(bare(w))) return w.toUpperCase();
    if (i > 0 && SMALL_EN.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

export function cleanRoom(r) {
  return r.replace(/\s+/g, " ").trim()
    .replace(/\s*Cuk\.\s*8$/i, "")
    .replace(/\s+lab\.?$/i, " (lab)")
    .replace(/\s+aula$/i, " (aula)")
    .trim();
}

// "12.10; 26.10; 09.11; 23.11.2026" -> ["2026-10-12", ...]. Rok z roku akademickiego, gdy go brak.
function parseDates(str, years) {
  const out = [];
  for (const m of str.matchAll(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?:\s*r\.?)?/g)) {
    const d = +m[1], mo = +m[2];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
    const y = m[3] ? +m[3] : (mo >= 9 ? years[0] : years[1]);
    out.push(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

function datesNote(dates) {
  const f = k => { const [y, m, d] = k.split("-"); return `${+d}.${m}`; };
  if (dates.length === 1) { const [y, m, d] = dates[0].split("-"); return `Jednorazowo: ${+d}.${m}.${y}`; }
  return "Tylko: " + dates.map(f).join(", ");
}

// Wspólna obróbka "reszty" tekstu wpisanego ręcznie: data:, GODZ., miejsce:, prowadzący + sala
function applyFreeRest(e, rest, years) {
  let r = rest;
  const godz = r.match(/GODZ\.?\s*(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/i);
  if (godz) { e.time = [`${+godz[1]}:${godz[2]}`, `${+godz[3]}:${godz[4]}`]; r = r.replace(godz[0], " "); }
  const miejsce = r.match(/miejsce:\s*([\s\S]+)$/i);
  if (miejsce) { e.r = miejsce[1].replace(/\s+/g, " ").trim(); r = r.slice(0, miejsce.index); }
  const data = r.match(/data:\s*([\s\S]+)$/i);
  let dates = [];
  if (data) { dates = parseDates(data[1], years); r = r.slice(0, data.index); }
  else { dates = parseDates(r, years); r = r.replace(/\b\d{1,2}\.\d{1,2}(?:\.\d{4})?(?:\s*r\.?)?/g, " "); }
  if (dates.length) { e.dates = dates; e.n = datesNote(dates); }
  r = r.replace(/\s+/g, " ").trim();
  if (r) {
    const pr = r.match(/^(.*?)\s*((?:s\.|sala|gab\.)\s.+)$/i);
    if (pr) { if (pr[1].trim()) e.p = pr[1].trim(); e.r = e.r || cleanRoom(pr[2]); }
    else e.x = r;   // pozostały opis
  }
}

export function parseEntry(chunk, years) {
  const lect = [...chunk.matchAll(/class="linkClass"[^>]*value="([^"]*)"/g)].map(m => decode(m[1]).trim()).filter(Boolean);
  const rooms = [...chunk.matchAll(/class="salButtonClass"[^>]*value="([^"]*)"/g)].map(m => cleanRoom(decode(m[1]))).filter(Boolean);
  const text = toText(chunk.replace(/<form[\s\S]*?<\/form>/g, " "));
  if (!text) return null;
  const e = {};
  const one = text.replace(/\n/g, " ");
  const m = one.match(/^(.+?) \(((?:[^()]|\([^()]*\))+)\) \((W|ĆW|LB|K|S)\)\s*(.*)$/);
  if (m) {
    e.pl = plCase(m[2]); e.en = enCase(m[1]); e.k = TYPES[m[3]];
    let rest = m[4];
    const g = rest.match(/\bGRUPA\s+([A-Z])\b/);
    if (g) { e.g = g[1]; rest = rest.replace(g[0], " "); }
    if (lect.length || rooms.length) {
      if (lect.length) e.p = lect.join(", ");
      if (rooms.length) e.r = rooms.join(", ");
      rest = rest.replace(/\s+/g, " ").trim();
      if (rest) e.tag = rest;
    } else {
      applyFreeRest(e, rest, years);
    }
  } else {
    // Wpis ręczny, np. szkolenie, lektorat, wykład ogólnouczelniany
    const lines = text.split("\n");
    let title = lines[0];
    let rest = lines.slice(1).join("\n");
    const cut = title.search(/\s\d{1,2}\.\d{1,2}(?:\.\d{4})?|\smiejsce:|\sGODZ\.|\sdata:/i);
    if (cut > 0) { rest = title.slice(cut) + "\n" + rest; title = title.slice(0, cut); }
    const t = title.match(/^(.*?)\s*\((W|ĆW|LB|K|S)\)\s*$/);
    if (t) { title = t[1]; e.k = TYPES[t[2]]; } else e.k = "X";
    e.pl = plCase(title.trim());
    if (lect.length) e.p = lect.join(", ");
    if (rooms.length) e.r = rooms.join(", ");
    applyFreeRest(e, rest, years);
  }
  return e;
}

// Stała kolejność kluczy, żeby porównywanie wersji planu było pewne
function ordered(e) {
  const o = {};
  for (const k of ["d", "s", "time", "pl", "en", "k", "g", "p", "r", "tag", "dates", "n", "x"]) if (e[k] !== undefined && e[k] !== "") o[k] = e[k];
  return o;
}

function parseSection(sec, years) {
  const out = [];
  const rows = sec.split(/<tr><th id="pierwszaKom">/).slice(1);
  for (const row of rows) {
    const time = row.slice(0, row.indexOf("<")).trim();
    const s = SLOTS.indexOf(time);
    const cells = row.split(/<td id="przedmiot\d*"[^>]*>/).slice(1);
    if (cells.length !== 5) throw new Error(`Wiersz ${time}: ${cells.length} komórek zamiast 5`);
    cells.forEach((cell, d) => {
      if (!cell.includes("<table>")) return;
      const inner = cell.split("<table>").slice(1).join("<table>").split("</td>")[0];
      for (const chunk of inner.split(/<hr[^>]*>/)) {
        const e = parseEntry(chunk, years);
        if (!e) continue;
        e.d = d;
        if (s >= 0) e.s = s;
        else { e.s = -1; e.time = e.time || time.split("-").map(x => x.replace(".", ":")); }
        out.push(ordered(e));
      }
    });
  }
  return out;
}

export function parseGroupPage(html) {
  const kierunek = (html.match(/id="kierunek"><strong>Kierunek:\s*<\/strong>\s*([^<]*)</) || [])[1];
  const grupa = (html.match(/<strong>Grupa:\s*<\/strong>\s*([^<]*)</) || [])[1];
  const ay = html.match(/Rok Akademicki:\s*<\/strong>\s*(\d{4})\/(\d{4})/);
  const semestr = (html.match(/Semestr:\s*<\/strong>\s*([^<]*)</) || [])[1];
  const years = ay ? [+ay[1], +ay[2]] : [new Date().getFullYear(), new Date().getFullYear() + 1];
  const a = html.indexOf('class="tydzien1"'), b = html.indexOf('class="tydzien2"'), c = html.indexOf('class="tydzien12"');
  if (a < 0 || b < 0 || c < 0 || !(a < b && b < c)) return { kierunek: kierunek && kierunek.trim(), grupa: grupa && grupa.trim(), empty: true };
  return {
    kierunek: kierunek && kierunek.trim(),
    grupa: grupa && grupa.trim(),
    rokAkademicki: ay ? `${ay[1]}/${ay[2]}` : null,
    semestr: semestr && semestr.trim(),
    odd: parseSection(html.slice(a, b), years),
    even: parseSection(html.slice(b, c), years)
  };
}

export function parseUpdated(planHtml) {
  const m = planHtml.match(/Aktualizacja planu:\s*([^<]*)/);
  return m ? m[1].trim() : null;
}
