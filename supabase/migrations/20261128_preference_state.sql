-- Run once as the project owner in Supabase SQL Editor.
-- Does not change existing accounts, posts, likes, or saved-look tables.
begin;
create table if not exists public.vybe_preference_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('taste','sample-saves','demo-likes','trend-saves','views')),
  value jsonb not null default '[]'::jsonb check (jsonb_typeof(value) = 'array' and octet_length(value::text) <= 65536),
  updated_at timestamptz not null default now(),
  primary key (user_id,kind)
);
alter table public.vybe_preference_state enable row level security;
revoke all on public.vybe_preference_state from anon, public;
grant select, insert, update, delete on public.vybe_preference_state to authenticated;
drop policy if exists vybe_preferences_select on public.vybe_preference_state;
create policy vybe_preferences_select on public.vybe_preference_state for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists vybe_preferences_insert on public.vybe_preference_state;
create policy vybe_preferences_insert on public.vybe_preference_state for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists vybe_preferences_update on public.vybe_preference_state;
create policy vybe_preferences_update on public.vybe_preference_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists vybe_preferences_delete on public.vybe_preference_state;
create policy vybe_preferences_delete on public.vybe_preference_state for delete to authenticated using ((select auth.uid()) = user_id);
commit;
