import { useMemo, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { useIsDesktop } from './lib/useMediaQuery'
import { AppShell, NAV_ICONS, type AppView } from './components/shell/AppShell'
import { AdminSegmentBar } from './components/admin/AdminSegmentBar'
import { EmptyState } from './components/ui/EmptyState'
import { EventListSkeleton } from './components/ui/Skeleton'
import { ToastProvider } from './components/ui/Toast'
import { AdminListsPage } from './pages/AdminListsPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { EventFormPage } from './pages/EventFormPage'
import { EventsPage } from './pages/EventsPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { ResponderFillPage } from './pages/ResponderFillPage'
import { ShiftDetailPage } from './pages/ShiftDetailPage'
import { ShiftFormPage } from './pages/ShiftFormPage'
import { ShiftsPage } from './pages/ShiftsPage'
import { ShieldAlert } from 'lucide-react'
import { Button } from './components/ui/Button'

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
  const { session, loading, roles, passwordSetupReason } = useAuth()
  const isDesktop = useIsDesktop()
  const [view, setView] = useState<AppView>('mine')
  const [eventSurface, setEventSurface] = useState<EventSurface>({ kind: 'list' })
  const [shiftSurface, setShiftSurface] = useState<ShiftSurface>({ kind: 'list' })

  const isAdmin = roles.includes('admin')
  const manages = isAdmin || roles.includes('shift_lead')
  const responds = roles.includes('responder')
  // Leads also go on events — same personal list/fill surface, not only the responder role.
  const hasMineList = responds || roles.includes('shift_lead')

  const entries = useMemo(() => {
    const list: {
      view: AppView
      label: string
      icon: (typeof NAV_ICONS)[AppView]
      section?: string
      alsoCurrentFor?: AppView[]
    }[] = []

    // Personal — top of nav for anyone who goes on calls.
    if (hasMineList) {
      list.push({ view: 'mine', label: 'האירועים שלי', icon: NAV_ICONS.mine })
      list.push({ view: 'my_shifts', label: 'המשמרות שלי', icon: NAV_ICONS.my_shifts })
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
    }

    if (isAdmin) {
      if (isDesktop) {
        list.push({
          view: 'users',
          label: 'משתמשים',
          icon: NAV_ICONS.users,
          section: 'ניהול',
        })
        list.push({
          view: 'lists',
          label: 'הגדרות',
          icon: NAV_ICONS.lists,
          section: 'ניהול',
        })
      } else {
        list.push({
          view: 'users',
          label: 'ניהול',
          icon: NAV_ICONS.users,
          section: 'ניהול',
          alsoCurrentFor: ['lists'],
        })
      }
    }

    list.push({ view: 'profile', label: 'פרופיל', icon: NAV_ICONS.profile })
    return list
  }, [manages, hasMineList, isAdmin, isDesktop])

  if (loading) {
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
    return <LoginPage forceSetPassword />
  }

  if (!session) return <LoginPage />

  const activeView: AppView = entries.some(
    (entry) => entry.view === view || entry.alsoCurrentFor?.includes(view),
  )
    ? view
    : (entries[0]?.view ?? 'profile')

  const isAdminView = activeView === 'users' || activeView === 'lists'
  const onEvents = activeView === 'events' || activeView === 'mine'
  const onShifts = activeView === 'shifts' || activeView === 'my_shifts'
  const scope: 'unit' | 'mine' = manages && activeView !== 'mine' ? 'unit' : 'mine'
  const shiftScope: 'unit' | 'mine' = manages && activeView !== 'my_shifts' ? 'unit' : 'mine'

  const immersiveSurface =
    (onEvents && (eventSurface.kind === 'form' || eventSurface.kind === 'fill')) ||
    (onShifts && (shiftSurface.kind === 'form' || shiftSurface.kind === 'detail'))

  // Desktop always keeps sidebar nav on list/admin/profile (fixes my-shifts with no navbar).
  const shellWithSidebar = isDesktop && !immersiveSurface
  const shellTheme: 'command' | 'field' =
    shellWithSidebar && (manages || isAdminView) ? 'command' : 'field'
  const shellNarrow = isDesktop && immersiveSurface
  const commandShell = shellWithSidebar && shellTheme === 'command'

  function navigate(next: AppView) {
    setEventSurface({ kind: 'list' })
    setShiftSurface({ kind: 'list' })
    setView(next)
  }

  function goHome() {
    const home: AppView = hasMineList
      ? 'mine'
      : manages
        ? 'events'
        : (entries[0]?.view ?? 'profile')
    navigate(home)
  }

  return (
    <AppShell
      theme={shellTheme}
      withSidebar={shellWithSidebar}
      narrow={shellNarrow}
      view={activeView}
      onNavigate={navigate}
      onHome={goHome}
      entries={entries}
    >
      {onEvents && eventSurface.kind === 'form' ? (
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
      ) : onEvents && eventSurface.kind === 'fill' ? (
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
      ) : onEvents && eventSurface.kind === 'detail' ? (
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
      ) : onShifts && shiftSurface.kind === 'form' ? (
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
      ) : isAdminView ? (
        isAdmin ? (
          <div className="stack-4">
            {!isDesktop ? (
              <AdminSegmentBar
                view={activeView === 'lists' ? 'lists' : 'users'}
                onChange={navigate}
              />
            ) : null}
            {activeView === 'lists' ? <AdminListsPage /> : <AdminUsersPage />}
          </div>
        ) : (
          <EmptyState
            icon={<ShieldAlert size={40} strokeWidth={1.75} />}
            title="אין לך הרשאה לפעולה זו."
            action={
              <Button variant="secondary" onClick={() => navigate(manages ? 'events' : 'profile')}>
                חזרה
              </Button>
            }
          />
        )
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
