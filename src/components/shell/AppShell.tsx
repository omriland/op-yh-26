import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Fuel,
  Gauge,
  ListChecks,
  ListTree,
  LogOut,
  Table2,
  UserRound,
  Users,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { Avatar } from '../ui/Avatar'
import { monoClass } from '../../lib/format'
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  clampSidebarWidth,
  nextSidebarWidthFromPointer,
  readSidebarWidth,
  writeSidebarWidth,
} from '../../lib/sidebarWidth'
import { navAttentionAriaSuffix } from '../../lib/navAttention'
import { SnykBadge } from './SnykBadge'

export type AppView =
  | 'events'
  | 'mine'
  | 'shifts'
  | 'my_shifts'
  | 'exceptions'
  | 'users'
  | 'fuel_refund'
  | 'fuel_quarter'
  | 'lists'
  | 'profile'

type NavEntry = {
  view: AppView
  label: string
  icon: ReactNode
  section?: string
  /** Extra views that should keep this nav entry marked current (mobile admin hub). */
  alsoCurrentFor?: AppView[]
  /** Small red dot on the icon — open items needing completion. */
  attention?: boolean
}

type AppShellProps = {
  theme: 'field' | 'command'
  withSidebar: boolean
  narrow: boolean
  /** List/admin/profile only — hide on immersive form/fill/detail. */
  showSecurityBadge?: boolean
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
  showSecurityBadge = false,
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
          {showSecurityBadge ? <SnykBadge /> : null}
        </main>
      </div>
      {withSidebar ? null : <BottomTabBar view={view} onNavigate={onNavigate} entries={entries} />}
    </div>
  )
}

export const NAV_ICONS: Record<AppView, ReactNode> = {
  events: <ClipboardList size={24} strokeWidth={1.75} aria-hidden="true" />,
  mine: <ListChecks size={24} strokeWidth={1.75} aria-hidden="true" />,
  shifts: <CalendarClock size={24} strokeWidth={1.75} aria-hidden="true" />,
  my_shifts: <CalendarCheck size={24} strokeWidth={1.75} aria-hidden="true" />,
  exceptions: <Gauge size={24} strokeWidth={1.75} aria-hidden="true" />,
  users: <Users size={24} strokeWidth={1.75} aria-hidden="true" />,
  fuel_refund: <Table2 size={24} strokeWidth={1.75} aria-hidden="true" />,
  fuel_quarter: <Fuel size={24} strokeWidth={1.75} aria-hidden="true" />,
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

function isDocumentRtl() {
  return getComputedStyle(document.documentElement).direction === 'rtl'
}

function persistSidebarWidth(width: number) {
  try {
    writeSidebarWidth(window.localStorage, width)
  } catch {
    // Private mode / quota — keep in-session only.
  }
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
  const [width, setWidth] = useState(() => {
    try {
      return readSidebarWidth(window.localStorage)
    } catch {
      return SIDEBAR_WIDTH_DEFAULT
    }
  })
  const widthRef = useRef(width)
  const dragRef = useRef<{ startWidth: number; startClientX: number } | null>(null)

  useEffect(() => {
    widthRef.current = width
  }, [width])

  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  function applyWidth(next: number, persist: boolean) {
    const clamped = clampSidebarWidth(next)
    setWidth(clamped)
    if (persist) persistSidebarWidth(clamped)
  }

  function onResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startWidth: widthRef.current, startClientX: event.clientX }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function onResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    applyWidth(
      nextSidebarWidthFromPointer({
        startWidth: drag.startWidth,
        startClientX: drag.startClientX,
        clientX: event.clientX,
        rtl: isDocumentRtl(),
      }),
      false,
    )
  }

  function onResizePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    persistSidebarWidth(widthRef.current)
  }

  function onResizeDoubleClick() {
    applyWidth(SIDEBAR_WIDTH_DEFAULT, true)
  }

  function onResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const rtl = isDocumentRtl()
    const step = 8
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      applyWidth(widthRef.current + (rtl ? step : -step), true)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      applyWidth(widthRef.current + (rtl ? -step : step), true)
    } else if (event.key === 'Home') {
      event.preventDefault()
      applyWidth(SIDEBAR_WIDTH_DEFAULT, true)
    }
  }

  return (
    <nav className="sidebar" aria-label="ניווט ראשי" style={{ width }}>
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
                aria-label={
                  entry.attention
                    ? `${entry.label}${navAttentionAriaSuffix(true)}`
                    : undefined
                }
                onClick={() => onNavigate(entry.view)}
              >
                <NavIcon icon={entry.icon} attention={Boolean(entry.attention)} />
                {entry.label}
              </button>
            </div>
          )
        })}
      </div>
      <div
        className="sidebar__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="שינוי רוחב תפריט הצד"
        aria-valuemin={SIDEBAR_WIDTH_MIN}
        aria-valuemax={SIDEBAR_WIDTH_MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onDoubleClick={onResizeDoubleClick}
        onKeyDown={onResizeKeyDown}
      />
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
          aria-label={
            entry.attention
              ? `${entry.label}${navAttentionAriaSuffix(true)}`
              : undefined
          }
          onClick={() => onNavigate(entry.view)}
        >
          <NavIcon icon={entry.icon} attention={Boolean(entry.attention)} />
          {entry.label}
        </button>
      ))}
    </nav>
  )
}

function NavIcon({ icon, attention }: { icon: ReactNode; attention: boolean }) {
  return (
    <span className="nav-icon">
      {icon}
      {attention ? <span className="nav-attention-dot" aria-hidden="true" /> : null}
    </span>
  )
}
