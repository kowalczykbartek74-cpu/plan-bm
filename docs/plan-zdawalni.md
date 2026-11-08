# Przeniesienie planu: plan.skrotbm.pl → plan.zdawalni.pl

Przygotowane 8.11.2026. Gałęzie `plan-zdawalni` w repo `plan-bm` i `skrot-bm`. **Do przełączenia nic nie jest na produkcji.**

## Jak to wygląda po przełączeniu

| Adres | Co pokazuje | Gdzie stoi |
|---|---|---|
| `plan.zdawalni.pl` | plan zajęć wszystkich kierunków + skrzynka | GitHub Pages, repo `plan-bm` |
| `plan.skrotbm.pl` | przekierowanie na plan.zdawalni.pl (z grupą, kierunkiem, motywem) + **prawdziwe kopie** `kalendarz/*.ics`, `plan.json`, `plan/*.json` | GitHub Pages, nowe repo `plan-skrotbm-przekierowanie` |

**Kalendarze w telefonach BM działają dalej bez żadnej akcji studentów.** Aplikacja kalendarza pobiera `plan.skrotbm.pl/kalendarz/C112.ics`, a ten plik leży tam naprawdę (kopia odświeżana co 30 min z plan-bm). UID-y wydarzeń są te same, więc nic się nie dubluje. Nowe subskrypcje (przycisk „Dodaj do kalendarza”) idą już na plan.zdawalni.pl.

## Co zmieniłem w kodzie

**plan-bm** (`plan-zdawalni`): `CNAME`, `CAL_HOST` w `index.html`, adres w opisie `.ics` (`scripts/ics.mjs`; UID i PRODID celowo `@plan.skrotbm.pl`), nagłówek i maile w `dziekanat.mjs`, `README.md`. Nowy `przenies.html` (przyjmuje ustawienia ze starej domeny, nie nadpisuje nowszych; publikowany przez workflow). `docs/plan-skrotbm-przekierowanie/` = zawartość nowego repo. Test: `node scripts/przeniesienie-planu.pw.mjs` (Playwright) → 17/17 OK.

**skrot-bm** (`plan-zdawalni`): `rocznik.js`, `roczniki-dane.js`, `kierunki/wefiz-bm-1-st-2026.json`, `scripts/kierunek.mjs` (`PLAN_HOST`) → plan.zdawalni.pl. CSP wpuszcza oba hosty. Funkcja `kalendarz`: stary host zamienia na nowy. Funkcja `zapisz-sie`: dopuszcza plan.zdawalni.pl. **SQL v50** (`supabase/skrot-v50-plan-zdawalni.sql`): `plan_url` roczników na nowy host, wyzwalacz z v46 na nowy host. `plan.html`, `skrzynka.html` (stare przekierowania), regulamin i polityka prywatności (PL i EN: „plan.zdawalni.pl (wcześniej plan.skrotbm.pl)”, treść bez zmian), jeden tekst w panelu odwołań (+ EN), podbite `?v=`. Testy: `node --test tests/*.test.js` 337/337, PGlite z v50 OK.

## Krok A — teraz, nic nie psuje (ok. 10 min)

**A1. ŚwiatDomen24 → zdawalni.pl → DNS** → dodaj rekord:
- Typ `CNAME`, nazwa `plan`, wartość `kowalczykbartek74-cpu.github.io.` (z kropką na końcu, jeśli panel jej wymaga), TTL `300`.
- Nic więcej nie ruszaj (rekordy `A`, `www`, `matura` zostają).

**A2. GitHub → New repository**: nazwa `plan-skrotbm-przekierowanie`, **Public**, bez README / .gitignore / licencji (puste). Daj znać Claude'owi, wrzuci zawartość (albo: wgraj pliki z `plan-bm/docs/plan-skrotbm-przekierowanie/`, razem z `.github/` i `.nojekyll`).

**A3. W nowym repo:** Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)` → Save. **Domeny jeszcze nie wpisuj.** Zakładka Actions → jeśli jest przycisk „I understand… enable”, kliknij.

## Krok B — przełączenie (wieczorem, ok. 20 min + czekanie na certyfikat)

1. **plan-bm**: scal Pull Request `plan-zdawalni` → `main`. Poczekaj, aż w Actions skończy się „Aktualizacja planu zajęć” (1–2 min).
2. **plan-bm** → Settings → Pages → Custom domain: `plan.zdawalni.pl` → Save.
3. **Od razu potem: plan-skrotbm-przekierowanie** → Settings → Pages → Custom domain: `plan.skrotbm.pl` → Save. (DNS plan.skrotbm.pl już wskazuje na GitHub Pages, nic tam nie zmieniasz.)
4. Poczekaj, aż oba repo pokażą „DNS check successful” i da się zaznaczyć **Enforce HTTPS** (ostatnio ok. 2 h). Zaznacz w obu. W tym czasie kalendarze w telefonach mogą się chwilę nie odświeżać; same spróbują później.
5. Gdy `https://plan.zdawalni.pl` działa z kłódką: **skrot-bm** → scal Pull Request `plan-zdawalni` → `main`.
6. **Supabase Skrótu** → SQL Editor → wklej `supabase/skrot-v50-plan-zdawalni.sql` (z github.com, „Copy raw file”) → Run. Na dole tabelka: wszystkie `plan_url` zaczynają się od `https://plan.zdawalni.pl/`.
7. **Supabase → Edge Functions**: wdroż z `main` funkcje `kalendarz` i `zapisz-sie`.

## Test po przełączeniu

- [ ] `https://plan.zdawalni.pl` pokazuje plan BM, kłódka HTTPS; `#/wefiz/zarz/1/c151` pokazuje Zarządzanie.
- [ ] `https://plan.skrotbm.pl` i `https://plan.skrotbm.pl/?k=zarz26` przechodzą na plan.zdawalni.pl; Twoja grupa (C112, lab A) jest wybrana sama.
- [ ] `https://plan.skrotbm.pl/kalendarz/C112.ics` pobiera plik kalendarza (nie stronę przekierowania).
- [ ] Kalendarz w Twoim telefonie dalej się odświeża (bez podwójnych zajęć).
- [ ] „Dodaj do kalendarza” na plan.zdawalni.pl daje link `plan.zdawalni.pl/kalendarz/…`.
- [ ] zdawalni.pl → Dziś / Kalendarz: plan się wczytuje, w konsoli brak błędu CSP.
- [ ] Osobisty link kalendarza Skrótu w telefonie dalej się odświeża.
- [ ] plan-skrotbm-przekierowanie → Actions: „Kopia planu i kalendarzy” przechodzi co 30 min.

## Cofnięcie

1. plan-skrotbm-przekierowanie → Pages → usuń domenę. plan-bm → Pages → Custom domain `plan.skrotbm.pl`.
2. plan-bm i skrot-bm: Revert commita scalenia na `main`.
3. SQL v50 nie trzeba cofać: warunek dopuszcza oba hosty, a stara wersja funkcji `kalendarz` przy adresie spoza plan.skrotbm.pl bierze plan BM (osobisty kalendarz mają dziś tylko płacący z BM).

## Uwagi

- Domenę skrotbm.pl opłacaj co najmniej do końca roku akademickiego 2026/27 (stare subskrypcje kalendarza).
- Nowe kierunki: link do planu `https://plan.zdawalni.pl/?k=<kod>` albo `#/wefiz/<kierunek>/<rok>/<grupa>`.
- Regulamin: zmienił się tylko adres planu (darmowa część). To ta sama sytuacja co przy zdawalni.pl; jeśli wysyłasz kupującym maila o zmianie adresu, wspomnij też plan (nie jestem prawnikiem).
