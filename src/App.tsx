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
import { ShieldAlert } from 'lucide-react'
import { Button } from './components/ui/Button'

type EventSurface =
  | { kind: 'list' }
  | { kind: 'detail'; eventId: string }
  | { kind: 'form'; eventId?: string; focusResponderId?: string }
  | { kind: 'fill'; eventId: string; returnTo: 'list' | 'detail' }

function Gate() {
  const { session, loading, roles, passwordSetupReason } = useAuth()
  const isDesktop = useIsDesktop()
  const [view, setView] = useState<AppView>('events')
  const [eventSurface, setEventSurface] = useState<EventSurface>({ kind: 'list' })

  const isAdmin = roles.includes('admin')
  const manages = isAdmin || roles.includes('shift_lead')
  const responds = roles.includes('responder')
  // Leads also go on events — same personal list/fill surface, not only the responder role.
  const hasMineList = responds || roles.includes('shift_lead')
  const isAdminView = view === 'users' || view === 'lists'
  const onEvents = view === 'events' || view === 'mine'

  const entries = useMemo(() => {
    const list: {
      view: AppView
      label: string
      icon: (typeof NAV_ICONS)[AppView]
      section?: string
      alsoCurrentFor?: AppView[]
    }[] = []
    if (manages) list.push({ view: 'events', label: 'אירועים', icon: NAV_ICONS.events })
    if (hasMineList) list.push({ view: 'mine', label: 'האירועים שלי', icon: NAV_ICONS.mine })
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

  if (session && passwordSetupReason) {
    return <LoginPage forceSetPassword />
  }

  if (!session) return <LoginPage />

  const commandShell = isDesktop && (manages || (isAdmin && isAdminView))
  const scope: 'unit' | 'mine' = manages && view !== 'mine' ? 'unit' : 'mine'
  const activeView: AppView = entries.some(
    (entry) => entry.view === view || entry.alsoCurrentFor?.includes(view),
  )
    ? view
    : entries[0].view

  function navigate(next: AppView) {
    setEventSurface({ kind: 'list' })
    setView(next)
  }

  function goHome() {
    // Lead/admin → unit events; responder → mine; otherwise first nav entry.
    const home: AppView = manages ? 'events' : hasMineList ? 'mine' : (entries[0]?.view ?? 'profile')
    navigate(home)
  }

  return (
    <AppShell
      theme={commandShell && eventSurface.kind !== 'fill' ? 'command' : 'field'}
      withSidebar={commandShell && eventSurface.kind !== 'fill'}
      narrow={(!commandShell || eventSurface.kind === 'fill') && isDesktop}
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
      ) : (
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
      )}
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
