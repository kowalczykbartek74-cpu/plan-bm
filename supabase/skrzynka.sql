-- Skrzynka do opiekunki roku: baza dla zakładki „Skrzynka” (skrzynka.html)
-- Wklej całość w Supabase → SQL Editor → New query → Run.
-- Skrypt można uruchomić ponownie: nie kasuje istniejących wiadomości.
--
-- Przed uruchomieniem podmień HASH_HASLA_STAROSTY na skrót SHA-256 hasła do panelu starosty
-- (Claude przygotował gotową wersję z wpisanym skrótem; hasło nie jest nigdzie zapisane w repozytorium).

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tabele ----------
create table if not exists public.prosby (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  tresc       text not null check (char_length(btrim(tresc)) between 5 and 2000),
  autor       text check (autor is null or char_length(btrim(autor)) between 1 and 60),
  grupa       text check (grupa is null or grupa in ('C111','C112','C113')),
  pilnosc     smallint not null default 1 check (pilnosc between 1 and 3),   -- 1 zwykła, 2 ważna, 3 pilna
  status      text not null default 'nowa' check (status in ('nowa','przekazana','odpowiedz','zamknieta')),
  odpowiedz   text check (odpowiedz is null or char_length(odpowiedz) <= 3000),
  ukryta      boolean not null default false
);

create table if not exists public.komentarze (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  prosba_id   bigint not null references public.prosby(id) on delete cascade,
  tresc       text not null check (char_length(btrim(tresc)) between 1 and 1000),
  autor       text check (autor is null or char_length(btrim(autor)) between 1 and 60),
  ukryty      boolean not null default false
);
create index if not exists komentarze_prosba_idx on public.komentarze(prosba_id);

create table if not exists public.reakcje (
  prosba_id   bigint not null references public.prosby(id) on delete cascade,
  emoji       text not null check (emoji in ('👍','🙏','❤️','😂','😮','😢')),
  klient      uuid not null,             -- losowy identyfikator przeglądarki, nie dane osobowe
  created_at  timestamptz not null default now(),
  primary key (prosba_id, emoji, klient)
);

create table if not exists public.admin_haslo (
  id    int primary key default 1 check (id = 1),
  hash  text not null
);
insert into public.admin_haslo (id, hash) values (1, 'HASH_HASLA_STAROSTY')
  on conflict (id) do update set hash = excluded.hash;

-- ---------- Dostęp: każdy z linkiem może czytać i pisać, ale nie zmieniać cudzych rzeczy ----------
alter table public.prosby      enable row level security;
alter table public.komentarze  enable row level security;
alter table public.reakcje     enable row level security;
alter table public.admin_haslo enable row level security;

revoke all on public.prosby, public.komentarze, public.reakcje, public.admin_haslo from anon, authenticated;
grant select on public.prosby, public.komentarze to anon, authenticated;
grant insert (tresc, autor, grupa, pilnosc) on public.prosby to anon, authenticated;
grant insert (prosba_id, tresc, autor)      on public.komentarze to anon, authenticated;

drop policy if exists "czytaj widoczne prosby" on public.prosby;
create policy "czytaj widoczne prosby" on public.prosby for select to anon, authenticated using (not ukryta);
drop policy if exists "dodaj prosbe" on public.prosby;
create policy "dodaj prosbe" on public.prosby for insert to anon, authenticated
  with check (status = 'nowa' and not ukryta and odpowiedz is null);

drop policy if exists "czytaj widoczne komentarze" on public.komentarze;
create policy "czytaj widoczne komentarze" on public.komentarze for select to anon, authenticated
  using (not ukryty and exists (select 1 from public.prosby p where p.id = prosba_id and not p.ukryta));
drop policy if exists "dodaj komentarz" on public.komentarze;
create policy "dodaj komentarz" on public.komentarze for insert to anon, authenticated
  with check (not ukryty and exists (select 1 from public.prosby p where p.id = prosba_id and not p.ukryta));

-- ---------- Prosta ochrona przed spamem ----------
create or replace function public.limit_wpisow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'prosby' then
    if (select count(*) from public.prosby where created_at > now() - interval '1 minute') >= 8 then
      raise exception 'Za dużo wiadomości naraz. Spróbuj za minutę.';
    end if;
  else
    if (select count(*) from public.komentarze where created_at > now() - interval '1 minute') >= 20 then
      raise exception 'Za dużo komentarzy naraz. Spróbuj za minutę.';
    end if;
  end if;
  new.tresc := btrim(new.tresc);
  new.autor := nullif(btrim(coalesce(new.autor, '')), '');
  return new;
end $$;
drop trigger if exists limit_prosby on public.prosby;
create trigger limit_prosby before insert on public.prosby for each row execute function public.limit_wpisow();
drop trigger if exists limit_komentarze on public.komentarze;
create trigger limit_komentarze before insert on public.komentarze for each row execute function public.limit_wpisow();

-- ---------- Reakcje (emotki) ----------
create or replace function public.przelacz_reakcje(p_prosba bigint, p_emoji text, p_klient uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.prosby where id = p_prosba and not ukryta) then
    raise exception 'Nie ma takiej wiadomości.';
  end if;
  delete from public.reakcje where prosba_id = p_prosba and emoji = p_emoji and klient = p_klient;
  if not found then
    insert into public.reakcje (prosba_id, emoji, klient) values (p_prosba, p_emoji, p_klient);
  end if;
end $$;

create or replace function public.reakcje_podsumowanie(p_klient uuid)
returns table (prosba_id bigint, emoji text, ile int, moja boolean)
language sql stable security definer set search_path = '' as $$
  select r.prosba_id, r.emoji, count(*)::int, bool_or(r.klient = p_klient)
  from public.reakcje r join public.prosby p on p.id = r.prosba_id
  where not p.ukryta
  group by r.prosba_id, r.emoji
$$;

-- ---------- Panel starosty (chroniony hasłem) ----------
create or replace function public.admin_ok(p_haslo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_haslo
                 where hash = encode(extensions.digest(coalesce(p_haslo, ''), 'sha256'), 'hex'))
$$;

create or replace function public.admin_lista(p_haslo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.admin_ok(p_haslo) then raise exception 'Złe hasło starosty.'; end if;
  return jsonb_build_object(
    'prosby', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.prosby p), '[]'::jsonb),
    'komentarze', coalesce((select jsonb_agg(to_jsonb(k) order by k.id) from public.komentarze k), '[]'::jsonb));
end $$;

create or replace function public.admin_prosba(p_haslo text, p_id bigint, p_status text, p_odpowiedz text, p_ukryta boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_ok(p_haslo) then raise exception 'Złe hasło starosty.'; end if;
  update public.prosby set
    status = coalesce(p_status, status),
    odpowiedz = case when p_odpowiedz is null then odpowiedz else nullif(btrim(p_odpowiedz), '') end,
    ukryta = coalesce(p_ukryta, ukryta),
    updated_at = now()
  where id = p_id;
end $$;

create or replace function public.admin_komentarz(p_haslo text, p_id bigint, p_ukryty boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_ok(p_haslo) then raise exception 'Złe hasło starosty.'; end if;
  update public.komentarze set ukryty = p_ukryty where id = p_id;
end $$;

revoke all on function public.limit_wpisow(), public.przelacz_reakcje(bigint, text, uuid),
  public.reakcje_podsumowanie(uuid), public.admin_ok(text), public.admin_lista(text),
  public.admin_prosba(text, bigint, text, text, boolean), public.admin_komentarz(text, bigint, boolean) from public;
grant execute on function public.przelacz_reakcje(bigint, text, uuid), public.reakcje_podsumowanie(uuid),
  public.admin_ok(text), public.admin_lista(text),
  public.admin_prosba(text, bigint, text, text, boolean), public.admin_komentarz(text, bigint, boolean)
  to anon, authenticated;

notify pgrst, 'reload schema';
