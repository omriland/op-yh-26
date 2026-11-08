import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  FileText,
  LayoutGrid,
  LifeBuoy,
  MessageSquarePlus,
  PanelLeft,
  Plus,
  Search,
  Settings,
  TrafficCone,
  X,
} from 'lucide-react'
import { appPath } from '../../lib/appRoute'
import {
  groupDesktopNav,
  readClosedSections,
  readNavOpen,
  sectionHasAttention,
  sectionIsCurrent,
  writeClosedSections,
  writeNavOpen,
  type DesktopNavSection,
} from '../../lib/desktopNav'
import { navAttentionAriaSuffix } from '../../lib/navAttention'
import { useSearchShortcut } from '../../lib/searchShortcut'
import { SHIFT_LEAD_NAV_SECTION, sidebarLeadNewEvent } from '../../lib/sidebarCreate'
import { OPEN_FEEDBACK_EVENT } from '../feedback/FeedbackFab'
import { NewEventButtonShell } from '../ui/NewEventButtonShell'
import type { AppView, NavEntry } from './AppShell'
import {
  ShellMenuProvider,
  TopBarMenu,
  isRtlDocument,
  shellPortalRoot,
  useShellMenu,
  useTooltip,
} from './desktopMenus'

type Section = DesktopNavSection<AppView, ReactNode>

type DesktopShellProps = {
  view: AppView
  onNavigate: (view: AppView) => void
  onHome: () => void
  entries: NavEntry[]
  onCreateEvent?: () => void
  creatingEvent: boolean
  /** Admins: run the search page with this query. */
  onSearch?: (query: string) => void
  onOpenSupport?: () => void
  onOpenPrivacy?: () => void
  /** Availability + avatar menu, after the top bar divider. */
  account: ReactNode
  /** Impersonation / role preview / cobrowse / update notices. */
  banners: ReactNode
  mainClassName: string
  /** Floating controls outside the card (feedback button). */
  overlay: ReactNode
  children: ReactNode
}

const SECTION_ICONS: Record<string, ReactNode> = {
  [SHIFT_LEAD_NAV_SECTION]: <TrafficCone aria-hidden="true" />,
  ניהול: <Building2 aria-hidden="true" />,
}

function viewHref(view: AppView): string {
  return appPath({ view, eventSurface: { kind: 'list' }, shiftSurface: { kind: 'list' } })
}

/** Plain left click navigates in-app; modified clicks keep the browser's link behaviour. */
function isPlainClick(event: ReactMouseEvent) {
  return (
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  )
}

function safeStorage<T>(read: (storage: Storage) => T, fallback: T): T {
  try {
    return read(window.localStorage)
  } catch {
    return fallback
  }
}

function safeWrite(write: (storage: Storage) => void) {
  try {
    write(window.localStorage)
  } catch {
    // Private mode / blocked storage: the choice lasts for this session only.
  }
}

function isEntryCurrent(entry: NavEntry, view: AppView, creatingEvent: boolean) {
  return !creatingEvent && entry.view === view
}

function attentionLabel(entry: { label: string; attention?: boolean }) {
  return entry.attention ? `${entry.label}${navAttentionAriaSuffix(true)}` : undefined
}

export function DesktopShell({
  view,
  onNavigate,
  onHome,
  entries,
  onCreateEvent,
  creatingEvent,
  onSearch,
  onOpenSupport,
  onOpenPrivacy,
  account,
  banners,
  mainClassName,
  overlay,
  children,
}: DesktopShellProps) {
  const model = groupDesktopNav<AppView, ReactNode>(entries)
  const [navOpen, setNavOpen] = useState(() => safeStorage(readNavOpen, true))
  const mainRef = useRef<HTMLElement>(null)

  function toggleNav() {
    setNavOpen((current) => {
      const next = !current
      safeWrite((storage) => writeNavOpen(storage, next))
      return next
    })
  }

  return (
    <ShellMenuProvider>
      <div className="shell shell--desktop" data-theme="field">
        <a
          className="skip-link"
          href="#main"
          onClick={(event) => {
            event.preventDefault()
            mainRef.current?.focus()
          }}
        >
          דילוג לתוכן
        </a>
        {banners}
        <div className="dshell">
          <SideNav
            open={navOpen}
            onToggle={toggleNav}
            top={model.top}
            sections={model.sections}
            view={view}
            onNavigate={onNavigate}
            onHome={onHome}
            onCreateEvent={onCreateEvent}
            creatingEvent={creatingEvent}
          />
          <div className="dshell__column">
            <header className="dbar">
              {model.hasSearch && onSearch ? <BarSearch onSearch={onSearch} /> : null}
              <div className="dbar__actions">
                <HelpMenu onOpenSupport={onOpenSupport} onOpenPrivacy={onOpenPrivacy} />
                {model.settings?.view ? (
                  <SettingsLink
                    label={model.settings.label}
                    view={model.settings.view}
                    current={view === model.settings.view}
                    onNavigate={onNavigate}
                  />
                ) : null}
                <span className="dbar__divider" aria-hidden="true" />
                {account}
              </div>
            </header>
            <div className="dshell__card">
              <main
                ref={mainRef}
                id="main"
                tabIndex={-1}
                className={mainClassName}
                data-theme="field"
              >
                {children}
              </main>
            </div>
          </div>
        </div>
        {overlay}
      </div>
    </ShellMenuProvider>
  )
}

// ---------- side nav ----------

function SideNav({
  open,
  onToggle,
  top,
  sections,
  view,
  onNavigate,
  onHome,
  onCreateEvent,
  creatingEvent,
}: {
  open: boolean
  onToggle: () => void
  top: NavEntry[]
  sections: Section[]
  view: AppView
  onNavigate: (view: AppView) => void
  onHome: () => void
  onCreateEvent?: () => void
  creatingEvent: boolean
}) {
  const toggleLabel = open ? 'כיווץ תפריט הצד' : 'הרחבת תפריט הצד'
  const toggleTip = useTooltip(toggleLabel, 'below')
  const brandLabel = view === 'cockpit' ? 'אבן דרך - הקוקפיט' : 'אבן דרך'

  return (
    <nav className={['dnav', open ? '' : 'dnav--rail'].filter(Boolean).join(' ')} aria-label="ניווט ראשי">
      <div className="dnav__header">
        <div className="dnav__toggle-zone">
          <button
            type="button"
            className="dnav__toggle"
            aria-label={toggleLabel}
            aria-expanded={open}
            aria-controls="dnav-body"
            {...toggleTip.triggerProps}
            onClick={onToggle}
          >
            {open ? (
              <PanelLeft className="icon-mirror" aria-hidden="true" />
            ) : (
              <ChevronRight className="icon-mirror" aria-hidden="true" />
            )}
          </button>
          {toggleTip.tooltip}
        </div>
        <button
          type="button"
          className="dnav__brand"
          onClick={onHome}
          aria-label="חזרה למסך הראשי"
          tabIndex={open ? undefined : -1}
          aria-hidden={open ? undefined : true}
        >
          <img className="dnav__logo" src="/favicon.svg" width={24} height={24} alt="" />
          <span className="dnav__brand-name">{brandLabel}</span>
        </button>
      </div>
      <div className="dnav__body" id="dnav-body">
        {open ? (
          <OpenNav
            top={top}
            sections={sections}
            view={view}
            onNavigate={onNavigate}
            onCreateEvent={onCreateEvent}
            creatingEvent={creatingEvent}
          />
        ) : (
          <RailNav
            top={top}
            sections={sections}
            view={view}
            onNavigate={onNavigate}
            onCreateEvent={onCreateEvent}
            creatingEvent={creatingEvent}
          />
        )}
      </div>
    </nav>
  )
}

function NavDotIcon({ icon, attention }: { icon: ReactNode; attention: boolean }) {
  return (
    <span className="dnav-icon">
      {icon}
      {attention ? <span className="dnav-dot" aria-hidden="true" /> : null}
    </span>
  )
}

function NavRow({
  entry,
  view,
  creatingEvent,
  onNavigate,
  inMenu = false,
  onDone,
}: {
  entry: NavEntry
  view: AppView
  creatingEvent: boolean
  onNavigate: (view: AppView) => void
  inMenu?: boolean
  onDone?: () => void
}) {
  const tip = useTooltip(entry.label, 'side', { truncatedOnly: true, enabled: !inMenu })
  const target = entry.view
  if (!target) return null
  return (
    <>
      <a
        href={viewHref(target)}
        className="dnav-item"
        role={inMenu ? 'menuitem' : undefined}
        aria-current={isEntryCurrent(entry, view, creatingEvent) ? 'page' : undefined}
        aria-label={attentionLabel(entry)}
        {...tip.triggerProps}
        onClick={(event) => {
          if (!isPlainClick(event)) return
          event.preventDefault()
          onDone?.()
          onNavigate(target)
        }}
      >
        <NavDotIcon icon={entry.icon} attention={Boolean(entry.attention)} />
        <span className="dnav-item__label">{entry.label}</span>
      </a>
      {tip.tooltip}
    </>
  )
}

function CreateEventRow({
  label,
  current,
  onCreate,
  inMenu = false,
  onDone,
}: {
  label: string
  current: boolean
  onCreate: () => void
  inMenu?: boolean
  onDone?: () => void
}) {
  const button = (
    <button
      type="button"
      className="dnav-item dnav-item--create"
      role={inMenu ? 'menuitem' : undefined}
      aria-current={current ? 'page' : undefined}
      onClick={() => {
        onDone?.()
        onCreate()
      }}
    >
      <span className="dnav-icon">
        <Plus aria-hidden="true" />
      </span>
      <span className="dnav-item__label">{label}</span>
    </button>
  )
  // The animated ring belongs to the open nav; inside a menu it is a plain row.
  return inMenu ? button : <NewEventButtonShell block>{button}</NewEventButtonShell>
}

function OpenNav({
  top,
  sections,
  view,
  onNavigate,
  onCreateEvent,
  creatingEvent,
}: {
  top: NavEntry[]
  sections: Section[]
  view: AppView
  onNavigate: (view: AppView) => void
  onCreateEvent?: () => void
  creatingEvent: boolean
}) {
  const [closed, setClosed] = useState<string[]>(() => safeStorage(readClosedSections, []))

  function toggleSection(id: string) {
    setClosed((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      safeWrite((storage) => writeClosedSections(storage, next))
      return next
    })
  }

  return (
    <div className="dnav__list">
      {top.length > 0 ? (
        <ul className="dnav__group">
          {top.map((entry) => (
            <li key={entry.view ?? entry.label}>
              <NavRow
                entry={entry}
                view={view}
                creatingEvent={creatingEvent}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {sections.map((section) => {
        const isOpen = !closed.includes(section.id)
        const bodyId = `dnav-section-${section.id}`
        const create = sidebarLeadNewEvent(section.id, onCreateEvent)
        return (
          <div key={section.id} className="dnav-section">
            <button
              type="button"
              className="dnav-section__header"
              aria-expanded={isOpen}
              aria-controls={bodyId}
              onClick={() => toggleSection(section.id)}
            >
              <span className="dnav-section__title">{section.title}</span>
              <span className="dnav-section__chevron" aria-hidden="true">
                {isOpen ? <ChevronUp /> : <ChevronDown />}
              </span>
            </button>
            <div
              id={bodyId}
              className={['dnav-section__body', isOpen ? 'is-open' : ''].filter(Boolean).join(' ')}
              inert={!isOpen}
            >
              <ul className="dnav-section__items">
                {create ? (
                  <li>
                    <CreateEventRow
                      label={create.label}
                      current={creatingEvent}
                      onCreate={create.onCreate}
                    />
                  </li>
                ) : null}
                {section.items.map((entry) => (
                  <li key={entry.view ?? entry.label}>
                    <NavRow
                      entry={entry}
                      view={view}
                      creatingEvent={creatingEvent}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- collapsed rail ----------

function RailNav({
  top,
  sections,
  view,
  onNavigate,
  onCreateEvent,
  creatingEvent,
}: {
  top: NavEntry[]
  sections: Section[]
  view: AppView
  onNavigate: (view: AppView) => void
  onCreateEvent?: () => void
  creatingEvent: boolean
}) {
  return (
    <ul className="dnav__rail">
      {top.map((entry) => (
        <li key={entry.view ?? entry.label}>
          <RailLink entry={entry} view={view} creatingEvent={creatingEvent} onNavigate={onNavigate} />
        </li>
      ))}
      {top.length > 0 && sections.length > 0 ? (
        <li className="dnav__rail-divider" role="separator" aria-hidden="true" />
      ) : null}
      {sections.map((section) => (
        <li key={section.id}>
          <RailSection
            section={section}
            view={view}
            onNavigate={onNavigate}
            onCreateEvent={onCreateEvent}
            creatingEvent={creatingEvent}
          />
        </li>
      ))}
    </ul>
  )
}

function RailLink({
  entry,
  view,
  creatingEvent,
  onNavigate,
}: {
  entry: NavEntry
  view: AppView
  creatingEvent: boolean
  onNavigate: (view: AppView) => void
}) {
  const tip = useTooltip(entry.label, 'side')
  const target = entry.view
  if (!target) return null
  return (
    <>
      <a
        href={viewHref(target)}
        className="dnav-rail-btn"
        aria-label={attentionLabel(entry) ?? entry.label}
        aria-current={isEntryCurrent(entry, view, creatingEvent) ? 'page' : undefined}
        {...tip.triggerProps}
        onClick={(event) => {
          if (!isPlainClick(event)) return
          event.preventDefault()
          onNavigate(target)
        }}
      >
        <NavDotIcon icon={entry.icon} attention={Boolean(entry.attention)} />
      </a>
      {tip.tooltip}
    </>
  )
}

const FLYOUT_WIDTH_PX = 220
/** Spec: the flyout starts 68px from the nav's start edge, i.e. 4px past the 64px rail. */
const FLYOUT_RAIL_GAP_PX = 4
const VIEWPORT_MARGIN_PX = 8

function RailSection({
  section,
  view,
  onNavigate,
  onCreateEvent,
  creatingEvent,
}: {
  section: Section
  view: AppView
  onNavigate: (view: AppView) => void
  onCreateEvent?: () => void
  creatingEvent: boolean
}) {
  const menu = useShellMenu(`flyout:${section.id}`)
  const tip = useTooltip(section.title, 'side', { enabled: !menu.open })
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const attention = sectionHasAttention(section)
  const current = sectionIsCurrent(section, view, creatingEvent)
  const create = sidebarLeadNewEvent(section.id, onCreateEvent)
  const menuId = `dnav-flyout-${section.id}`
  const icon = section.icon ?? SECTION_ICONS[section.id] ?? <LayoutGrid aria-hidden="true" />
  const { open, triggerRef, menuRef } = menu

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const trigger = triggerRef.current
    const nav = trigger?.closest('.dnav')
    if (!trigger || !nav) return
    const triggerRect = trigger.getBoundingClientRect()
    const navRect = nav.getBoundingClientRect()
    const panelHeight = menuRef.current?.offsetHeight ?? 0
    const left = isRtlDocument()
      ? navRect.left - FLYOUT_RAIL_GAP_PX - FLYOUT_WIDTH_PX
      : navRect.right + FLYOUT_RAIL_GAP_PX
    const maxTop = window.innerHeight - VIEWPORT_MARGIN_PX - panelHeight
    setPos({ top: Math.max(VIEWPORT_MARGIN_PX, Math.min(triggerRect.top, maxTop)), left })
  }, [open, triggerRef, menuRef])

  return (
    <>
      <button
        ref={menu.triggerRef}
        type="button"
        className={['dnav-rail-btn', current ? 'is-current' : ''].filter(Boolean).join(' ')}
        aria-label={attentionLabel({ label: section.title, attention }) ?? section.title}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menuId : undefined}
        {...tip.triggerProps}
        onClick={menu.onTriggerClick}
        onKeyDown={menu.onTriggerKeyDown}
      >
        <NavDotIcon icon={icon} attention={attention} />
      </button>
      {tip.tooltip}
      {menu.open
        ? createPortal(
            <div
              ref={menu.menuRef}
              className="dshell-menu dshell-menu--flyout"
              // Unpositioned first frame stays focusable (opacity, not visibility) so
              // keyboard opening can move focus to the first item.
              style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, opacity: 0 }}
              onKeyDown={menu.onMenuKeyDown}
            >
              <div id={menuId} role="menu" aria-label={section.title} className="dshell-menu__list">
                {create ? (
                  <CreateEventRow
                    label={create.label}
                    current={creatingEvent}
                    onCreate={create.onCreate}
                    inMenu
                    onDone={() => menu.hide()}
                  />
                ) : null}
                {section.items.map((entry) => (
                  <NavRow
                    key={entry.view ?? entry.label}
                    entry={entry}
                    view={view}
                    creatingEvent={creatingEvent}
                    onNavigate={onNavigate}
                    inMenu
                    onDone={() => menu.hide()}
                  />
                ))}
              </div>
            </div>,
            shellPortalRoot(),
          )
        : null}
    </>
  )
}

// ---------- top bar ----------

function BarSearch({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<'keyboard' | 'pointer' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pointerFocus = useRef(false)

  useSearchShortcut(true, () => {
    pointerFocus.current = false
    inputRef.current?.focus()
    inputRef.current?.select()
  })

  return (
    <form
      role="search"
      className="dbar-search"
      data-focus={focus ?? undefined}
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = query.trim()
        if (!trimmed) return
        setQuery('')
        inputRef.current?.blur()
        onSearch(trimmed)
      }}
    >
      <label className="visually-hidden" htmlFor="dbar-search-input">
        חיפוש אירועים ואנשים
      </label>
      <Search className="dbar-search__icon" aria-hidden="true" />
      <input
        ref={inputRef}
        id="dbar-search-input"
        className="dbar-search__input"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="חיפוש…"
        aria-keyshortcuts="Meta+K Control+K"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onPointerDown={() => {
          pointerFocus.current = true
        }}
        onFocus={() => {
          setFocus(pointerFocus.current ? 'pointer' : 'keyboard')
          pointerFocus.current = false
        }}
        onBlur={() => setFocus(null)}
      />
      {query ? (
        <button
          type="button"
          className="dbar-search__clear"
          aria-label="ניקוי החיפוש"
          onPointerDown={() => {
            pointerFocus.current = true
          }}
          onClick={() => {
            setQuery('')
            inputRef.current?.focus()
          }}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </form>
  )
}

function HelpMenu({
  onOpenSupport,
  onOpenPrivacy,
}: {
  onOpenSupport?: () => void
  onOpenPrivacy?: () => void
}) {
  return (
    <TopBarMenu
      id="help"
      label="עזרה"
      tooltip="עזרה"
      triggerClassName="dbar__icon-btn"
      triggerContent={<CircleHelp aria-hidden="true" />}
    >
      {(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            className="dshell-menu__item"
            onClick={() => {
              close()
              window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))
            }}
          >
            <MessageSquarePlus aria-hidden="true" />
            דיווח על תקלה או הצעה
          </button>
          {onOpenSupport ? (
            <button
              type="button"
              role="menuitem"
              className="dshell-menu__item"
              onClick={() => {
                close()
                onOpenSupport()
              }}
            >
              <LifeBuoy aria-hidden="true" />
              תמיכה ויצירת קשר
            </button>
          ) : null}
          {onOpenPrivacy ? (
            <button
              type="button"
              role="menuitem"
              className="dshell-menu__item"
              onClick={() => {
                close()
                onOpenPrivacy()
              }}
            >
              <FileText aria-hidden="true" />
              מדיניות פרטיות
            </button>
          ) : null}
        </>
      )}
    </TopBarMenu>
  )
}

function SettingsLink({
  label,
  view,
  current,
  onNavigate,
}: {
  label: string
  view: AppView
  current: boolean
  onNavigate: (view: AppView) => void
}) {
  const tip = useTooltip(label, 'below')
  return (
    <>
      <a
        href={viewHref(view)}
        className="dbar__icon-btn"
        aria-label={label}
        aria-current={current ? 'page' : undefined}
        {...tip.triggerProps}
        onClick={(event) => {
          if (!isPlainClick(event)) return
          event.preventDefault()
          onNavigate(view)
        }}
      >
        <Settings aria-hidden="true" />
      </a>
      {tip.tooltip}
    </>
  )
}
