import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  Radar,
  MessageSquarePlus,
  Search,
  Settings,
  Shield,
  Signpost,
  Smartphone,
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
import { Avatar } from '../ui/Avatar'
import { monoClass } from '../../lib/format'
import { useToast } from '../ui/Toast'
import { CobrowseSupport } from './CobrowseSupport'
import { ImpersonationBar } from './ImpersonationBar'
import { RolePreviewBar } from './RolePreviewBar'
import { UpdateAvailableNotice } from './UpdateAvailableNotice'
import { ImpersonationPickerDialog } from './ImpersonationPickerDialog'
import { RolePreviewPickerDialog } from './RolePreviewPickerDialog'
import { navAttentionAriaSuffix } from '../../lib/navAttention'
import { MOBILE_MORE_LABEL, splitMobileNav } from '../../lib/mobileNav'
import { useIsDesktop } from '../../lib/useMediaQuery'
import { AvailabilityPopoverTrigger, AvailabilityTrigger } from '../availability/AvailabilityControl'
import { Dialog } from '../ui/Dialog'
import { SnykBadge } from './SnykBadge'
import { FeedbackFab } from '../feedback/FeedbackFab'
import { DesktopShell } from './DesktopShell'
import { TopBarMenu } from './desktopMenus'

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
  | 'ios_devices'
  | 'highway_junctions'
  | 'search'

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
  /** Desktop Help menu: the support page. */
  onOpenSupport?: () => void
  /** Desktop top bar search (admins): open the search page with this query. */
  onSearch?: (query: string) => void
  view: AppView
  onNavigate: (view: AppView) => void
  /** Wordmark → role home (unit events / mine / profile). */
  onHome: () => void
  entries: NavEntry[]
  /** Desktop side nav: אירוע חדש at the top of כלים לאחמ״ש. Shift create lives on the shifts page. */
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
  onOpenSupport,
  onSearch,
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
  const mainClassName = ['shell__main', narrow ? 'shell__main--narrow' : ''].join(' ')
  const banners = (
    <>
      <ImpersonationBar onRestored={onHome} />
      <RolePreviewBar onRestored={onHome} />
      <CobrowseSupport />
      <UpdateAvailableNotice />
    </>
  )
  const content = (
    <>
      {children}
      {showSecurityBadge && onOpenPrivacy ? (
        <SnykBadge onOpenPrivacy={onOpenPrivacy} onOpenAndroid={onOpenAndroid} onHome={onHome} />
      ) : null}
    </>
  )

  if (isDesktop && withSidebar) {
    return (
      <DesktopShell
        view={view}
        onNavigate={onNavigate}
        onHome={onHome}
        entries={entries}
        onCreateEvent={onCreateEvent}
        creatingEvent={creatingEvent}
        onSearch={onSearch}
        onOpenSupport={onOpenSupport}
        onOpenPrivacy={onOpenPrivacy}
        account={<UserChrome variant="desktop" onNavigate={onNavigate} onHome={onHome} />}
        banners={banners}
        mainClassName={mainClassName}
        overlay={<FeedbackFab pagePath={feedbackPagePath} />}
      >
        {content}
      </DesktopShell>
    )
  }

  return (
    <div className="shell" data-theme="field">
      <a className="skip-link" href="#main">
        דילוג לתוכן
      </a>
      {isDesktop ? null : (
        <TopAppBar view={view} onNavigate={onNavigate} onHome={onHome} />
      )}
      {banners}
      <div className="shell__body">
        <main id="main" className={mainClassName} data-theme="field">
          {content}
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
  ios_devices: <Smartphone size={24} strokeWidth={1.75} aria-hidden="true" />,
  highway_junctions: <Signpost size={24} strokeWidth={1.75} aria-hidden="true" />,
  search: <Search size={24} strokeWidth={1.75} aria-hidden="true" />,
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
  variant = 'appbar',
}: {
  onNavigate: (view: AppView) => void
  onHome: () => void
  /** `desktop`: availability + avatar menu in the desktop top bar. */
  variant?: 'appbar' | 'desktop'
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

  const availabilityTarget = profile
    ? {
        id: profile.id,
        availability: profile.availability,
        available_from: profile.available_from,
      }
    : null

  function menuItems(itemClass: string, close: () => void) {
    return (
      <>
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => {
            close()
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
            className={itemClass}
            onClick={() => {
              close()
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
            className={itemClass}
            onClick={() => {
              close()
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
            className={itemClass}
            onClick={() => {
              close()
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
            className={itemClass}
            disabled={restoreBusy}
            onClick={() => {
              close()
              void restoreOwnAccount()
            }}
          >
            <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
            חזרה לחשבון שלי
          </button>
        ) : null}
        <button type="button" role="menuitem" className={itemClass} onClick={() => void signOut()}>
          <LogOut size={20} strokeWidth={1.75} className="icon-mirror" aria-hidden="true" />
          התנתקות
        </button>
      </>
    )
  }

  const name = profile?.full_name ?? 'משתמש'
  const callsign = (
    <p className="t-caption text-muted">
      או״ק <span className={monoClass(profile?.callsign)}>{profile?.callsign ?? '—'}</span>
    </p>
  )

  const dialogs = (
    <>
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

  if (variant === 'desktop') {
    return (
      <>
        <div className="dbar__account">
          {availabilityTarget ? (
            <AvailabilityPopoverTrigger
              target={availabilityTarget}
              disabled={viewingAsOther}
              disabledCaption="צפייה כמשתמש — לא ניתן לשנות זמינות."
              onSaved={() => void reloadProfile()}
            />
          ) : null}
          <TopBarMenu
            id="account"
            label="תפריט משתמש"
            triggerClassName="dbar__avatar-btn"
            triggerContent={<Avatar name={name} size="sm" />}
            header={
              <div className="dshell-menu__header">
                <p className="dshell-menu__name">{name}</p>
                {callsign}
              </div>
            }
          >
            {(close) => menuItems('dshell-menu__item', close)}
          </TopBarMenu>
        </div>
        {dialogs}
      </>
    )
  }

  return (
    <>
      <div className="appbar__cluster">
        {isDesktop && availabilityTarget ? (
          <AvailabilityPopoverTrigger
            target={availabilityTarget}
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
            <Avatar name={name} />
          </button>
          {open ? (
            <div className="menu" role="menu">
              <div className="menu__header">
                <p className="t-body-strong">{name}</p>
                {callsign}
                {!isDesktop && availabilityTarget ? (
                  <AvailabilityTrigger
                    target={availabilityTarget}
                    disabled={viewingAsOther}
                    disabledCaption="צפייה כמשתמש — לא ניתן לשנות זמינות."
                    onSaved={() => {
                      setOpen(false)
                      void reloadProfile()
                    }}
                  />
                ) : null}
              </div>
              {menuItems('menu__item', () => setOpen(false))}
            </div>
          ) : null}
        </div>
      </div>
      {dialogs}
    </>
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
