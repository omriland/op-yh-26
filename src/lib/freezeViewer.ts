import { useMemo } from 'react'
import { useAuth } from './auth'
import { isFreezeAdminRole, type FreezeViewer } from './eventFreeze'

/** Who the signed-in reader is for freeze marks. See `freezeViewFor`. */
export function useFreezeViewer(): FreezeViewer {
  const { user, roles } = useAuth()
  const userId = user?.id ?? null
  const isAdmin = isFreezeAdminRole(roles)
  return useMemo(() => ({ userId, isAdmin }), [userId, isAdmin])
}
