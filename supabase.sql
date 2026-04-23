create extension if not exists "pgcrypto";

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists tags_user_id_normalized_name_key
  on public.tags (user_id, normalized_name);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text not null default '',
  image_path text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.entry_tags (
  entry_id uuid not null references public.entries(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (entry_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.entries enable row level security;
alter table public.entry_tags enable row level security;

create policy "Users manage own tags"
  on public.tags
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own entries"
  on public.entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own entry tags"
  on public.entry_tags
  for all
  using (
    exists (
      select 1
      from public.entries
      where entries.id = entry_tags.entry_id
        and entries.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.entries
      where entries.id = entry_tags.entry_id
        and entries.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values ('pottery-images', 'pottery-images', true)
on conflict (id) do nothing;

create policy "Users upload own pottery images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'pottery-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own pottery images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'pottery-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'pottery-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own pottery images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'pottery-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Anyone can read pottery images"
  on storage.objects
  for select
  using (bucket_id = 'pottery-images');
