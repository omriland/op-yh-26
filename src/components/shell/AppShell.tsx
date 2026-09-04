import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Contact,
  Ellipsis,
  Eye,
  Fuel,
  History,
  ListChecks,
  LogOut,
  MapPin,
  MapPinned,
  Plus,
  Radar,
  MessageSquarePlus,
  Settings,
  Shield,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { stopImpersonation } from '../../lib/impersonation'
import {
  IMPERSONATION_CHANGE_EVENT,
  isImpersonating,
} from '../../lib/impersonationStash'
import { isMenuOutsideClick } from '../../lib/overlayDismiss'
import { canStartRolePreview } from '../../lib/rolePreview'
import {
  ROLE_PREVIEW_CHANGE_EVENT,
  clearRolePreviewStash,
  isRolePreviewing,
} from '../../lib/rolePreviewStash'
import { sidebarLeadNewEvent } from '../../lib/sidebarCreate'
import { Avatar } from '../ui/Avatar'
import { monoClass } from '../../lib/format'
import { useToast } from '../ui/Toast'
import { ImpersonationBar } from './ImpersonationBar'
import { RolePreviewBar } from './RolePreviewBar'
import { UpdateAvailableNotice } from './UpdateAvailableNotice'
import { ImpersonationPickerDialog } from './ImpersonationPickerDialog'
import { RolePreviewPickerDialog } from './RolePreviewPickerDialog'
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
import { MOBILE_MORE_LABEL, splitMobileNav } from '../../lib/mobileNav'
import { NAV_FLYOUT_MIN_WIDTH, placeNavFlyout } from '../../lib/navFlyoutPlacement'
import { useIsDesktop } from '../../lib/useMediaQuery'
import { AvailabilityPopoverTrigger, AvailabilityTrigger } from '../availability/AvailabilityControl'
import { Dialog } from '../ui/Dialog'
import { SnykBadge } from './SnykBadge'
import { FeedbackFab } from '../feedback/FeedbackFab'

export type AppView =
  | 'events'
  | 'mine'
  | 'shifts'
  | 'my_shifts'
  | 'contacts'
  | 'cockpit'
  | 'users'
  | 'map'
  | 'reports'
  | 'fuel_quarter'
  | 'lists'
  | 'profile'
  | 'feedback'
  | 'event_locations'
  | 'event_audit'

export type NavEntry = {
  view?: AppView
  /** Parent-only id when this row is a submenu, not a destination. */
  menuId?: string
  label: string
  icon: ReactNode
  section?: string
  /** Extra views that should keep this nav entry marked current (mobile admin hub). */
  alsoCurrentFor?: AppView[]
  /** Small red dot on the icon — open items needing completion. */
  attention?: boolean
  /** Desktop sidebar: pin to the block-end footer (פרופיל / הגדרות). */
  pin?: 'end'
  children?: NavEntry[]
}

type AppShellProps = {
  withSidebar: boolean
  narrow: boolean
  /** List/admin/profile only — hide on immersive form/fill/detail. */
  showSecurityBadge?: boolean
  onOpenPrivacy?: () => void
  onOpenAndroid?: () => void
  onOpenIos?: () => void
  view: AppView
  onNavigate: (view: AppView) => void
  /** Wordmark → role home (unit events / mine / profile). */
  onHome: () => void
  entries: NavEntry[]
  /** Desktop sidebar — אירוע חדש at the top of כלים לאחמ״ש. Shift create lives on the shifts page. */
  onCreateEvent?: () => void
  /** Create route (`/events/new`) — marks אירוע חדש current, not the previous dest. */
  creatingEvent?: boolean
  /** Current virtual path, attached to submitted feedback. */
  feedbackPagePath?: string | null
  children: ReactNode
}

export function AppShell({
  withSidebar,
  narrow,
  showSecurityBadge = false,
  onOpenPrivacy,
  onOpenAndroid,
  onOpenIos,
  view,
  onNavigate,
  onHome,
  entries,
  onCreateEvent,
  creatingEvent = false,
  feedbackPagePath = null,
  children,
}: AppShellProps) {
  const isDesktop = useIsDesktop()

  return (
    <div
      className={['shell', isDesktop ? 'shell--cards' : ''].filter(Boolean).join(' ')}
      data-theme="field"
    >
      <a className="skip-link" href="#main">
        דילוג לתוכן
      </a>
      {isDesktop ? null : (
        <TopAppBar view={view} onNavigate={onNavigate} onHome={onHome} />
      )}
      <ImpersonationBar onRestored={onHome} />
      <RolePreviewBar onRestored={onHome} />
      <UpdateAvailableNotice />
      <div className="shell__body">
        {withSidebar ? (
          <Sidebar
            view={view}
            onNavigate={onNavigate}
            onHome={onHome}
            entries={entries}
            onCreateEvent={onCreateEvent}
            creatingEvent={creatingEvent}
          />
        ) : null}
        <main
          id="main"
          className={['shell__main', narrow ? 'shell__main--narrow' : ''].join(' ')}
          data-theme="field"
        >
          {children}
          {showSecurityBadge && onOpenPrivacy ? (
            <SnykBadge
              onOpenPrivacy={onOpenPrivacy}
              onOpenAndroid={onOpenAndroid}
              onOpenIos={onOpenIos}
            />
          ) : null}
        </main>
      </div>
      {withSidebar ? null : <BottomTabBar view={view} onNavigate={onNavigate} entries={entries} />}
      <FeedbackFab pagePath={feedbackPagePath} />
    </div>
  )
}

export const NAV_ICONS: Record<AppView, ReactNode> = {
  events: <ClipboardList size={24} strokeWidth={1.75} aria-hidden="true" />,
  mine: <ListChecks size={24} strokeWidth={1.75} aria-hidden="true" />,
  shifts: <CalendarClock size={24} strokeWidth={1.75} aria-hidden="true" />,
  my_shifts: <CalendarCheck size={24} strokeWidth={1.75} aria-hidden="true" />,
  contacts: <Contact size={24} strokeWidth={1.75} aria-hidden="true" />,
  cockpit: <Radar size={24} strokeWidth={1.75} aria-hidden="true" />,
  users: <Users size={24} strokeWidth={1.75} aria-hidden="true" />,
  map: <MapPinned size={24} strokeWidth={1.75} aria-hidden="true" />,
  reports: <BarChart3 size={24} strokeWidth={1.75} aria-hidden="true" />,
  fuel_quarter: <Fuel size={24} strokeWidth={1.75} aria-hidden="true" />,
  lists: <Settings size={24} strokeWidth={1.75} aria-hidden="true" />,
  profile: <UserRound size={24} strokeWidth={1.75} aria-hidden="true" />,
  feedback: <MessageSquarePlus size={24} strokeWidth={1.75} aria-hidden="true" />,
  event_locations: <MapPin size={24} strokeWidth={1.75} aria-hidden="true" />,
  event_audit: <History size={24} strokeWidth={1.75} aria-hidden="true" />,
}

export const SUPER_ADMIN_NAV_ICON = (
  <Shield size={24} strokeWidth={1.75} aria-hidden="true" />
)

function navEntryKey(entry: NavEntry) {
  return entry.view ?? entry.menuId ?? entry.label
}

function isNavCurrent(
  entry: NavEntry,
  view: AppView,
  createEventCurrent = false,
): boolean {
  if (createEventCurrent) return false
  if (entry.view === view || Boolean(entry.alsoCurrentFor?.includes(view))) return true
  return Boolean(entry.children?.some((child) => isNavCurrent(child, view)))
}

function BrandMark({
  view,
  onHome,
  layout = 'bar',
}: {
  view: AppView
  onHome: () => void
  layout?: 'bar' | 'sidebar'
}) {
  const cockpit = view === 'cockpit'
  return (
    <button
      type="button"
      className={layout === 'sidebar' ? 'sidebar__brand' : 'appbar__brand'}
      onClick={onHome}
      aria-label="חזרה למסך הראשי"
    >
      <span className="appbar__system">{cockpit ? 'אבן דרך - הקוקפיט' : 'אבן דרך'}</span>
      {cockpit ? null : (
        <>
          {layout === 'bar' ? <span className="appbar__brand-rule" aria-hidden="true" /> : null}
          <span className={layout === 'sidebar' ? 'sidebar__brand-unit' : 'appbar__unit'}>
            היחידה הארצית לפינוי צירים
          </span>
        </>
      )}
    </button>
  )
}

/** Always Command ink — the constant institutional band, in both theme contexts. */
function TopAppBar({
  view,
  onNavigate,
  onHome,
}: {
  view: AppView
  onNavigate: (view: AppView) => void
  onHome: () => void
}) {
  return (
    <header className="appbar" data-theme="command">
      <BrandMark view={view} onHome={onHome} />
      <UserChrome onNavigate={onNavigate} onHome={onHome} />
    </header>
  )
}

function UserChrome({
  onNavigate,
  onHome,
  menuRise = false,
}: {
  onNavigate: (view: AppView) => void
  onHome: () => void
  menuRise?: boolean
}) {
  const { profile, user, roles, signOut, reloadProfile } = useAuth()
  const isDesktop = useIsDesktop()
  const { show } = useToast()
  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rolePickerOpen, setRolePickerOpen] = useState(false)
  const [viewingAsOther, setViewingAsOther] = useState(() => isImpersonating())
  const [previewingRole, setPreviewingRole] = useState(() => isRolePreviewing())
  const [restoreBusy, setRestoreBusy] = useState(false)
  const isSuperAdmin = roles.includes('super_admin')
  const showRolePreview = canStartRolePreview({
    actualRoles: roles,
    impersonating: viewingAsOther,
    previewing: previewingRole,
  })
  const anchorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const sync = () => setViewingAsOther(isImpersonating())
    window.addEventListener(IMPERSONATION_CHANGE_EVENT, sync)
    return () => window.removeEventListener(IMPERSONATION_CHANGE_EVENT, sync)
  }, [])

  useEffect(() => {
    const sync = () => setPreviewingRole(isRolePreviewing())
    window.addEventListener(ROLE_PREVIEW_CHANGE_EVENT, sync)
    return () => window.removeEventListener(ROLE_PREVIEW_CHANGE_EVENT, sync)
  }, [])

  async function restoreOwnAccount() {
    setRestoreBusy(true)
    const result = await stopImpersonation()
    setRestoreBusy(false)
    setViewingAsOther(isImpersonating())
    if (result.error) {
      show(result.error, 'alert')
      return
    }
    show('חזרתם לחשבון שלכם.', 'done')
    onHome()
  }

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (isMenuOutsideClick(event.target, anchorRef.current)) setOpen(false)
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
    <>
      <div className="appbar__cluster">
          {isDesktop && profile ? (
            <AvailabilityPopoverTrigger
              target={{
                id: profile.id,
                availability: profile.availability,
                available_from: profile.available_from,
              }}
              disabled={viewingAsOther}
              disabledCaption="צפייה כמשתמש — לא ניתן לשנות זמינות."
              onSaved={() => void reloadProfile()}
            />
          ) : null}
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
            <div
              className={['menu', menuRise ? 'menu--rise' : ''].filter(Boolean).join(' ')}
              role="menu"
            >
              <div className="menu__header">
                <p className="t-body-strong">{profile?.full_name ?? 'משתמש'}</p>
                <p className="t-caption text-muted">
                  או״ק{' '}
                  <span className={monoClass(profile?.callsign)}>{profile?.callsign ?? '—'}</span>
                </p>
                {!isDesktop && profile ? (
                  <AvailabilityTrigger
                    target={{
                      id: profile.id,
                      availability: profile.availability,
                      available_from: profile.available_from,
                    }}
                    disabled={viewingAsOther}
                    disabledCaption="צפייה כמשתמש — לא ניתן לשנות זמינות."
                    onSaved={() => {
                      setOpen(false)
                      void reloadProfile()
                    }}
                  />
                ) : null}
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
              {isSuperAdmin && !viewingAsOther && user?.id ? (
                <button
                  type="button"
                  role="menuitem"
                  className="menu__item"
                  onClick={() => {
                    setOpen(false)
                    setPickerOpen(true)
                  }}
                >
                  <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
                  צפייה כמשתמש
                </button>
              ) : null}
              {showRolePreview ? (
                <button
                  type="button"
                  role="menuitem"
                  className="menu__item"
                  onClick={() => {
                    setOpen(false)
                    setRolePickerOpen(true)
                  }}
                >
                  <UserCog size={20} strokeWidth={1.75} aria-hidden="true" />
                  צפייה בתפקיד אחר
                </button>
              ) : null}
              {previewingRole ? (
                <button
                  type="button"
                  role="menuitem"
                  className="menu__item"
                  onClick={() => {
                    setOpen(false)
                    clearRolePreviewStash()
                    setPreviewingRole(false)
                    show('חזרת בהצלחה לתפקיד שלך.', 'done')
                    onHome()
                  }}
                >
                  <UserCog size={20} strokeWidth={1.75} aria-hidden="true" />
                  חזרה לתפקיד שלי
                </button>
              ) : null}
              {viewingAsOther ? (
                <button
                  type="button"
                  role="menuitem"
                  className="menu__item"
                  disabled={restoreBusy}
                  onClick={() => {
                    setOpen(false)
                    void restoreOwnAccount()
                  }}
                >
                  <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
                  חזרה לחשבון שלי
                </button>
              ) : null}
              <button type="button" role="menuitem" className="menu__item" onClick={() => void signOut()}>
                <LogOut size={20} strokeWidth={1.75} className="icon-mirror" aria-hidden="true" />
                התנתקות
              </button>
            </div>
          ) : null}
        </div>
        </div>
      {user?.id ? (
        <ImpersonationPickerDialog
          open={pickerOpen}
          actorUserId={user.id}
          onClose={() => setPickerOpen(false)}
          onStarted={onHome}
        />
      ) : null}
      <RolePreviewPickerDialog
        open={rolePickerOpen}
        onClose={() => setRolePickerOpen(false)}
        onStarted={onHome}
      />
    </>
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

const SIDEBAR_END_ORDER: AppView[] = ['profile', 'lists']

function splitSidebarEntries(entries: NavEntry[]) {
  const main: NavEntry[] = []
  const end: NavEntry[] = []
  for (const entry of entries) {
    if (entry.pin === 'end') end.push(entry)
    else main.push(entry)
  }
  end.sort((a, b) => {
    const left = a.view ? SIDEBAR_END_ORDER.indexOf(a.view) : SIDEBAR_END_ORDER.length
    const right = b.view ? SIDEBAR_END_ORDER.indexOf(b.view) : SIDEBAR_END_ORDER.length
    return left - right
  })
  return { main, end }
}

function Sidebar({
  view,
  onNavigate,
  onHome,
  entries,
  onCreateEvent,
  creatingEvent,
}: {
  view: AppView
  onNavigate: (view: AppView) => void
  onHome: () => void
  entries: NavEntry[]
  onCreateEvent?: () => void
  creatingEvent: boolean
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

  const { main, end } = splitSidebarEntries(entries)

  return (
    <nav className="sidebar" aria-label="ניווט ראשי" data-theme="command" style={{ width }}>
      <BrandMark layout="sidebar" view={view} onHome={onHome} />
      <div className="sidebar__nav">
        <SidebarNavItems
          entries={main}
          view={view}
          onNavigate={onNavigate}
          onCreateEvent={onCreateEvent}
          creatingEvent={creatingEvent}
        />
      </div>
      <div className="sidebar__footer">
        {end.length > 0 ? (
          <SidebarNavItems
            entries={end}
            view={view}
            onNavigate={onNavigate}
            onCreateEvent={onCreateEvent}
            creatingEvent={creatingEvent}
          />
        ) : null}
        <UserChrome
          onNavigate={onNavigate}
          onHome={onHome}
          menuRise
        />
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

function SidebarNavItems({
  entries,
  view,
  onNavigate,
  onCreateEvent,
  creatingEvent,
}: {
  entries: NavEntry[]
  view: AppView
  onNavigate: (view: AppView) => void
  onCreateEvent?: () => void
  creatingEvent: boolean
}) {
  return (
    <>
      {entries.map((entry, index) => {
        const prev = entries[index - 1]
        const showSection = entry.section && entry.section !== prev?.section
        const leadNewEvent =
          showSection ? sidebarLeadNewEvent(entry.section, onCreateEvent) : null
        return (
          <div key={navEntryKey(entry)}>
            {showSection ? <p className="sidebar__section">{entry.section}</p> : null}
            {leadNewEvent ? (
              <button
                type="button"
                className="nav-item sidebar__new-event"
                aria-current={creatingEvent ? 'page' : undefined}
                onClick={leadNewEvent.onCreate}
              >
                <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                {leadNewEvent.label}
              </button>
            ) : null}
            {entry.children && entry.children.length > 0 ? (
              <SidebarNavMenu
                entry={entry}
                view={view}
                onNavigate={onNavigate}
                creatingEvent={creatingEvent}
              />
            ) : (
              <button
                type="button"
                className={
                  entry.view === 'cockpit' ? 'nav-item nav-item--cockpit' : 'nav-item'
                }
                aria-current={isNavCurrent(entry, view, creatingEvent) ? 'page' : undefined}
                aria-label={
                  entry.attention
                    ? `${entry.label}${navAttentionAriaSuffix(true)}`
                    : undefined
                }
                onClick={() => {
                  if (entry.view) onNavigate(entry.view)
                }}
              >
                <NavIcon icon={entry.icon} attention={Boolean(entry.attention)} />
                {entry.label}
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}

function SidebarNavMenu({
  entry,
  view,
  onNavigate,
  creatingEvent,
}: {
  entry: NavEntry
  view: AppView
  onNavigate: (view: AppView) => void
  creatingEvent: boolean
}) {
  const children = entry.children ?? []
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)
  const menuId = useId()
  const current = isNavCurrent(entry, view, creatingEvent)

  function clearCloseTimer() {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function openMenu() {
    clearCloseTimer()
    setOpen(true)
  }

  function scheduleClose() {
    clearCloseTimer()
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }

  useEffect(() => () => clearCloseTimer(), [])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null)
      return
    }

    function place() {
      const triggerEl = triggerRef.current
      const panelEl = panelRef.current
      if (!triggerEl) return
      const rect = triggerEl.getBoundingClientRect()
      const panelWidth = panelEl?.offsetWidth ?? NAV_FLYOUT_MIN_WIDTH
      setCoords(
        placeNavFlyout({
          trigger: { top: rect.top, left: rect.left, right: rect.right },
          panelWidth,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          rtl: isDocumentRtl(),
        }),
      )
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, children.length])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className="nav-flyout">
      <button
        ref={triggerRef}
        type="button"
        className="nav-item nav-item--menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-current={current ? 'page' : undefined}
        aria-label={
          entry.attention ? `${entry.label}${navAttentionAriaSuffix(true)}` : undefined
        }
        onPointerEnter={openMenu}
        onPointerLeave={scheduleClose}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <NavIcon icon={entry.icon} attention={Boolean(entry.attention)} />
        <span className="nav-item__label">{entry.label}</span>
        <ChevronDown size={16} strokeWidth={1.75} className="nav-item__chevron" aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={menuId}
              className="menu nav-flyout__panel"
              role="menu"
              style={coords ? { top: coords.top, left: coords.left } : undefined}
              onPointerEnter={openMenu}
              onPointerLeave={scheduleClose}
            >
              {children.map((child) => (
                <button
                  key={navEntryKey(child)}
                  type="button"
                  role="menuitem"
                  className="menu__item"
                  aria-current={isNavCurrent(child, view, creatingEvent) ? 'page' : undefined}
                  onClick={() => {
                    if (!child.view) return
                    setOpen(false)
                    onNavigate(child.view)
                  }}
                >
                  <NavIcon icon={child.icon} attention={Boolean(child.attention)} />
                  {child.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
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
  const { tabs, more } = splitMobileNav(entries)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreCurrent = more.some((entry) => isNavCurrent(entry, view))
  const moreAttention = more.some((entry) => entry.attention)

  useEffect(() => {
    setMoreOpen(false)
  }, [view])

  return (
    <>
      <nav className="tabbar" aria-label="ניווט ראשי">
        {tabs.map((entry) => (
          <TabButton
            key={navEntryKey(entry)}
            entry={entry}
            current={isNavCurrent(entry, view)}
            onClick={() => {
              if (entry.view) onNavigate(entry.view)
            }}
          />
        ))}
        {more.length > 0 ? (
          <button
            type="button"
            className="tab"
            aria-current={moreCurrent ? 'page' : undefined}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-label={
              moreAttention
                ? `${MOBILE_MORE_LABEL}${navAttentionAriaSuffix(true)}`
                : undefined
            }
            onClick={() => setMoreOpen((open) => !open)}
          >
            <NavIcon
              icon={<Ellipsis size={24} strokeWidth={1.75} aria-hidden="true" />}
              attention={Boolean(moreAttention)}
            />
            {MOBILE_MORE_LABEL}
          </button>
        ) : null}
      </nav>
      <Dialog open={moreOpen} title={MOBILE_MORE_LABEL} onClose={() => setMoreOpen(false)}>
        <div className="tabbar-more">
          {more.map((entry) =>
            entry.children && entry.children.length > 0 ? (
              <MoreNavMenu
                key={navEntryKey(entry)}
                entry={entry}
                view={view}
                onNavigate={(next) => {
                  setMoreOpen(false)
                  onNavigate(next)
                }}
              />
            ) : (
              <button
                key={navEntryKey(entry)}
                type="button"
                className="nav-item"
                aria-current={isNavCurrent(entry, view) ? 'page' : undefined}
                aria-label={
                  entry.attention
                    ? `${entry.label}${navAttentionAriaSuffix(true)}`
                    : undefined
                }
                onClick={() => {
                  if (!entry.view) return
                  setMoreOpen(false)
                  onNavigate(entry.view)
                }}
              >
                <NavIcon icon={entry.icon} attention={Boolean(entry.attention)} />
                {entry.label}
              </button>
            ),
          )}
        </div>
      </Dialog>
    </>
  )
}

function MoreNavMenu({
  entry,
  view,
  onNavigate,
}: {
  entry: NavEntry
  view: AppView
  onNavigate: (view: AppView) => void
}) {
  const children = entry.children ?? []
  const current = isNavCurrent(entry, view)
  const [expanded, setExpanded] = useState(current)

  return (
    <div className="tabbar-more__menu">
      <button
        type="button"
        className="nav-item nav-item--menu"
        aria-expanded={expanded}
        aria-current={current ? 'page' : undefined}
        aria-label={
          entry.attention ? `${entry.label}${navAttentionAriaSuffix(true)}` : undefined
        }
        onClick={() => setExpanded((open) => !open)}
      >
        <NavIcon icon={entry.icon} attention={Boolean(entry.attention)} />
        <span className="nav-item__label">{entry.label}</span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={['nav-item__chevron', expanded ? 'is-open' : ''].filter(Boolean).join(' ')}
          aria-hidden="true"
        />
      </button>
      {expanded
        ? children.map((child) => (
            <button
              key={navEntryKey(child)}
              type="button"
              className="nav-item nav-item--sub"
              aria-current={isNavCurrent(child, view) ? 'page' : undefined}
              aria-label={
                child.attention
                  ? `${child.label}${navAttentionAriaSuffix(true)}`
                  : undefined
              }
              onClick={() => {
                if (child.view) onNavigate(child.view)
              }}
            >
              <NavIcon icon={child.icon} attention={Boolean(child.attention)} />
              {child.label}
            </button>
          ))
        : null}
    </div>
  )
}

function TabButton({
  entry,
  current,
  onClick,
}: {
  entry: NavEntry
  current: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="tab"
      aria-current={current ? 'page' : undefined}
      aria-label={
        entry.attention
          ? `${entry.label}${navAttentionAriaSuffix(true)}`
          : undefined
      }
      onClick={onClick}
    >
      <NavIcon icon={entry.icon} attention={Boolean(entry.attention)} />
      {entry.label}
    </button>
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
