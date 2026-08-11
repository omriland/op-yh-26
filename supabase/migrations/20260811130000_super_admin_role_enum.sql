-- Commit enum value before it is referenced in later migration
alter type public.app_role add value if not exists 'super_admin';
