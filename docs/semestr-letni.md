# Semestr letni – co zrobić, gdy wydziały opublikują plany

Semestr letni 2026/27: zajęcia **1.03–27.06.2027** (WH: zjazdy od 12.03, harmonogram zjazdów obejmuje oba semestry). Wydziały publikują plany zwykle w ostatnich tygodniach lutego, często pod **nowymi nazwami plików** („…semestr-letni-2026_2027…”). Strona i importery same przechodzą na lato, gdy w `kalendarz.json` są tygodnie lata – reszta poniżej to sprawdzenie, że nic się nie rozjechało.

## 1. Kalendarz roku (raz, przed przełączeniem)

1. W `kalendarz.json` dopisz tygodnie lata do listy `tygodnie` (format jak zimą: `["2027-03-01", "2027-03-05", "odd"]`), dni wolne lata do `wolne` (np. 3.05, Boże Ciało), a w `okresy` usuń wpis „Semestr letni: plan tygodni pojawi się…” i dopisz przerwę wielkanocną.
2. Sprawdzenie: `node scripts/kalendarz.mjs` (błąd = zły format). Od tej chwili:
   - `semestrZKalendarza()` zwraca semestr **letni**, gdy zimowy skończył się ponad 3 tygodnie temu (w praktyce od ok. 22 lutego);
   - importery zapisują `"semestr": "letni"`, daty „co tydzień” liczą w tygodniach lata, WH bierze zjazdy letnie z harmonogramu;
   - z dwóch plików tego samego kierunku obowiązuje ten z bieżącym semestrem w nazwie (`scripts/us/zrodla.mjs → obowiazujace`).

## 2. Nowe nazwy plików → inwentarz

```bash
node scripts/us/inwentarz.mjs
```

Pobiera strony wydziałów (1 zapytanie/s) i zapisuje `config/zrodla-us.json`, `config/kierunki-us.json`, `docs/inwentarz-us.md`. Przejrzyj w `docs/inwentarz-us.md`:
- **pytania** na końcu – nowy skrót w nazwie pliku, kierunek spoza oferty, nieznana etykieta kolumny WNS (`config/wydzialy-us.json → wns.nstEtykiety`);
- liczby roczników na wydział – powinny zostać takie jak zimą (te same roczniki, nowe pliki). Id roczników się nie zmieniają, więc adresy na stronie i subskrypcje kalendarzy działają dalej.

## 3. Przebieg na sucho (nic nie zapisuje)

```bash
PLAN_TERAZ=2027-03-01 node scripts/us/importuj.mjs --wszystkie --na-sucho
```

`PLAN_TERAZ` udaje dzień – można to zrobić jeszcze w lutym, zanim semestr się zacznie. Szukaj w wyniku:
- **błąd „… dni poza semestrem letni … plik z innego semestru?”** – pod nową nazwą jest stary plik (albo wydział jeszcze nie podmienił treści). Plan na stronie zostaje zimowy aż do poprawnego pliku – to celowe („zły plan gorszy niż brak planu”);
- **„brak rocznika … w config/kierunki-us.json”** – inwentarz nie znalazł rocznika w nowym pliku (np. wydział połączył roczniki w jednym pliku inaczej niż zimą) – popraw nazwę/skrót w `config/` albo dopisz pytanie;
- spadek liczby zajęć o ponad 30% – `zapiszPlan` i tak go nie zapisze bez sprawdzenia.

Potem `node scripts/sprawdz-plany.mjs` – kod 1 = któryś plan ma błąd (opis w tabeli).

## 4. Kolejka zatwierdzeń (plany z PDF: WPiA, WNS, WNŚiP, WT)

Nowy plik PDF = nowy szkic w panelu **zdawalni.pl → Narzędzia starosty → Importy** (profil wydziału). Plan letni to w praktyce nowy plan – prawie wszystkie pozycje będą „do decyzji”. Do czasu zatwierdzenia na stronie zostaje zatwierdzony plan zimowy (z datami zimowymi nie pokaże nic w tygodniach lata – strona napisze „brak zajęć”).
- WT (skany): nowy skan = nowy odczyt AI – wgraj PDF w Importy (profil WT) albo dodaj `odczyty/wt/<plik>.json`.
- WNS niestacjonarne: plik na zjazd – każdy kolejny zjazd lata to nowa wersja szkicu tego samego rocznika.

## 5. Po przełączeniu

- `node scripts/stan-planow.mjs` → `stan.html` / `docs/stan-planow.md`: czy każdy rocznik ma „ostatni udany import” z ostatnich dni.
- Strona: wybierz 2–3 roczniki z różnych wydziałów, tydzień 1–5.03 – zajęcia letnie, bez zimowych.
- Kalendarze `.ics` zaktualizują się same przy następnym przebiegu workflow (`scripts/ics.mjs`).

## Próba generalna (atrapa)

`scripts/us-semestr-letni.test.mjs` (w `node --test scripts/*.test.mjs`): strona WH z plikami zimowymi i „letnimi” (nowe nazwy), `kalendarz.json` z tygodniami lata, import bez sieci przy `PLAN_TERAZ=2027-03-01`:
- obowiązuje plik letni, zimowy jest pominięty (zimą odwrotnie);
- plan Historii z letniego pliku ma `semestr: letni`, rok akademicki 2026/2027;
- plik niestacjonarny FA z datami zimowymi pod letnią nazwą → 5 roczników z błędem „poza semestrem letni”, plany na stronie bez zmian.
