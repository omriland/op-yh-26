-- או״ק is unique across profiles (trim + case-insensitive).
-- Resolves the existing 942 pair: the more recently signed-in account keeps 942.

update public.profiles
set callsign = '942b', updated_at = now()
where id = 'bbcae35d-7fee-4949-b9b2-5812ea4f4d4c'
  and lower(btrim(callsign)) = '942';

create unique index if not exists profiles_callsign_unique
  on public.profiles (lower(btrim(callsign)));
