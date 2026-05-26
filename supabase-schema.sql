create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  book_title text,
  cfi text,
  href text,
  chapter_label text,
  progress numeric default 0,
  updated_at timestamptz default now(),
  unique(user_id, book_id)
);

alter table public.reading_progress enable row level security;

drop policy if exists "Users can read their own progress" on public.reading_progress;
create policy "Users can read their own progress"
on public.reading_progress
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own progress" on public.reading_progress;
create policy "Users can insert their own progress"
on public.reading_progress
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own progress" on public.reading_progress;
create policy "Users can update their own progress"
on public.reading_progress
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
