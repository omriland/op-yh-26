-- A photo can be marked as showing no vehicle (the road, a sign, debris), so it is
-- told apart from a photo nobody has assigned yet. Set by the website's photo step;
-- the mobile apps do not read or write it, and the default keeps their inserts valid.

alter table public.event_media
  add column not_vehicle boolean not null default false;
