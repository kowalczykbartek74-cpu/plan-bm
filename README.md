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

## Ręczne sprawdzenie

Zakładka **Actions** → **Aktualizacja planu zajęć** → **Run workflow**.

## Co trzeba zmienić ręcznie

- **Nowy semestr:** podział na tygodnie parzyste i nieparzyste (`RANGES`, `OFF`, `SWAP` w `index.html`)
  pochodzi z harmonogramu wydziału na semestr zimowy 2026/27. Na semestr letni trzeba go podmienić.
- **Inne grupy:** lista grup jest w `CANDIDATES` w `scripts/update-plan.mjs`.
