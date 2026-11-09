# WNS – studia niestacjonarne (Etap 7)

Źródło: [nsp.usz.edu.pl → plany zajęć, studia niestacjonarne](https://nsp.usz.edu.pl/studenci/plany-zajec-studia-niestacjonarne/) – PDF na **zjazd** (9.11.2026: 38 plików, zjazdy 1–6 bezpieczeństwa i 1–5 pedagogiki). Plan rocznika = suma wszystkich opublikowanych zjazdów; nowy plik zjazdu = nowa wersja szkicu (pozycje bez zmian mają od razu „tak”). Parser: `scripts/us/wns-nst.mjs` (wołany z `wns-pdf.mjs → importuj`), testy: `scripts/us-wns-nst.test.mjs`.

Układy:
- **A – BN, BW, MIPiPR**: tytuł „ZJAZD 1 09 - 11.10. 2026 r.” (daty), pas dnia = komórka z nazwą dnia z lewej, kolumny „BN I° 1 rok”, „BW II° 2 rok”; niedziela zwykle na 2. stronie.
- **B – Pedagogika/Praca socjalna, RESO, PPiW, Pedagogika specjalna**: kolumny „ped 1”, „ps 3”, „reso 1 II st”, „ppiw4”, „pedspec jm 3”; dla każdego dnia wiersz dat w kolumnach (data bywa różna w kolumnach).
- Komórki i ich tekst – jak w planach stacjonarnych WNS (`komorki`, `czesciKomorki`, `zajeciaZCzesci`); komórka przez kilka kolumn = zajęcia każdego z tych roczników.
- Etykieta kolumny → kierunek: `config/wydzialy-us.json → wns.nstEtykiety` (nowa etykieta = pytanie w inwentarzu).

27 roczników (inwentarz liczy je z nagłówków kolumn): BN I st. 1–3, BW I st. 1–3 i II st. 1–2, MIPiPR I st. 1–3, Pedagogika I st. 1–2, Praca socjalna I st. 3, RESO I st. 1–3 i II st. 1, PPiW jm 1–5, Pedagogika specjalna jm 1, 3, 4, 5. Szkice 13–46 pozycji, wszystkie z datami; „kod zespołu: …” → notka „kod MS Teams”, sala „online (MS Teams)”. Na stronę dopiero po zatwierdzeniu w panelu Importy (profil WNS).
