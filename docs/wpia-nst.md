# WPiA – studia niestacjonarne (Etap 7)

Źródło: [wpia.usz.edu.pl/rozklady-zajec](https://wpia.usz.edu.pl/rozklady-zajec/) – 11 PDF-ów (plik na rocznik): Prawo jm I–V (`I-NSP-8.pdf` …), Administracja I st. I–III i II st. I, Prawo służb mundurowych I st. I i III. Parser: `scripts/us/wpia-nst.mjs` (wołany z `wpia-pdf.mjs → importuj`), testy: `scripts/us-wpia-nst.test.mjs`.

Układ: jedna strona, trzy pasy jeden pod drugim – PIĄTEK, SOBOTA, NIEDZIELA. W pasie kolumna = jeden zjazd (data w nagłówku), wiersze = bloki 45 min. Komórki czytamy jak w planach stacjonarnych (kolorowe prostokąty cięte liniami, tekst: nazwa, „(NN godz.)”, prowadzący, „godz. …”, sala).

| Rocznik | Pozycji w szkicu |
|---|---|
| Prawo jm 1 / 2 / 3 / 4 / 5 | 92 / 112 / 103 / 111 / 46 |
| Administracja I st. 1 / 2 / 3 | 45 / 55 / 47 |
| Administracja II st. 1 | 45 |
| Prawo służb mundurowych I st. 1 / 3 | 54 / 52 |

Zasady:
- Data zajęć = data kolumny; te same zajęcia w kilku zjazdach = jeden wpis z listą `dates`.
- Rodzaj: komórka ze skrótem w nawiasie kwadratowym („Wstęp do prawoznawstwa [WP] (25 godz.)”) = wykład; „WP 3 (15 godz.)”, „K 1” = ćwiczenia do tego wykładu, grupa w `pg` („Wstęp do prawoznawstwa:3”). Bez oznaczenia – X (jak w trybie stacjonarnym).
- „[zajęcia hybrydowe]”, „MS TEAMS: kod”, „(wykaz wykładów … https://…)” → notka; „[e-zajęcia]” → sala „online (MS Teams)”.
- **Kolejka**: jak każdy PDF – szkic idzie do panelu Importy (profil WPiA), na stronę dopiero po zatwierdzeniu. Szkic z parsera ma daty (v50).
- Profil AI `importy/WPiA.json` opisuje układ stacjonarny (dni w kolumnach) – ręczne wgranie PDF-u niestacjonarnego do szkicu AI da zły szkic; niestacjonarne obsługuje parser.
