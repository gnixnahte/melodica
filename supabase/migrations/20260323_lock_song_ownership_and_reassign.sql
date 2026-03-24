begin;

-- Ensure songs rows are tied to a specific authenticated user.
alter table public.songs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Resolve the target account id from email and assign all existing songs to it.
do $$
declare
  target_user_id uuid;
begin
  select id
  into target_user_id
  from auth.users
  where email = 'ethanxing2007@gmail.com'
  limit 1;

  if target_user_id is null then
    raise exception 'No auth user found for ethanxing2007@gmail.com';
  end if;

  update public.songs
  set user_id = target_user_id;
end
$$;

-- Enforce ownership at the database layer.
alter table public.songs enable row level security;

drop policy if exists songs_select_own on public.songs;
create policy songs_select_own
on public.songs
for select
using (auth.uid() = user_id);

drop policy if exists songs_insert_own on public.songs;
create policy songs_insert_own
on public.songs
for insert
with check (auth.uid() = user_id);

drop policy if exists songs_update_own on public.songs;
create policy songs_update_own
on public.songs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists songs_delete_own on public.songs;
create policy songs_delete_own
on public.songs
for delete
using (auth.uid() = user_id);

commit;
