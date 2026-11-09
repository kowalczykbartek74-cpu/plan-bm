# Inwentarz źródeł planów US

Wygenerowane 2026-11-09: `node scripts/us/inwentarz.mjs`. Dane: `config/zrodla-us.json`, `config/kierunki-us.json`.

Oferta rekrutacji US 2026/27 (kandydaci.usz.edu.pl): 75 kierunków I st. i jednolitych, 55 II st.

## Podsumowanie

| Wydział | Kierunki | Kierunek×stopień | Roczniki z planem (st) | Roczniki z planem (nst) | Źródła planów | Format |
|---|---|---|---|---|---|---|
| WEFiZ | 24 | 32 | 17 | 31 | 32 | html |
| WKFiZ | 4 | 7 | 18 | 6 | 24 | json, html |
| WH | 28 | 41 | 85 | 2 | 32 | xlsx |
| WNS | 16 | 23 | 62 | 0 | 72 | pdf |
| WNŚiP | 16 | 20 | 38 | 0 | 38 | pdf |
| WPiA | 5 | 8 | 22 | 11 | 33 | pdf |
| WT | 2 | 3 | 10 | 0 | 2 | pdf |

„Roczniki z planem” = kierunek × stopień × rok, dla którego źródło wprost podaje rok. Pliki „I i II st.” (WH) i plany bez roku (WT) liczą się dopiero po odczycie treści (Etap 4/5).

## WEFiZ – Wydział Ekonomii, Finansów i Zarządzania

Strony: [st](https://planyzajec-efz.usz.edu.pl/plan), [nst](https://efz.usz.edu.pl/studenci/plany-zajec-studia-niestacjonarne/). DOS: [cukrowa](https://dos.usz.edu.pl/cukrowa/zajecia-cukrowa/), [mickiewicza](https://dos.usz.edu.pl/mickiewicza/zajecia-mickiewicza/).

| Kierunek | Kod | Skróty w źródłach | Oferta 2026/27 | Stopnie w źródłach | Tryby | Lata z planem | Uwagi |
|---|---|---|---|---|---|---|---|
| Audyt finansowy | `AF` | AF | II nst/st | II | nst, st | nst II: 1,2 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy AF-NII.26-1, AF-NII.26-1, AF-NII.26-1 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf; niestacjonarne: grupy AF-NII.25-2, AF-NII.25-2, AF-NII.25-2 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf |
| Business Intelligence w gospodarce | `BIWG` | BIwG | I/jm st | I | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Business Management | `BM` | BM | I/jm+II st | I, II | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Data Science | `DS` | DS, DAT | II nst/st | II | nst, st | nst II: 1,2 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy DAT-NII.26-1, DAT-NII.26-1, DAT-NII.26-1 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf; niestacjonarne: grupy DAT-NII.25-2, DAT-NII.25-2, DAT-NII.25-2 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf |
| Economics and IT Applications | `EAIA` | EaIA | I/jm st | I | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Ekonomia | `EK` | Ek, E | I/jm+II nst/st | I, II | nst, st | st I: 1 · nst I: 1,2,3 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy E-NI.26-1, E-NI.26-1 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf; niestacjonarne: grupy E-NI.25-2, E-NI.25-2 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf; niestacjonarne: grupy E-NI.24-3, E-NI.24-3 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf |
| Ekonomiczno-prawny | `EP` | E-P | I/jm+II st | I, II | st | ? | system planów WEFiZ: 1. rok I st. bez planu; system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Finanse i rachunkowość | `FIR` | FiR | I/jm+II nst/st | I, II | nst, st | st I: 1 · nst I: 1,2,3; II: 1,2 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy FiR-NI.26-1, FiR-NI.26-1, FiR-NI.26-1 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf; niestacjonarne: grupy FiR-NI.25-2, FiR-NI.25-2, FiR-NI.25-2 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf; niestacjonarne: grupy FiR-NI.24-3, FiR-NI.24-3 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf; niestacjonarne: grupy FiR-NII.25-2, FiR-NII.25-2, FiR-NII.25-2 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf; niestacjonarne: grupy FiR-NII.26-1, FiR-NII.26-1 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf |
| Gospodarka nieruchomościami | `GN` | GN | I/jm st | I | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Gospodarka przestrzenna | `GPI` | GPi | I/jm st | I | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Green Economy - zielona gospodarka | `GE` | GE | — | ? | st | ? | nazwa tylko ze strony planów (brak w ofercie rekrutacji 2026/27); system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Informatyka i ekonometria | `IIE` | IiE | I/jm nst/st | I | nst, st | st I: 1 · nst I: 1,3 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy IiE-NI.26-1, IiE-NI.26-1 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf; niestacjonarne: grupy IiE-NI.24-3, IiE-NI.24-3 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf |
| Informatyka w biznesie | `IWB` | IwB | I/jm+II st | I, II | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Komunikacja i psychologia w biznesie | `KIPB` | KiPB | I/jm+II st | I, II | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Logistyka | `LOG` | L | I/jm+II nst/st | I, II | nst, st | st I: 1 · nst I: 1,2,3; II: 1,2 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy L-NI.26-1, L-NI.26-1 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy L-NI.25-2, L-NI.25-2 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy L-NI.24-3, L-NI.24-3 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy L-NII.26-1, L-NII.26-1 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy L-NII.26-2, L-NII.26-2 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf |
| Logistyka inż. | `LI` | Li | I/jm nst/st | I | nst, st | st I: 1 · nst I: 1,2,3,4 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy Li-NI.26-1, Li-NI.26-1 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy Li-NI.25-2, Li-NI.25-2 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy Li-NI.24-3, Li-NI.24-3 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy Li-NI.23-4, Li-NI.23-4 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf |
| Marketing | `MKT` | M, MAR | II nst/st | II | nst, st | nst II: 1,2 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy MAR-NII.26-1, MAR-NII.26-1, MAR-NII.26-1 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy MAR-NII.25-2, MAR-NII.25-2 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf |
| Międzynarodowy biznes turystyczny | `MBT` | MBT | II nst/st | II | st | ? | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Przedsiębiorczość i inwestycje | `PII` | PiI | I/jm st | I | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Rynek nieruchomości | `RN` | RN | II st | II | st | ? | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Turystyka i rekreacja | `TIR` | TiR | I/jm nst/st | I | nst, st | st I: 1 · nst I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy TiR-NI.26-1, TiR-NI.26-1 w Wykaz_grup_Kampus_Mickiewicza_NZ.pdf |
| Zarządzanie | `ZARZ` | Z | I/jm+II nst/st | I, II | nst, st | st I: 1 · nst I: 1,2,3; II: 1,2 | system planów WEFiZ (lata 2+ / II st.: Etap 1); niestacjonarne: grupy Z-NI.26-1, Z-NI.26-1, Z-NI.26-1 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy Z-NI.25-2, Z-NI.25-2 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy Z-NI.24-3, Z-NI.24-3 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy Z-NII.26-1, Z-NII.26-1 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf; niestacjonarne: grupy Z-NII.25-2, Z-NII.25-2 w Wykaz_grup_Kampus_Cukrowa_NZ.pdf |
| Zarządzanie logistyczne w ochronie zdrowia | `ZLOZ` | ZLOZ | I/jm nst/st | I | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |
| Zarządzanie odnawialnymi źródłami energii | `ZOZE` | ZOZE | I/jm nst/st | I | st | st I: 1 | system planów WEFiZ (lata 2+ / II st.: Etap 1) |

## WKFiZ – Wydział Kultury Fizycznej i Zdrowia

Strony: [st](https://planyzajec-kfz.usz.edu.pl/api/get_schedule.php), [nst](https://planyzajec-kfz.usz.edu.pl/api/get_html_plans.php). DOS: [piastow](https://dos.usz.edu.pl/piastow/zajecia-piastow-wkfiz/).

| Kierunek | Kod | Skróty w źródłach | Oferta 2026/27 | Stopnie w źródłach | Tryby | Lata z planem | Uwagi |
|---|---|---|---|---|---|---|---|
| Diagnostyka sportowa | `DS` | DS | I/jm+II nst/st | I, II | st | st I: 1,2,3; II: 1,2 | skrót DS = inicjały nazwy z oferty (aplikacja nie podaje pełnej nazwy) |
| Management w sporcie | `MWS` | MwS | I/jm st | I | st | st I: 1,2,3 | skrót MwS = inicjały nazwy z oferty (aplikacja nie podaje pełnej nazwy) |
| Wychowanie fizyczne | `WF` | WF | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 · nst I: 1,2,3; II: 1,2 | skrót WF = inicjały nazwy z oferty (aplikacja nie podaje pełnej nazwy) |
| Zdrowie publiczne | `ZP` | ZP | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 · nst II: 1 | skrót ZP = inicjały nazwy z oferty (aplikacja nie podaje pełnej nazwy) |

**Skąd aplikacja bierze dane** (`planyzajec-kfz.usz.edu.pl/script.js` → `loadSchedule()`): jedno zapytanie GET
`https://planyzajec-kfz.usz.edu.pl/api/get_schedule.php` (publiczne, bez logowania) zwraca `{success, classes[], total, timestamp}` – wszystkie zajęcia stacjonarne naraz
(467 zajęć, znacznik 2026-11-09 10:16:29); grupa = pole `group` („<skrót> <rok> rok <stopień> stopień”), tryb = `studyMode` (w danych tylko: stacjonarne).
Filtry grupy i wykładowcy aplikacja liczy u siebie z tej listy. Gdy baza jest pusta, aplikacja woła `api/parse_xml.php`.
Niestacjonarne: `https://planyzajec-kfz.usz.edu.pl/api/get_html_plans.php` = lista grup, plan grupy to HTML z `get_html_plans.php?group=<nazwa>`. Przykład zajęć:

```json
{
 "id": 1,
 "subject": "PDW: nowoczesne formy ruchowe 30h, 1zt (5.10-25.01.27)",
 "type": "Zajęcia terenowe",
 "teacher": "dr Marek Kolbowicz",
 "day": "Poniedziałek",
 "startTime": "08:15",
 "endTime": "09:45",
 "duration": 90,
 "room": "sala 101",
 "building": "Główny budynek",
 "group": "MwS 2 rok I stopień",
 "specialization": "MwS",
 "year": 2,
 "semester": 2,
 "studyMode": "stacjonarne",
 "description": "",
 "color": "#14B8A6",
 "startDate": null,
 "endDate": null
}
```

## WH – Wydział Humanistyczny

Strony: [st](https://hum.usz.edu.pl/studenci/plany-zajec-studia-stacjonarne/), [nst](https://hum.usz.edu.pl/studenci/plany-zajec-studia-niestacjonarne/). DOS: [piastow](https://dos.usz.edu.pl/piastow/zajecia-piastow/).

| Kierunek | Kod | Skróty w źródłach | Oferta 2026/27 | Stopnie w źródłach | Tryby | Lata z planem | Uwagi |
|---|---|---|---|---|---|---|---|
| Archeologia | `ARCH` | ARCH | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 | nazwa z treści pliku: „ARCHEOLOGIA 1 rok I st. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Bałtyckie studia kulturowe | `BSK` | BSK | II st | II | st | st II: 1,2 | nazwa z treści pliku: „BAŁTYCKIE STUDIA KULTUROWE 1 rok II stopień PONIEDZIAŁEK” |
| Dziennikarstwo i komunikacja społeczna | `DIKS` | DiKS | I/jm st | I | st | st I: 1,2,3 | nazwa z treści pliku: „DZIENNIKARSTWO I KOMUNIKACJA SPOŁECZNA 1 rok I st. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Dziennikarstwo i zarządzanie mediami | `DIZM` | DiZM | II st | II | st | st II: 1,2 | nazwa z treści pliku: „DZIENNIKARSTWO I ZARZĄDZANIE MEDIAMI 1 rok II st. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Filologia angielska | `FA` | FA | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 | nazwa z treści pliku: „FILOLOGIA ANGIELSKA 2 rok II st PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027 PONIEDZIAŁEK”; nazwa z treści pliku: „PLAN STUDIA NIESTACJONARNE, FILOLOGIA ANGIELSKA I I II STOPNIA SEMESTR ZIMOWY 2026/2027 ZJAZD I : 9-11.10.2026r.” |
| Filologia germańska | `FG` | FG | II nst/st | I, II | nst, st | st I: 2,3; II: 1,2 · nst I: 2 | nazwa z treści pliku: „filologia germańska 2 rok I stopnia, plan zajęć semestr zimowy 2026/2027”; nazwa z treści pliku: „filologia germańska 1 rok II stopnia, plan zajęć semestr zimowy 2026/2027”; nazwa z treści pliku: „PLAN ZAJĘĆ -FILOLOGIA GERMAŃSKA- 2 ROK I st. – studia niestacjonarne -SEMESTR zimowy 2026/2027 zajęcia odbywaja się przy” |
| Filologia germańska z dodatkowym językiem obcym | `FGZDJO` | FGzDJO | I/jm st | I | st | st I: 1,2,3 | nazwa z treści pliku: „filologia germańska z dodatkowym językiem obcym 1 rok I stopnia, plan zajęć semestr zimowy 2026/2027” |
| Filologia germańska z językiem angielskim | `FGZJA` | FGzJA | I/jm nst/st | I | nst, st | st I: 1 · nst I: 1 | nazwa z treści pliku: „filologia germańska z językiem angielskim 1 rok I stopnia, PLAN ZAJĘĆ semestr zimowy 2026/2027 plan zajęć po redukcji gr”; nazwa z treści pliku: „PLAN ZAJĘĆ -FILOLOGIA GERMAŃSKA z JĘZYKIEM ANGIELSKIM - 1 ROK I st. – studia niestacjonarne -SEMESTR zimowy 2026/2027 za” |
| Filologia hiszpańska | `FH` | FH | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1 | nazwa z treści pliku: „FILOLOGIA HISZPAŃSKA 1 rok I st. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027”; nazwa z treści pliku: „FILOLOGIA HISZPAŃSKA I rok NIESTACJONARNE PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Filologia norweska | `FN` | FN | I/jm st | I | st | st I: 1,2,3 | nazwa z treści pliku: „FILOLOGIA NORWESKA 1 rok I st. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Filologia polska | `FP` | FP | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 | nazwa z treści pliku: „FILOLOGIA POLSKA 1 rok I stopień PONIEDZIAŁEK”; nazwa z treści pliku: „FILOLOGIA POLSKA 1 rok II stopień PONIEDZIAŁEK” |
| Filologia romańska | `FROM` | FROM | II st | II | st | st II: 1,2 | nazwa z treści pliku: „FILOLOGIA ROMAŃSKA 1 ROK II ST. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Filologia romańska z językiem obcym do wyboru | `FRZJO` | FRZJOdW | I/jm st | I | st | st I: 1,2,3 | nazwa z treści pliku: „FILOLOGIA ROMAŃSKA Z JĘZYKIEM OBCYM DO WYBORU 3 ROK I ST. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Filologia rosyjska z dodatkowym językiem obcym | `FROS` | FROS | I/jm st | I | st | st I: 1,2,3 | nazwa z treści pliku: „FILOLOGIA ROSYJSKA Z DODATKOWYM JĘZYKIEM OBCYM 1 ROK I ST. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Filozofia | `FILO` | FILO | I/jm+II st | I, II | st | st I: 1,2,3; II: 1 | nazwa z treści pliku: „FILOZOFIA 1 ROK I ST. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Germanistyczno-polonistyczne wspólne studia nauczycielskie | **?** | — | I/jm st | I | st | brak planu |  |
| Global Communication | `GC` | GC | I/jm+II st | I, II | st | st I: 1,2,3; II: 1 | nazwa z treści pliku: „Global Communication year I BA winter semester 2026/27 WTOREK” |
| Historia | `HIST` | HIST | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 | nazwa z treści pliku: „HISTORIA 1 rok IIst. WTOREK” |
| Italianistyka | `ITA` | ITA | I/jm+II st | I, II | st | st I: 1,2,3; II: 1 | nazwa z treści pliku: „ITALIANISTYKA 1 rok I st. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Kognitywistyka komunikacji | `KK` | KK | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 | nazwa z treści pliku: „KOGNITYWISTYKA KOMUNIKACJI 1 ROK I ST. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Lingwistyka dla biznesu — tłumaczenia rosyjsko-polsko-niemieckie | `LDB` | LDB | I/jm st | I | st | st I: 2 | plik podaje tylko skrót LDB; nazwa = kierunek z oferty o tych inicjałach (do potwierdzenia) |
| Media i cywilizacja | `MIC` | MiC | I/jm st | I | st | st I: 1,2,3 | nazwa z treści pliku: „MEDIA I CYWILIZACJA 1 rok PONIEDZIAŁEK” |
| Menedżer dziedzictwa kulturowego | **?** | — | II st | II | st | brak planu |  |
| Polonistyczno-germanistyczne wspólne studia nauczycielskie | `PGWSN` | P_GWSN | — | I, II | st | st I: 3; II: 2 | nazwa tylko ze strony planów (brak w ofercie rekrutacji 2026/27); nazwa z nagłówka pliku: „POLONISTYCZNO-GERMANISTYCZNE WSPÓLNE STUDIA NAUCZYCIELSKIE III rok I stopień PONIEDZIAŁEK 2026/27 se” (brak w ofercie); nazwa z nagłówka pliku: „POLONISTYCZNO-GERMANISTYCZNE WSPÓLNE STUDIA NAUCZYCIELSKIE 2 rok II stopnia plan zajęć semestr zimow” (brak w ofercie) |
| Przekład rosyjsko-polski | `PRP` | PRP | II st | II | st | st II: 1,2 | nazwa z treści pliku: „PRZEKŁAD ROSYJSKO-POLSKI 1 ROK II ST. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Stosunki międzynarodowe | `SM` | SM | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 | nazwa z treści pliku: „STOSUNKI MIĘDZYNARODOWE 1 rok Ist. PLAN ZAJĘĆ SEMESTR ZIMOWY 2026/2027” |
| Studia anglistyczno-slawistyczne | **?** | — | I/jm st | I | st | brak planu |  |
| Studia pisarskie | `SP` | SP | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 | nazwa z treści pliku: „STUDIA PISARSKIE 1 rok I stopień PONIEDZIAŁEK”; nazwa z treści pliku: „STUDIA PISARSKIE 1 rok II stopień PONIEDZIAŁEK” |

Pominięte pliki: `FGzJA-I-st.-plan-zajec_-przed-redukja-grup-_semestr-zimowy-2026_-2027.xlsx` (starsza wersja niż FGzJA-I-st.-plan-zajec-semestr-zimowy-2026_-2027-po-redukcji-grup-od-dnia-12.10.2026-r.xlsx).

## WNS – Wydział Nauk Społecznych

Strony: [st](https://nsp.usz.edu.pl/studenci/plany-zajec-studia-stacjonarne/), [nst](https://nsp.usz.edu.pl/studenci/plany-zajec-studia-niestacjonarne/). DOS: [krakowska](https://dos.usz.edu.pl/krakowska/zajecia-krakowska/).

| Kierunek | Kod | Skróty w źródłach | Oferta 2026/27 | Stopnie w źródłach | Tryby | Lata z planem | Uwagi |
|---|---|---|---|---|---|---|---|
| Animacja kultury | `AK` | AK | — | I | st | st I: 3 | nazwa tylko ze strony planów (brak w ofercie rekrutacji 2026/27) |
| Bezpieczeństwo narodowe | `BN` | BN | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 | niestacjonarne: stopień i rok tylko w treści plików zjazdowych (Etap 7) |
| Bezpieczeństwo wewnętrzne | `BW` | BW | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 | niestacjonarne: stopień i rok tylko w treści plików zjazdowych (Etap 7) |
| Edukacja artystyczna | `EA` | EA | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 |  |
| Management instytucji publicznych i Public Relations | `MIPIPR` | MIPiPR | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 | niestacjonarne: stopień i rok tylko w treści plików zjazdowych (Etap 7) |
| Pedagogika | `PEDO` | PedO | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 | wspólny plik kilku kierunków; niestacjonarne: stopień i rok tylko w treści plików zjazdowych (Etap 7) |
| Pedagogika opiekuńczo-wychowawcza | `POW` | POW | — | I | st | st I: 3 | nazwa tylko ze strony planów (brak w ofercie rekrutacji 2026/27) |
| Pedagogika przedszkolna i wczesnoszkolna | `PPIW` | PPIW | I/jm nst/st | jm | nst, st | st jm: 1,2,3,4,5 | niestacjonarne: stopień i rok tylko w treści plików zjazdowych (Etap 7) |
| Pedagogika resocjalizacyjna | `RESO` | RESO, Reso | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 | niestacjonarne: stopień i rok tylko w treści plików zjazdowych (Etap 7) |
| Pedagogika specjalna | `PEDSP` | PEDSPEC | I/jm nst/st | jm | nst, st | st jm: 1,2,3,4,5 | niestacjonarne: stopień i rok tylko w treści plików zjazdowych (Etap 7) |
| Politologia | `POL` | POL | I/jm+II st | I | st | st I: 1,2,3 |  |
| Praca socjalna | `PS` | PS | I/jm nst/st | I | nst, st | st I: 1 | wspólny plik kilku kierunków; niestacjonarne: stopień i rok tylko w treści plików zjazdowych (Etap 7) |
| Psychologia | `PSYCH` | Psych | I/jm st | jm | st | st jm: 1,2,3,4,5 |  |
| Social Sciences | `SS` | SS | I/jm st | I | st | st I: 1,2,3 |  |
| Socjologia | `SOC` | SOC | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 |  |
| Socjotechnika i oddziaływanie społeczne | `SIOS` | SIOS | I/jm st | I | st | st I: 1,2,3 |  |

## WNŚiP – Wydział Nauk Ścisłych i Przyrodniczych

Strony: [st](https://spr.usz.edu.pl/studenci/plany-zajec-studia-stacjonarne/). DOS: [waska](https://dos.usz.edu.pl/waska/zajecia-waska/).

| Kierunek | Kod | Skróty w źródłach | Oferta 2026/27 | Stopnie w źródłach | Tryby | Lata z planem | Uwagi |
|---|---|---|---|---|---|---|---|
| Biologia | `BIOL` | biol | I/jm+II st | I | st | st I: 1,2,3 |  |
| Biologiczne podstawy kryminalistyki | `BPK` | bpk | II st | II | st | st II: 2 |  |
| Biotechnologia | `BIOTEC` | biotech | I/jm+II st | I, II | st | st I: 1,3; II: 1 |  |
| Eksploatacja zasobów naturalnych | `EZN` | ezn | — | I | st | st I: 4 | nazwa tylko ze strony planów (brak w ofercie rekrutacji 2026/27) |
| Fizyka | `FIZ` | fiz | I/jm+II st | I | st | st I: 2,3 |  |
| Genetyka i biologia eksperymentalna | `GIBE` | gibe | I/jm st | I | st | st I: 1,2,3 |  |
| Geografia | `GEOG` | geog | I/jm+II st | I | st | st I: 1,2 |  |
| Geologia | `GEOL` | geol | I/jm+II st | I, II | st | st I: 1,2,3; II: 2 |  |
| Hydrobiology | `HYDRO` | hydro | I/jm st | I | st | st I: 1,2,3 |  |
| Kosmologia | `KOSMO` | kosmologia | I/jm st | I | st | st I: 1 |  |
| Matematyka | `MAT` | mat | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 |  |
| Mikrobiologia | `MIKR` | mikrobiol | I/jm+II st | I, II | st | st I: 1,2,3; II: 1 |  |
| Oceanografia | `OCEAN` | ocean | I/jm+II st | I | st | st I: 1,2,3 |  |
| Ochrona i inżynieria środowiska przyrodniczego | **?** | — | II st | II | st | brak planu |  |
| Ochrona środowiska | **?** | — | I/jm st | I | st | brak planu |  |
| Optyka okularowa | `OPTYKA` | optyka | I/jm st | I | st | st I: 1,2,3 |  |

## WPiA – Wydział Prawa i Administracji

Strony: [st+nst](https://wpia.usz.edu.pl/rozklady-zajec/). DOS: [narutowicza](https://dos.usz.edu.pl/narutowicza/zajecia-narutowicza/).

| Kierunek | Kod | Skróty w źródłach | Oferta 2026/27 | Stopnie w źródłach | Tryby | Lata z planem | Uwagi |
|---|---|---|---|---|---|---|---|
| Administracja | `ADM` | A | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 · nst I: 1,2,3; II: 1 |  |
| Ekonomiczno-prawny | `EP` | EP | — | I, II | st | st I: 1,2,3; II: 1,2 | w ofercie jako kierunek Wydział Ekonomii, Finansów i Zarządzania – jeden rocznik z id tego wydziału |
| International and European Business Law | `IEBL` | IEBL | II st | II | st | st II: 1,2 |  |
| Prawo | `PRAWO` | P, N | I/jm nst/st | jm | nst, st | st jm: 1,2,3,4,5 · nst jm: 1,2,3,4,5 |  |
| Prawo służb mundurowych | `PSM` | PSM | I/jm+II nst/st | I, II | nst, st | st I: 1,2,3; II: 1,2 · nst I: 1,3 |  |

## WT – Wydział Teologiczny

Strony: [st](https://teo.usz.edu.pl/studenci/plany-zajec-studia-stacjonarne/). DOS: [teologia](https://dos.usz.edu.pl/teologia/zajecia-teologia/).

| Kierunek | Kod | Skróty w źródłach | Oferta 2026/27 | Stopnie w źródłach | Tryby | Lata z planem | Uwagi |
|---|---|---|---|---|---|---|---|
| Nauki o rodzinie — doradztwo, coaching, mediacje | `NOR` | NOR | I/jm+II st | I, II | st | st I: 1,2,3; II: 1,2 | stopień i lata z nagłówków kolumn skanu (config/wydzialy-us.json → roczniki) |
| Teologia | `TEO` | TEO | I/jm st | jm | st | st jm: 1,2,3,4,5 | stopień i lata z nagłówków kolumn skanu (config/wydzialy-us.json → roczniki) |

Błędy pobierania: `Wychowanie-fizyczne-2026-27a.pdf`: brak pliku (404).

## Niejasne pozycje i pytania do Bartka

1. WEFiZ: „Green Economy - zielona gospodarka (GE)” jest w systemie planów, ale nie ma go w ofercie rekrutacji 2026/27 – stopień nieznany
2. WEFiZ: „Green Economy - zielona gospodarka” – źródło nie podaje stopnia/roku (plan)
3. WKFiZ: grupa „ERASMUS +” (30 zajęć) nie ma formy „<kierunek> <rok> rok <stopień>”
4. WH: P_GWSN – plik nazywa kierunek „Polonistyczno-germanistyczne wspólne studia nauczycielskie”, oferta nie ma takiej nazwy; czy to ten sam kierunek co podobny w ofercie?
5. WH: P_GWSN – plik nazywa kierunek „Polonistyczno-germanistyczne wspólne studia nauczycielskie”, oferta nie ma takiej nazwy; czy to ten sam kierunek co podobny w ofercie?

Zapytania: sieć 0, HEAD 0, cache 193. Pliki: 180 (nowo pobrane 0, błędy 1).
