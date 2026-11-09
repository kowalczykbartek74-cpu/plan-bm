# Plan całego US – lista dla Bartka (klik po kliku)

Stan 9.11.2026: Etapy 0–8 są na gałęzi **`us/etap-8`** w plan-bm (scalonej z dzisiejszym `main`, plan.zdawalni.pl) i na gałęzi **`importy/plan-bm-automat`** w skrot-bm. Nic nie jest wypchnięte. Kolejność poniżej ma znaczenie: kolejka zatwierdzeń (skrot-bm) musi działać, zanim workflow plan-bm zacznie wysyłać szkice.

## A. skrot-bm (kolejka zatwierdzeń planów z PDF)

1. **Gałąź `importy/plan-bm-automat`** (3 commity: v50, profile WNS/WNSiP, profil WT; scala się z `main` bez konfliktów) → wypchnij i scal (albo powiedz mi „wypchnij importy/plan-bm-automat i otwórz PR”). Po scaleniu zdawalni.pl ma profile WPiA, WNS, WNSiP, WT w panelu Importy.
2. **SQL**: Supabase → SQL Editor → wklej `supabase/skrot-v50-importy-automat.sql` (na github.com przycisk *Copy raw file*) → **Run** → na dole „OK v50: szkice planów z plan-bm…”.
   - Na `main` jest też **inny** plik z numerem v50: `skrot-v50-plan-zdawalni.sql` (przeniesienie planu na plan.zdawalni.pl). To niezależne pliki – jeśli tamten był już uruchomiony, nic z nim nie rób.
3. **Token automatu** (raz): w tym samym pliku na dole sekcja „4) token automatu” – odkomentuj 4 linie `-- with t as …`, **Run**, skopiuj wartość `token` z wyniku, zakomentuj z powrotem (nie zapisuj tokenu nigdzie indziej).
4. **Funkcja Edge `importy`**: Supabase → Edge Functions → `importy` → plik `logika.js` → podmień na `supabase/functions/importy/logika.js` z gałęzi (daty i podgrupy w eksporcie planu) → **Deploy updates**. `index.ts` i `obsluga.ts` bez zmian.

## B. plan-bm (GitHub `kowalczykbartek74-cpu/plan-bm`)

5. **Sekret**: GitHub → plan-bm → Settings → Secrets and variables → Actions → **New repository secret** → nazwa `PLAN_IMPORT_TOKEN`, wartość = token z kroku 3.
6. **Gałąź `us/etap-8`** → wypchnij i scal do `main` (albo powiedz mi „wypchnij us/etap-8 i otwórz PR”). Automat dopisuje do `main` codziennie nowe dane – jeśli GitHub pokaże konflikt w `plan/*.json` albo `plan/_import.json`, weź wersję z `main` (dane i tak odświeżają się przy każdym przebiegu).
7. **Workflow** (mój token nie może zmieniać plików w `.github/workflows/`): GitHub → plan-bm → `.github/workflows/aktualizacja-planu.yml` → ołówek ✎ → zaznacz wszystko → wklej całą zawartość `docs/aktualizacja-planu-us.yml` (z gałęzi, *Raw*) → **Commit changes**. Zmiany względem obecnego: PyMuPDF (plany z PDF), dłuższe limity czasu (WEFiZ nst, DOS), `PLAN_IMPORT_TOKEN`, kroki „Mapa strony” i „Stan planów”, publikacja `stan.html`, `sitemap.xml`, `robots.txt`.
8. **Pierwszy przebieg**: Actions → „Aktualizacja planu zajęć” → **Run workflow**. Potrwa ok. 30–60 min (pierwszy raz pobiera wszystko, 1 zapytanie/s; WEFiZ niestacjonarne ok. 210 stron, DOS ok. 450 wpisów). Kroki z importem mogą być żółte („continue-on-error”) – ważne, żeby „Zapisz nową wersję” i „opublikuj” były zielone.

## C. Plany z PDF – publikacja od razu (decyzja 9.11.2026)

9. WNS, WNŚiP, WPiA i WT mają w `config/wydzialy-us.json` `"publikacja": "od razu"`: plan z parsera trafia na stronę przy przebiegu, a szkic **i tak** idzie do panelu zdawalni.pl → Importy (170 szkiców). Panel służy teraz do poprawek: zatwierdzona wersja szkicu dla tego samego pliku PDF wygrywa z parserem przy następnym przebiegu.
10. Powrót do zatwierdzania przed publikacją: usuń `"publikacja": "od razu"` przy wydziale (plany już opublikowane zostają, nowe wersje czekają na panel).
11. Przed publikacją nazwy zajęć przechodzą porządki (`scripts/us/porzadki.mjs`): godziny, adresy stron i dopiski z nazwy → notka, WIELKIE LITERY → zdanie, rodzaj z początku nazwy („Seminarium…”, „Język…”), resztki komórek (sam prowadzący przy innych zajęciach) usunięte.

## D. Co sprawdzić na żywej stronie (po kroku 8)

11. `plan.zdawalni.pl/stan.html` – podsumowanie: na stronie wszystkie 393 roczniki (WEFiZ 104, WKFiZ 25 z Erasmus+, WH 94, WPiA 33, WNŚiP 38, WNS 89, WT 10), błędów 0; kolumna „Ostatni import” z dzisiejszą datą.
12. Kilka roczników na telefonie i komputerze, PL i EN (przełącznik języka):
    - `plan.zdawalni.pl/?k=fan26` – Filologia angielska niestacjonarne 1. rok: zjazd 6–8.11 (piątek–niedziela), poprzedni tydzień „‹”;
    - `?k=firn26` – FiR niestacjonarne (podgrupy lab A/B), `?k=wfn26` – WF niestacjonarne;
    - `?k=hist26`, `?k=fa26` – WH stacjonarne; BM (`plan.zdawalni.pl`) – bez zmian.
13. `plan.zdawalni.pl/sitemap.xml` (391 adresów) i `/robots.txt`. Opcjonalnie: Google Search Console → plan.zdawalni.pl → Mapy witryn → dodaj `sitemap.xml`.
14. Mail z GitHuba (issue) o komunikatach dziekanatu przychodzi tylko dla BM – roczniki US mają odwołania na stronie, bez maili (decyzja niżej).

## E. Na semestr letni

15. Instrukcja: `docs/semestr-letni.md` (kalendarz.json z tygodniami lata, inwentarz, `PLAN_TERAZ=2027-03-01 … --na-sucho`, kolejka). Najlepiej w ostatnim tygodniu lutego.

## F. Decyzje podjęte 9.11.2026 (domyślne – zmień, jeśli chcesz inaczej)

1. Kody kierunków PEDSP, FRZJO, ADM, BIOTEC – zostają (adresy stron roczników już ich używają).
2. Sale „…H” w Psychologii (WNS) i sale WT – zapis jak w pliku wydziału, bez dopisanego adresu.
3. Teologia – studia jednolite (stopień 0).
4. Komunikaty DOS dla roczników US – tylko na stronie, bez maili; dopasowania o niskiej pewności – tylko notka przy dniu.
5. WEFiZ niestacjonarne – przy każdym porannym przebiegu (cały przebieg 9.11 trwał ok. 18 min, limit 50).
6. Kody MS Teams w notkach – zostają (publiczne na stronach wydziałów).
7. Lektoraty FG – trzy pozycje całego roku (plik nie mówi, kto chodzi na który).
8. Wykłady ogólnouczelniane i WF – zostają w planie rocznika tam, gdzie wydział je wpisał (z porządkami nazw); osobna lista „dodaj swoje zajęcia” – później.
9. Plany z PDF – publikacja od razu (sekcja C).
10. Kierunki bez planów na stronach wydziałów (Ochrona środowiska, Ochrona i inżynieria środowiska przyrodniczego, Menedżer dziedzictwa kulturowego, Studia anglistyczno-slawistyczne, Green Economy) – pojawią się same, gdy wydział opublikuje plik (inwentarz). „Germanistyczno-polonistyczne wspólne studia nauczycielskie” z oferty = P_GWSN („Polonistyczno-germanistyczne…” w plikach WH) – jest na stronie pod nazwą z pliku.
