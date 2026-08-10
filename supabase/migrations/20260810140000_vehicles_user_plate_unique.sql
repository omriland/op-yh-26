-- Same plate may exist for different users; not twice for one user.
create unique index if not exists vehicles_user_id_plate_number_uidx
  on public.vehicles (user_id, plate_number);
