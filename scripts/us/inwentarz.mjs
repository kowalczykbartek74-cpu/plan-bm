// Etap 0 planu dla całego US: inwentarz źródeł planów 7 wydziałów (bez zmian na stronie).
//
//   node scripts/us/inwentarz.mjs              pobiera listy planów i pliki (≤ 1 zapytanie/s), zapisuje:
//                                               config/zrodla-us.json, config/kierunki-us.json, docs/inwentarz-us.md
//   node scripts/us/inwentarz.mjs --offline    to samo z cache (.cache/us/), bez sieci
//   node scripts/us/inwentarz.mjs --probki     dodatkowo zapisuje próbki stron do scripts/fixtures/<wydział>/
//
// Wydziały i strony: config/wydzialy-us.json. Kierunki: oferta US (kandydaci.usz.edu.pl) + strony planów wydziałów.
// Skróty bierzemy tylko ze źródeł (nazwy plików, odnośniki, grupy w aplikacji); czego nic nie potwierdza – idzie do pytań.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { pobieracz, xlsxNapisy, xlsxArkusze, xlsxArkuszeDane, adres } from "./wspolne.mjs";
import { rocznikArkusza } from "./wh-xlsx.mjs";
import { zrodlaWH, zrodlaWNS, zrodlaWNSiP, zrodlaWPIA, zrodlaWT, zrodlaWKFiZ, ofertaUS } from "./zrodla.mjs";
import { kierunkiZFormularza, kodZ, nabor, LATA } from "../wefiz-wszystkie.mjs";
import { uczelnia } from "../uczelnia.mjs";

const PARSER = { wh: zrodlaWH, wns: zrodlaWNS, wnsip: zrodlaWNSiP, wpia: zrodlaWPIA, wt: zrodlaWT };

// ---------- nazwy ----------
export const norm = (s) => String(s || "").toLowerCase().replace(/\((ii|i) stopień\)/g, "").replace(/[–—\-_,.:;()"„”]/g, " ").replace(/\s+/g, " ").trim();
// dopasowanie nazwy ze strony planu do oferty US: równa albo początek nazwy z oferty („NAUKI O RODZINIE” → „Nauki o rodzinie — doradztwo…”)
export function dopasuj(nazwa, oferta) {
  const n = norm(nazwa);
  if (!n) return null;
  return oferta.find((o) => norm(o.nazwa) === n) || oferta.find((o) => norm(o.nazwa).startsWith(n + " ")) || null;
}
// inicjały nazwy („Management w sporcie” → MWS) – tylko do potwierdzenia skrótu z aplikacji WKFiZ
export const inicjaly = (s) => String(s).split(/\s+[—–]\s+/)[0].split(/[\s-]+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase();
// „DiZM 1 rok II stopień PONIEDZIAŁEK” → { DiZM: [{stopien:2, rok:1}] } (napisy w arkuszach WH)
export function lataWH(napisy) {
  const out = {};
  for (const s of napisy) {
    // „DiZM 1 rok II stopień”, „ARCHEOLOGIA 1 rok I st.”, „HISTORIA 1 rok IIst.”; klucz = norm(skrót albo nazwa)
    const m = /^(?:plan zajęć\s*[-–]?\s*)?(.+?)\s*[-–]?\s+(\d)\s*rok\s*(II|I)\s*(?:st|stop)/i.exec(s);
    if (!m) continue;
    const r = { stopien: m[3].toUpperCase() === "II" ? 2 : 1, rok: +m[2] };
    const k = norm(m[1]);
    (out[k] ||= []).some((x) => x.stopien === r.stopien && x.rok === r.rok) || out[k].push(r);
  }
  return out;
}
const poprawnyKod = (k) => /^[A-Z]{2,6}$/.test(k);
const kodZeSkrotu = (s) => String(s || "").normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
const ladna = (s) => { const t = String(s).trim(); return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t.charAt(0).toUpperCase() + t.slice(1); };

// ---------- składanie kierunków jednego wydziału ----------
// wpisy: [{ nazwa?, skrot?, stopien, lata, tryb, zrodlo(url), potw }] → kierunki z kodem, stopniami, trybami i rocznikami
export function zlozKierunki(wydz, wpisy, oferta, { kody = {}, en = {}, teraz = new Date(), wydzialy = {} } = {}) {
  const pytania = [];
  const enN = new Map(Object.entries(en).map(([k, v]) => [norm(k), v]));
  const ofW = oferta.filter((o) => o.wydzial === wydz.oferta);
  const mapa = new Map();
  const klucz = (nazwa) => norm(nazwa);
  const kier = (nazwa, zOferty) => {
    const k = klucz(nazwa);
    if (!mapa.has(k)) mapa.set(k, { pl: nazwa, wOfercie: !!zOferty, oferta: { stopnie: [], tryby: [] }, skroty: new Set(), kandydaci: [], stopnie: new Set(), tryby: new Set(), roczniki: new Map(), potwierdzenie: new Set(), zrodla: new Set() });
    return mapa.get(k);
  };
  for (const o of ofW) { const k = kier(o.nazwa, true); k.oferta.stopnie.push(o.stopien); k.oferta.tryby.push(...o.tryby); k.url = k.url || o.url; }
  for (const w of wpisy) {
    const o = w.nazwa ? dopasuj(w.nazwa, ofW) : null;
    const obcy = !o && w.nazwa ? dopasuj(w.nazwa, oferta) : null;
    if (!w.nazwa) { pytania.push(`${wydz.skrot}: źródło ${w.zrodlo} bez nazwy kierunku (skrót ${w.skrot || "?"})`); continue; }
    const k = kier(o ? o.nazwa : obcy ? obcy.nazwa : ladna(w.nazwa), o);
    if (obcy) { k.wlasciciel = wydzialy[obcy.wydzial] || obcy.wydzial; k.potwierdzenie.add(`w ofercie jako kierunek ${obcy.wydzial} – jeden rocznik z id tego wydziału`); }
    else if (!o) k.potwierdzenie.add("nazwa tylko ze strony planów (brak w ofercie rekrutacji 2026/27)");
    if (w.skrot) { k.skroty.add(w.skrot); }
    for (const s of w.kandydaciKodu || [w.skrot]) if (s) k.kandydaci.push(s);
    if (w.potw) k.potwierdzenie.add(w.potw);
    k.zrodla.add(w.zrodlo);
    for (const st of w.stopnie || (w.stopien == null ? [] : [w.stopien])) {
      k.stopnie.add(st); k.tryby.add(w.tryb);
      for (const rok of w.lata || []) k.roczniki.set(`${st}|${w.tryb}|${rok}`, { stopien: st, tryb: w.tryb, rok, zrodlo: w.zrodlo });
    }
    if ((w.stopnie || (w.stopien == null ? [] : [w.stopien])).length === 0) { k.tryby.add(w.tryb); if (w.tryb === "st") k.bezStopnia = true; else k.nstBezRoku = true; }
  }
  const out = [];
  for (const k of mapa.values()) {
    let kod = kody[k.pl] || null, zrodloKodu = kod ? "kod istniejący w Skrócie (nauka_kierunki)" : null;
    if (!kod) for (const s of k.kandydaci) { const c = kodZeSkrotu(s); if (poprawnyKod(c)) { kod = c; zrodloKodu = `skrót „${s}” ze źródła`; break; } }
    if (!kod && k.kandydaci.length) {
      const c = kodZeSkrotu(k.kandydaci[0]);
      pytania.push(`${wydz.skrot}: „${k.pl}” – skrót ze źródła „${k.kandydaci[0]}” ma ${c.length} liter (kod musi mieć 2–6). Propozycja: ${c.length > 6 ? c.slice(0, 6) : c + "X".repeat(2 - c.length)}?`);
    }
    if (!kod && !k.kandydaci.length && k.zrodla.size) pytania.push(`${wydz.skrot}: „${k.pl}” – brak skrótu w źródłach, kod do ustalenia`);
    const stopnie = [...new Set([...k.stopnie, ...(k.stopnie.size ? [] : k.oferta.stopnie)])].sort();
    const tryby = [...new Set([...k.tryby, ...(k.tryby.size ? [] : k.oferta.tryby)])].sort();
    const roczniki = [...k.roczniki.values()].sort((a, b) => a.stopien - b.stopien || a.tryb.localeCompare(b.tryb) || a.rok - b.rok).map((r) => ({
      id: kod ? `${k.wlasciciel || wydz.kod}-${kod.toLowerCase()}-${r.stopien}-${r.tryb}-${nabor(r.rok, teraz)}` : null, ...r, nabor: nabor(r.rok, teraz),
    }));
    if (k.nstBezRoku) k.potwierdzenie.add("niestacjonarne: stopień i rok tylko w treści plików zjazdowych (Etap 7)");
    if (k.bezStopnia) pytania.push(`${wydz.skrot}: „${k.pl}” – źródło nie podaje stopnia/roku (${[...k.zrodla].map((u) => u.split("/").pop()).join(", ")})`);
    out.push({
      kod, pl: k.pl, en: enN.get(norm(k.pl)) || null, ...(k.wlasciciel ? { wlasciciel: k.wlasciciel } : {}), stopnie, tryby, skroty: [...k.skroty], wOfercie: k.wOfercie,
      ...(k.wOfercie ? { oferta: { stopnie: [...new Set(k.oferta.stopnie)].sort(), tryby: [...new Set(k.oferta.tryby)].sort(), url: k.url } } : {}),
      maZrodlo: k.zrodla.size > 0, ...(zrodloKodu ? { zrodloKodu } : {}),
      ...(k.potwierdzenie.size ? { uwagi: [...k.potwierdzenie] } : {}),
      roczniki,
    });
  }
  const kody2 = out.filter((k) => k.kod).map((k) => k.kod);
  for (const d of kody2.filter((c, i) => kody2.indexOf(c) !== i)) pytania.push(`${wydz.skrot}: kod ${d} powtarza się w wydziale`);
  return { kierunki: out.sort((a, b) => a.pl.localeCompare(b.pl, "pl")), pytania };
}

// ---------- wpisy kierunków ze źródeł (per wydział) ----------
function wpisyZeZrodel(wydz, zrodla, ofertaW, tytuly) {
  const wpisy = [], pytania = [];
  for (const z of zrodla) {
    if (z.typ !== "plan" || z.pominiety) continue;
    for (const k of z.kierunki) {
      const w = { ...k, tryb: z.tryb, zrodlo: z.url };
      if (wydz.kod === "wh") {
        // nazwa kierunku z treści pliku XLSX (tytuł arkusza); skrót z nazwy pliku
        const t = tytuly[z.url]?.[k.skrot];
        const ini = unikalne(ofertaW).filter((x) => inicjaly(x.nazwa) === k.skrot.toUpperCase() && k.stopnie.every((st) => ofertaW.some((y) => y.nazwa === x.nazwa && y.stopien === st)));
        if (t) { w.nazwa = t.nazwa; w.potw = `nazwa z treści pliku: „${t.napis.slice(0, 120)}”`; }
        else if (ini.length === 1) { w.nazwa = ini[0].nazwa; w.potw = `plik podaje tylko skrót ${k.skrot}; nazwa = kierunek z oferty o tych inicjałach (do potwierdzenia)`; }
        else if (tytuly[z.url]?._tytul && /\S/.test(tytuly[z.url]._tytul.replace(/\s+(?:\d|I{1,3})\s*rok\b.*$/i, ""))) {
          // nazwa z nagłówka pliku (kierunek spoza oferty rekrutacji, np. Polonistyczno-germanistyczne wspólne studia nauczycielskie)
          w.nazwa = ladna(tytuly[z.url]._tytul.replace(/\s+(?:\d|I{1,3}|IV)\s*rok\b.*$/i, "").trim());
          w.potw = `nazwa z nagłówka pliku: „${tytuly[z.url]._tytul.slice(0, 100)}” (brak w ofercie)`;
          pytania.push(`WH: ${k.skrot} – plik nazywa kierunek „${w.nazwa}”, oferta nie ma takiej nazwy; czy to ten sam kierunek co podobny w ofercie?`);
        } else { pytania.push(`WH: skrót ${k.skrot} (${z.plik}) – plik nie podaje nazwy kierunku, a inicjały nie pasują do żadnego kierunku z oferty`); continue; }
        // lata: z napisów „<skrót> <rok> rok <stopień> stopień” w arkuszach
        // lata: z arkuszy pliku (pewne), a gdy ich brak – z napisów „<skrót> <rok> rok <stopień>”
        const zArk = z.tryb === "st" ? (tytuly[z.url]?._arkusze || []).filter((x) => k.stopnie.includes(x.stopien)) : [];   // nst: arkusze = zjazdy
        const lw = zArk.length ? zArk : tytuly[z.url]?._lata?.[norm(k.skrot)] || tytuly[z.url]?._lata?.[norm(w.nazwa)];
        if (!k.lata && lw?.length) {
          for (const st of k.stopnie) { const l = lw.filter((x) => x.stopien === st).map((x) => x.rok).sort(); if (l.length) wpisy.push({ ...w, stopnie: undefined, stopien: st, lata: l }); else wpisy.push({ ...w, stopnie: [st] }); }
          continue;
        }
      }
      if (wydz.kod === "wkfiz") {
        const o = unikalne(ofertaW).filter((x) => inicjaly(x.nazwa) === k.skrot.toUpperCase());
        if (o.length === 1) { w.nazwa = o[0].nazwa; w.potw = `skrót ${k.skrot} = inicjały nazwy z oferty (aplikacja nie podaje pełnej nazwy)`; }
        else pytania.push(`WKFiZ: skrót grupy ${k.skrot} – ${o.length ? "kilka" : "żaden"} kierunek z oferty o tych inicjałach`);
      }
      if (wydz.kod === "wt") {
        // skany bez tekstu: stopień i lata z config/wydzialy-us.json („roczniki”: prefiks nazwy pliku → [{stopien, lata}])
        const r = Object.entries(wydz.roczniki || {}).find(([p]) => !p.startsWith("_") && z.plik.startsWith(p))?.[1];
        if (r) { for (const x of r) wpisy.push({ ...w, stopien: x.stopien, lata: x.lata, potw: "stopień i lata z nagłówków kolumn skanu (config/wydzialy-us.json → roczniki)" }); continue; }
      }
      if (wydz.kod === "wnsip") w.kandydaciKodu = [k.skrot, k.skrotPliku];
      if (wydz.kod === "wpia") w.kandydaciKodu = [k.skrot, k.skrotPliku && k.skrotPliku.replace(/^(SS|NS|N)(?=[A-Z])/, "")];
      if (wydz.kod === "wns" && z.tryb === "nst" && !dopasuj(k.nazwa, ofertaW)) {
        // „PEDAGOGIKA i PRACA SOCJALNA” = wspólny plik dwóch kierunków
        const czesci = k.nazwa.split(/\s+i\s+/);
        if (czesci.length > 1 && czesci.every((c) => dopasuj(c, ofertaW))) { for (const c of czesci) wpisy.push({ ...w, nazwa: c, potw: "wspólny plik kilku kierunków" }); continue; }
      }
      wpisy.push(w);
    }
  }
  return { wpisy, pytania };
}

const unikalne = (of) => [...new Map(of.map((o) => [o.nazwa, o])).values()];
// tytuł kierunku w XLSX: napis, który ZACZYNA SIĘ od nazwy kierunku z oferty WH („ARCHEOLOGIA 1 rok I st. PLAN ZAJĘĆ…”,
// „PLAN ZAJĘĆ -FILOLOGIA GERMAŃSKA- 2 ROK…”). Kandydaci tylko z oferty o stopniu skrótu z nazwy pliku (wyjątek: nazwa
// istnieje w ofercie tylko na innym stopniu – np. FG I st., którego już nie ma w rekrutacji); najdłuższa nazwa wygrywa.
export function tytulyWH(napisy, kierunki, ofertaW) {
  const wynik = {};
  const n = napisy.slice(0, 600).map((s) => ({ s, n: norm(s).replace(/^plan( zajęć| studia niestacjonarne)*\s*/, "") }));
  for (const k of kierunki) {
    const traf = [];
    for (const o of unikalne(ofertaW)) {
      const on = norm(o.nazwa);
      // napis-tytuł: nazwa kierunku na początku i dalej rok/semestr/plan (nie nazwa przedmiotu w rodzaju „historia języka…”)
      const t = n.find((x) => x.n.startsWith(on + " ") && /\b(\d|i{1,3}|iv|v)\s*rok\b|\byear\b|semestr|plan|stopie/.test(x.n.slice(on.length)));
      if (!t) continue;
      const naStopniu = (k.stopnie || []).some((st) => ofertaW.some((y) => y.nazwa === o.nazwa && y.stopien === st));
      traf.push({ nazwa: o.nazwa, napis: t.s, dl: on.length, naStopniu });
    }
    traf.sort((a, b) => (b.naStopniu - a.naStopniu) || (b.dl - a.dl));
    if (traf[0]) wynik[k.skrot] = traf[0];
  }
  return wynik;
}

// ---------- WEFiZ: system planów (HTML) – kierunki z formularza, stopnie z oferty ----------
async function wefiz(wydz, p, oferta, { offline, log }) {
  const zrodla = [], pytania = [];
  let form = [], akt = null;
  if (!offline) {
    const g = uczelnia({ log });
    const html = await g("plan");
    form = kierunkiZFormularza(html || ""); akt = await g.aktualizacja();
    fs.mkdirSync(".cache/us/wefiz", { recursive: true });
    fs.writeFileSync(".cache/us/wefiz/formularz.json", JSON.stringify({ form, akt }));
  } else if (fs.existsSync(".cache/us/wefiz/formularz.json")) ({ form, akt } = JSON.parse(fs.readFileSync(".cache/us/wefiz/formularz.json", "utf8")));
  const ofW = oferta.filter((o) => o.wydzial === wydz.oferta);
  const k1 = fs.existsSync("config/kierunki-1rok.json") ? JSON.parse(fs.readFileSync("config/kierunki-1rok.json", "utf8")).kierunki : [];
  const wpisy = [];
  for (const f of form) {
    // „Gospodarka Przestrzenna inż.” = „Gospodarka przestrzenna” w ofercie (gdy oferta nie ma osobnej pozycji „inż.”, jak Logistyka)
    const o = dopasuj(f.nazwa, ofW) || dopasuj(f.nazwa.replace(/\s*-\s*.*$/, ""), ofW) || dopasuj(f.nazwa.replace(/\s+inż\.?$/, ""), ofW);
    const stopnie = o ? [...new Set(ofW.filter((x) => x.nazwa === o.nazwa).map((x) => x.stopien))] : [];
    if (!o) pytania.push(`WEFiZ: „${f.pelna}” jest w systemie planów, ale nie ma go w ofercie rekrutacji 2026/27 – stopień nieznany`);
    const lata = (st) => LATA.filter(([, s]) => s === st).map(([, , r]) => r);
    for (const st of stopnie.length ? stopnie : [null]) {
      const plan1 = k1.find((k) => k.system?.nazwa === f.pelna);
      zrodla.push({ url: wydz.strony[0].url, plik: "plan", opis: f.pelna, format: "html", tryb: "st", typ: "plan",
        kierunki: [{ nazwa: o ? o.nazwa : f.nazwa, skrot: f.skrot, stopien: st, lata: st ? lata(st) : null, latyWFormularzu: true }], wersja: akt,
        ...(st === 1 && plan1 ? { plan1rok: plan1.maPlan } : {}) });
      // lata z planem: na razie tylko sprawdzony 1. rok I st. (config/kierunki-1rok.json); lata 2–4 i II st. sprawdza Etap 1
      wpisy.push({ nazwa: o ? o.nazwa : f.nazwa, skrot: f.skrot, kandydaciKodu: [kodZ(f.skrot)], stopien: st, lata: st === 1 && plan1?.maPlan ? [1] : [], tryb: "st", zrodlo: wydz.strony[0].url,
        potw: st === 1 && plan1 && !plan1.maPlan ? "system planów WEFiZ: 1. rok I st. bez planu" : "system planów WEFiZ (lata 2+ / II st.: Etap 1)" });
    }
  }
  // niestacjonarne: osobny system (plan dla wykładowców / sal); grupy w PDF-ach „Zestawienie nazw grup”
  if (wydz.strony[1]) {
    const html = await p.strona(wydz.strony[1].url);
    for (const m of String(html || "").matchAll(/href="([^"]*(?:planynst-[a-z-]+|Wykaz_grup[^"]*\.pdf))"[^>]*>([^<]+)</g)) {
      const url = new URL(m[1], wydz.strony[1].url).href;
      zrodla.push({ url, plik: url.split("/").pop(), opis: m[2].trim(), format: /\.pdf$/.test(url) ? "pdf" : "html", tryb: "nst", typ: /Wykaz_grup/.test(url) ? "grupy" : "plan", kierunki: [], wersja: null });
    }
  }
  return { zrodla, wpisy, pytania, aktualizacja: akt };
}

// ---------- główny przebieg ----------
export async function inwentarz({ offline = false, probki = false, log = console.error, teraz = new Date() } = {}) {
  const cfg = JSON.parse(fs.readFileSync("config/wydzialy-us.json", "utf8"));
  const en = fs.existsSync("config/nazwy-en.json") ? JSON.parse(fs.readFileSync("config/nazwy-en.json", "utf8")) : {};
  const p = pobieracz({ offline, log });
  const oferta = [];
  for (const o of cfg.oferta) { const h = await p.strona(o.url); if (!h) throw new Error("brak oferty US: " + o.url); oferta.push(...ofertaUS(h, o.stopien)); }
  const wynik = { zrodla: {}, kierunki: {}, pytania: [], pliki: { razem: 0, nowe: 0, bledy: [] } };
  for (const w of cfg.wydzialy) {
    log(`— ${w.skrot}`);
    const ofW = oferta.filter((o) => o.wydzial === w.oferta);
    let zrodla = [], wpisy = [], pytania = [], dodatkowe = {};
    if (w.parser === "wefiz") {
      ({ zrodla, wpisy, pytania } = await wefiz(w, p, oferta, { offline, log }));
    } else if (w.parser === "wkfiz") {
      const st = await p.strona(w.strony[0].url), nst = await p.strona(w.strony[1].url);
      const r = zrodlaWKFiZ(JSON.parse(st || "{}"), JSON.parse(nst || "{}"), w.strony[0].url, w.strony[1].url);
      zrodla = r.zrodla; pytania.push(...r.niejasne);
      if (probki) zapiszProbke(w.kod, "schedule.json", probkaWKFiZ(JSON.parse(st)));
      if (probki) zapiszProbke(w.kod, "html-plans.json", nst);
      ({ wpisy } = wpisyZeZrodel(w, zrodla, ofW, {}));
      const d = JSON.parse(st || "{}");
      dodatkowe = { tryby_w_danych: r.tryby, zajec: d.classes?.length ?? 0, znacznik: d.timestamp || null, przyklad: d.classes?.[0] || null };
    } else {
      for (const s of w.strony) {
        const html = await p.strona(s.url);
        if (!html) { pytania.push(`${w.skrot}: strona ${s.url} nie odpowiada`); continue; }
        if (probki) zapiszProbke(w.kod, `lista-${s.tryb.replace("+", "-")}.html`, odchudz(html));
        zrodla.push(...PARSER[w.parser](html, s.tryb === "st+nst" ? "st" : s.tryb, s.url));
      }
      // pliki: sha256 i rozmiar (pobranie tylko nowych adresów / zmienionych plików)
      const tytuly = {};
      for (const z of zrodla) {
        if (!/^(xlsx|pdf)$/.test(z.format) || z.pominiety) continue;
        wynik.pliki.razem++;
        try {
          const f = await p.plik(z.url);
          if (!f || f.brak) { z.blad = "brak pliku (404)"; wynik.pliki.bledy.push(z.url); continue; }
          z.sha256 = f.sha256; z.rozmiar = f.rozmiar; if (!f.zCache) wynik.pliki.nowe++;
          if (z.format === "xlsx") {
            const napisy = xlsxNapisy(f.buf);
            z.arkusze = xlsxArkusze(f.buf);
            // lata i stopnie z arkuszy (arkusz = rocznik), tytuł pliku na wypadek nazwy spoza oferty
            const ark = xlsxArkuszeDane(f.buf).filter((a) => Object.keys(a.komorki).length);
            const roczn = ark.map(rocznikArkusza).filter(Boolean);
            const tytulPliku = ark.flatMap((a) => Object.entries(a.komorki).filter(([r]) => adres(r)[1] < 2).map(([, v]) => v)).find((v) => /\brok\b/i.test(v));
            tytuly[z.url] = { ...tytulyWH(napisy, z.kierunki, ofW), _lata: lataWH(napisy), _arkusze: roczn, _tytul: tytulPliku };
          }
        } catch (e) { z.blad = e.message; wynik.pliki.bledy.push(z.url); }
      }
      const r = wpisyZeZrodel(w, zrodla, ofW, tytuly);
      wpisy = r.wpisy; pytania.push(...r.pytania);
    }
    const kody = (cfg.kody || {})[w.kod] || {};
    const sk = zlozKierunki(w, wpisy, oferta, { kody, en, teraz, wydzialy: Object.fromEntries(cfg.wydzialy.map((x) => [x.oferta, x.kod])) });
    pytania.push(...sk.pytania);
    // kierunek każdego źródła jako kod (gdy znany)
    const kodNazwy = new Map(sk.kierunki.map((k) => [norm(k.pl), k.kod]));
    for (const z of zrodla) for (const k of z.kierunki) {
      const n = w.kod === "wh" ? null : (dopasuj(k.nazwa, ofW)?.nazwa || k.nazwa);
      k.kod = n ? kodNazwy.get(norm(n)) ?? null : sk.kierunki.find((x) => x.skroty.includes(k.skrot))?.kod ?? null;
    }
    wynik.zrodla[w.kod] = { skrot: w.skrot, pl: w.pl, en: w.en, dos: w.dos, strony: w.strony, ...dodatkowe, zrodla };
    wynik.kierunki[w.kod] = { skrot: w.skrot, pl: w.pl, kierunki: sk.kierunki };
    wynik.pytania.push(...pytania.map((q) => ({ wydzial: w.skrot, q })));
  }
  if (probki) { zapiszProbke("oferta", "i-stopnia.html", tylkoLista(await p.strona(cfg.oferta[0].url))); zapiszProbke("oferta", "ii-stopnia.html", tylkoLista(await p.strona(cfg.oferta[1].url))); }
  wynik.stat = p.stat; wynik.oferta = oferta;
  return wynik;
}

// ---------- próbki do testów ----------
const tylkoLista = (h) => { const t = odchudz(h), a = t.indexOf("kierunek-archive"), b = t.lastIndexOf("kierunek-archive"); return a < 0 ? t : t.slice(Math.max(0, t.lastIndexOf("<", a - 40)), b + 4000); };
const odchudz = (h) => String(h).replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/\n\s*\n+/g, "\n");
function probkaWKFiZ(d) { const ile = {}; return JSON.stringify({ ...d, classes: (d.classes || []).filter((c) => (ile[c.group] = (ile[c.group] || 0) + 1) <= 3) }, null, 1); }
function zapiszProbke(wydz, nazwa, tresc) { const d = path.join("scripts/fixtures", wydz); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, nazwa), tresc); }

// ---------- zapis ----------
const bezPol = (z) => { const { arkusze, ...r } = z; return arkusze?.length ? { ...r, arkusze } : r; };
export function raport(w, teraz = new Date()) {
  const L = [];
  const d = teraz.toISOString().slice(0, 10);
  L.push(`# Inwentarz źródeł planów US`, ``, `Wygenerowane ${d}: \`node scripts/us/inwentarz.mjs\`. Dane: \`config/zrodla-us.json\`, \`config/kierunki-us.json\`.`, ``);
  L.push(`Oferta rekrutacji US 2026/27 (kandydaci.usz.edu.pl): ${w.oferta.filter((o) => o.stopien === 1).length} kierunków I st. i jednolitych, ${w.oferta.filter((o) => o.stopien === 2).length} II st.`, ``);
  L.push(`## Podsumowanie`, ``, `| Wydział | Kierunki | Kierunek×stopień | Roczniki z planem (st) | Roczniki z planem (nst) | Źródła planów | Format |`, `|---|---|---|---|---|---|---|`);
  for (const [kod, k] of Object.entries(w.kierunki)) {
    const z = w.zrodla[kod];
    const ks = k.kierunki.reduce((s, x) => s + Math.max(1, x.stopnie.length), 0);
    const rs = k.kierunki.flatMap((x) => x.roczniki);
    const formaty = [...new Set(z.zrodla.filter((x) => x.typ === "plan").map((x) => x.format))].join(", ");
    L.push(`| ${k.skrot} | ${k.kierunki.length} | ${ks} | ${rs.filter((r) => r.tryb === "st").length} | ${rs.filter((r) => r.tryb === "nst").length} | ${z.zrodla.filter((x) => x.typ === "plan" && !x.pominiety).length} | ${formaty} |`);
  }
  L.push(``, `„Roczniki z planem” = kierunek × stopień × rok, dla którego źródło wprost podaje rok. Pliki „I i II st.” (WH) i plany bez roku (WT) liczą się dopiero po odczycie treści (Etap 4/5).`, ``);
  for (const [kod, k] of Object.entries(w.kierunki)) {
    const z = w.zrodla[kod];
    L.push(`## ${k.skrot} – ${k.pl}`, ``);
    L.push(`Strony: ${z.strony.map((s) => `[${s.tryb}](${s.url})`).join(", ")}. DOS: ${z.dos.map((u) => `[${u.split("/")[3]}](${u})`).join(", ")}.`, ``);
    L.push(`| Kierunek | Kod | Skróty w źródłach | Oferta 2026/27 | Stopnie w źródłach | Tryby | Lata z planem | Uwagi |`, `|---|---|---|---|---|---|---|---|`);
    for (const x of k.kierunki) {
      const lata = (tryb) => x.stopnie.map((s) => { const r = x.roczniki.filter((y) => y.stopien === s && y.tryb === tryb).map((y) => y.rok); return r.length ? `${s === 0 ? "jm" : s === 1 ? "I" : "II"}: ${r.join(",")}` : null; }).filter(Boolean).join("; ");
      const lst = lata("st"), lnst = lata("nst");
      const of = x.wOfercie ? `${x.oferta.stopnie.map((s) => (s === 1 ? "I/jm" : "II")).join("+")} ${x.oferta.tryby.join("/")}` : "—";
      L.push(`| ${x.pl} | ${x.kod ? "`" + x.kod + "`" : "**?**"} | ${x.skroty.join(", ") || "—"} | ${of} | ${x.stopnie.map((s) => (s === 0 ? "jm" : s === 1 ? "I" : "II")).join(", ") || (x.maZrodlo ? "?" : "—")} | ${x.tryby.join(", ")} | ${[lst && "st " + lst, lnst && "nst " + lnst].filter(Boolean).join(" · ") || (x.maZrodlo ? "?" : "brak planu")} | ${(x.uwagi || []).join("; ")} |`);
    }
    if (kod === "wkfiz" && z.przyklad) {
      L.push(``, `**Skąd aplikacja bierze dane** (\`planyzajec-kfz.usz.edu.pl/script.js\` → \`loadSchedule()\`): jedno zapytanie GET`,
        `\`${z.strony[0].url}\` (publiczne, bez logowania) zwraca \`{success, classes[], total, timestamp}\` – wszystkie zajęcia stacjonarne naraz`,
        `(${z.zajec} zajęć, znacznik ${z.znacznik}); grupa = pole \`group\` („<skrót> <rok> rok <stopień> stopień”), tryb = \`studyMode\` (w danych tylko: ${z.tryby_w_danych.join(", ")}).`,
        `Filtry grupy i wykładowcy aplikacja liczy u siebie z tej listy. Gdy baza jest pusta, aplikacja woła \`api/parse_xml.php\`.`,
        `Niestacjonarne: \`${z.strony[1].url}\` = lista grup, plan grupy to HTML z \`get_html_plans.php?group=<nazwa>\`. Przykład zajęć:`,
        ``, "```json", JSON.stringify(z.przyklad, null, 1), "```");
    }
    const pom = z.zrodla.filter((x) => x.pominiety);
    if (pom.length) L.push(``, `Pominięte pliki: ${pom.map((x) => `\`${x.plik}\` (${x.powod})`).join("; ")}.`);
    const bl = z.zrodla.filter((x) => x.blad);
    if (bl.length) L.push(``, `Błędy pobierania: ${bl.map((x) => `\`${x.plik}\`: ${x.blad}`).join("; ")}.`);
    L.push(``);
  }
  L.push(`## Niejasne pozycje i pytania do Bartka`, ``);
  w.pytania.forEach((p, i) => L.push(`${i + 1}. ${p.q}`));
  L.push(``, `Zapytania: sieć ${w.stat.siec}, HEAD ${w.stat.head}, cache ${w.stat.cache}. Pliki: ${w.pliki.razem} (nowo pobrane ${w.pliki.nowe}, błędy ${w.pliki.bledy.length}).`, ``);
  return L.join("\n");
}

async function main(argv) {
  const offline = argv.includes("--offline"), probki = argv.includes("--probki");
  const teraz = new Date();
  const w = await inwentarz({ offline, probki, teraz });
  const dzis = teraz.toISOString().slice(0, 10);
  fs.writeFileSync("config/zrodla-us.json", JSON.stringify({
    opis: "Wygenerowane: node scripts/us/inwentarz.mjs. Nie edytuj ręcznie (wydziały i strony: config/wydzialy-us.json). Źródło = {url, plik, format, tryb, typ, kierunki:[{kod, stopien, lata}], wersja (data z nazwy pliku), sha256, rozmiar}.",
    wygenerowano: dzis, wydzialy: Object.fromEntries(Object.entries(w.zrodla).map(([k, v]) => [k, { ...v, zrodla: v.zrodla.map(bezPol) }])),
  }, null, 1) + "\n");
  fs.writeFileSync("config/kierunki-us.json", JSON.stringify({
    opis: "Wygenerowane: node scripts/us/inwentarz.mjs. Oficjalna lista kierunków US (oferta 2026/27 + kierunki ze stron planów), kody z nazw plików/źródeł, id roczników <wydział>-<kod>-<stopień>-<tryb>-<nabór> (stopień 0 = jednolite). Nazwy EN: config/nazwy-en.json.",
    wygenerowano: dzis, wydzialy: w.kierunki,
  }, null, 1) + "\n");
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/inwentarz-us.md", raport(w, teraz));
  console.log(`Zapisano config/zrodla-us.json, config/kierunki-us.json, docs/inwentarz-us.md. Pytania: ${w.pytania.length}. Pliki: ${w.pliki.razem}, nowe ${w.pliki.nowe}, błędy ${w.pliki.bledy.length}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv.slice(2)).catch((e) => { console.error("BŁĄD:", e.stack || e.message); process.exit(1); });
}
