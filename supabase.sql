-- 라인온의원 온라인 시술실: 누적 방문자 카운터 (일별로 저장, 합계를 표시)
-- Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run

create table if not exists public.daily_visits (
  day date primary key,
  count integer not null default 0
);
alter table public.daily_visits enable row level security;
drop policy if exists "read visits" on public.daily_visits;
create policy "read visits" on public.daily_visits for select using (true);

-- 방문 1 증가(오늘 날짜 행에 기록) 후 누적 합계 반환
create or replace function public.visit_today() returns integer
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date;
begin
  insert into daily_visits(day, count) values (d, 1)
  on conflict (day) do update set count = daily_visits.count + 1;
  return (select coalesce(sum(count), 0) from daily_visits);
end $$;

-- 누적 합계만 조회
create or replace function public.today_visits() returns integer
language sql security definer set search_path = public as $$
  select coalesce(sum(count), 0)::integer from daily_visits;
$$;

grant execute on function public.visit_today() to anon, authenticated;
grant execute on function public.today_visits() to anon, authenticated;
