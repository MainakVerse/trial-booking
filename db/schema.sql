-- Idempotent schema. Applied by `npm run db:migrate`.

create extension if not exists pgcrypto;

create table if not exists mentors (
  id          text primary key,
  name        text not null,
  email       text not null,
  timezone    text not null,
  start_hour  smallint not null check (start_hour between 0 and 23),
  end_hour    smallint not null check (end_hour between 1 and 24),
  access_hash text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (end_hour > start_hour)
);
create unique index if not exists mentors_email_uniq on mentors (lower(email));

create table if not exists bookings (
  id              uuid primary key default gen_random_uuid(),
  manage_token    text not null unique,
  mentor_id       text not null references mentors (id),
  parent_name     text not null,
  parent_email    text not null,
  parent_key      text not null,
  parent_timezone text not null,
  start_utc       timestamptz not null,
  end_utc         timestamptz not null,
  meeting_link    text not null,
  status          text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancelled_at    timestamptz,
  cancelled_by    text check (cancelled_by in ('parent', 'admin')),
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  check (end_utc > start_utc)
);

-- A mentor can never hold two confirmed classes at the same instant, whatever the app does.
create unique index if not exists bookings_mentor_slot_uniq
  on bookings (mentor_id, start_utc) where status = 'confirmed';
create index if not exists bookings_start_idx on bookings (start_utc);
create index if not exists bookings_mentor_idx on bookings (mentor_id, start_utc);
create index if not exists bookings_parent_idx on bookings (parent_key) where status = 'confirmed';

create table if not exists email_log (
  id         bigserial primary key,
  booking_id uuid references bookings (id) on delete set null,
  recipient  text not null,
  subject    text not null,
  body       text not null,
  status     text not null check (status in ('sent', 'logged', 'failed')),
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_created_idx on email_log (created_at desc);
