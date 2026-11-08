# Plany z PDF przez kolejkę zatwierdzeń (Etap 5) – co zrobić klik po kliku

Plany wydziałów publikowane jako PDF (najpierw WPiA) czyta parser plan-bm. **Nic z parsera nie trafia na stronę bez Twojego
zatwierdzenia** w zdawalni.pl → Narzędzia starosty → Importy. Przy kolejnej wersji pliku pozycje bez zmian są od razu
„tak”, więc sprawdzasz tylko różnice. Dopóki nie zrobisz kroków 1–4, automat liczy szkice, ale nigdzie ich nie wysyła.

## 1. Skrót (repo skrot-bm, gałąź `importy/plan-bm-automat`)

Zmiany: eksport planu z datami i podgrupami (`importy.js`), profil `importy/WPiA.json`, SQL `supabase/skrot-v50-importy-automat.sql`.
Scal gałąź do `main` i wdroż stronę jak zwykle (zdawalni.pl). Funkcji Edge nie trzeba wdrażać od nowa (szkice z parsera jej nie używają).

## 2. SQL v50

Supabase → SQL Editor → otwórz `supabase/skrot-v50-importy-automat.sql` na github.com → „Copy raw file” → wklej → Run.
Na dole ma być komunikat „OK v50”.

## 3. Token automatu

W tym samym pliku na dole jest zakomentowany blok „token automatu”. Wklej go w SQL Editor **bez** `--` na początku linii → Run.
Wynik to jedna wartość `token` (64 znaki). Skopiuj ją (to jedyny raz, kiedy ją widać – baza trzyma tylko skrót).

GitHub → repo **plan-bm** → Settings → Secrets and variables → Actions → New repository secret →
Name: `PLAN_IMPORT_TOKEN`, Secret: wklejony token → Add secret.

## 4. Workflow z PyMuPDF i tokenem

GitHub → plan-bm → plik `.github/workflows/aktualizacja-planu.yml` → ołówek (Edit) → zaznacz wszystko → wklej treść
`docs/aktualizacja-planu-us.yml` (Raw → kopiuj) → Commit changes. Różnica: krok `pip install pymupdf==1.28.2`, sekret
`PLAN_IMPORT_TOKEN` dla kroku roczników, limit czasu 30 min. Bez tego WPiA jest pomijany (bez błędu).

## 5. Zatwierdzanie

Po najbliższym przebiegu (rano albo Actions → „Aktualizacja planu zajęć” → Run workflow) w Importach pojawi się 22 szkiców WPiA
(Prawo 1–5, Administracja, PSM, IEBL, Ekonomiczno-prawny), stan „do sprawdzenia”, opis np. „Prawo, jm 1. rok – parser plan-bm”.
Każda pozycja = jedne zajęcia (grupa, dzień, godziny, przedmiot, podgrupa, prowadzący, sala, daty). Tak / Popraw / Nie,
a na końcu „Zatwierdź”. Następny przebieg wstawi zatwierdzony plan na stronę.

Kiedy wydział podmieni PDF: nowy szkic zastępuje stary niezatwierdzony; na stronie zostaje ostatnia zatwierdzona wersja.

Sprawdzenie bez sieci: `node scripts/us/importuj.mjs --wydzial wpia --na-sucho` (szkice w `.cache/us/szkice/`),
porównanie z PDF-em: `docs/wpia-pilot.md` (`node scripts/us/wpia-pilot.mjs`).
