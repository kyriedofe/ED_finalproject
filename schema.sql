-- ============================================================
-- QR-ATT — School Event Attendance Management System
-- Supabase PostgreSQL schema (tables, security, server functions)
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Paste this ENTIRE file
--   3. Click "Run"
--
-- Safe to re-run: the script is idempotent (it checks before
-- creating/altering anything), so it also upgrades an old
-- version of this database.
--
-- SECURITY SUMMARY (important for the exam):
--   * Row Level Security (RLS) is ON for every table.
--   * Students can only read their OWN attendance rows.
--   * NO client can INSERT attendance directly. Attendance is
--     only written by the server function record_attendance().
--   * QR codes contain a random token. Only its SHA-256 HASH
--     is stored, and nobody can read that table from the app.
--   * A database TRIGGER stops users changing their own role.
-- ============================================================

-- ------------------------------------------------------------
-- 0. SMALL HELPERS THAT DO NOT DEPEND ON ANY TABLE
-- ------------------------------------------------------------

-- The only place where the school timezone is written down.
-- >>> Change 'Asia/Manila' to your school's timezone. <<<
create or replace function public.school_timezone()
returns text
language sql immutable as $$
  select 'Asia/Manila'::text;
$$;

-- Current time expressed in the school's local wall clock.
create or replace function public.school_now()
returns timestamp
language sql stable as $$
  select now() at time zone public.school_timezone();
$$;

-- Turns a local date + time (for example 2026-10-21 08:00)
-- into an absolute timestamp the database can compare with now().
create or replace function public.to_school_tz(p_local timestamp)
returns timestamptz
language sql stable as $$
  select p_local at time zone public.school_timezone();
$$;

-- SHA-256 hash of a QR token. We store only the hash, never the
-- plain token (sha256() is built into PostgreSQL, no extension).
create or replace function public.hash_token(p_token text)
returns text
language sql stable as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- ------------------------------------------------------------
-- 1. PROFILES TABLE (one row per signed-up user)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  student_id text,
  role text not null default 'student',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrades for databases created with an older version of this file
alter table public.profiles add column if not exists student_id text;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Only these three roles exist. Public sign-up can never pick one:
-- the column default is 'student' and the sign-up trigger ignores
-- anything the app sends.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));

-- A student ID number may be used only once (blank stays allowed).
create unique index if not exists profiles_student_id_key
  on public.profiles (student_id) where student_id is not null;

-- ------------------------------------------------------------
-- 2. EVENTS TABLE
-- ------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique
    default ('EVT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  end_time time,
  venue text,
  status text not null default 'open',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrades for databases created with an older version of this file
alter table public.events add column if not exists description text;
alter table public.events add column if not exists venue text;
alter table public.events add column if not exists updated_at timestamptz not null default now();
alter table public.events add column if not exists event_date date;
alter table public.events add column if not exists status text not null default 'open';

-- Tables created by older versions have event_code WITHOUT a default
-- (the app lets the database fill it in). Without this line every
-- insert failed with a not-null violation on event_code.
alter table public.events
  alter column event_code set default
  ('EVT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

-- Upgrade path for databases created with an older version of this
-- file (start/end were timestamps there). First take the date from
-- the old timestamp, and only then keep the time part.
-- The column type is checked first: time-of-day columns (time, or
-- the old time with time zone) carry no date at all - only a
-- timestamp does - so for those the date can only come from
-- created_at. Casting a time value to date is illegal in PostgreSQL.
do $$
declare v_start_type text;
begin
  select data_type into v_start_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'events'
    and column_name = 'start_time';

  if v_start_type = 'timestamp with time zone' then
    update public.events
    set event_date = coalesce(
          timezone('Asia/Manila', start_time)::date,
          timezone('Asia/Manila', created_at)::date
        )
    where event_date is null;
  elsif v_start_type is not null then
    update public.events
    set event_date = timezone('Asia/Manila', created_at)::date
    where event_date is null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events'
      and column_name = 'start_time' and data_type = 'timestamp with time zone'
  ) then
    alter table public.events
      alter column start_time type time using (timezone('Asia/Manila', start_time)::time);
    alter table public.events
      alter column end_time type time using (timezone('Asia/Manila', end_time)::time);
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events'
      and column_name = 'start_time' and data_type = 'time with time zone'
  ) then
    -- Old databases may still hold 'time with time zone'. Keep only
    -- the wall-clock digits; the server's built-in timetz -> time
    -- cast does exactly that.
    alter table public.events
      alter column start_time type time using (start_time::time);
    alter table public.events
      alter column end_time type time using (end_time::time);
  end if;
end $$;

-- event_date is required from now on (this is a no-op on fresh installs).
alter table public.events alter column event_date set not null;

alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('open', 'closed'));

create index if not exists idx_events_created_by on public.events (created_by);
create index if not exists idx_events_event_date on public.events (event_date);

-- ------------------------------------------------------------
-- 3. ATTENDANCE TABLE (one row = one student attended one event)
-- ------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  attended_at timestamptz not null default now(),
  attendance_status text not null default 'present',
  correction_reason text,
  corrected_by uuid references auth.users (id) on delete set null,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  -- DATABASE-LEVEL DUPLICATE PROTECTION: two phones scanning at
  -- exactly the same time can never create two rows.
  constraint attendance_student_event_unique unique (student_id, event_id)
);

-- Old version called the column "scanned_at" -> rename it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance'
      and column_name = 'scanned_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance'
      and column_name = 'attended_at'
  ) then
    alter table public.attendance rename column scanned_at to attended_at;
  end if;
end $$;

alter table public.attendance add column if not exists attendance_status text not null default 'present';
alter table public.attendance add column if not exists correction_reason text;
alter table public.attendance add column if not exists corrected_by uuid references auth.users (id) on delete set null;
alter table public.attendance add column if not exists corrected_at timestamptz;
alter table public.attendance add column if not exists created_at timestamptz not null default now();

alter table public.attendance drop constraint if exists attendance_attendance_status_check;
alter table public.attendance add constraint attendance_attendance_status_check
  check (attendance_status in ('present', 'absent', 'excused'));

create index if not exists idx_attendance_event on public.attendance (event_id);
create index if not exists idx_attendance_student on public.attendance (student_id);

-- ------------------------------------------------------------
-- 4. QR TOKEN TABLE (only SHA-256 hashes are stored!)
--    RLS is enabled with NO policies -> the app can never read
--    tokens; only the server functions in section 6 use it.
-- ------------------------------------------------------------
create table if not exists public.event_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_qr_tokens_event on public.event_qr_tokens (event_id);

-- ------------------------------------------------------------
-- 5. AUDIT LOG (who changed what - visible to administrators)
-- ------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);

-- ------------------------------------------------------------
-- 6. IDENTITY HELPERS + TRIGGERS
-- ------------------------------------------------------------

-- Role of the user making the current request.
-- SECURITY DEFINER = this runs with the function owner's rights,
-- so it can read profiles even where RLS would hide rows, and it
-- cannot be influenced by data sent from the phone.
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_active from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Automatically create a profile after a user signs up.
-- The role is ALWAYS 'student' here - sign-up data can never
-- choose another role, because this trigger ignores it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keeps updated_at correct whenever a row changes.
create or replace function public.set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute procedure public.set_updated_at();

-- BLOCKS privilege escalation at database level: even if someone
-- edits the app or calls the API directly, they cannot change
-- their own role, active flag or email.
create or replace function public.protect_profile_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Trusted server-side edits (Supabase Table Editor, SQL Editor,
  -- migrations) run as postgres/service_role and carry no user JWT,
  -- so auth.uid() is null there. Anonymous API clients also have a
  -- null uid, but they can never reach this trigger: the profiles
  -- RLS policies do not allow them to update any row. Allowing the
  -- null path therefore only opens the dashboard/SQL route, which
  -- is exactly where an administrator manages roles.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role then
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role.';
    elsif not public.is_admin() then
      raise exception 'Only administrators can change user roles.';
    end if;
  end if;

  if new.is_active is distinct from old.is_active then
    if new.id = auth.uid() then
      raise exception 'You cannot activate or deactivate your own account.';
    elsif not public.is_admin() then
      raise exception 'Only administrators can activate or deactivate accounts.';
    end if;
  end if;

  if new.email is distinct from old.email then
    raise exception 'Email cannot be changed.';
  end if;

  if new.id is distinct from old.id then
    raise exception 'Profile id cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_changes on public.profiles;
create trigger profiles_protect_changes
  before update on public.profiles
  for each row execute procedure public.protect_profile_changes();

-- ============================================================
-- 7. SERVER FUNCTIONS FOR THE APP (the "trusted backend")
-- ============================================================

-- ------------------------------------------------------------
-- 7a. generate_event_qr_token(event_id)
--     Called by a teacher/admin to show a QR code.
--     Returns the plain token ONCE; only its hash is saved.
--     Regenerating revokes the previous token (rotation).
-- ------------------------------------------------------------
create or replace function public.generate_event_qr_token(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_token text;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Please log in first.');
  end if;
  if not public.is_active_user() then
    return jsonb_build_object('ok', false, 'message', 'Your account is deactivated.');
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Event not found.');
  end if;
  if not public.is_admin() and v_event.created_by is distinct from auth.uid() then
    return jsonb_build_object(
      'ok', false,
      'message', 'You can only generate QR codes for your own events.'
    );
  end if;

  -- Rotation: every previously shown QR code for this event dies now.
  update public.event_qr_tokens set revoked = true where event_id = p_event_id;

  -- 32 random hexadecimal characters (122 bits of randomness).
  v_token := replace(gen_random_uuid()::text, '-', '');

  -- The QR expires when the event's attendance window closes.
  v_expires := public.to_school_tz(
    v_event.event_date + coalesce(v_event.end_time, time '23:59')
  );
  if v_expires < now() then
    v_expires := now() + interval '1 day';
  end if;

  insert into public.event_qr_tokens (event_id, token_hash, created_by, expires_at)
  values (p_event_id, public.hash_token(v_token), auth.uid(), v_expires);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires,
    'event_title', v_event.title
  );
end;
$$;

-- ------------------------------------------------------------
-- 7b. record_attendance(payload)  <-- THE core server function.
--     The phone only sends {"v":"2","token":"..."}.
--     Everything else (who you are, your role, the event, the
--     time window, duplicates) is verified HERE, in the database.
-- ------------------------------------------------------------
create or replace function public.record_attendance(p_payload text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_json jsonb;
  v_token text;
  v_qr public.event_qr_tokens%rowtype;
  v_event public.events%rowtype;
  v_now timestamp := public.school_now();
begin
  -- STEP 1: is anyone logged in?
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'Please log in to record attendance.');
  end if;

  -- STEP 2: who is logged in, and are they allowed to check in?
  select * into v_profile from public.profiles where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Profile not found. Please contact the administrator.');
  end if;
  if v_profile.is_active = false then
    return jsonb_build_object('ok', false, 'message', 'Your account is deactivated. Please contact the administrator.');
  end if;
  if v_profile.role <> 'student' then
    return jsonb_build_object('ok', false, 'message', 'Only student accounts can record attendance.');
  end if;

  -- STEP 3: does the scanned text have the right format?
  begin
    v_json := p_payload::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'message', 'Invalid QR code.');
  end;
  if coalesce(v_json ->> 'v', '') <> '2' then
    return jsonb_build_object('ok', false, 'message', 'Invalid QR code.');
  end if;
  v_token := v_json ->> 'token';
  if v_token is null or length(v_token) < 16 then
    return jsonb_build_object('ok', false, 'message', 'Invalid QR code.');
  end if;

  -- STEP 4: does a live token match this hash?
  -- The scanned token is hashed first, so the database only ever
  -- compares hashes - the plain token is never stored.
  select * into v_qr
  from public.event_qr_tokens
  where token_hash = public.hash_token(v_token);

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Invalid QR code.');
  end if;
  if v_qr.revoked then
    return jsonb_build_object('ok', false, 'message', 'This QR code was revoked. Please ask for a new one.');
  end if;
  if v_qr.expires_at is not null and v_qr.expires_at < now() then
    return jsonb_build_object('ok', false, 'message', 'This QR code has expired.');
  end if;

  -- STEP 5: does the event exist, is it open, is now inside its window?
  select * into v_event from public.events where id = v_qr.event_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Invalid QR code.');
  end if;
  if v_event.status <> 'open' then
    return jsonb_build_object('ok', false, 'message', 'This event is closed.');
  end if;
  if v_event.event_date is null then
    return jsonb_build_object('ok', false, 'message', 'This event has no date set. Please contact your teacher.');
  end if;
  if v_now::date < v_event.event_date then
    return jsonb_build_object('ok', false, 'message', 'This event has not started yet. Please wait until the event date.');
  end if;
  if v_now::date > v_event.event_date then
    return jsonb_build_object('ok', false, 'message', 'The date of this event has already passed.');
  end if;
  if v_event.start_time is not null and v_now::time < v_event.start_time then
    return jsonb_build_object('ok', false, 'message', 'This event has not started yet.');
  end if;
  if v_event.end_time is not null and v_now::time > v_event.end_time then
    return jsonb_build_object('ok', false, 'message', 'The attendance window for this event has ended.');
  end if;

  -- STEP 6: has this student already attended?
  if exists (
    select 1 from public.attendance
    where student_id = v_user_id and event_id = v_event.id
  ) then
    return jsonb_build_object('ok', false, 'message', 'You have already attended this event.');
  end if;

  -- STEP 7: save it. Success is only reported AFTER the insert works.
  insert into public.attendance (student_id, event_id, attended_at, attendance_status)
  values (v_user_id, v_event.id, now(), 'present');

  return jsonb_build_object(
    'ok', true,
    'message', 'Attendance recorded successfully.',
    'event_title', v_event.title
  );

exception
  -- Safety net if two requests race each other: the unique
  -- constraint rejects the second one and we answer politely.
  when unique_violation then
    return jsonb_build_object('ok', false, 'message', 'You have already attended this event.');
  when others then
    return jsonb_build_object('ok', false, 'message', 'Unable to connect. Please try again.');
end;
$$;

-- ------------------------------------------------------------
-- 7c. Administrator operations.
--     Each one checks is_admin() first and writes a row into
--     audit_logs afterwards.
-- ------------------------------------------------------------
create or replace function public.admin_set_user_role(p_user_id uuid, p_new_role text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only administrators can change user roles.');
  end if;
  if p_new_role not in ('student', 'teacher', 'admin') then
    return jsonb_build_object('ok', false, 'message', 'Invalid role.');
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'message', 'You cannot change your own role.');
  end if;

  update public.profiles set role = p_new_role where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'User not found.');
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'role_change', 'profile', p_user_id,
          jsonb_build_object('new_role', p_new_role));

  return jsonb_build_object('ok', true, 'message', 'Role updated.');
end;
$$;

create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only administrators can activate or deactivate accounts.');
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'message', 'You cannot deactivate your own account.');
  end if;

  update public.profiles set is_active = p_active where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'User not found.');
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'account_status', 'profile', p_user_id,
          jsonb_build_object('is_active', p_active));

  return jsonb_build_object(
    'ok', true,
    'message', case when p_active then 'Account activated.' else 'Account deactivated.' end
  );
end;
$$;

-- Correcting an attendance record is an administrative action:
-- it REQUIRES a reason and is written to the audit log.
create or replace function public.admin_correct_attendance(
  p_attendance_id uuid,
  p_new_status text,
  p_reason text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only administrators can correct attendance records.');
  end if;
  if p_new_status not in ('present', 'absent', 'excused') then
    return jsonb_build_object('ok', false, 'message', 'Invalid attendance status.');
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    return jsonb_build_object('ok', false, 'message', 'A reason is required for corrections.');
  end if;

  update public.attendance
  set attendance_status = p_new_status,
      correction_reason = trim(p_reason),
      corrected_by = auth.uid(),
      corrected_at = now()
  where id = p_attendance_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Attendance record not found.');
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'attendance_correction', 'attendance', p_attendance_id,
          jsonb_build_object('new_status', p_new_status, 'reason', trim(p_reason)));

  return jsonb_build_object('ok', true, 'message', 'Attendance record corrected.');
end;
$$;

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
--    RLS answers one question for every request:
--    "which rows may THIS user see or change?"
-- ============================================================

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
alter table public.event_qr_tokens enable row level security;
alter table public.audit_logs enable row level security;

-- --- profiles ---------------------------------------------------
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles"
  on public.profiles for select
  using (public.is_admin());

-- Teachers may read the students who attended their own events
-- (this is how attendee names appear in the attendance list).
drop policy if exists "Teachers read attendee profiles" on public.profiles;
create policy "Teachers read attendee profiles"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

-- Users may re-create their own profile row only as an ACTIVE
-- STUDENT (the normal path is the handle_new_user trigger, which
-- already inserts it). This closes the gap where a deleted profile
-- could be re-inserted with role = 'admin' from a modified app.
drop policy if exists "Insert own profile" on public.profiles;
create policy "Insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'student' and is_active);

-- Users may edit their own row (name / student_id).
-- Changing role, is_active or email is blocked by the
-- profiles_protect_changes trigger created in section 6.
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- --- events -----------------------------------------------------
-- Every signed-in, active user can READ events (students browse them).
drop policy if exists "Authenticated users read events" on public.events;
create policy "Authenticated users read events"
  on public.events for select
  using (auth.uid() is not null and public.is_active_user());

-- Only active teachers and admins may create events, and the row
-- must belong to them (admins may create events too).
drop policy if exists "Teachers create their events" on public.events;
create policy "Teachers create their events"
  on public.events for insert
  with check (
    auth.uid() = created_by
    and public.my_role() in ('teacher', 'admin')
    and public.is_active_user()
  );

-- Owners may edit/close their own events; admins may edit any event.
drop policy if exists "Owners and admins update events" on public.events;
create policy "Owners and admins update events"
  on public.events for update
  using (
    (auth.uid() = created_by and public.my_role() in ('teacher', 'admin'))
    or public.is_admin()
  );

drop policy if exists "Owners and admins delete events" on public.events;
create policy "Owners and admins delete events"
  on public.events for delete
  using (
    (auth.uid() = created_by and public.my_role() in ('teacher', 'admin'))
    or public.is_admin()
  );

-- --- attendance --------------------------------------------------
-- READ: students see only their own rows,
--       teachers see rows of their own events,
--       admins see everything.
drop policy if exists "Students read own attendance" on public.attendance;
create policy "Students read own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);

drop policy if exists "Teachers read attendance of their events" on public.attendance;
create policy "Teachers read attendance of their events"
  on public.attendance for select
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

drop policy if exists "Admins read all attendance" on public.attendance;
create policy "Admins read all attendance"
  on public.attendance for select
  using (public.is_admin());

-- NO insert policy and NO update policy on purpose!
-- Without those policies every direct write from a phone is
-- rejected by the database. Attendance rows are only written by
-- record_attendance() and admin_correct_attendance().

-- --- event_qr_tokens ---------------------------------------------
-- RLS enabled with ZERO policies: the app can never read or write
-- token rows. Only the security-definer functions touch them.

-- --- audit_logs ---------------------------------------------------
drop policy if exists "Admins read audit logs" on public.audit_logs;
create policy "Admins read audit logs"
  on public.audit_logs for select
  using (public.is_admin());
-- No insert policy: only the server functions write audit rows.

-- ============================================================
-- 9. GRANTS
--    The server functions are the only entry points, and the
--    anonymous role (not logged in) cannot call them at all.
-- ============================================================
revoke all on function public.record_attendance(text) from public, anon;
grant execute on function public.record_attendance(text) to authenticated;

revoke all on function public.generate_event_qr_token(uuid) from public, anon;
grant execute on function public.generate_event_qr_token(uuid) to authenticated;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

revoke all on function public.admin_correct_attendance(uuid, text, text) from public, anon;
grant execute on function public.admin_correct_attendance(uuid, text, text) to authenticated;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
