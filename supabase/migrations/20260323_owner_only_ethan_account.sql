begin;

do $$
declare
  owner_user_id uuid;
begin
  select id
  into owner_user_id
  from auth.users
  where email = 'ethanxing2007@gmail.com'
  limit 1;

  if owner_user_id is null then
    raise exception 'No auth user found for ethanxing2007@gmail.com';
  end if;

  update public.songs
  set user_id = owner_user_id;
end
$$;

alter table public.songs enable row level security;

drop policy if exists songs_select_own on public.songs;
drop policy if exists songs_insert_own on public.songs;
drop policy if exists songs_update_own on public.songs;
drop policy if exists songs_delete_own on public.songs;

drop policy if exists songs_owner_only_select on public.songs;
create policy songs_owner_only_select
on public.songs
for select
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'ethanxing2007@gmail.com'
);

drop policy if exists songs_owner_only_insert on public.songs;
create policy songs_owner_only_insert
on public.songs
for insert
with check (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'ethanxing2007@gmail.com'
);

drop policy if exists songs_owner_only_update on public.songs;
create policy songs_owner_only_update
on public.songs
for update
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'ethanxing2007@gmail.com'
)
with check (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'ethanxing2007@gmail.com'
);

drop policy if exists songs_owner_only_delete on public.songs;
create policy songs_owner_only_delete
on public.songs
for delete
using (
  auth.uid() = user_id
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'ethanxing2007@gmail.com'
);

commit;
