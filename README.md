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

Automat rozpoznaje prowadzącego po nazwisku, a dni i godziny po zwykłych sformułowaniach dziekanatu
(„Dnia 23.10.2026 zostają odwołane zajęcia z dr …”, „Termin odrobienia: 19.11.2026, godz. 10:00, sala 002”).
Gdy strona dziekanatu nie odpowiada, plan zostaje z ostatnio odczytanymi komunikatami.

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
