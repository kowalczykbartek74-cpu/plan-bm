# Budzik automatu planu (cron-job.org → GitHub)

**Po co:** GitHub odpala zaplanowane przebiegi ok. 7 godzin za późno i gubi większość godzinnych.
Zewnętrzny budzik (cron-job.org, darmowy) o stałych godzinach prosi GitHuba: „uruchom automat teraz”.
Takie uruchomienie GitHub wykonuje od razu.

Zrobisz to w 3 częściach, ok. 15 minut. Kolejność jest ważna: najpierw część A, potem B i C.

---

## A. Wklej nową wersję automatu (2 min)

Nowa wersja dodaje tryb „tylko dziekanat”, żeby cogodzinny budzik nie robił całego importu.

1. Otwórz gotowy plik: https://raw.githubusercontent.com/kowalczykbartek74-cpu/plan-bm/main/docs/aktualizacja-planu-budzik.yml
2. Zaznacz wszystko (Cmd+A) i skopiuj (Cmd+C).
3. Otwórz edycję automatu: https://github.com/kowalczykbartek74-cpu/plan-bm/edit/main/.github/workflows/aktualizacja-planu.yml
4. Kliknij w treść, zaznacz wszystko (Cmd+A) i wklej (Cmd+V).
5. Kliknij zielony przycisk **Commit changes…**, a potem w okienku jeszcze raz **Commit changes**.

## B. Załóż klucz do uruchamiania automatu (4 min)

Klucz pozwala tylko uruchamiać automat w repozytorium `plan-bm`, nic więcej.

1. Otwórz: https://github.com/settings/personal-access-tokens/new
2. **Token name:** `budzik planu`
3. **Expiration:** wybierz najdłuższy dostępny termin. Wpisz sobie w kalendarz dzień przed końcem, żeby wtedy założyć nowy klucz.
4. **Repository access:** zaznacz **Only select repositories** i wybierz `kowalczykbartek74-cpu/plan-bm`.
5. **Permissions → Repository permissions → Actions:** ustaw **Read and write**. Resztę zostaw, jak jest.
6. Na dole kliknij **Generate token**, a potem znów **Generate token**.
7. Skopiuj klucz (zaczyna się od `github_pat_`). Pokazuje się tylko raz, więc trzymaj go do części C.
   Nie wklejaj go nigdzie poza cron-job.org, także nie do czatu z Claude.

## C. Ustaw budzik na cron-job.org (8 min)

1. Załóż konto: https://console.cron-job.org/signup (potem potwierdź mail).
2. Po zalogowaniu kliknij **Settings** (lewe menu) i ustaw **Timezone: Europe/Warsaw**. Zapisz.
3. Otwórz: https://console.cron-job.org/jobs/create i wypełnij:

   **Zakładka COMMON**
   - **Title:** `Plan – pełny import`
   - **URL:** `https://api.github.com/repos/kowalczykbartek74-cpu/plan-bm/actions/workflows/aktualizacja-planu.yml/dispatches`
   - **Execution schedule:** **Custom**. Days of month: wszystkie, Days of week: wszystkie, Months: wszystkie,
     **Hours: 6 i 7**, **Minutes: 5** (czyli 6:05 i 7:05; druga próba łata dzień, gdy strona uczelni chwilowo nie odpowie).

   **Zakładka ADVANCED**
   - **Request method:** `POST`
   - **Headers** (każdy osobno przez „Add”):
     - `Authorization` → `Bearer ` + Twój klucz z części B (słowo Bearer, spacja, klucz)
     - `Accept` → `application/vnd.github+json`
     - `X-GitHub-Api-Version` → `2022-11-28`
     - `Content-Type` → `application/json`
   - **Request body:**
     ```
     {"ref":"main","inputs":{"tryb":"pelny"}}
     ```

   Kliknij **TEST RUN**. Dobry wynik to **204 No Content**. Potem kliknij **CREATE**.

4. Drugi budzik: na liście kliknij przy pierwszym **⋯ → Clone** i zmień tylko:
   - **Title:** `Plan – dziekanat co godzinę`
   - **Hours: 8–19** (zaznacz 8, 9, …, 19), **Minutes: 20**
   - **Request body:**
     ```
     {"ref":"main","inputs":{"tryb":"dziekanat"}}
     ```
   **TEST RUN** → 204 → **CREATE**.

## Jak sprawdzić, że działa

- Otwórz https://github.com/kowalczykbartek74-cpu/plan-bm/actions. Po TEST RUN od razu pojawia się nowy przebieg z dopiskiem **workflow_dispatch**.
- Następnego dnia rano o ok. 6:05 powinien być przebieg pełny, a od 8:20 co godzinę krótkie przebiegi dziekanatu.
- Możesz też napisać do Claude „sprawdź budzik”, a sprawdzi godziny przebiegów.

## Gdy coś nie gra

| Wynik TEST RUN | Co to znaczy | Co zrobić |
|---|---|---|
| 401 | zły klucz | sprawdź nagłówek `Authorization`: `Bearer github_pat_…` (ze spacją) |
| 403 albo 404 | klucz bez uprawnienia albo do innego repo | część B, punkty 4–5 |
| 422 | GitHub nie zna trybu `tryb` | najpierw część A (nowa wersja automatu) |

Stare harmonogramy GitHuba zostają jako zapas: gdy cron-job.org kiedyś nie zadziała, GitHub i tak uruchomi automat, tylko później.
Gdy klucz wygaśnie, budzik dostanie 401. Wtedy powtórz część B i podmień klucz w obu budzikach (Edit → Advanced → Headers).
