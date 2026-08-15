import { useEffect, useMemo, useRef, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { useIsDesktop } from './lib/useMediaQuery'
import { AppShell, NAV_ICONS, type AppView } from './components/shell/AppShell'
import { fetchNavAttention, type NavAttention } from './lib/navAttention'
import { shouldShowSecurityBadge } from './lib/securityBadge'
import { AdminSegmentBar } from './components/admin/AdminSegmentBar'
import { EmptyState } from './components/ui/EmptyState'
import { EventListSkeleton } from './components/ui/Skeleton'
import { ToastProvider } from './components/ui/Toast'
import { Button } from './components/ui/Button'
import { OtpGate } from './components/otp/OtpGate'
import { ShieldAlert } from 'lucide-react'
import {
  ADMIN_MOBILE_HUB_VIEWS,
  ADMIN_SEGMENTS,
  isAdminSegment,
} from './lib/adminSegments'
import { reportsNavPlacement } from './lib/reports/access'
import { AdminListsPage } from './pages/AdminListsPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { FuelQuarterPage } from './pages/FuelQuarterPage'
import { ReportsPage } from './pages/ReportsPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { EventFormPage } from './pages/EventFormPage'
import { EventsPage } from './pages/EventsPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { ResponderFillPage } from './pages/ResponderFillPage'
import { ShiftDetailPage } from './pages/ShiftDetailPage'
import { ShiftFormPage } from './pages/ShiftFormPage'
import { ShiftsPage } from './pages/ShiftsPage'
import { isImpersonating } from './lib/impersonationStash'
import { fetchOtpStatus } from './lib/phoneOtp'
import {
  clearPostLoginFill,
  consumeFillEventTarget,
  parseFillTokenFromSearch,
  stashPostLoginFill,
} from './lib/fillTokenIntent'
import { loadFillByToken } from './lib/responderFillToken'

type EventSurface =
  | { kind: 'list' }
  | { kind: 'detail'; eventId: string }
  | { kind: 'form'; eventId?: string; focusResponderId?: string }
  | { kind: 'fill'; eventId: string; returnTo: 'list' | 'detail' }

type ShiftSurface =
  | { kind: 'list' }
  | { kind: 'detail'; shiftId: string }
  | { kind: 'form'; shiftId?: string }

function Gate() {
  const { session, loading, roles, passwordSetupReason, user, profile } = useAuth()
  const isDesktop = useIsDesktop()
  const [view, setView] = useState<AppView>('mine')
  const [eventSurface, setEventSurface] = useState<EventSurface>({ kind: 'list' })
  const [shiftSurface, setShiftSurface] = useState<ShiftSurface>({ kind: 'list' })
  const [navAttention, setNavAttention] = useState<NavAttention>({
    mineEvents: false,
    myShifts: false,
  })
  const [loginOtp, setLoginOtp] = useState<
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'required'; maskedPhone: string | null }
    | { state: 'ok' }
  >({ state: 'idle' })
  const [tokenFill, setTokenFill] = useState<
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'ready'; fillToken: string; eventId: string; responderId?: string }
    | { status: 'blocked'; message: string }
  >({ status: 'idle' })
  const [fillBootDone, setFillBootDone] = useState(false)

  // Resolve ?fill_token=… before requiring login (scoped fill link).
  useEffect(() => {
    const token = parseFillTokenFromSearch(window.location.search)
    if (!token) {
      setFillBootDone(true)
      return
    }

    let active = true
    setTokenFill({ status: 'checking' })
    loadFillByToken(token)
      .then((result) => {
        if (!active) return
        if (result.ok) {
          setTokenFill({
            status: 'ready',
            fillToken: token,
            eventId: result.context.eventId,
            responderId: (result.context as { responderId?: string }).responderId,
          })
        } else {
          if (result.eventId) stashPostLoginFill(result.eventId)
          setTokenFill({
            status: 'blocked',
            message: result.error,
          })
        }
        setFillBootDone(true)
      })
      .catch(() => {
        if (!active) return
        setTokenFill({
          status: 'blocked',
          message: 'קישור הדיווח אינו תקין או שפג תוקפו.',
        })
        setFillBootDone(true)
      })

    return () => {
      active = false
    }
  }, [])

  // After login (+ OTP), open fill from ?fill_event= or stashed post-login intent.
  const fillReturnApplied = useRef(false)
  useEffect(() => {
    if (!session || passwordSetupReason || !fillBootDone) return
    if (profile?.otp_login_enabled && loginOtp.state !== 'ok') return
    if (!profile?.otp_login_enabled && loginOtp.state !== 'ok' && loginOtp.state !== 'idle') return
    if (fillReturnApplied.current) return

    // Logged-in user opening a valid fill_token for themselves.
    if (tokenFill.status === 'ready' && user) {
      if (tokenFill.responderId && tokenFill.responderId !== user.id) {
        fillReturnApplied.current = true
        setTokenFill({
          status: 'blocked',
          message: 'אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.',
        })
        return
      }
      fillReturnApplied.current = true
      clearPostLoginFill()
      setView('mine')
      setEventSurface({ kind: 'fill', eventId: tokenFill.eventId, returnTo: 'list' })
      setTokenFill({ status: 'idle' })
      return
    }

    const target = consumeFillEventTarget(window.location.search)
    if (!target) return
    fillReturnApplied.current = true
    setView('mine')
    setEventSurface({ kind: 'fill', eventId: target, returnTo: 'list' })
  }, [
    session,
    passwordSetupReason,
    loginOtp.state,
    profile?.otp_login_enabled,
    user,
    tokenFill,
    fillBootDone,
  ])

  const isAdmin = roles.includes('admin')
  const manages = isAdmin || roles.includes('shift_lead')
  const responds = roles.includes('responder')
  // Leads also go on events — same personal list/fill surface, not only the responder role.
  const hasMineList = responds || roles.includes('shift_lead')

  // Refresh attention when returning to list surfaces after fill/save.
  const attentionRefreshKey = `${eventSurface.kind}:${shiftSurface.kind}:${view}`

  useEffect(() => {
    if (!hasMineList || !user) {
      setNavAttention({ mineEvents: false, myShifts: false })
      return
    }

    let active = true
    fetchNavAttention(user.id)
      .then((next) => {
        if (active) setNavAttention(next)
      })
      .catch(() => {
        // Fail closed — no dots if the check cannot run.
        if (active) setNavAttention({ mineEvents: false, myShifts: false })
      })

    return () => {
      active = false
    }
  }, [hasMineList, user, attentionRefreshKey])

  useEffect(() => {
    if (!session || passwordSetupReason) {
      setLoginOtp({ state: 'idle' })
      return
    }

    if (isImpersonating() || !profile?.otp_login_enabled) {
      setLoginOtp({ state: 'ok' })
      return
    }

    let active = true
    setLoginOtp({ state: 'checking' })
    fetchOtpStatus()
      .then((status) => {
        if (!active) return
        if ('error' in status) {
          // Flag is on — fail closed into the OTP gate (user can resend / retry).
          setLoginOtp({ state: 'required', maskedPhone: null })
          return
        }
        if (status.loginRequired) {
          setLoginOtp({ state: 'required', maskedPhone: status.maskedPhone })
        } else {
          setLoginOtp({ state: 'ok' })
        }
      })
      .catch(() => {
        if (active) setLoginOtp({ state: 'required', maskedPhone: null })
      })

    return () => {
      active = false
    }
  }, [session, passwordSetupReason, user?.id, profile?.otp_login_enabled])

  const entries = useMemo(() => {
    const list: {
      view: AppView
      label: string
      icon: (typeof NAV_ICONS)[AppView]
      section?: string
      alsoCurrentFor?: AppView[]
      attention?: boolean
    }[] = []

    // Personal — top of nav for anyone who goes on calls.
    if (hasMineList) {
      list.push({
        view: 'mine',
        label: 'האירועים שלי',
        icon: NAV_ICONS.mine,
        attention: navAttention.mineEvents,
      })
      list.push({
        view: 'my_shifts',
        label: 'המשמרות שלי',
        icon: NAV_ICONS.my_shifts,
        attention: navAttention.myShifts,
      })
    }

    // Shift-lead tools (admins also get these via manages).
    if (manages) {
      list.push({
        view: 'events',
        label: 'אירועים',
        icon: NAV_ICONS.events,
        section: 'כלים לאחמ״ש',
      })
      list.push({
        view: 'shifts',
        label: 'משמרות',
        icon: NAV_ICONS.shifts,
        section: 'כלים לאחמ״ש',
      })
      if (reportsNavPlacement(roles) === 'shift_lead') {
        list.push({
          view: 'reports',
          label: isDesktop ? 'דוחות וסטטיסטיקות' : 'דוחות',
          icon: NAV_ICONS.reports,
          section: isDesktop ? 'כלים לאחמ״ש' : undefined,
        })
      }
    }

    if (isAdmin) {
      if (isDesktop) {
        for (const segment of ADMIN_SEGMENTS) {
          list.push({
            view: segment.id,
            label: segment.label,
            icon: NAV_ICONS[segment.id],
            section: 'ניהול',
          })
        }
      } else {
        // Mobile tab bar: משתמשים only; other admin views via segment control.
        list.push({
          view: 'users',
          label: 'משתמשים',
          icon: NAV_ICONS.users,
          alsoCurrentFor: ADMIN_MOBILE_HUB_VIEWS,
        })
      }
    }

    // Profile: desktop sidebar only — mobile uses the app-bar user menu.
    if (isDesktop) {
      list.push({ view: 'profile', label: 'פרופיל', icon: NAV_ICONS.profile })
    }

    return list
  }, [manages, hasMineList, isAdmin, isDesktop, navAttention, roles])

  function isAllowedView(next: AppView): boolean {
    switch (next) {
      case 'mine':
      case 'my_shifts':
        return hasMineList
      case 'events':
      case 'shifts':
      case 'reports':
        return manages
      case 'users':
      case 'fuel_quarter':
      case 'lists':
        return isAdmin
      case 'profile':
        return true
    }
  }

  const fallbackView: AppView = hasMineList
    ? 'mine'
    : manages
      ? 'events'
      : isAdmin
        ? 'users'
        : 'profile'

  if (loading || !fillBootDone || tokenFill.status === 'checking') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <EventListSkeleton count={3} />
        </main>
      </div>
    )
  }

  // Invite/recovery gate is driven by intent, not by an existing session.
  // verifyOtp may still be binding the session; never fall through to sign-in.
  if (passwordSetupReason) {
    return <LoginPage key={`setup-${passwordSetupReason}`} forceSetPassword />
  }

  // Scoped fill link — no Auth session required while the token is valid.
  if (!session && tokenFill.status === 'ready') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <ResponderFillPage
            eventId={tokenFill.eventId}
            fillToken={tokenFill.fillToken}
            onBack={() => {
              setTokenFill({ status: 'idle' })
              try {
                const url = new URL(window.location.href)
                url.searchParams.delete('fill_token')
                window.history.replaceState({}, '', url.pathname + url.search + url.hash)
              } catch {
                /* ignore */
              }
            }}
            onCompleted={() => {
              setTokenFill({ status: 'idle' })
              try {
                const url = new URL(window.location.href)
                url.searchParams.delete('fill_token')
                window.history.replaceState({}, '', url.pathname + url.search + url.hash)
              } catch {
                /* ignore */
              }
            }}
          />
        </main>
      </div>
    )
  }

  if (!session) {
    return (
      <>
        {tokenFill.status === 'blocked' ? (
          <div className="shell" data-theme="field">
            <main className="shell__main">
              <EmptyState
                icon={<ShieldAlert size={40} strokeWidth={1.75} aria-hidden="true" />}
                title="קישור הדיווח"
                caption={tokenFill.message}
                action={
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setTokenFill({ status: 'idle' })}
                  >
                    להמשך להתחברות
                  </Button>
                }
              />
            </main>
          </div>
        ) : (
          <LoginPage key="signin" />
        )}
      </>
    )
  }

  if (loginOtp.state === 'checking' || loginOtp.state === 'idle') {
    return (
      <div className="shell" data-theme="field">
        <main className="shell__main">
          <EventListSkeleton count={3} />
        </main>
      </div>
    )
  }

  if (loginOtp.state === 'required') {
    return (
      <OtpGate
        purpose="login_device"
        maskedPhone={loginOtp.maskedPhone}
        onVerified={() => setLoginOtp({ state: 'ok' })}
      />
    )
  }

  // Role allowlist — not nav entries — so profile / fuel / lists / reports stay
  // reachable when omitted from the mobile tab bar.
  const activeView: AppView = isAllowedView(view) ? view : fallbackView

  const isAdminHub = isAdmin && isAdminSegment(activeView)
  const onEvents = activeView === 'events' || activeView === 'mine'
  const onShifts = activeView === 'shifts' || activeView === 'my_shifts'
  const onReports = activeView === 'reports'
  const onEventHost = onEvents || onReports
  const scope: 'unit' | 'mine' = manages && activeView !== 'mine' ? 'unit' : 'mine'
  const shiftScope: 'unit' | 'mine' = manages && activeView !== 'my_shifts' ? 'unit' : 'mine'

  const immersiveSurface =
    (onEventHost && (eventSurface.kind === 'form' || eventSurface.kind === 'fill')) ||
    (onShifts && (shiftSurface.kind === 'form' || shiftSurface.kind === 'detail'))

  // Desktop always keeps sidebar nav on list/admin/profile (fixes my-shifts with no navbar).
  const shellWithSidebar = isDesktop && !immersiveSurface
  const shellTheme: 'command' | 'field' =
    shellWithSidebar && (manages || isAdminHub) ? 'command' : 'field'
  const shellNarrow = isDesktop && immersiveSurface
  const commandShell = shellWithSidebar && shellTheme === 'command'

  function navigate(next: AppView) {
    setEventSurface({ kind: 'list' })
    setShiftSurface({ kind: 'list' })
    setView(next)
  }

  function goHome() {
    navigate(fallbackView)
  }

  return (
    <AppShell
      theme={shellTheme}
      withSidebar={shellWithSidebar}
      narrow={shellNarrow}
      showSecurityBadge={shouldShowSecurityBadge(immersiveSurface)}
      view={activeView}
      onNavigate={navigate}
      onHome={goHome}
      entries={entries}
    >
      <>
        {onReports ? (
          <div hidden={eventSurface.kind !== 'list'}>
            <div
              className={['stack-4', commandShell ? 'page--wide' : ''].filter(Boolean).join(' ')}
            >
              {isAdmin && !isDesktop ? (
                <AdminSegmentBar view="reports" onChange={navigate} />
              ) : null}
              <ReportsPage
                asTable={Boolean(commandShell)}
                onOpenEvent={(eventId) => setEventSurface({ kind: 'detail', eventId })}
              />
            </div>
          </div>
        ) : null}
        {onEventHost && eventSurface.kind === 'form' ? (
        <EventFormPage
          eventId={eventSurface.eventId}
          focusResponderId={eventSurface.focusResponderId}
          onCancel={() =>
            setEventSurface(
              eventSurface.eventId
                ? { kind: 'detail', eventId: eventSurface.eventId }
                : { kind: 'list' },
            )
          }
          onEventId={(id) =>
            setEventSurface({
              kind: 'form',
              eventId: id,
              focusResponderId: eventSurface.focusResponderId,
            })
          }
          onSaved={(id) => setEventSurface({ kind: 'detail', eventId: id })}
          onSavedAndCreateNew={() => setEventSurface({ kind: 'form' })}
        />
      ) : onEventHost && eventSurface.kind === 'fill' ? (
        <ResponderFillPage
          eventId={eventSurface.eventId}
          onBack={() =>
            setEventSurface(
              eventSurface.returnTo === 'detail'
                ? { kind: 'detail', eventId: eventSurface.eventId }
                : { kind: 'list' },
            )
          }
          onCompleted={() =>
            setEventSurface(
              eventSurface.returnTo === 'detail'
                ? { kind: 'detail', eventId: eventSurface.eventId }
                : { kind: 'list' },
            )
          }
        />
      ) : onEventHost && eventSurface.kind === 'detail' ? (
        <EventDetailPage
          eventId={eventSurface.eventId}
          onBack={() => setEventSurface({ kind: 'list' })}
          onEdit={
            manages
              ? () => setEventSurface({ kind: 'form', eventId: eventSurface.eventId })
              : undefined
          }
          onFillOwn={() =>
            setEventSurface({
              kind: 'fill',
              eventId: eventSurface.eventId,
              returnTo: 'detail',
            })
          }
          onEditLeadFields={
            manages
              ? (responderId) =>
                  setEventSurface({
                    kind: 'form',
                    eventId: eventSurface.eventId,
                    focusResponderId: responderId,
                  })
              : undefined
          }
        />
      ) : onReports ? null : onShifts && shiftSurface.kind === 'form' ? (
        <ShiftFormPage
          shiftId={shiftSurface.shiftId}
          onBack={() =>
            setShiftSurface(
              shiftSurface.shiftId
                ? { kind: 'detail', shiftId: shiftSurface.shiftId }
                : { kind: 'list' },
            )
          }
          onSaved={(id) => setShiftSurface({ kind: 'detail', shiftId: id })}
        />
      ) : onShifts && shiftSurface.kind === 'detail' ? (
        <ShiftDetailPage
          shiftId={shiftSurface.shiftId}
          canManage={manages}
          isAdmin={isAdmin}
          onBack={() => setShiftSurface({ kind: 'list' })}
          onEdit={() => setShiftSurface({ kind: 'form', shiftId: shiftSurface.shiftId })}
          onDeleted={() => setShiftSurface({ kind: 'list' })}
        />
      ) : activeView === 'profile' ? (
        <ProfilePage />
      ) : isAdminHub && isAdminSegment(activeView) ? (
          <div
            className={['stack-4', activeView === 'users' ? 'page--wide' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {!isDesktop ? (
              <AdminSegmentBar view={activeView} onChange={navigate} />
            ) : null}
            {activeView === 'lists' ? (
              <AdminListsPage />
            ) : activeView === 'fuel_quarter' ? (
              <FuelQuarterPage />
            ) : (
              <AdminUsersPage />
            )}
          </div>
      ) : onShifts ? (
        <ShiftsPage
          scope={shiftScope}
          canManage={manages && shiftScope === 'unit'}
          onOpen={(shiftId) => setShiftSurface({ kind: 'detail', shiftId })}
          onCreate={
            manages && shiftScope === 'unit'
              ? () => setShiftSurface({ kind: 'form' })
              : undefined
          }
        />
      ) : onEvents ? (
        <EventsPage
          scope={scope}
          asTable={Boolean(commandShell && scope === 'unit')}
          canCreate={manages && scope === 'unit'}
          onOpen={(eventId) => setEventSurface({ kind: 'detail', eventId })}
          onCreate={() => setEventSurface({ kind: 'form' })}
          onFill={
            hasMineList
              ? (eventId) => setEventSurface({ kind: 'fill', eventId, returnTo: 'list' })
              : undefined
          }
        />
      ) : null}
      </>
    </AppShell>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
