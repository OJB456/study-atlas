create table if not exists public.activities (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table if not exists public.daily_tasks (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table if not exists public.focus_sessions (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table if not exists public.timer_state (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null default 'singleton',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  check (id = 'singleton')
);

create table if not exists public.user_settings (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null default 'singleton',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  check (id = 'singleton')
);

alter table public.activities enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.timer_state enable row level security;
alter table public.user_settings enable row level security;

create policy "owner manages activities" on public.activities
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages daily tasks" on public.daily_tasks
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages focus sessions" on public.focus_sessions
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages timer state" on public.timer_state
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages settings" on public.user_settings
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create or replace function public.keep_newest_study_atlas_row()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at < old.updated_at then
    return old;
  end if;
  return new;
end;
$$;

create trigger activities_last_write_wins before update on public.activities
  for each row execute function public.keep_newest_study_atlas_row();
create trigger daily_tasks_last_write_wins before update on public.daily_tasks
  for each row execute function public.keep_newest_study_atlas_row();
create trigger focus_sessions_last_write_wins before update on public.focus_sessions
  for each row execute function public.keep_newest_study_atlas_row();
create trigger timer_state_last_write_wins before update on public.timer_state
  for each row execute function public.keep_newest_study_atlas_row();
create trigger user_settings_last_write_wins before update on public.user_settings
  for each row execute function public.keep_newest_study_atlas_row();
