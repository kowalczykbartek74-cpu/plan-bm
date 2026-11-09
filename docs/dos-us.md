# Odwołane zajęcia ze wszystkich sekcji DOS (Etap 6)

`node scripts/dziekanat.mjs --kierunki` czyta komunikaty Działu Obsługi Studenta dla:
- **BM**, który ma osobne uruchomienie i działa bez zmian;
- **roczników WEFiZ** z `kierunki/` (Cukrowa, Mickiewicza);
- **wszystkich roczników US z planem w `plan/<id>.json`**: sekcja DOS wydziału z `config/zrodla-us.json`, lista roczników w `scripts/us/dos-dopasuj.mjs` → `rocznikiUS()`.

Sprawdzenie bez zapisu: `node scripts/dziekanat.mjs --kierunki --na-sucho`.

| Sekcja DOS | Wydział | Wpisów od 09.2026 | Co w nich jest |
|---|---|---|---|
| cukrowa, mickiewicza | WEFiZ | ok. 160 + 76 | „GRUPA C111”, „M150, M151” (jak dotąd) |
| piastow/zajecia-piastow | WH | 73 | połowa to **formularze nieobecności** (dokładne), reszta: prowadzący w tytule |
| krakowska | WNS | 54 | prowadzący w tytule, czasem „kier. psychologia, 3 rok”, formularze |
| waska | WNŚiP | 48 | „Geologia I st. 1 rok – odwołane … w dniu 4.11”, też po angielsku |
| narutowicza | WPiA | 124 | „SSP IV – …”, „SSA I st. II r. – …”, „(gr. 3, 5, 9)” |
| teologia | WT | 0 (ostatni: marzec 2026) | prowadzący w tytule |
| piastow/zajecia-piastow-wkfiz | WKFiZ | 0 | lista pokazuje głównie wykłady ogólnouczelniane z Wąskiej |

## Jak wpis trafia do rocznika

1. **Formularz nieobecności** (tabela „Lp. Z dnia Z godziny Na dzień…” i „Kierunek studiów Forma studiów Stopień Rok Przedmiot…”).
   - Każda pozycja podaje kierunek, tryb, stopień, rok, przedmiot, dzień, godzinę i termin odrabiania z salą.
   - Pozycja trafia do rocznika o tej samej nazwie kierunku, stopniu i roku. Odwołują się zajęcia o tej godzinie, a gdy jest ich kilka, wybór zawęża się po przedmiocie, potem po prowadzącym z tytułu, potem po rodzaju.
   - Gdy dalej jest niejasne, zostaje tylko notka.
2. **Wysoka pewność:** w tytule jest kierunek (nazwa albo skrót, dla WPiA też `dosSkroty` z `config/wydzialy-us.json`) i rok, a stopień, gdy podany, się zgadza.
   - Odczyt jak w BM: odwołanie zajęć tego dnia (zawężone po prowadzącym, przedmiocie, godzinie i grupie z tytułu) oraz odrabianie.
   - Odrabianie z kilkoma różnymi godzinami („grupa 1 – 8.15, grupa 2 – 13.30”) nie jest zgadywane.
3. **Niska pewność:** w tytule jest tylko prowadzący z planu, albo kierunek bez roku.
   - Pod dniem pojawia się **tylko notka z oryginałem wpisu** i odnośnikiem. Dzieje się to wyłącznie w dni, w które rocznik ma zajęcia tego prowadzącego.
   - Zajęcia nie są zgadywane.
4. **Pominięte:** „niestacjonarne”, przedrostki N… z WPiA (NSP, NSA, NPSM) i wpisy podające inny rok albo skrót innego kierunku wydziału.

Daty bez roku („4.11”, „30.X”, „5th of November”) i angielskie „cancelled” / „will not take place” są czytane tylko dla roczników US. BM i WEFiZ czytają daty jak dotąd.

## Grzeczność wobec uczelni

- Najwyżej 1 zapytanie na sekundę, User-Agent z adresem skrotbm@outlook.com.
- Treść wpisów zapisuje się w `plan/_dos-wpisy.json`. Co godzinę pobierane są tylko listy (ok. 5 stron na sekcję) i nowe wpisy, a znane wpisy odświeżają się raz na dobę.
- Pierwszy przebieg czyta ok. 450 wpisów, czyli kilka minut (limit kroku w workflow: 25 min).
- Roczniki US nie wysyłają maila („Powiadom o nowych komunikatach”), bo komunikaty są tylko na stronie.
