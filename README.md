# Plan zajęć – Business Management, 1. rok (US, WEFiZ)

Strona z planem zajęć dla grup C111, C112 i C113 wraz z podgrupami laboratoryjnymi A i B.
Plan aktualizuje się sam na podstawie [oficjalnego planu wydziału](https://planyzajec-efz.usz.edu.pl/plan).

## Jak to działa

1. Codziennie około 7:00 GitHub Actions uruchamia `scripts/update-plan.mjs`.
2. Skrypt pobiera plan grup ze strony uczelni i zapisuje go w `plan.json` (kopia trafia też do `index.html`).
3. Jeśli plan się zmienił, powstaje zgłoszenie (Issue) z listą zmian, a GitHub wysyła o nim maila właścicielowi repozytorium.
4. Strona jest publikowana na GitHub Pages. Otwarte strony pobierają świeży `plan.json` co 5 minut.

Jeśli strona uczelni zwróci coś podejrzanego (brak grupy, za mało zajęć), skrypt nie nadpisuje planu.
Uruchomienie kończy się wtedy błędem i GitHub wysyła maila o nieudanym przebiegu.

## Odwołane zajęcia i odrabianie (komunikaty dziekanatu)

`scripts/dziekanat.mjs` czyta [komunikaty dziekanatu na Cukrowej](https://dos.usz.edu.pl/cukrowa/zajecia-cukrowa/)
rano razem z planem, a w ciągu dnia co godzinę (8:20–19:20). Bierze tylko wpisy dla naszych grup (np. „GRUPA C111, C112, C113”, „GRUPA C112a”).

- Odwołane zajęcia są na stronie przekreślone z napisem „Odwołane”, a w kalendarzu w telefonie mają w tytule „ODWOŁANE:”.
- Odrabianie i zmiany godziny lub sali pojawiają się jako dodatkowe zajęcia w danym dniu.
- Komunikat, którego nie da się przypiąć do konkretnych zajęć (np. prowadzący spoza planu), widać jako notkę pod danym dniem.
- Przy każdym nowym komunikacie dla naszych grup powstaje Issue, więc GitHub wysyła maila. Warto zerknąć, czy automat dobrze go odczytał.

**Odwołania z Teams.** Prowadzący często piszą o odwołanych zajęciach tylko w Teams. Skrót BM pokazuje staroście propozycję
odwołania przy takim ogłoszeniu (skrotbm.pl → Narzędzia starosty → Odwołania z Teams), a po zatwierdzeniu zapisuje gotowe wpisy
w swojej bazie. `scripts/dziekanat.mjs` przy każdym przebiegu pobiera je publiczną funkcją bazy Skrótu
(`nauka_odwolania_publiczne`, plik `supabase/skrot-v26-odwolania.sql` w repozytorium skrot-bm) i dopisuje do `dziekanat`:
ogłoszenie trafia do `posts` z `src: "teams"` (bez adresu), a odwołania do `zmiany` z `src: "teams"`. Strona i pliki .ics pokazują je
tak samo jak komunikaty dziekanatu, z dopiskiem „Ogłoszenie prowadzącego w Teams”. Gdy baza nie odpowiada, zostają poprzednie wpisy.
Test bez internetu: `node scripts/dziekanat.mjs --offline --teams-file odpowiedz.json`.

Automat rozpoznaje prowadzącego po nazwisku, a dni i godziny po zwykłych sformułowaniach dziekanatu
(„Dnia 23.10.2026 zostają odwołane zajęcia z dr …”, „Termin odrobienia: 19.11.2026, godz. 10:00, sala 002”).
Gdy strona dziekanatu nie odpowiada, plan zostaje z ostatnio odczytanymi komunikatami.

## Plan z PDF-u (kolejka importów w Skrócie)

Gdy planu jakiejś grupy nie ma na stronie uczelni (np. nowa grupa albo plan rozesłany tylko jako PDF), administrator Skrótu
wgrywa PDF w zdawalni.pl → Narzędzia starosty → Importy. AI robi szkic, a administrator zatwierdza go zajęcie po zajęciu;
nic z AI nie trafia do bazy bez tej decyzji. `scripts/update-plan.mjs` przy każdym przebiegu pyta publiczną funkcję bazy Skrótu
`nauka_import_plan_publiczny(rocznik)` (plik `supabase/skrot-v40-importy.sql` w repozytorium skrot-bm; rocznik z `PLAN_ROCZNIK`,
domyślnie `wefiz-bm-1-st-2026`) i dokłada **tylko grupy, których strona uczelni nie podaje**. Plan uczelni zawsze ma pierwszeństwo.
W `plan.json` takie grupy są opisane w polu `zImportu`. Bez zatwierdzonego planu, bez sieci albo przed uruchomieniem v40 plan
działa dokładnie jak dotąd (`scripts/import-plan.mjs`, test: `node --test scripts/import-plan.test.mjs`).
Test bez internetu: `node scripts/update-plan.mjs --import-file odpowiedz.json` (odpowiedź funkcji bazy).

## Inne kierunki (roczniki)

Strona ma wybór **Kierunek → Rok → Grupa**. BM zostaje pod `plan.json` (bez zmian), każdy inny rocznik ma plik
`plan/<id rocznika>.json` w tym samym formacie. Link dla roku: `https://plan.skrotbm.pl/?k=<kod>`, np. **?k=zarz26** (Zarządzanie, 1. rok).

- Konfiguracja rocznika to plik `kierunki/<id>.json` (nazwa w systemie planów uczelni, rok, grupy, plik wyjściowy). Robi go skrypt
  `scripts/kierunek.mjs` w repozytorium skrot-bm; tutaj nie ma żadnego kierunku wpisanego w kod poza BM.
- `node scripts/update-plan.mjs --wszystkie` pobiera plany wszystkich roczników z `kierunki/` (grupy z pliku + 3 kolejne numery),
  `--kierunek kierunki/<id>.json` tylko jeden. Błąd jednego rocznika nie blokuje pozostałych.
- Odwołane zajęcia: `node scripts/dziekanat.mjs --kierunki`, tylko komunikaty DOS (bez Teams). Adres sekcji DOS wydziału bierze z bazy
  Skrótu (`nauka_roczniki_lista` → `wydzial.dos_url`), a bez bazy z poprzedniego przebiegu.
  Rocznik z zajęciami w innym budynku ma w konfiguracji pole `dos` (np. FiR: `https://dos.usz.edu.pl/mickiewicza/zajecia-mickiewicza/`) i wtedy
  bierze komunikaty z tej sekcji; lista wpisów działa dla każdej sekcji DOS (`/<budynek>/<lista>/`).
- Parser zna też nazwy z rodzajem, grupą labów i liczbą godzin w nawiasach („MAKROEKONOMIA (ĆW)(30)”, „(LAB GR. A)(15)”):
  rodzaj → `k`, grupa → `g`, godziny → `h`. Dopisek budynku w sali („Cuk.8”, „Mic.64”) znika.
- `scripts/kalendarz.mjs` dokłada kalendarz roku także do `plan/*.json`; `scripts/kierunki.mjs` wstawia listę roczników do `index.html`.
- Pliki do kalendarza w telefonie (`kalendarz/*.ics`) są na razie tylko dla BM; inne roczniki mają osobisty kalendarz w aplikacji.
- **Cały wydział naraz:** `node scripts/wefiz-wszystkie.mjs --na-sucho` (potem bez `--na-sucho`) czyta listę kierunków z formularza uczelni,
  znajduje grupy każdego kierunku i roku (z planu kierunku, a gdy go brak: z listy grup i wspólnych przedmiotów) i zapisuje brakujące
  `kierunki/<id>.json` (te same pola co z skrot-bm; plików ze Skrótu nie rusza). Raport: `docs/wefiz-wszystkie.md`. ≤ 1 zapytanie/s,
  raz w semestrze. `--lata 1` = tylko 1. rok, `--tylko "Logistyka"`, `--odswiez` = nadpisz własne pliki.
  Gdy strona kierunku nie podaje numerów grup, a formularz nie ma ich listy (np. Marketing II st.), skrypt przegląda numery
  `C100–C499` i `M100–M499` (`--skan-litery`, `--skan-zakres`) i przypisuje rok po wspólnych przedmiotach; wynik zostaje
  w `docs/wefiz-grupy.json`, więc do zmiany „Aktualizacja planu” kolejne przebiegi nie pytają uczelni drugi raz (pierwszy: ok. 15 min).
- Ten sam kierunek I i II stopnia (np. Ekonomia) to dwie pozycje na liście kierunków („Ekonomia (II stopień)”).
- Od 8.11.2026 w `kierunki/` są wszystkie lata WEFiZ (73 roczniki, raport `docs/wefiz-wszystkie.md`). Nazwy EN nowych plików
  skrypt bierze z `config/nazwy-en.json`. Kierunek tylko II stopnia (np. Audyt finansowy) `kierunki-1rok.mjs` zapisuje w
  `tylkoIIStopnia`, nie jako „1. rok bez planu”.
- **Inne wydziały US (Etap 2, fundament):** importer wydziału to `scripts/us/<plik>` wskazany polem `importer` w `config/wydzialy-us.json`
  (Etapy 3–5 dokładają je po kolei; bez importera wydział jest pomijany). `node scripts/us/importuj.mjs --wydzial <kod> [--tylko id] [--na-sucho]`,
  a `update-plan.mjs --wszystkie` woła wszystkie (`--bez-us` = tylko WEFiZ). Plan zapisuje `scripts/us/wspolne.mjs → zapiszPlan`
  w tym samym formacie (`time` zamiast `s`, `dates` dla konkretnych dni), z `source` = adres pliku wydziału i `wersja`; przy błędzie
  albo spadku zajęć > 30% zostaje poprzednia wersja. Plany z PDF/AI mają status „czeka na zatwierdzenie” i nie trafiają na stronę.
  `plan/_import.json`: `wydzial`, `zrodlo`, `wersja`, `status` (ok / bez zmian / czeka na zatwierdzenie / błąd), `szczegoly`.
- Strona: krok **Wydział** pojawia się, gdy plany ma więcej niż jeden wydział; adres `#/<wydział bez ogonków>/<kod>/<rok>/<grupa>`
  (np. `#/wnsip/mat/1/1`), kod niestacjonarnych z „n” (`bnn26`). Kierunki z `config/kierunki-us.json` bez planu są na liście
  w grupie „Plan jeszcze niedostępny” (link do planów wydziału i lista oczekujących). `kierunki.mjs` wstawia też blok `US_START/US_END`.
- **WKFiZ (Etap 3):** `scripts/us/wkfiz.mjs` czyta jedno zapytanie `planyzajec-kfz.usz.edu.pl/api/get_schedule.php` (wszystkie zajęcia
  stacjonarne). Grupa aplikacji („WF 1 rok I stopień”) = rocznik z `config/kierunki-us.json`, w planie jedna grupa („WF1”).
  Z nazwy przedmiotu: prawdziwa godzina („8:00-9:30;”), podgrupa („1ćs”, „2lb”, „3ć”, „[4gr]”) → opcjonalne pole `pg`
  (np. `"ćs1"`) i terminy („8.10-25.01.27”, „3,10.11; 1.12”) → `dates`. Na stronie wiersz „Twoje podgrupy” (wybór dla każdego
  rodzaju, zapamiętany dla rocznika); plany bez `pg` (WEFiZ, BM) wyglądają jak dotąd. Grupa „ERASMUS +” jest pomijana.
  Terminy, których nie da się dopasować do dnia tygodnia (błąd w danych uczelni), zostają jako notka.
- **Wydział Humanistyczny (Etap 4, pilot HIST i FA):** `scripts/us/wh-xlsx.mjs` czyta pliki XLSX ze strony wydziału (bez
  zależności: `scripts/us/wspolne.mjs → xlsxArkuszeDane`). Arkusz = rocznik, dzień = pas kolumn pod nagłówkiem dnia, godziny
  z kolumny godzin (albo z tekstu, np. „od 8.15-10.30”), grupa z nagłówka kolumny („GRUPA A”, „1 gr”) albo z tekstu („gr lab A”,
  „grupa ćw 2”, „GRUPA 1a”, „specj. transl.”, nagłówek „SPECJALNOŚĆ …”) → `pg` („lab:A”, „ćw:2”, „spec:translatoryczna”).
  Terminy („od 12.10-16.11”, „I poł. sem. do 30 XI”, „terminy: 01, 08 grudnia”, „oprócz 16.11”) → `dates`. Dopiski
  („zajęcia łączone z …”) idą do notki. Opis układu plików w nagłówku skryptu. Pilot: pole `tylkoKierunki` w
  `config/wydzialy-us.json` (od 8.11.2026 usunięte – importują się wszystkie pliki WH, 85 roczników). Raport pilota: `docs/wh-pilot.md`
  (`node scripts/us/wh-pilot.mjs`, 10 losowych zajęć plik ↔ plan, zrzuty w `docs/wh-pilot/`), kontrola pozostałych plików:
  `docs/wh-kontrola.md` (`--bez-pilota --ile 20`). Jedna komórka bywa kilkoma zajęciami (linia kresek, „ / ” między
  prowadzącymi, dwa „(zajęcia w terminie: …)”) – importer je rozdziela. Lata roczników WH inwentarz bierze z arkuszy pliku.
- **Plany z PDF (Etap 5, WPiA):** `scripts/us/pdf_tekst.py` (PyMuPDF) daje słowa z pozycjami i prostokąty, `scripts/us/wpia-pdf.mjs`
  składa z nich siatkę (dni z linii przy nagłówku, bloki godzin, kolorowe komórki pocięte czarnymi liniami) i zajęcia (skróty
  z „[WP]” i legendy, grupy → `pg`, terminy → `dates`, wyjątki do notki). Wynik **zawsze idzie do kolejki zatwierdzeń**
  (`scripts/us/kolejka.mjs`, baza Skrótu v50 – instrukcja `docs/kolejka-pdf.md`); na stronę trafia dopiero plan zatwierdzony
  w zdawalni.pl → Importy. Pilot: `docs/wpia-pilot.md`. Bez PyMuPDF wydział jest pomijany (workflow: `docs/aktualizacja-planu-us.yml`).
- Komunikaty DOS: grupy C i M, numery 1xx–6xx (wszystkie lata i II stopień); rocznik z grupami „M…” bierze sekcję DOS
  Mickiewicza (także z pliku `kierunki/` bez pola `dos`).
- Codzienny automat przy innych rocznikach niż BM pobiera grupy tylko wtedy, gdy uczelnia zmieniła „Aktualizacja planu”
  albo w pliku brakuje grupy (`--wymus` = zawsze), z przerwą ≥ 1 s między zapytaniami. BM jak dotąd.
- Test: `node --test scripts/*.test.mjs`.
- **1. rok wszystkich kierunków (I st., stacjonarne):** `node scripts/kierunki-1rok.mjs` zapisuje `config/kierunki-1rok.json`
  (id, nazwa w systemie, PL/EN, grupy z podgrupami, czy system ma plan). Kierunki tylko z systemu uczelni, nazwy EN w `config/nazwy-en.json`.
  Odpowiedzi uczelni są w `.cache/efz/` (poza gitem) do zmiany „Aktualizacja planu”, więc kolejny przebieg to jedno zapytanie.
- **Import wszystkich kierunków 1. roku:** `update-plan.mjs --wszystkie` bierze roczniki z `kierunki/*.json` (pierwszeństwo) i z
  `config/kierunki-1rok.json` (`scripts/roczniki.mjs`), więc poranny automat obejmuje wszystkie bez zmian w workflow.
  Przed zapisem: plan niepusty, każda grupa ma zajęcia, liczba zajęć nie spadła o ponad 30%. Inaczej zostaje stara wersja,
  a błąd trafia do logu przebiegu i do `plan/_import.json` (stan każdego rocznika + ostatnie 200 błędów). `--tylko id1,id2` = próba na kilku.
  Odwołane zajęcia: ten sam czytnik DOS; sekcja (Cukrowa / Mickiewicza) z sal w planie („S01”, „N104” = Mickiewicza).
  Sprawdzenie skryptem: `node scripts/sprawdz-plany.mjs`. `scripts/bm-identyczny.test.mjs` porównuje `plan.json` BM ze starego i nowego kodu.
- **Adres każdego planu:** `plan.skrotbm.pl/#/<wydział>/<kierunek>/<rok>/<grupa>`, np. `#/wefiz/zarz/1/c151` (hash, więc bez `404.html`).
  Adres w pasku zmienia się razem z wyborem; wybór (rocznik, grupa, podgrupa) zostaje na urządzeniu. Stare linki `?k=zarz26` działają
  i przechodzą na nowy adres. BM otwarty bez `#/…` zostaje pod czystym `plan.skrotbm.pl`, jak dotąd. Testy tras: `scripts/adresy.test.mjs`.
- **Workflow do podmiany ręcznie:** `docs/aktualizacja-planu-kierunki.yml` to nowa wersja `.github/workflows/aktualizacja-planu.yml` (kroki dla roczników, publikacja `plan/`). Token automatu nie może zmieniać workflow, więc wklej go na github.com (Edit file → wklej → Commit). Bez tego plan Zarządzania nie odświeża się sam i nie trafia na stronę.

## Plan w kalendarzu telefonu

Przycisk „Dodaj plan do kalendarza w telefonie” daje link do subskrypcji w Google, Apple albo Outlooku.
Pliki `kalendarz/GRUPA-PODGRUPA.ics` (np. `C112-A.ics`, a `C112.ics` to obie podgrupy) robi `scripts/ics.mjs`
przy każdym przebiegu automatu, więc zmiana planu albo `kalendarz.json` trafia też do kalendarzy studentów.

## Ręczne sprawdzenie

Zakładka **Actions** → **Aktualizacja planu zajęć** → **Run workflow**.

## Co trzeba zmienić ręcznie

- **Kalendarz roku** (tygodnie parzyste i nieparzyste, dni wolne, dni zamienne, przerwy i sesje) jest w `kalendarz.json`.
  Po zapisaniu zmian automat dołącza go do `plan.json` (pole `kalendarz`), z którego korzystają plan.skrotbm.pl i skrotbm.pl.
  Na semestr letni dopisz tygodnie do `tygodnie` i popraw ostatni wpis w `okresy`.
- **Inne grupy:** lista grup jest w `CANDIDATES` w `scripts/update-plan.mjs`.
