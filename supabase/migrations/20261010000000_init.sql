-- Treatly: social cheat-meal tracker
-- Core schema, row-level security, and the RPCs friends use to see each other's
-- progress. Friends never read another user's tables directly: every cross-user
-- read goes through a SECURITY DEFINER function that applies privacy settings.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (public-ish identity) and settings (owner only)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_emoji text not null default '🍩' check (char_length(avatar_emoji) between 1 and 16),
  avatar_color text not null default 'peach'
    check (avatar_color in ('peach', 'mint', 'sky', 'lilac', 'lemon', 'rose')),
  -- Private profiles are hidden from username search and can only be added via
  -- their owner's invite link.
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'UTC',
  -- What approved friends can see
  share_log_status boolean not null default true,
  share_daily_counts boolean not null default true,
  share_categories boolean not null default false,
  share_monthly_totals boolean not null default true,
  share_goal_progress boolean not null default true,
  share_history boolean not null default false,
  -- Notifications
  reminder_enabled boolean not null default false,
  reminder_time time not null default '20:00',
  notify_goal_ending boolean not null default true,
  notify_monthly_summary boolean not null default true,
  notify_friend_activity boolean not null default false,
  notify_monthly_review boolean not null default false,
  invite_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  updated_at timestamptz not null default now()
);

create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

create or replace function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from pg_timezone_names where name = tz);
$$;

alter table public.user_settings
  add constraint user_settings_timezone_valid check (public.is_valid_timezone(timezone));

-- The user's local calendar date, used for "today" in every server-side calc.
create or replace function public.local_today(p_user uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select s.timezone from public.user_settings s where s.user_id = p_user), 'UTC'))::date;
$$;

-- Create profile + settings when someone signs up. Username / name / timezone
-- come from the sign-up form via user metadata; we fall back to safe defaults
-- so OAuth sign-ins also work.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name',
                                new.raw_user_meta_data ->> 'full_name',
                                new.raw_user_meta_data ->> 'name',
                                split_part(coalesce(new.email, ''), '@', 1)));
  v_tz text := coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC');
begin
  if v_username !~ '^[a-z0-9_]{3,20}$'
     or exists (select 1 from public.profiles p where p.username = v_username) then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  if v_name = '' then
    v_name := v_username;
  end if;
  if not public.is_valid_timezone(v_tz) then
    v_tz := 'UTC';
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, left(v_name, 40));
  insert into public.user_settings (user_id, timezone) values (new.id, v_tz);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Food categories (system defaults now; per-user custom ones later)
-- ---------------------------------------------------------------------------

create table public.food_categories (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  label text not null,
  emoji text not null,
  sort_order int not null default 100,
  -- null = built-in category available to everyone
  user_id uuid references auth.users (id) on delete cascade
);

insert into public.food_categories (key, label, emoji, sort_order) values
  ('fast_food', 'Fast food', '🍟', 10),
  ('fried_food', 'Fried food', '🍗', 20),
  ('pizza', 'Pizza', '🍕', 30),
  ('burgers_sandwiches', 'Burgers & sandwiches', '🍔', 40),
  ('sweets_desserts', 'Sweets & desserts', '🍰', 50),
  ('chocolates_confectionery', 'Chocolates & confectionery', '🍫', 60),
  ('bakery', 'Bakery items', '🥐', 70),
  ('sugary_drinks', 'Sugary drinks', '🥤', 80),
  ('packaged_snacks', 'Packaged snacks', '🍿', 90),
  ('other', 'Other', '🍽️', 100);

-- ---------------------------------------------------------------------------
-- Daily food logs: one row per user per local calendar date
-- ---------------------------------------------------------------------------

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  had_cheat boolean not null,
  meal_count smallint not null default 0,
  categories text[] not null default '{}',
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_logs_one_per_day unique (user_id, log_date),
  -- A NO day has no meals; a YES day has 1..20 meals and at least one category.
  -- Categories describe the day's meals; they never change the meal count.
  constraint food_logs_shape check (
    (had_cheat and meal_count between 1 and 20 and cardinality(categories) between 1 and 10)
    or (not had_cheat and meal_count = 0 and cardinality(categories) = 0 and note is null)
  ),
  -- Nobody, anywhere on earth, is past this date yet.
  constraint food_logs_not_future check (log_date <= (now() at time zone 'Pacific/Kiritimati')::date),
  constraint food_logs_not_ancient check (log_date >= date '2000-01-01')
);

create index food_logs_user_date on public.food_logs (user_id, log_date desc);

create trigger food_logs_touch before update on public.food_logs
  for each row execute function public.touch_updated_at();

create or replace function public.validate_food_log_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.categories) c
    where not exists (
      select 1 from public.food_categories fc
      where fc.key = c and (fc.user_id is null or fc.user_id = new.user_id)
    )
  ) then
    raise exception 'Unknown food category' using errcode = '23514';
  end if;
  -- store each category once, in a stable order
  new.categories := array(select distinct c from unnest(new.categories) c order by c);
  return new;
end;
$$;

create trigger food_logs_validate before insert or update on public.food_logs
  for each row execute function public.validate_food_log_categories();

-- ---------------------------------------------------------------------------
-- Goals and temporary exceptions
-- ---------------------------------------------------------------------------

-- daily / weekly / monthly: recurring allowance per day, ISO week or calendar month
-- weekday_schedule: recurring weekly allowance split by weekday (Mon..Sun)
-- period_total: one allowance for the whole start..end period
create type public.goal_type as enum ('daily', 'weekly', 'monthly', 'weekday_schedule', 'period_total');

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_type public.goal_type not null,
  allowance smallint not null check (allowance between 0 and 500),
  schedule smallint[] check (
    schedule is null
    or (array_length(schedule, 1) = 7 and 0 <= all (schedule) and 20 >= all (schedule))
  ),
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'ended', 'cancelled')),
  paused_from date,
  previous_goal_id uuid references public.goals (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_end_after_start check (end_date is null or end_date >= start_date),
  constraint goals_total_needs_end check (goal_type <> 'period_total' or end_date is not null),
  constraint goals_schedule_shape check (
    (goal_type = 'weekday_schedule') = (schedule is not null)
  ),
  constraint goals_pause_shape check ((status = 'paused') = (paused_from is not null))
);

-- At most one current (active or paused) goal per user.
create unique index goals_one_current on public.goals (user_id) where status in ('active', 'paused');
create index goals_user on public.goals (user_id, start_date desc);

create trigger goals_touch before update on public.goals
  for each row execute function public.touch_updated_at();

create table public.goal_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  occasion text not null default 'vacation'
    check (occasion in ('vacation', 'birthday', 'wedding', 'festival', 'holiday', 'celebration', 'other')),
  label text check (label is null or char_length(label) <= 60),
  start_date date not null,
  end_date date not null,
  -- per_day: allowance applies to each day; total: allowance spread over the whole exception
  rule text not null check (rule in ('per_day', 'total')),
  allowance smallint not null check (allowance between 0 and 500),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_exceptions_dates check (end_date >= start_date and end_date - start_date <= 366),
  constraint goal_exceptions_no_overlap exclude using gist (
    user_id with =, daterange(start_date, end_date, '[]') with &&
  ) where (status = 'active')
);

create index goal_exceptions_user on public.goal_exceptions (user_id, start_date);

create trigger goal_exceptions_touch before update on public.goal_exceptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Friendships, activity feed, cheers
-- ---------------------------------------------------------------------------

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id)
);

create unique index friendships_pair on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
create index friendships_addressee on public.friendships (addressee_id);

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  );
$$;

-- Same as are_friends(auth.uid(), other), safe to expose to clients.
create or replace function public.is_my_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.are_friends(auth.uid(), other);
$$;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'logged', 'streak', 'goal_met', 'goal_started', 'goal_updated', 'exception', 'recap', 'joined'
  )),
  payload jsonb not null default '{}' check (pg_column_size(payload) <= 2048),
  dedupe_key text,
  created_at timestamptz not null default now(),
  constraint activities_dedupe unique (user_id, dedupe_key)
);

create index activities_user_time on public.activities (user_id, created_at desc);

create table public.activity_cheers (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

-- You can cheer an activity posted by one of your friends.
create or replace function public.can_cheer(p_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.activities a
    where a.id = p_activity and public.are_friends(a.user_id, auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Written only by the server (service role) to avoid sending duplicates.
create table public.notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, dedupe_key)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.food_categories enable row level security;
alter table public.food_logs enable row level security;
alter table public.goals enable row level security;
alter table public.goal_exceptions enable row level security;
alter table public.friendships enable row level security;
alter table public.activities enable row level security;
alter table public.activity_cheers enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

-- Profiles: yourself, your friends, anyone you have a pending request with, and
-- non-private profiles (so people can find each other by username).
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or not is_private
    or exists (
      select 1 from public.friendships f
      where (f.requester_id = (select auth.uid()) and f.addressee_id = profiles.id)
         or (f.addressee_id = (select auth.uid()) and f.requester_id = profiles.id)
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy settings_select on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy categories_select on public.food_categories for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));

-- Own rows only for logs, goals, exceptions and push subscriptions.
create policy food_logs_all on public.food_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goals_all on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goal_exceptions_all on public.goal_exceptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (goal_id is null or exists (
      select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())))
  );
create policy push_all on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Friendships: participants can see and delete (decline / cancel / unfriend).
-- Creating and accepting go through RPCs so nobody can forge an accepted row.
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- Activities: you read/write your own directly; friends read through get_feed().
create policy activities_own on public.activities for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Cheers: you can cheer your friends' activities and see cheers on your own.
create policy cheers_select on public.activity_cheers for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.activities a
               where a.id = activity_id and a.user_id = (select auth.uid()))
  );
create policy cheers_insert on public.activity_cheers for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_cheer(activity_id));
create policy cheers_delete on public.activity_cheers for delete to authenticated
  using (user_id = (select auth.uid()));

-- notification_log: no policies => only the service role can touch it.

-- Column-level hardening: users may not move rows between accounts or edit ids.
revoke insert, update on public.profiles, public.user_settings from authenticated, anon;
grant update (username, display_name, avatar_emoji, avatar_color, is_private)
  on public.profiles to authenticated;
grant update (timezone, share_log_status, share_daily_counts, share_categories,
  share_monthly_totals, share_goal_progress, share_history, reminder_enabled, reminder_time,
  notify_goal_ending, notify_monthly_summary, notify_friend_activity, notify_monthly_review)
  on public.user_settings to authenticated;
revoke all on public.notification_log from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Allowance engine (SQL twin of src/lib/engine/goals.ts)
-- Allowances accrue per day: weekly = a/7 per day, monthly = a/days-in-month,
-- weekday_schedule = schedule[weekday], period_total = a / period length.
-- An active exception replaces the goal's allowance on its dates.
-- ---------------------------------------------------------------------------

create or replace function public.goal_effective_end(g public.goals)
returns date
language sql
immutable
as $$
  select case
    when g.status = 'paused' then least(coalesce(g.end_date, 'infinity'::date), g.paused_from - 1)
    else coalesce(g.end_date, 'infinity'::date)
  end;
$$;

create or replace function public.day_allowance(p_user uuid, p_day date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.goal_exceptions;
  g public.goals;
begin
  select * into e from public.goal_exceptions x
  where x.user_id = p_user and x.status = 'active' and p_day between x.start_date and x.end_date
  limit 1;
  if found then
    if e.rule = 'per_day' then
      return e.allowance;
    end if;
    return e.allowance::numeric / (e.end_date - e.start_date + 1);
  end if;

  select * into g from public.goals x
  where x.user_id = p_user and x.status <> 'cancelled'
    and p_day >= x.start_date and p_day <= public.goal_effective_end(x)
  order by x.created_at desc
  limit 1;
  if not found then
    return null;
  end if;

  return case g.goal_type
    when 'daily' then g.allowance::numeric
    when 'weekly' then g.allowance::numeric / 7
    when 'monthly' then g.allowance::numeric
      / extract(day from (date_trunc('month', p_day) + interval '1 month - 1 day'))
    when 'weekday_schedule' then g.schedule[extract(isodow from p_day)::int]::numeric
    when 'period_total' then g.allowance::numeric / (g.end_date - g.start_date + 1)
  end;
end;
$$;

-- Current goal window for a user on a given day, with allowance and usage.
create or replace function public.goal_window(p_user uuid, p_day date)
returns table (
  goal_id uuid, goal_type public.goal_type, goal_allowance int,
  window_start date, window_end date, allowance int, used int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.goals;
  ws date;
  we date;
begin
  select * into g from public.goals x
  where x.user_id = p_user and x.status <> 'cancelled'
    and p_day >= x.start_date and p_day <= public.goal_effective_end(x)
  order by x.created_at desc
  limit 1;
  if not found then
    return;
  end if;

  if g.goal_type = 'daily' then
    ws := p_day; we := p_day;
  elsif g.goal_type in ('weekly', 'weekday_schedule') then
    ws := date_trunc('week', p_day)::date; we := ws + 6;
  elsif g.goal_type = 'monthly' then
    ws := date_trunc('month', p_day)::date;
    we := (date_trunc('month', p_day) + interval '1 month - 1 day')::date;
  else
    ws := g.start_date; we := g.end_date;
  end if;
  ws := greatest(ws, g.start_date);
  we := least(we, public.goal_effective_end(g));

  return query
  select g.id, g.goal_type, g.allowance::int, ws, we,
    (select round(coalesce(sum(public.day_allowance(p_user, d::date)), 0) + 0.000000001)::int
       from generate_series(ws, we, interval '1 day') d),
    (select coalesce(sum(l.meal_count), 0)::int from public.food_logs l
       where l.user_id = p_user and l.log_date between ws and we);
end;
$$;

-- Logging streak: consecutive logged days ending today (or yesterday, so the
-- streak isn't "broken" before the user has had a chance to log today).
create or replace function public.logging_streak(p_user uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date := public.local_today(p_user);
  n int := 0;
begin
  if not exists (select 1 from public.food_logs where user_id = p_user and log_date = d) then
    d := d - 1;
  end if;
  while exists (select 1 from public.food_logs where user_id = p_user and log_date = d) loop
    n := n + 1;
    d := d - 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Friend-facing RPCs (privacy enforced here)
-- ---------------------------------------------------------------------------

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

create or replace function public.search_profiles(p_query text)
returns table (
  id uuid, username text, display_name text, avatar_emoji text, avatar_color text,
  relation text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_emoji, p.avatar_color,
    case
      when f.status = 'accepted' then 'friend'
      when f.requester_id = auth.uid() then 'outgoing'
      when f.addressee_id = auth.uid() then 'incoming'
      else 'none'
    end
  from public.profiles p
  left join public.friendships f
    on least(f.requester_id, f.addressee_id) = least(p.id, auth.uid())
   and greatest(f.requester_id, f.addressee_id) = greatest(p.id, auth.uid())
  where auth.uid() is not null
    and p.id <> auth.uid()
    and char_length(btrim(p_query)) >= 2
    and (not p.is_private or f.id is not null)
    and (p.username like lower(btrim(p_query)) || '%'
         or p.display_name ilike '%' || btrim(p_query) || '%')
  order by (p.username = lower(btrim(p_query))) desc, p.username
  limit 20;
$$;

create or replace function public.send_friend_request(p_target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  f public.friendships;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_target = me then
    raise exception 'You cannot add yourself' using errcode = '22023';
  end if;

  select * into f from public.friendships x
  where least(x.requester_id, x.addressee_id) = least(me, p_target)
    and greatest(x.requester_id, x.addressee_id) = greatest(me, p_target);

  if found then
    if f.status = 'accepted' then
      return 'friend';
    elsif f.addressee_id = me then
      -- They already asked us: accept.
      update public.friendships set status = 'accepted', responded_at = now() where id = f.id;
      return 'friend';
    end if;
    return 'outgoing';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_target and not p.is_private) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, p_target);
  return 'outgoing';
end;
$$;

create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
    where id = p_request and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships
    where id = p_request and addressee_id = auth.uid() and status = 'pending';
  end if;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Public preview of an invite link (works before sign-up).
create or replace function public.invite_preview(p_code text)
returns table (id uuid, username text, display_name text, avatar_emoji text, avatar_color text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_emoji, p.avatar_color
  from public.user_settings s join public.profiles p on p.id = s.user_id
  where s.invite_code = p_code;
$$;

-- The inviter consented by sharing the link, so this creates an accepted friendship.
create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inviter uuid;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select s.user_id into inviter from public.user_settings s where s.invite_code = p_code;
  if inviter is null then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if inviter = me then
    return inviter;
  end if;

  insert into public.friendships (requester_id, addressee_id, status, responded_at)
  values (inviter, me, 'accepted', now())
  on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  do update set status = 'accepted', responded_at = now();
  return inviter;
end;
$$;

create or replace function public.regenerate_invite_code()
returns text
language sql
security definer
set search_path = ''
as $$
  update public.user_settings
  set invite_code = encode(extensions.gen_random_bytes(6), 'hex')
  where user_id = auth.uid()
  returning invite_code;
$$;

-- Snapshot of one friend, filtered by their privacy settings.
-- Fields the friend doesn't share come back as null.
create or replace function public.friend_snapshot(p_friend uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.user_settings;
  p public.profiles;
  today date;
  month_start date;
  t public.food_logs;
  w record;
  result jsonb;
begin
  if auth.uid() is null or not public.are_friends(auth.uid(), p_friend) then
    return null;
  end if;
  select * into s from public.user_settings where user_id = p_friend;
  select * into p from public.profiles where id = p_friend;
  today := public.local_today(p_friend);
  month_start := date_trunc('month', today)::date;
  select * into t from public.food_logs where user_id = p_friend and log_date = today;

  result := jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_emoji', p.avatar_emoji, 'avatar_color', p.avatar_color,
    'today', today,
    'share', jsonb_build_object(
      'log_status', s.share_log_status, 'daily_counts', s.share_daily_counts,
      'categories', s.share_categories, 'monthly_totals', s.share_monthly_totals,
      'goal_progress', s.share_goal_progress, 'history', s.share_history),
    'logged_today', case when s.share_log_status then t.id is not null end,
    'streak', case when s.share_log_status then public.logging_streak(p_friend) end,
    'had_cheat_today', case when s.share_daily_counts then t.had_cheat end,
    'meals_today', case when s.share_daily_counts then t.meal_count end,
    'categories_today', case when s.share_categories then to_jsonb(t.categories) end
  );

  if s.share_monthly_totals then
    result := result || (
      select jsonb_build_object(
        'month_meals', coalesce(sum(l.meal_count), 0),
        'month_cheat_days', count(*) filter (where l.had_cheat),
        'month_logged_days', count(*))
      from public.food_logs l
      where l.user_id = p_friend and l.log_date between month_start and today);
  end if;

  if s.share_goal_progress then
    select * into w from public.goal_window(p_friend, today);
    if found then
      result := result || jsonb_build_object('goal', jsonb_build_object(
        'goal_type', w.goal_type, 'goal_allowance', w.goal_allowance,
        'window_start', w.window_start, 'window_end', w.window_end,
        'allowance', w.allowance, 'used', w.used));
    end if;
    result := result || jsonb_build_object('exception', (
      select jsonb_build_object('occasion', x.occasion, 'label', x.label,
                                'start_date', x.start_date, 'end_date', x.end_date)
      from public.goal_exceptions x
      where x.user_id = p_friend and x.status = 'active' and today between x.start_date and x.end_date
      limit 1));
  end if;

  return result;
end;
$$;

create or replace function public.friends_overview()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.friend_snapshot(case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end)
  from public.friendships f
  where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id);
$$;

-- A friend's daily history for one month, if they share history.
create or replace function public.friend_history(p_friend uuid, p_month date)
returns table (log_date date, had_cheat boolean, meal_count int, categories text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.user_settings;
begin
  if auth.uid() is null or not public.are_friends(auth.uid(), p_friend) then
    return;
  end if;
  select * into s from public.user_settings where user_id = p_friend;
  if not s.share_history then
    return;
  end if;
  return query
  select l.log_date,
    case when s.share_daily_counts then l.had_cheat end,
    case when s.share_daily_counts then l.meal_count::int end,
    case when s.share_categories then l.categories end
  from public.food_logs l
  where l.user_id = p_friend
    and l.log_date >= date_trunc('month', p_month)::date
    and l.log_date < (date_trunc('month', p_month) + interval '1 month')::date
  order by l.log_date;
end;
$$;

-- Friends' activity, filtered by each friend's current privacy settings.
create or replace function public.get_feed(p_limit int default 30, p_before timestamptz default null)
returns table (
  id uuid, user_id uuid, kind text, payload jsonb, created_at timestamptz,
  username text, display_name text, avatar_emoji text, avatar_color text,
  cheers int, cheered boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.user_id, a.kind, a.payload, a.created_at,
    p.username, p.display_name, p.avatar_emoji, p.avatar_color,
    (select count(*)::int from public.activity_cheers c where c.activity_id = a.id),
    exists (select 1 from public.activity_cheers c where c.activity_id = a.id and c.user_id = auth.uid())
  from public.activities a
  join public.profiles p on p.id = a.user_id
  join public.user_settings s on s.user_id = a.user_id
  where (a.user_id = auth.uid() or public.are_friends(auth.uid(), a.user_id))
    and (p_before is null or a.created_at < p_before)
    and case a.kind
      when 'logged' then s.share_log_status
      when 'streak' then s.share_log_status
      when 'goal_met' then s.share_goal_progress
      when 'goal_started' then s.share_goal_progress
      when 'goal_updated' then s.share_goal_progress
      when 'exception' then s.share_goal_progress
      else true -- 'recap' and 'joined' are explicitly shared
    end
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function
  public.search_profiles(text),
  public.send_friend_request(uuid),
  public.respond_friend_request(uuid, boolean),
  public.accept_invite(text),
  public.regenerate_invite_code(),
  public.friend_snapshot(uuid),
  public.friends_overview(),
  public.friend_history(uuid, date),
  public.get_feed(int, timestamptz),
  public.delete_my_account(),
  public.is_my_friend(uuid),
  public.can_cheer(uuid)
to authenticated;
-- Internal helpers used by triggers / constraints / other definer functions.
grant execute on function public.is_valid_timezone(text), public.touch_updated_at() to authenticated;
-- These reveal data about arbitrary users, so they stay server-only.
revoke execute on function public.day_allowance(uuid, date), public.goal_window(uuid, date),
  public.logging_streak(uuid), public.local_today(uuid), public.are_friends(uuid, uuid),
  public.handle_new_user()
from authenticated;
