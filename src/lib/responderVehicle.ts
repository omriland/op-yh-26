/**
 * Whether a participation owes a lead-entered `total_km`.
 *
 * A volunteer with no active vehicle has no kilometers to report: the event
 * form disables the KM input for them and shows `מתנדב ללא רכב`. Counting that
 * as a missing value stranded the event — it could never reach `הושלם`, stayed
 * pinned under `דורשים השלמת פרטים`, and kept nagging the lead.
 *
 * `total_km` deliberately stays `null` on those rows rather than being written
 * as 0. A stored 0 is indistinguishable from a lead who really measured zero,
 * so it would quietly under-refund the volunteer once a car is added later.
 */

/** One `vehicles` row as embedded on a responder profile. */
export type ResponderVehicleRow = { archived?: boolean | null }

export type ResponderVehicleProfile =
  | { vehicles?: ResponderVehicleRow[] | null }
  | null
  | undefined

export type KmBearingResponder = {
  total_km: number | null
  profile?: ResponderVehicleProfile
}

/**
 * True when the lead is expected to enter KM for this responder.
 *
 * When the query did not select vehicles at all this returns `true`, so the
 * older behaviour (KM always expected) stands — an incomplete query shape must
 * never silently clear a real gap.
 *
 * RLS caveat: `vehicles_select_own_or_admin` hides a teammate's vehicles from a
 * plain כונן, so for them the embed arrives as `[]` and this reads false. That
 * is safe only because every KM-gap surface is lead/admin-scoped
 * (`missingEventFieldsForViewer` drops `responder_km` for non-leads, and the
 * detail page guards on `eventLead`). Do not call this from a כונן-facing
 * surface without widening that policy first.
 */
export function responderKmApplicable(responder: {
  profile?: ResponderVehicleProfile
}): boolean {
  const vehicles = responder.profile?.vehicles
  if (vehicles == null) return true
  return vehicles.some((row) => !row.archived)
}

/** True when this responder still owes a lead-entered KM value. */
export function responderKmMissing(responder: KmBearingResponder): boolean {
  return responder.total_km == null && responderKmApplicable(responder)
}
