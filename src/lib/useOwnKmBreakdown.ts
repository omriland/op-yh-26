import { useEffect, useState } from 'react'
import { buildProfileKmBreakdown, type ProfileKmBreakdown } from './profileKmBreakdown'
import { fetchOwnKmMonthly } from './profileKmMonthly'

export type OwnKmBreakdownState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; breakdown: ProfileKmBreakdown }

type LoadedResult = {
  profileId: string
  state: OwnKmBreakdownState
}

const LOADING: OwnKmBreakdownState = { status: 'loading' }

/**
 * The signed-in person's km by month and quarter. A result is tied to the profile
 * it was loaded for, so after the profile changes the previous person's rows are
 * never shown while the new ones load.
 */
export function useOwnKmBreakdown(profileId: string | undefined): OwnKmBreakdownState {
  const [loaded, setLoaded] = useState<LoadedResult | null>(null)

  useEffect(() => {
    if (!profileId) return
    let active = true
    fetchOwnKmMonthly(profileId)
      .then((rows) => {
        if (!active) return
        setLoaded({
          profileId,
          state: { status: 'ready', breakdown: buildProfileKmBreakdown(rows) },
        })
      })
      .catch(() => {
        if (active) setLoaded({ profileId, state: { status: 'error' } })
      })
    return () => {
      active = false
    }
  }, [profileId])

  return loaded && loaded.profileId === profileId ? loaded.state : LOADING
}
