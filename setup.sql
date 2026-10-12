-- Treatly web app: database setup.
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
--
-- Each person's entries are private to them. Friends only ever see the summary
-- that person's app chooses to share (based on their privacy settings), and only
-- after a friend request is accepted or an invite link is used.

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_emoji text not null default '🍩' check (char_length(avatar_emoji) between 1 and 16),
  avatar_color text not null default 'peach'
    check (avatar_color in ('peach', 'mint', 'sky', 'lilac', 'lemon', 'rose')),
  created_at timestamptz not null default now()
);

-- The person's whole tracker (entries, goals, occasions, settings). Owner only.
create table if not exists public.user_state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  state jsonb not null default '{}' check (pg_column_size(state) < 900000),
  invite_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  updated_at timestamptz not null default now()
);

-- What friends may see, written by the owner's app from their privacy settings.
create table if not exists public.summaries (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  data jsonb not null default '{}' check (pg_column_size(data) < 60000),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index if not exists friendships_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table if not exists public.cheers (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null check (char_length(item_id) <= 64),
  created_at timestamptz not null default now(),
  primary key (user_id, owner_id, item_id)
);

-- ---------------------------------------------------------------- helpers

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b));
$$;

create or replace function public.is_my_friend(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.are_friends(auth.uid(), other);
$$;

-- Create the profile from the sign-up form.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_username text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if v_username !~ '^[a-z0-9_]{3,20}$'
     or exists (select 1 from public.profiles p where p.username = v_username) then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  if v_name = '' then v_name := v_username; end if;
  insert into public.profiles (id, username, display_name) values (new.id, v_username, left(v_name, 40));
  insert into public.user_state (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- row-level security

alter table public.profiles enable row level security;
alter table public.user_state enable row level security;
alter table public.summaries enable row level security;
alter table public.friendships enable row level security;
alter table public.cheers enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (select 1 from public.friendships f
             where (f.requester_id = (select auth.uid()) and f.addressee_id = profiles.id)
                or (f.addressee_id = (select auth.uid()) and f.requester_id = profiles.id)));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists state_own on public.user_state;
create policy state_own on public.user_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists summaries_read on public.summaries;
create policy summaries_read on public.summaries for select to authenticated
  using (user_id = (select auth.uid()) or public.is_my_friend(user_id));
drop policy if exists summaries_write on public.summaries;
create policy summaries_write on public.summaries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

drop policy if exists cheers_select on public.cheers;
create policy cheers_select on public.cheers for select to authenticated
  using (user_id = (select auth.uid()) or owner_id = (select auth.uid()) or public.is_my_friend(owner_id));
drop policy if exists cheers_insert on public.cheers;
create policy cheers_insert on public.cheers for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_my_friend(owner_id));
drop policy if exists cheers_delete on public.cheers;
create policy cheers_delete on public.cheers for delete to authenticated
  using (user_id = (select auth.uid()));

-- Nobody can change ids, usernames or invite codes directly.
revoke insert, update on public.profiles, public.user_state from anon, authenticated;
grant update (display_name, avatar_emoji, avatar_color) on public.profiles to authenticated;
grant update (state, updated_at) on public.user_state to authenticated;
grant insert (user_id, state) on public.user_state to authenticated;

-- ---------------------------------------------------------------- friend functions

create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

-- Look someone up by their exact username.
create or replace function public.find_user(p_username text)
returns table (id uuid, username text, display_name text, avatar_emoji text, avatar_color text, relation text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_emoji, p.avatar_color,
    case when f.status = 'accepted' then 'friend'
         when f.requester_id = auth.uid() then 'outgoing'
         when f.addressee_id = auth.uid() then 'incoming'
         else 'none' end
  from public.profiles p
  left join public.friendships f
    on least(f.requester_id, f.addressee_id) = least(p.id, auth.uid())
   and greatest(f.requester_id, f.addressee_id) = greatest(p.id, auth.uid())
  where auth.uid() is not null and p.id <> auth.uid()
    and p.username = lower(btrim(btrim(p_username), '@'));
$$;

create or replace function public.send_friend_request(p_target uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); f public.friendships;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_target = me then raise exception 'You cannot add yourself' using errcode = '22023'; end if;
  select * into f from public.friendships x
   where least(x.requester_id, x.addressee_id) = least(me, p_target)
     and greatest(x.requester_id, x.addressee_id) = greatest(me, p_target);
  if found then
    if f.status = 'accepted' then return 'friend'; end if;
    if f.addressee_id = me then
      update public.friendships set status = 'accepted', responded_at = now() where id = f.id;
      return 'friend';
    end if;
    return 'outgoing';
  end if;
  insert into public.friendships (requester_id, addressee_id) values (me, p_target);
  return 'outgoing';
end;
$$;

create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
     where id = p_request and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships where id = p_request and addressee_id = auth.uid() and status = 'pending';
  end if;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
end;
$$;

-- Shown on the invite page before someone signs up.
create or replace function public.invite_preview(p_code text)
returns table (display_name text, avatar_emoji text, avatar_color text)
language sql stable security definer set search_path = '' as $$
  select p.display_name, p.avatar_emoji, p.avatar_color
  from public.user_state s join public.profiles p on p.id = s.user_id
  where s.invite_code = p_code;
$$;

-- Sharing the link is the inviter's consent, so this makes you friends straight away.
create or replace function public.accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); inviter uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select s.user_id into inviter from public.user_state s where s.invite_code = p_code;
  if inviter is null then raise exception 'Invite not found' using errcode = 'P0002'; end if;
  if inviter <> me then
    insert into public.friendships (requester_id, addressee_id, status, responded_at)
    values (inviter, me, 'accepted', now())
    on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
    do update set status = 'accepted', responded_at = now();
  end if;
  return inviter;
end;
$$;

create or replace function public.delete_my_account()
returns void language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.are_friends(uuid, uuid), public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_my_friend(uuid), public.find_user(text), public.send_friend_request(uuid),
  public.respond_friend_request(uuid, boolean), public.accept_invite(text), public.delete_my_account() from public, anon;
grant execute on function public.is_my_friend(uuid), public.find_user(text), public.send_friend_request(uuid),
  public.respond_friend_request(uuid, boolean), public.accept_invite(text), public.delete_my_account() to authenticated;
grant execute on function public.username_available(text), public.invite_preview(text) to anon, authenticated;
