create table if not exists public.eru_admins (user_id uuid primary key references auth.users(id));
alter table public.eru_admins enable row level security;
create policy "own membership" on public.eru_admins for select to authenticated using(user_id=auth.uid());
grant select on public.eru_admins to authenticated;
create table if not exists public.eru_posts (id text primary key,status text not null check(status in ('draft','published')),payload jsonb not null,updated_at timestamptz not null default now());
alter table public.eru_posts enable row level security;
create policy "published read" on public.eru_posts for select to anon,authenticated using(status='published');
create policy "admin access" on public.eru_posts for all to authenticated using(exists(select 1 from public.eru_admins where user_id=auth.uid())) with check(exists(select 1 from public.eru_admins where user_id=auth.uid()));
grant select on public.eru_posts to anon,authenticated;
grant insert,update,delete on public.eru_posts to authenticated;
create table if not exists public.eru_site(id integer primary key check(id=1),payload jsonb not null);
alter table public.eru_site enable row level security;
create policy "site public" on public.eru_site for select to anon,authenticated using(true);
create policy "site admin" on public.eru_site for all to authenticated using(exists(select 1 from public.eru_admins where user_id=auth.uid())) with check(exists(select 1 from public.eru_admins where user_id=auth.uid()));
grant select on public.eru_site to anon,authenticated;
grant insert,update on public.eru_site to authenticated;
-- Create your login user in Supabase Authentication, then replace the UUID below:
-- insert into public.eru_admins(user_id) values ('YOUR-AUTH-USER-UUID');
