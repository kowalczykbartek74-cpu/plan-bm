# WH – studia niestacjonarne (Etap 7)

Źródło: [hum.usz.edu.pl → plany zajęć, studia niestacjonarne](https://hum.usz.edu.pl/studenci/plany-zajec-studia-niestacjonarne/) – 4 pliki XLSX (FA, FG, FGzJA, FH) i PDF „Harmonogram zjazdów … r.a. 26_27”. Parser: `scripts/us/wh-nst.mjs` (wołany z `wh-xlsx.mjs → importuj`), testy: `scripts/us-wh-nst.test.mjs`.

| Plik | Układ | Roczniki | Zajęć w planie |
|---|---|---|---|
| FA I i II st. | arkusz = zjazd (9), kolumny = roczniki („ROK I”, „ROK I ST. II”), grupy z tekstu („I/1 (lab)” = lab:1) | I st. 1–3, II st. 1–2 | 264 / 280 / 178 / 108 / 134 |
| FG I st. | arkusz = rocznik, zjazdy w pasach po 4 kolumny, wiersz = 90 min | I st. 2 | 114 |
| FGzJA I st. | jak FG | I st. 1 | 108 |
| FH I st. | arkusz = rocznik, pasy po 2 kolumny (podgrupy A/B), wiersz = 45 min | I st. 1–2 | 100 / 82 |

Zasady:
- **Daty**: każdy wpis ma `dates` (dni zjazdu). Numer zjazdu → piątek–niedziela z harmonogramu; daty z arkuszy są z nim sprawdzane. Rocznik, którego ponad połowa dni nie leży w zjazdach, nie jest zapisywany (zostaje poprzednia wersja) – tak odpada pusty arkusz „III rok” w FH (daty z 2025 r., bez zajęć).
- **e-zajęcia**: zjazdy IV i VIII są w formie e-zajęć (harmonogram) → sala „e-zajęcia”; kody Teams z komórek idą do notki („kod Teams: …”), bo są publiczne na stronie wydziału.
- **Grupy**: FA – lab:1–4, ćw:1/1a/1b/2/2c/2d/3, spec:nauczycielska / spec:translatoryczna (jak w trybie stacjonarnym); FH – gr:A / gr:B (nagłówek tylko pod piątkiem obowiązuje cały pas zjazdu); FG/FGzJA – bez podgrup (specjalność translatorska jako spec:translatoryczna).
- Komórka z kilkoma zajęciami rozdzielonymi kreskami (lektoraty FG) = osobne wpisy z tą samą godziną.
- „nie planować”, „nie rezerwować”, „UWAGA kody…” – pomijane; „DZIEŃ ADAPTACYJNY …” – jeden wpis „Spotkanie organizacyjne” z pełnym tekstem w notce.
