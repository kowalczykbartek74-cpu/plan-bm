-- Skrót BM na skrotbm.pl: rozszerzenie bazy z nauka.sql o kolekcje nowej strony.
-- Wymaga wcześniej uruchomionego supabase/nauka.sql (tabela nauka_docs, admini, funkcje dostępu).
-- Wklej całość w Supabase → SQL Editor → New query → Run. Można uruchamiać wielokrotnie.
--
-- Kto co może:
--   • czytać materiały, zadania, terminy, ogłoszenia: studenci US (mail @stud.usz.edu.pl / @usz.edu.pl),
--     osoby z wykupionym dostępem (nauka_dostep) i administratorzy (nauka_admini)
--   • dodawać terminy i zgłoszenia błędów: każdy, kto może czytać; zmieniać termin: autor albo admin
--   • postęp nauki: tylko jego właściciel
--   • materiały, zadania, ogłoszenia, wyjaśnienia AI, stan synchronizacji: tylko administratorzy

alter table public.nauka_docs drop constraint if exists nauka_docs_kolekcja_check;
alter table public.nauka_docs add constraint nauka_docs_kolekcja_check check (kolekcja in (
  'materials','materialContent','materialSources','materialSimple','quizWhy',
  'tasks','meta','deadlines','announcements','reports','progress'));

-- Limit wpisów na osobę obejmuje też zgłoszenia i terminy (bez zmian względem nauka.sql)

drop policy if exists "nauka czytaj" on public.nauka_docs;
create policy "nauka czytaj" on public.nauka_docs for select to authenticated using (
     (kolekcja in ('materials','materialContent','materialSources','materialSimple','quizWhy',
                   'tasks','meta','deadlines','announcements') and public.nauka_czytelnik())
  or (kolekcja = 'reports'  and public.nauka_admin())
  or (kolekcja = 'progress' and id = auth.uid()::text)
);

drop policy if exists "nauka dodaj" on public.nauka_docs;
create policy "nauka dodaj" on public.nauka_docs for insert to authenticated with check (
     (kolekcja in ('deadlines','reports') and public.nauka_czytelnik())
  or (kolekcja = 'progress' and id = auth.uid()::text)
  or (kolekcja in ('materials','materialContent','materialSources','materialSimple','quizWhy',
                   'tasks','meta','announcements') and public.nauka_admin())
);

drop policy if exists "nauka zmien" on public.nauka_docs;
create policy "nauka zmien" on public.nauka_docs for update to authenticated
  using (
       (kolekcja = 'deadlines' and (created_by = auth.uid() or public.nauka_admin()))
    or (kolekcja = 'progress'  and id = auth.uid()::text)
    or (kolekcja in ('materials','materialContent','materialSources','materialSimple','quizWhy',
                     'tasks','meta','announcements','reports') and public.nauka_admin())
  )
  with check (
       (kolekcja = 'deadlines' and (created_by = auth.uid() or public.nauka_admin()))
    or (kolekcja = 'progress'  and id = auth.uid()::text)
    or (kolekcja in ('materials','materialContent','materialSources','materialSimple','quizWhy',
                     'tasks','meta','announcements','reports') and public.nauka_admin())
  );

drop policy if exists "nauka usun" on public.nauka_docs;
create policy "nauka usun" on public.nauka_docs for delete to authenticated using (
     (kolekcja = 'deadlines' and (created_by = auth.uid() or public.nauka_admin()))
  or (kolekcja = 'progress'  and id = auth.uid()::text)
  or (kolekcja in ('materials','materialContent','materialSources','materialSimple','quizWhy',
                   'tasks','meta','announcements','reports') and public.nauka_admin())
);

-- Szybsze listy kolekcji
create index if not exists nauka_docs_kolekcja_idx on public.nauka_docs (kolekcja);
