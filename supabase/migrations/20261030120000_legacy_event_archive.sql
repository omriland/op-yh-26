-- Legacy event-report archive.
--
-- Holds the old members.yachpatz.org.il event data (imported from the offline
-- backup) so the new site can reconstruct the old ShowEventReport documents after
-- live access to the old Azure DB is gone.
--
-- Security model:
--   * The legacy.* tables are NOT exposed to the API (the `legacy` schema is not in
--     the PostgREST schema list). They are reachable only through the SECURITY
--     DEFINER function public.legacy_report_search, which enforces admin/super_admin
--     via public.has_role. The reports carry volunteers' ת.ז., hence the gate.
--   * RLS is enabled on every legacy table with no policies (deny-all) as defence in
--     depth; the definer function runs as the table owner and bypasses it.
--
-- Data is loaded separately (psql \copy from the trimmed backup CSVs), after the
-- cutover + delta pull. This migration only creates the structure.

create schema if not exists legacy;

-- ---------------------------------------------------------------------------
-- Tables (minimal column set needed to render a report)
-- ---------------------------------------------------------------------------

create table legacy.vol_events (
  auto_id                   integer primary key,     -- tbl_VolEvents.AutoID (join key for cars)
  event_fk                  text not null,           -- fld_EventFK (old URL ?id=, the report key)
  event_number              text,                    -- fld_EventNumber (NOT unique across years)
  call_sign                 text,                    -- fld_CallSign
  event_date                timestamp,               -- fld_EventDate
  branch_id                 integer,                 -- fld_BranchID
  event_type                integer,                 -- fld_EventType
  coordinator               text,                    -- fld_Coordinator (call sign, maybe + name)
  approving_officer         text,                    -- fld_ApprovingOfficer
  police_call_sign          text,                    -- fld_PoliceCallSign
  road_number               text,                    -- fld_RoadNumber
  location                  text,                    -- fld_Location
  in_shift                  boolean,                 -- fld_InShift
  start_hour                text,                    -- fld_StartHour
  end_hour                  text,                    -- fld_EndHour
  shool                     boolean,                 -- fld_Shool (shoulder driving)
  siren                     boolean,                 -- fld_Siren (operational driving)
  special_approving_officer text,                    -- fld_SpecialApprovingOfficer
  officer_name              text,                    -- fld_OfficerName
  start_km                  text,                    -- fld_StartKM
  end_km                    text,                    -- fld_EndKM
  total_km                  text,                    -- fld_TotalKM
  route                     text,                    -- fld_Route
  actions_taken             text,                    -- fld_ActionsTaken
  problems                  text,                    -- fld_Problems
  problems_reported_to      text,                    -- fld_ProblemsReportedTo
  vol_car_number            text,                    -- fld_VolCarNumber
  other_equipment           text,                    -- fld_OtherEquipment
  eq_2meter                 boolean,                 -- fld_2Meter
  eq_3meter                 boolean,                 -- fld_3Meter
  eq_9meter                 boolean,                 -- fld_9Meter
  eq_agaschain              boolean,                 -- fld_AgasChain
  eq_chainfliplarge         boolean,                 -- fld_ChainFlipLarge
  eq_chainflipsmall         boolean,                 -- fld_ChainFlipSmall
  eq_airtube                boolean                  -- fld_AirTube
);
create index vol_events_event_fk_idx       on legacy.vol_events (event_fk);
create index vol_events_callsign_date_idx  on legacy.vol_events (call_sign, event_date);
create index vol_events_event_number_idx   on legacy.vol_events (event_number);

create table legacy.cars_in_hits (
  auto_id       integer primary key,  -- tbl_CarsInHits.AutoID
  event_fk      integer not null,     -- fld_EventFK = legacy.vol_events.auto_id
  car_index     integer,              -- fld_CarIndex 1..4
  license_plate text                  -- fld_LicensePlate (free-text type/colour)
);
create index cars_in_hits_event_fk_idx on legacy.cars_in_hits (event_fk);

create table legacy.event_car_hits (
  cars_in_hits_index integer not null, -- fld_CarsInHitsIndex = legacy.cars_in_hits.auto_id
  hit_id             integer not null, -- fld_HitID = HitTypes.fld_AutoID = display order 1..17
  value              boolean           -- fld_Value (checked)
);
create index event_car_hits_cih_idx on legacy.event_car_hits (cars_in_hits_index);

create table legacy.users (
  call_sign  text,  -- tbl_Users.fld_CallSign
  first_name text,  -- fld_FirstName
  last_name  text   -- fld_LastName
);
create index users_call_sign_idx on legacy.users (call_sign);

create table legacy.user_details (
  users_fk text,    -- tbl_UserDetails.fld_UsersFK = call sign
  pid      text     -- fld_PID (ת.ז.)
);
create index user_details_users_fk_idx on legacy.user_details (users_fk);

create table legacy.branches (
  branch_id   integer primary key,  -- tbl_Branches.BranchID
  branch_name text                  -- BranchName
);

create table legacy.event_types (
  event_id          integer primary key,  -- tbl_EventTypes.EventID
  event_description text                   -- EventDescription
);

-- Deny-all RLS (defence in depth; the definer function bypasses it as owner).
alter table legacy.vol_events     enable row level security;
alter table legacy.cars_in_hits   enable row level security;
alter table legacy.event_car_hits enable row level security;
alter table legacy.users          enable row level security;
alter table legacy.user_details   enable row level security;
alter table legacy.branches       enable row level security;
alter table legacy.event_types    enable row level security;

-- ---------------------------------------------------------------------------
-- Report assembler (internal) — builds one report's JSON from a vol_events row.
-- Shape matches the LegacyReport type in src/lib/reports/legacyReport.ts.
-- ---------------------------------------------------------------------------
create or replace function legacy.build_report(p_auto_id integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'fk',          ve.event_fk,
    'eventNumber', coalesce(btrim(ve.event_number), ''),
    'callSign',    coalesce(btrim(ve.call_sign), ''),
    'eventDate',   coalesce(to_char(ve.event_date, 'YYYY-MM-DD'), ''),
    'header', jsonb_build_object(
      'volName', coalesce((
        select btrim(u.first_name) || ' ' || btrim(u.last_name)
        from legacy.users u where btrim(u.call_sign) = btrim(ve.call_sign) limit 1), ''),
      'pid', coalesce((
        select btrim(ud.pid) from legacy.user_details ud
        where btrim(ud.users_fk) = btrim(ve.call_sign) limit 1), ''),
      'carNumber',        coalesce(btrim(ve.vol_car_number), ''),
      'branch',           coalesce((select btrim(b.branch_name) from legacy.branches b where b.branch_id = ve.branch_id), ''),
      'approvingOfficer', coalesce(btrim(ve.approving_officer), ''),
      'policeCallSign',   coalesce(btrim(ve.police_call_sign), ''),
      'roadNumber',       coalesce(btrim(ve.road_number), ''),
      'location',         coalesce(btrim(ve.location), ''),
      'coordinator',      btrim(coalesce(btrim(ve.coordinator), '') || ' ' || coalesce((
        select btrim(cu.first_name) || ' ' || btrim(cu.last_name)
        from legacy.users cu where btrim(cu.call_sign) = btrim(ve.coordinator) limit 1), '')),
      'eventType',        coalesce((select btrim(et.event_description) from legacy.event_types et where et.event_id = ve.event_type), ''),
      'inShift',          coalesce(ve.in_shift, false),
      'startHour',        coalesce(btrim(ve.start_hour), ''),
      'endHour',          coalesce(btrim(ve.end_hour), ''),
      'shool',            coalesce(ve.shool, false),
      'siren',            coalesce(ve.siren, false),
      'specialApprovingOfficer', coalesce(btrim(ve.special_approving_officer), ''),
      'officerName',      coalesce(btrim(ve.officer_name), ''),
      'startKM',          coalesce(btrim(ve.start_km), ''),
      'endKM',            coalesce(btrim(ve.end_km), ''),
      'totalKM',          coalesce(btrim(ve.total_km), ''),
      'route',            coalesce(ve.route, ''),
      'actionsTaken',     coalesce(ve.actions_taken, ''),
      'problems',         coalesce(ve.problems, ''),
      'problemsReportedTo', coalesce(btrim(ve.problems_reported_to), ''),
      'otherEquipment',   coalesce(btrim(ve.other_equipment), '')
    ),
    'equipment', jsonb_build_object(
      'fld_2Meter',         coalesce(ve.eq_2meter, false),
      'fld_3Meter',         coalesce(ve.eq_3meter, false),
      'fld_9Meter',         coalesce(ve.eq_9meter, false),
      'fld_AgasChain',      coalesce(ve.eq_agaschain, false),
      'fld_ChainFlipLarge', coalesce(ve.eq_chainfliplarge, false),
      'fld_ChainFlipSmall', coalesce(ve.eq_chainflipsmall, false),
      'fld_AirTube',        coalesce(ve.eq_airtube, false)
    ),
    'cars', coalesce((
      select jsonb_agg(jsonb_build_object('index', ci.car_index, 'plate', coalesce(btrim(ci.license_plate), '')) order by ci.car_index)
      from legacy.cars_in_hits ci where ci.event_fk = ve.auto_id), '[]'::jsonb),
    'hits', coalesce((
      select jsonb_agg(jsonb_build_array(ci.car_index, ech.hit_id) order by ci.car_index, ech.hit_id)
      from legacy.event_car_hits ech
      join legacy.cars_in_hits ci on ci.auto_id = ech.cars_in_hits_index
      where ci.event_fk = ve.auto_id and ech.value = true), '[]'::jsonb)
  )
  from legacy.vol_events ve
  where ve.auto_id = p_auto_id;
$$;

-- ---------------------------------------------------------------------------
-- Public lookup RPC (admin-gated). Returns 0..N reports as jsonb rows.
--   p_kind: 'id' | 'report' | 'callsign_date' | 'callsign_list'
--   p_value: the id / event number / call sign
--   p_date: only for 'callsign_date' (the event date)
-- ---------------------------------------------------------------------------
create or replace function public.legacy_report_search(
  p_kind  text,
  p_value text,
  p_date  date default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public, legacy
as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin')) then
    raise exception 'not authorized to read the legacy event archive' using errcode = '42501';
  end if;

  return query
  with matches as (
    select ve.auto_id, ve.event_date
    from legacy.vol_events ve
    where case p_kind
      when 'id'            then ve.event_fk = btrim(p_value)
      when 'report'        then btrim(ve.event_number) = btrim(p_value)
      when 'callsign_date' then btrim(ve.call_sign) = btrim(p_value) and ve.event_date::date = p_date
      when 'callsign_list' then btrim(ve.call_sign) = btrim(p_value)
      else false
    end
  )
  select legacy.build_report(m.auto_id)
  from matches m
  order by m.event_date nulls last;
end;
$$;

revoke all on function public.legacy_report_search(text, text, date) from public;
grant execute on function public.legacy_report_search(text, text, date) to authenticated;
