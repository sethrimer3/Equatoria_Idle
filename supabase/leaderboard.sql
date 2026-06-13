-- Equatoria Idle — minimal Supabase leaderboard setup
--
-- Usage:
--   1. Create/open your Supabase project.
--   2. Open SQL Editor.
--   3. Paste this full file and run it once.
--
-- What this creates:
--   - public.leaderboard table
--   - public.submit_leaderboard_score(username, score) RPC
--   - public.get_leaderboard(limit) RPC
--   - public read access for leaderboard rows
--   - no accounts, passwords, profiles, cloud saves, or auth flow
--
-- Security model:
--   - Anyone can read leaderboard rows.
--   - The browser client cannot directly insert/update/delete rows.
--   - The browser client can only call submit_leaderboard_score().
--   - The function validates username and score, then only raises a player's high score.
--
-- Important limitation:
--   This is a casual leaderboard, not anti-cheat. A determined player can still
--   submit fake scores from browser devtools because the game runs client-side.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.leaderboard (
  username text primary key,
  high_score integer not null check (high_score >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.leaderboard is
  'Minimal public leaderboard for Equatoria Idle: username + highest wave only.';

comment on column public.leaderboard.username is
  'Player-chosen public display name. Letters, numbers, and underscores only.';

comment on column public.leaderboard.high_score is
  'Highest wave reached. Only increases through submit_leaderboard_score().';

comment on column public.leaderboard.updated_at is
  'Timestamp of the last submitted improvement for this username.';

create index if not exists leaderboard_high_score_idx
  on public.leaderboard (high_score desc, updated_at asc, username asc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security and direct table permissions
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.leaderboard enable row level security;

-- Keep this safe to re-run.
drop policy if exists "leaderboard_public_read" on public.leaderboard;

-- Public clients may read leaderboard rows.
create policy "leaderboard_public_read"
  on public.leaderboard
  for select
  to anon, authenticated
  using (true);

-- Do not grant direct write access to public browser roles.
revoke insert, update, delete on public.leaderboard from anon, authenticated;

-- Grant read access. RLS policy above still controls SELECT visibility.
grant select on public.leaderboard to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Submit score RPC
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.submit_leaderboard_score(
  p_username text,
  p_score integer
)
returns table (
  username text,
  high_score integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := btrim(coalesce(p_username, ''));
  v_score integer := p_score;
begin
  -- Keep usernames simple because they are public and displayed in-game.
  if v_username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Invalid username. Use 3-20 letters, numbers, or underscores.'
      using errcode = '22023';
  end if;

  -- Adjust this cap if Equatoria Idle eventually supports higher wave numbers.
  if v_score is null or v_score < 0 or v_score > 1000000 then
    raise exception 'Invalid high score.'
      using errcode = '22023';
  end if;

  return query
  insert into public.leaderboard as lb (username, high_score, updated_at)
  values (v_username, v_score, now())
  on conflict (username)
  do update set
    high_score = greatest(lb.high_score, excluded.high_score),
    updated_at = case
      when excluded.high_score > lb.high_score then now()
      else lb.updated_at
    end
  returning lb.username, lb.high_score, lb.updated_at;
end;
$$;

comment on function public.submit_leaderboard_score(text, integer) is
  'Validated public RPC for submitting a username and high score. Existing scores only increase.';

revoke all on function public.submit_leaderboard_score(text, integer) from public;
grant execute on function public.submit_leaderboard_score(text, integer) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Read leaderboard RPC
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_leaderboard(
  p_limit integer default 25
)
returns table (
  rank bigint,
  username text,
  high_score integer,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    row_number() over (order by high_score desc, updated_at asc, username asc) as rank,
    username,
    high_score,
    updated_at
  from public.leaderboard
  order by high_score desc, updated_at asc, username asc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

comment on function public.get_leaderboard(integer) is
  'Returns the top leaderboard rows, capped between 1 and 100 rows.';

revoke all on function public.get_leaderboard(integer) from public;
grant execute on function public.get_leaderboard(integer) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Optional smoke test
-- ─────────────────────────────────────────────────────────────────────────────
-- Uncomment these after running the setup if you want to verify behavior:
--
-- select * from public.submit_leaderboard_score('Test_Player', 10);
-- select * from public.submit_leaderboard_score('Test_Player', 5);  -- should remain 10
-- select * from public.submit_leaderboard_score('Test_Player', 12); -- should become 12
-- select * from public.get_leaderboard(25);
-- delete from public.leaderboard where username = 'Test_Player';
