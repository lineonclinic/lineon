-- 라인온의원 온라인 시술실: 오늘 방문자 카운터
-- Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run

create table if not exists public.daily_visits (
  day date primary key,
  count integer not null default 0
);
alter table public.daily_visits enable row level security;
drop policy if exists "read visits" on public.daily_visits;
create policy "read visits" on public.daily_visits for select using (true);

-- 방문 1 증가 후 오늘 수 반환 (한국 시간 기준)
create or replace function public.visit_today() returns integer
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; c integer;
begin
  insert into daily_visits(day, count) values (d, 1)
  on conflict (day) do update set count = daily_visits.count + 1
  returning count into c;
  return c;
end $$;

-- 오늘 수만 조회
create or replace function public.today_visits() returns integer
language sql security definer set search_path = public as $$
  select coalesce((select count from daily_visits where day = (now() at time zone 'Asia/Seoul')::date), 0);
$$;

grant execute on function public.visit_today() to anon, authenticated;
grant execute on function public.today_visits() to anon, authenticated;
