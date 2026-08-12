-- One open challenge per user+purpose so concurrent otp_start cannot keep two codes.
delete from public.otp_challenges a
using public.otp_challenges b
where a.user_id = b.user_id
  and a.purpose = b.purpose
  and a.created_at < b.created_at;

create unique index if not exists otp_challenges_user_purpose_uidx
  on public.otp_challenges (user_id, purpose);
