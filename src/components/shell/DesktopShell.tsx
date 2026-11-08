import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Download,
  FileText,
  LifeBuoy,
  MessageSquarePlus,
  Plus,
  Settings,
} from 'lucide-react'
import { ANDROID_FOOTER_LINK, canOfferAndroidDownloadHere } from '../../lib/androidDownload'
import { appPath } from '../../lib/appRoute'
import {
  LEGACY_DESKTOP_NAV_OPEN_KEY,
  groupDesktopNav,
  readClosedSections,
  writeClosedSections,
  type DesktopNavSection,
} from '../../lib/desktopNav'
import { navAttentionAriaSuffix } from '../../lib/navAttention'
import { PRIVACY_FOOTER_LINK } from '../../lib/privacyPolicy'
import { sidebarLeadNewEvent } from '../../lib/sidebarCreate'
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  clampSidebarWidth,
  nextSidebarWidthFromPointer,
  readSidebarWidth,
  writeSidebarWidth,
} from '../../lib/sidebarWidth'
import { OPEN_FEEDBACK_EVENT } from '../feedback/FeedbackFab'
import { NewEventButtonShell } from '../ui/NewEventButtonShell'
import type { AppView, NavEntry } from './AppShell'
import { ShellMenuProvider, TopBarMenu, isRtlDocument, useTooltip } from './desktopMenus'

type Section = DesktopNavSection<AppView, ReactNode>

type DesktopShellProps = {
  view: AppView
  onNavigate: (view: AppView) => void
  onHome: () => void
  entries: NavEntry[]
  onCreateEvent?: () => void
  creatingEvent: boolean
  /** The top bar search field (SearchCombobox), for every role. */
  search?: ReactNode
  onOpenSupport?: () => void
  onOpenPrivacy?: () => void
  /** Help menu: Android download page (omitted where the app cannot be installed). */
  onOpenAndroid?: () => void
  /** Availability + avatar menu, after the top bar divider. */
  account: ReactNode
  /** Impersonation / role preview / cobrowse / update notices. */
  banners: ReactNode
  mainClassName: string
  /** Floating controls outside the card (feedback button). */
  overlay: ReactNode
  children: ReactNode
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
  search,
  onOpenSupport,
  onOpenPrivacy,
  onOpenAndroid,
  account,
  banners,
  mainClassName,
  overlay,
  children,
}: DesktopShellProps) {
  const model = groupDesktopNav<AppView, ReactNode>(entries)
  const mainRef = useRef<HTMLElement>(null)

  // The nav no longer collapses: drop the choice an earlier preview stored.
  useEffect(() => {
    safeWrite((storage) => storage.removeItem(LEGACY_DESKTOP_NAV_OPEN_KEY))
  }, [])

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
              {model.hasSearch && search ? search : null}
              <div className="dbar__actions">
                <HelpMenu
                  onOpenSupport={onOpenSupport}
                  onOpenPrivacy={onOpenPrivacy}
                  onOpenAndroid={onOpenAndroid}
                />
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
  top,
  sections,
  view,
  onNavigate,
  onHome,
  onCreateEvent,
  creatingEvent,
}: {
  top: NavEntry[]
  sections: Section[]
  view: AppView
  onNavigate: (view: AppView) => void
  onHome: () => void
  onCreateEvent?: () => void
  creatingEvent: boolean
}) {
  const brandLabel = view === 'cockpit' ? 'אבן דרך - הקוקפיט' : 'אבן דרך'
  const { width, handleProps } = useResizableWidth()

  return (
    <nav className="dnav" aria-label="ניווט ראשי" style={{ width }}>
      <div className="dnav__header">
        <button type="button" className="dnav__brand" onClick={onHome} aria-label="חזרה למסך הראשי">
          <img className="dnav__logo" src="/favicon.svg" width={24} height={24} alt="" />
          <span className="dnav__brand-name">{brandLabel}</span>
        </button>
      </div>
      <div className="dnav__body">
        <OpenNav
          top={top}
          sections={sections}
          view={view}
          onNavigate={onNavigate}
          onCreateEvent={onCreateEvent}
          creatingEvent={creatingEvent}
        />
      </div>
      <div
        className="dnav__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="שינוי רוחב תפריט הצד"
        aria-valuemin={SIDEBAR_WIDTH_MIN}
        aria-valuemax={SIDEBAR_WIDTH_MAX}
        aria-valuenow={width}
        tabIndex={0}
        {...handleProps}
      />
    </nav>
  )
}

/**
 * Drag the nav's inner edge (or use arrow keys on it) between 190 and 265px. The width
 * is remembered (lib/sidebarWidth.ts); double-click or Home resets to 240px.
 */
function useResizableWidth() {
  const [width, setWidth] = useState(() => safeStorage(readSidebarWidth, SIDEBAR_WIDTH_DEFAULT))
  const widthRef = useRef(width)
  const dragRef = useRef<{ startWidth: number; startClientX: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    widthRef.current = width
  }, [width])

  useEffect(() => {
    if (!dragging) return
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging])

  function apply(next: number, persist: boolean) {
    const clamped = clampSidebarWidth(next)
    setWidth(clamped)
    if (persist) safeWrite((storage) => writeSidebarWidth(storage, clamped))
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    safeWrite((storage) => writeSidebarWidth(storage, widthRef.current))
  }

  return {
    width,
    handleProps: {
      'data-dragging': dragging || undefined,
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { startWidth: widthRef.current, startClientX: event.clientX }
        setDragging(true)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current
        if (!drag) return
        apply(
          nextSidebarWidthFromPointer({
            startWidth: drag.startWidth,
            startClientX: drag.startClientX,
            clientX: event.clientX,
            rtl: isRtlDocument(),
          }),
          false,
        )
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick: () => apply(SIDEBAR_WIDTH_DEFAULT, true),
      onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const step = 8
        // Arrow toward the content narrows the nav, away from it widens (mirrored in RTL).
        const widen = isRtlDocument() ? 'ArrowLeft' : 'ArrowRight'
        const narrow = isRtlDocument() ? 'ArrowRight' : 'ArrowLeft'
        if (event.key === widen) {
          event.preventDefault()
          apply(widthRef.current + step, true)
        } else if (event.key === narrow) {
          event.preventDefault()
          apply(widthRef.current - step, true)
        } else if (event.key === 'Home') {
          event.preventDefault()
          apply(SIDEBAR_WIDTH_DEFAULT, true)
        }
      },
    },
  }
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
}: {
  entry: NavEntry
  view: AppView
  creatingEvent: boolean
  onNavigate: (view: AppView) => void
}) {
  // Full label on hover/focus only when the nav is narrowed enough to cut it off.
  const tip = useTooltip(entry.label, 'side', { truncatedOnly: true })
  const target = entry.view
  if (!target) return null
  return (
    <>
      <a
        href={viewHref(target)}
        className="dnav-item"
        aria-current={isEntryCurrent(entry, view, creatingEvent) ? 'page' : undefined}
        aria-label={attentionLabel(entry)}
        {...tip.triggerProps}
        onClick={(event) => {
          if (!isPlainClick(event)) return
          event.preventDefault()
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
}: {
  label: string
  current: boolean
  onCreate: () => void
}) {
  return (
    <NewEventButtonShell block>
      <button
        type="button"
        className="dnav-item dnav-item--create"
        aria-current={current ? 'page' : undefined}
        onClick={onCreate}
      >
        <span className="dnav-icon">
          <Plus aria-hidden="true" />
        </span>
        <span className="dnav-item__label">{label}</span>
      </button>
    </NewEventButtonShell>
  )
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

// ---------- top bar ----------

function HelpMenu({
  onOpenSupport,
  onOpenPrivacy,
  onOpenAndroid,
}: {
  onOpenSupport?: () => void
  onOpenPrivacy?: () => void
  onOpenAndroid?: () => void
}) {
  const showAndroid = Boolean(onOpenAndroid) && canOfferAndroidDownloadHere()
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
              {PRIVACY_FOOTER_LINK.label}
            </button>
          ) : null}
          {showAndroid && onOpenAndroid ? (
            <button
              type="button"
              role="menuitem"
              className="dshell-menu__item"
              onClick={() => {
                close()
                onOpenAndroid()
              }}
            >
              <Download aria-hidden="true" />
              {ANDROID_FOOTER_LINK.label}
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
