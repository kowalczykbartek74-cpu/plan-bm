-- Nauka: baza dla zakładki „Nauka” (nauka.html)
-- Wklej całość w Supabase → SQL Editor → New query → Run.
-- Skrypt można uruchomić ponownie: nie kasuje istniejących danych.
--
-- Kto co może:
--   • czytać kursy, terminy i ogłoszenia: zalogowani mailem @stud.usz.edu.pl / @usz.edu.pl,
--     osoby z wykupionym dostępem (tabela nauka_dostep) i administratorzy (nauka_admini)
--   • dodawać terminy i zgłoszenia błędów: każdy, kto może czytać; edytować termin: autor albo admin
--   • postęp nauki (wyniki quizów, przerobione lekcje): tylko jego właściciel
--   • kursy, lekcje i ogłoszenia: tylko administratorzy
-- Logowanie odbywa się linkiem wysyłanym na maila (Supabase Auth). Niezalogowani nie widzą nic.

-- ---------- Tabele ----------
create table if not exists public.nauka_docs (
  kolekcja    text not null check (kolekcja in ('materials','materialContent','deadlines','announcements','reports','progress')),
  id          text not null check (char_length(id) between 1 and 120),
  data        jsonb not null check (octet_length(data::text) < 300000),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (kolekcja, id)
);

create table if not exists public.nauka_admini (
  email text primary key check (email = lower(email))
);
insert into public.nauka_admini (email) values
  ('251782@stud.usz.edu.pl'),
  ('kowalczykbartek74@gmail.com')
on conflict do nothing;

-- Wykupiony dostęp (na przyszłość: płatności wpisują tu e-mail i datę końca dostępu)
create table if not exists public.nauka_dostep (
  email     text primary key check (email = lower(email)),
  do_kiedy  date not null,
  zrodlo    text,
  created_at timestamptz not null default now()
);

alter table public.nauka_docs    enable row level security;
alter table public.nauka_admini  enable row level security;
alter table public.nauka_dostep  enable row level security;

-- ---------- Funkcje pomocnicze ----------
create or replace function public.nauka_email() returns text
language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.nauka_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.nauka_admini a where a.email = public.nauka_email())
$$;

create or replace function public.nauka_czytelnik() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.nauka_email() like '%@stud.usz.edu.pl'
      or public.nauka_email() like '%@usz.edu.pl'
      or public.nauka_admin()
      or exists (select 1 from public.nauka_dostep d
                 where d.email = public.nauka_email() and d.do_kiedy >= current_date)
$$;

-- Co widzi strona o zalogowanej osobie (bez ujawniania list e-maili)
create or replace function public.nauka_ja() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', public.nauka_email(),
    'admin', public.nauka_admin(),
    'czytelnik', public.nauka_czytelnik(),
    'dostep_do', (select d.do_kiedy from public.nauka_dostep d where d.email = public.nauka_email())
  )
$$;

-- Autor i daty ustawia baza, nie przeglądarka; limit wpisów na osobę chroni przed spamem
create or replace function public.nauka_przed_zapisem() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    if new.kolekcja in ('deadlines','reports') and not public.nauka_admin() then
      if (select count(*) from public.nauka_docs d
          where d.created_by = auth.uid() and d.kolekcja = new.kolekcja
            and d.created_at > now() - interval '1 hour') >= 20 then
        raise exception 'Za dużo wpisów w ciągu godziny. Spróbuj później.';
      end if;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists nauka_przed_zapisem on public.nauka_docs;
create trigger nauka_przed_zapisem before insert or update on public.nauka_docs
  for each row execute function public.nauka_przed_zapisem();

-- ---------- Uprawnienia ----------
revoke all on public.nauka_docs, public.nauka_admini, public.nauka_dostep from anon, authenticated;
grant select, insert, update, delete on public.nauka_docs to authenticated;

drop policy if exists "nauka czytaj" on public.nauka_docs;
create policy "nauka czytaj" on public.nauka_docs for select to authenticated using (
     (kolekcja in ('materials','materialContent','deadlines','announcements') and public.nauka_czytelnik())
  or (kolekcja = 'reports'  and public.nauka_admin())
  or (kolekcja = 'progress' and id = auth.uid()::text)
);

drop policy if exists "nauka dodaj" on public.nauka_docs;
create policy "nauka dodaj" on public.nauka_docs for insert to authenticated with check (
     (kolekcja in ('deadlines','reports') and public.nauka_czytelnik())
  or (kolekcja = 'progress' and id = auth.uid()::text)
  or (kolekcja in ('materials','materialContent','announcements') and public.nauka_admin())
);

drop policy if exists "nauka zmien" on public.nauka_docs;
create policy "nauka zmien" on public.nauka_docs for update to authenticated
  using (
       (kolekcja = 'deadlines' and (created_by = auth.uid() or public.nauka_admin()))
    or (kolekcja = 'progress'  and id = auth.uid()::text)
    or (kolekcja in ('materials','materialContent','announcements','reports') and public.nauka_admin())
  )
  with check (
       (kolekcja = 'deadlines' and (created_by = auth.uid() or public.nauka_admin()))
    or (kolekcja = 'progress'  and id = auth.uid()::text)
    or (kolekcja in ('materials','materialContent','announcements','reports') and public.nauka_admin())
  );

drop policy if exists "nauka usun" on public.nauka_docs;
create policy "nauka usun" on public.nauka_docs for delete to authenticated using (
     (kolekcja = 'deadlines' and (created_by = auth.uid() or public.nauka_admin()))
  or (kolekcja = 'progress'  and id = auth.uid()::text)
  or (kolekcja in ('materials','materialContent','announcements','reports') and public.nauka_admin())
);

revoke all on function public.nauka_admin(), public.nauka_czytelnik(), public.nauka_ja(),
  public.nauka_przed_zapisem() from public, anon;
grant execute on function public.nauka_email(), public.nauka_admin(), public.nauka_czytelnik(), public.nauka_ja()
  to authenticated;
