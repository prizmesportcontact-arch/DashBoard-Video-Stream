-- Dashboard créateur — base de données
-- À exécuter une seule fois dans l'éditeur SQL du projet Supabase.
-- Chaque ligne appartient à l'utilisateur connecté ; personne d'autre ne peut la lire.

create extension if not exists pgcrypto;

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  kind text not null default 'video' check (kind in ('video', 'stream')),
  platforms text[] not null default '{}',
  status text not null default 'idee'
    check (status in ('idee', 'tourne', 'montage', 'pret', 'programme', 'publie')),
  planned_at timestamptz,
  file_url text,
  thumb_url text,
  sponsor text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  hook text,
  notes text,
  tags text[] not null default '{}',
  platforms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  due_on date,
  priority smallint not null default 2 check (priority between 1 and 3),
  done boolean not null default false,
  video_id uuid references public.videos (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  platform text,
  current_value numeric not null default 0,
  target_value numeric not null check (target_value > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'instagram', 'twitch', 'youtube')),
  recorded_on date not null default current_date,
  followers integer not null default 0 check (followers >= 0),
  views integer not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, recorded_on)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text,
  video_id uuid references public.videos (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);

create table if not exists public.review_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  at_seconds numeric not null default 0 check (at_seconds >= 0),
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists videos_user_planned_idx on public.videos (user_id, planned_at);
create index if not exists ideas_user_idx on public.ideas (user_id, created_at desc);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_on);
create index if not exists tasks_video_idx on public.tasks (video_id);
create index if not exists goals_user_idx on public.goals (user_id);
create index if not exists metrics_user_idx on public.metrics (user_id, platform, recorded_on desc);
create index if not exists notes_user_idx on public.notes (user_id, updated_at desc);
create index if not exists time_entries_user_idx on public.time_entries (user_id, started_at desc);
create index if not exists time_entries_video_idx on public.time_entries (video_id);
create index if not exists review_comments_video_idx on public.review_comments (video_id, at_seconds);
create index if not exists review_comments_user_idx on public.review_comments (user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['videos', 'ideas', 'tasks', 'goals', 'metrics', 'notes', 'time_entries', 'review_comments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists "%s_owner_select" on public.%I', t, t);
    execute format('drop policy if exists "%s_owner_insert" on public.%I', t, t);
    execute format('drop policy if exists "%s_owner_update" on public.%I', t, t);
    execute format('drop policy if exists "%s_owner_delete" on public.%I', t, t);

    execute format(
      'create policy "%s_owner_select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t, t);
    execute format(
      'create policy "%s_owner_insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t, t);
    execute format(
      'create policy "%s_owner_update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
    execute format(
      'create policy "%s_owner_delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t, t);

    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end;
$$;

-- Exports du monteur : fichiers vidéo privés, rangés dans un dossier par compte.
alter table public.videos add column if not exists media_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "media_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Comptes multiples : plusieurs comptes par plateforme.
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'twitch')),
  name text not null,
  handle text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists accounts_user_idx on public.accounts (user_id, platform, position);
alter table public.accounts enable row level security;
revoke all on public.accounts from anon;
grant select, insert, update, delete on public.accounts to authenticated;
create policy "accounts_owner_select" on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy "accounts_owner_insert" on public.accounts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "accounts_owner_update" on public.accounts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "accounts_owner_delete" on public.accounts for delete to authenticated using ((select auth.uid()) = user_id);
create trigger accounts_touch before update on public.accounts for each row execute function public.touch_updated_at();

alter table public.videos add column if not exists account_ids uuid[] not null default '{}';
alter table public.metrics add column if not exists account_id uuid references public.accounts (id) on delete cascade;
alter table public.metrics drop constraint if exists metrics_user_id_platform_recorded_on_key;
create unique index if not exists metrics_account_day_key on public.metrics (user_id, account_id, recorded_on);
create index if not exists metrics_account_idx on public.metrics (account_id);
alter table public.goals add column if not exists account_id uuid references public.accounts (id) on delete set null;
create index if not exists goals_account_idx on public.goals (account_id);

-- Connexion des comptes aux plateformes (Twitch pour commencer).
alter table public.accounts
  add column if not exists external_id text,
  add column if not exists avatar_url text,
  add column if not exists access_token text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists synced_at timestamptz;
create unique index if not exists accounts_external_key on public.accounts (user_id, platform, external_id) where external_id is not null;

-- Connexion TikTok : jeton de renouvellement (protégé par les règles RLS du compte).
alter table public.accounts add column if not exists refresh_token text;

-- Nombre de vidéos / publications sur la plateforme (mis à jour automatiquement).
alter table public.accounts add column if not exists content_count integer;

-- Publication : historique des envois vers Instagram (Reels) et TikTok (brouillons).
create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id uuid references public.videos (id) on delete set null,
  caption text,
  media_path text,
  file_name text,
  targets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.publications enable row level security;
revoke all on public.publications from anon;
create policy "publications_select" on public.publications for select to authenticated using (user_id = (select auth.uid()));
create policy "publications_insert" on public.publications for insert to authenticated with check (user_id = (select auth.uid()));
create policy "publications_update" on public.publications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "publications_delete" on public.publications for delete to authenticated using (user_id = (select auth.uid()));
create index if not exists publications_user_idx on public.publications (user_id, created_at desc);
create trigger publications_touch before update on public.publications for each row execute function public.touch_updated_at();
