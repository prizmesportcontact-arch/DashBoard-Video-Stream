-- Dashboard créateur — base de données (phase 1)
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
  platform text not null check (platform in ('tiktok', 'instagram', 'twitch')),
  recorded_on date not null default current_date,
  followers integer not null default 0 check (followers >= 0),
  views integer not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, recorded_on)
);

create index if not exists videos_user_planned_idx on public.videos (user_id, planned_at);
create index if not exists ideas_user_idx on public.ideas (user_id, created_at desc);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_on);
create index if not exists tasks_video_idx on public.tasks (video_id);
create index if not exists goals_user_idx on public.goals (user_id);
create index if not exists metrics_user_idx on public.metrics (user_id, platform, recorded_on desc);

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
  foreach t in array array['videos', 'ideas', 'tasks', 'goals', 'metrics'] loop
    execute format('alter table public.%I enable row level security', t);

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
