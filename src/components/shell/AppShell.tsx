import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ClipboardList, ListChecks, ListTree, LogOut, UserRound, Users } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { Avatar } from '../ui/Avatar'
import { monoClass } from '../../lib/format'

export type AppView = 'events' | 'mine' | 'users' | 'lists' | 'profile'

type NavEntry = {
  view: AppView
  label: string
  icon: ReactNode
  section?: string
  /** Extra views that should keep this nav entry marked current (mobile admin hub). */
  alsoCurrentFor?: AppView[]
}

type AppShellProps = {
  theme: 'field' | 'command'
  withSidebar: boolean
  narrow: boolean
  view: AppView
  onNavigate: (view: AppView) => void
  /** Wordmark → role home (unit events / mine / profile). */
  onHome: () => void
  entries: NavEntry[]
  children: ReactNode
}

export function AppShell({
  theme,
  withSidebar,
  narrow,
  view,
  onNavigate,
  onHome,
  entries,
  children,
}: AppShellProps) {
  return (
    <div className="shell" data-theme={theme}>
      <a className="skip-link" href="#main">
        דילוג לתוכן
      </a>
      <TopAppBar onNavigate={onNavigate} onHome={onHome} />
      <div className="shell__body">
        {withSidebar ? <Sidebar view={view} onNavigate={onNavigate} entries={entries} /> : null}
        <main id="main" className={['shell__main', narrow ? 'shell__main--narrow' : ''].join(' ')}>
          {children}
        </main>
      </div>
      {withSidebar ? null : <BottomTabBar view={view} onNavigate={onNavigate} entries={entries} />}
    </div>
  )
}

export const NAV_ICONS: Record<AppView, ReactNode> = {
  events: <ClipboardList size={24} strokeWidth={1.75} aria-hidden="true" />,
  mine: <ListChecks size={24} strokeWidth={1.75} aria-hidden="true" />,
  users: <Users size={24} strokeWidth={1.75} aria-hidden="true" />,
  lists: <ListTree size={24} strokeWidth={1.75} aria-hidden="true" />,
  profile: <UserRound size={24} strokeWidth={1.75} aria-hidden="true" />,
}

function isNavCurrent(entry: NavEntry, view: AppView) {
  return entry.view === view || Boolean(entry.alsoCurrentFor?.includes(view))
}

/** Always Command ink — the constant institutional band, in both theme contexts. */
function TopAppBar({
  onNavigate,
  onHome,
}: {
  onNavigate: (view: AppView) => void
  onHome: () => void
}) {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <header className="appbar" data-theme="command">
      <button
        type="button"
        className="appbar__brand"
        onClick={onHome}
        aria-label="חזרה למסך הראשי"
      >
        <span className="appbar__system">אבן דרך</span>
        <span className="appbar__brand-rule" aria-hidden="true" />
        <span className="appbar__unit">היחידה הארצית לפינוי צירים</span>
      </button>
      <div className="menu-anchor" ref={anchorRef}>
        <button
          ref={triggerRef}
          type="button"
          className="appbar__user"
          aria-label="תפריט משתמש"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Avatar name={profile?.full_name ?? 'משתמש'} />
        </button>
        {open ? (
          <div className="menu" role="menu">
            <div className="menu__header">
              <p className="t-body-strong">{profile?.full_name ?? 'משתמש'}</p>
              <p className="t-caption text-muted">
                או״ק{' '}
                <span className={monoClass(profile?.callsign)}>{profile?.callsign ?? '—'}</span>
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              className="menu__item"
              onClick={() => {
                setOpen(false)
                onNavigate('profile')
              }}
            >
              <UserRound size={20} strokeWidth={1.75} aria-hidden="true" />
              פרופיל
            </button>
            <button type="button" role="menuitem" className="menu__item" onClick={() => void signOut()}>
              <LogOut size={20} strokeWidth={1.75} className="icon-mirror" aria-hidden="true" />
              התנתקות
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}

function Sidebar({
  view,
  onNavigate,
  entries,
}: {
  view: AppView
  onNavigate: (view: AppView) => void
  entries: NavEntry[]
}) {
  return (
    <nav className="sidebar" aria-label="ניווט ראשי">
      <div className="sidebar__nav">
        {entries.map((entry, index) => {
          const prev = entries[index - 1]
          const showSection = entry.section && entry.section !== prev?.section
          return (
            <div key={entry.view}>
              {showSection ? <p className="sidebar__section">{entry.section}</p> : null}
              <button
                type="button"
                className="nav-item"
                aria-current={isNavCurrent(entry, view) ? 'page' : undefined}
                onClick={() => onNavigate(entry.view)}
              >
                {entry.icon}
                {entry.label}
              </button>
            </div>
          )
        })}
      </div>
    </nav>
  )
}

function BottomTabBar({
  view,
  onNavigate,
  entries,
}: {
  view: AppView
  onNavigate: (view: AppView) => void
  entries: NavEntry[]
}) {
  return (
    <nav className="tabbar" aria-label="ניווט ראשי">
      {entries.map((entry) => (
        <button
          key={entry.view}
          type="button"
          className="tab"
          aria-current={isNavCurrent(entry, view) ? 'page' : undefined}
          onClick={() => onNavigate(entry.view)}
        >
          {entry.icon}
          {entry.label}
        </button>
      ))}
    </nav>
  )
}
