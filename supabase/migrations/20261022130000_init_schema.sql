-- EXIT KOMPASS – Grundschema
-- Leads aus dem E-Book-Formular, CMS-Inhalte (content.json) mit Versionsverlauf, Keep-Alive.
--
-- Zugriff:
--   anon (Publishable Key, im Worker): darf Leads anlegen (nur Insert, kein Lesen),
--                                      darf den veröffentlichten Seiteninhalt lesen,
--                                      darf keep_alive() aufrufen.
--   service_role (Secret Key, nur als Cloudflare-Secret): alles – CMS-Speichern, Leads lesen.

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null check (char_length(name) between 2 and 60),
  phone         text not null check (phone ~ '^\+[0-9]{8,15}$'),
  source        text check (source is null or char_length(source) <= 20),
  page          text check (page is null or char_length(page) <= 300),
  consent       boolean not null check (consent = true),
  consent_text  text check (consent_text is null or char_length(consent_text) <= 600),
  status        text not null default 'neu' check (status in ('neu', 'kontaktiert', 'e-book gesendet', 'kunde', 'kein interesse')),
  note          text
);

comment on table public.leads is 'Leads aus dem E-Book-Formular auf exit-kompass.de';
create index leads_created_at_idx on public.leads (created_at desc);
create index leads_phone_idx on public.leads (phone);

-- ---------------------------------------------------------------------------
-- CMS-Inhalte (eine Zeile pro Inhalt, aktuell nur key = 'main' = content.json)
-- ---------------------------------------------------------------------------
create table public.site_content (
  key         text primary key check (key ~ '^[a-z0-9_-]{1,40}$'),
  content     jsonb not null check (jsonb_typeof(content) = 'object'),
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

comment on table public.site_content is 'Live-Inhalte der Website (ersetzt public/content.json)';

create table public.content_revisions (
  id          bigint generated always as identity primary key,
  key         text not null references public.site_content (key) on delete cascade,
  version     integer not null,
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  created_by  text,
  message     text,
  unique (key, version)
);

comment on table public.content_revisions is 'Versionsverlauf der CMS-Inhalte (jede Veröffentlichung)';
create index content_revisions_key_idx on public.content_revisions (key, version desc);

-- Veröffentlichen mit Konflikterkennung: nur wenn expected_version noch aktuell ist.
-- Gibt die neue Version zurück, oder NULL bei Konflikt.
create or replace function public.publish_content(
  p_key text,
  p_content jsonb,
  p_expected_version integer,
  p_user text,
  p_message text default null
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new integer;
begin
  update public.site_content
     set content = p_content,
         version = version + 1,
         updated_at = now(),
         updated_by = p_user
   where key = p_key
     and version = p_expected_version
  returning version into v_new;

  if v_new is null then
    return null;
  end if;

  insert into public.content_revisions (key, version, content, created_by, message)
  values (p_key, v_new, p_content, p_user, p_message);

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keep-Alive (GitHub Action alle 3 Tage, verhindert das Pausieren im Free-Plan)
-- ---------------------------------------------------------------------------
create table public.heartbeat (
  id          smallint primary key default 1 check (id = 1),
  last_ping   timestamptz not null default now(),
  source      text,
  ping_count  bigint not null default 0
);

insert into public.heartbeat (id, last_ping, source, ping_count) values (1, now(), 'setup', 0);

create or replace function public.keep_alive(p_source text default 'github-action')
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update public.heartbeat
     set last_ping = now(),
         source = left(coalesce(p_source, 'unknown'), 40),
         ping_count = ping_count + 1
   where id = 1
  returning last_ping;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.leads             enable row level security;
alter table public.site_content      enable row level security;
alter table public.content_revisions enable row level security;
alter table public.heartbeat         enable row level security;

-- Leads: öffentlich nur anlegen, nie lesen/ändern/löschen
create policy "Leads: anon darf anlegen"
  on public.leads for insert
  to anon
  with check (consent = true and status = 'neu' and note is null);

-- Inhalte: öffentlich lesbar (stehen ohnehin auf der Website)
create policy "Inhalte: öffentlich lesbar"
  on public.site_content for select
  to anon, authenticated
  using (true);

-- content_revisions + heartbeat: keine Policies → nur service_role / security-definer-Funktionen

-- ---------------------------------------------------------------------------
-- Rechte (Least Privilege)
-- ---------------------------------------------------------------------------
revoke all on public.leads, public.site_content, public.content_revisions, public.heartbeat from anon, authenticated;
grant insert (name, phone, source, page, consent, consent_text) on public.leads to anon;
grant select on public.site_content to anon, authenticated;

revoke execute on function public.publish_content(text, jsonb, integer, text, text) from public, anon, authenticated;
grant execute on function public.publish_content(text, jsonb, integer, text, text) to service_role;

revoke execute on function public.keep_alive(text) from public, authenticated;
grant execute on function public.keep_alive(text) to anon, service_role;
