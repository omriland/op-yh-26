import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { Clock, FileText, Search, SquareArrowOutUpLeft, Trash2, UserRound, Wand2, X } from 'lucide-react'
import type { SmartSearchFilter } from '../../../supabase/functions/_shared/smartSearchFilter.ts'
import { eventLifecycle, lifecycleStamp, type StatusAudience } from '../../lib/eventLifecycle'
import { formatDate, monoClass } from '../../lib/format'
import { comboboxInput, comboboxKeyDown, isHandled, type ComboboxState } from '../../lib/search/comboboxKeys'
import { prepareQuery, type PreparedQuery, type SearchApi } from '../../lib/search/prepareQuery'
import { addRecentSearch, clearRecentSearches, readRecentSearches } from '../../lib/search/recentSearches'
import type { RulesVocab } from '../../lib/search/searchRules'
import { canUseArchive, filterForRole, type SearchRole } from '../../lib/search/searchRole'
import { useSearchShortcut } from '../../lib/searchShortcut'
import { isBlankQuery } from '../../lib/smartSearch'
import * as smartSearchApi from '../../lib/smartSearchApi'
import type { ArchiveRow, PersonHit, SearchEvent, SearchResults } from '../../lib/smartSearchApi'
import { volunteerStatusLabel } from '../../lib/volunteerStatus'
import { StampChip } from '../ui/StampChip'
import { SearchFilterBar } from './SearchFilterBar'

const DEBOUNCE_MS = 150
const SKELETON_AFTER_MS = 300
const GROUP_SIZE = 5
const PREVIEW_CAP = 200

export type SearchPageLink = { view: string; label: string }

type OptionKind = 'recent' | 'clear-recent' | 'shortcut' | 'person' | 'event' | 'archive' | 'page' | 'results' | 'parse'

type Option = {
  key: string
  kind: OptionKind
  title: ReactNode
  sub?: ReactNode
  side?: ReactNode
  run: () => void
}

type Group = { id: string; title: string; extra?: string; options: Option[] }

type Instant = {
  query: string
  people: PersonHit[]
  events: SearchEvent[]
  archive: ArchiveRow[] | null
  failed: boolean
}

type Sentence =
  | { status: 'loading'; query: string }
  | { status: 'ready'; prepared: PreparedQuery; results: SearchResults | null; failed: boolean }

const ICONS: Record<OptionKind, ReactNode> = {
  recent: <Clock aria-hidden="true" />,
  'clear-recent': <Trash2 aria-hidden="true" />,
  shortcut: <SquareArrowOutUpLeft aria-hidden="true" />,
  person: <UserRound aria-hidden="true" />,
  event: <FileText aria-hidden="true" />,
  archive: <FileText aria-hidden="true" />,
  page: <SquareArrowOutUpLeft aria-hidden="true" />,
  results: <Search aria-hidden="true" />,
  parse: <Wand2 aria-hidden="true" />,
}

function newSession(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function eventTitle(event: SearchEvent) {
  const place = [event.road?.name, event.location].filter(Boolean).join(' · ')
  return (
    <>
      <span className="mono">{formatDate(event.event_date)}</span>
      {place ? ` · ${place}` : ''}
      {event.event_type?.name ? ` · ${event.event_type.name}` : ''}
    </>
  )
}

function personSub(person: PersonHit) {
  return (
    <>
      או״ק <span className={monoClass(person.callsign)}>{person.callsign}</span>
      {person.volunteer_status ? ` · ${volunteerStatusLabel(person.volunteer_status)}` : ''}
      {person.last_shift_date !== undefined
        ? person.last_shift_date
          ? ` · משמרת אחרונה ${formatDate(person.last_shift_date)}`
          : ' · אין משמרת קודמת'
        : ''}
      {person.found_by ? ` · נמצא לפי ${person.found_by}` : ''}
    </>
  )
}

export type SearchComboboxProps = {
  variant: 'bar' | 'page'
  role: SearchRole
  audience: StatusAudience
  query: string
  onQueryChange: (query: string) => void
  /** Enter with nothing highlighted, ⌘Enter, or כל התוצאות: the results page. */
  onSubmit: (query: string, prepared?: PreparedQuery) => void
  onOpenEvent: (eventId: string) => void
  onOpenPerson: (person: PersonHit) => void
  onOpenArchive: (fk: string, query: string) => void
  onNavigate: (view: string) => void
  /** Destinations this role has, for the pages group and the shortcuts. */
  pages: SearchPageLink[]
  shortcuts: SearchPageLink[]
  canOpenReports: boolean
  api?: SearchApi
  autoFocus?: boolean
  placeholder?: string
}

/**
 * One search field for every role: instant grouped results while typing (Postgres
 * only), and on request the sentence parser, whose filter shows as editable chips.
 * ARIA combobox: the input owns focus and points at the highlighted option.
 */
export function SearchCombobox({
  variant,
  role,
  audience,
  query,
  onQueryChange,
  onSubmit,
  onOpenEvent,
  onOpenPerson,
  onOpenArchive,
  onNavigate,
  pages,
  shortcuts,
  canOpenReports,
  api = smartSearchApi,
  autoFocus = false,
  placeholder,
}: SearchComboboxProps) {
  const baseId = useId()
  const listId = `${baseId}-list`
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)
  const sessionRef = useRef<string | null>(null)
  const [state, setState] = useState<ComboboxState>({ open: false, active: -1, query })
  const [focus, setFocus] = useState<'keyboard' | 'pointer' | null>(null)
  const pointerFocus = useRef(false)
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches())
  const [instant, setInstant] = useState<Instant | null>(null)
  const [skeleton, setSkeleton] = useState(false)
  const [sentence, setSentence] = useState<Sentence | null>(null)
  const [vocab, setVocab] = useState<RulesVocab>({ eventTypes: [], districts: [] })
  const [addRequest, setAddRequest] = useState(0)
  const showArchive = canUseArchive(role)
  const text = query.trim()

  useEffect(() => {
    let live = true
    void api.fetchSearchVocab().then((v) => {
      if (live) setVocab(v)
    })
    return () => {
      live = false
    }
  }, [api])

  useSearchShortcut(variant === 'bar', () => {
    pointerFocus.current = false
    inputRef.current?.focus()
    inputRef.current?.select()
  })

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const session = useCallback(() => {
    sessionRef.current ??= newSession()
    return sessionRef.current
  }, [])

  // Instant results: one request per pause in typing, stale answers dropped.
  useEffect(() => {
    if (!state.open || sentence || isBlankQuery(text)) {
      setSkeleton(false)
      return
    }
    const id = ++requestId.current
    const skeletonTimer = window.setTimeout(() => {
      if (id === requestId.current) setSkeleton(true)
    }, SKELETON_AFTER_MS)
    const timer = window.setTimeout(() => {
      api
        .suggest(text, role)
        .then((found) => {
          if (id !== requestId.current) return
          setInstant((current) => ({
            query: text,
            people: found.people,
            events: audience === 'responder' ? found.events.filter((e) => eventLifecycle(e).status !== 'draft') : found.events,
            archive: current?.query === text ? current.archive : null,
            failed: false,
          }))
          setSkeleton(false)
        })
        .catch(() => {
          if (id !== requestId.current) return
          setInstant({ query: text, people: [], events: [], archive: null, failed: true })
          setSkeleton(false)
        })
      if (showArchive && text.replace(/\s/g, '').length >= 3) {
        api
          .suggestArchive(text, session())
          .then((rows) => {
            if (id !== requestId.current) return
            setInstant((current) =>
              current && current.query === text
                ? { ...current, archive: rows }
                : { query: text, people: [], events: [], archive: rows, failed: false },
            )
          })
          .catch(() => {})
      }
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(skeletonTimer)
    }
  }, [text, state.open, sentence, role, audience, api, showArchive, session])

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false, active: -1 }))
    sessionRef.current = null
  }, [])

  // A click outside closes the panel; focus leaving the whole widget too.
  useEffect(() => {
    if (!state.open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [state.open, close])

  function remember(q: string) {
    setRecent(addRecentSearch(q))
  }

  function submit(q: string, prepared?: PreparedQuery) {
    if (isBlankQuery(q)) return
    remember(q)
    close()
    setSentence(null)
    onSubmit(q.trim(), prepared)
  }

  function changeQuery(next: string) {
    onQueryChange(next)
    setSentence(null)
    setState(comboboxInput(next))
  }

  const runPreview = useCallback(
    async (prepared: PreparedQuery) => {
      const id = ++requestId.current
      setSentence({ status: 'ready', prepared, results: null, failed: false })
      const unsupported = prepared.interpretation.filter.intent === 'unsupported_question'
      if (unsupported || prepared.interpretation.error) return
      try {
        const results = await api.runSearch(prepared.filter, PREVIEW_CAP, { role, session: session() })
        if (id !== requestId.current) return
        setSentence({ status: 'ready', prepared, results, failed: false })
      } catch {
        if (id !== requestId.current) return
        setSentence({ status: 'ready', prepared, results: null, failed: true })
      }
    },
    [api, role, session],
  )

  const parse = useCallback(async () => {
    const q = text
    const id = ++requestId.current
    setSentence({ status: 'loading', query: q })
    setState((s) => ({ ...s, open: true, active: -1 }))
    try {
      const prepared = await prepareQuery(q, { role, vocab, forceModel: true }, api)
      if (id !== requestId.current) return
      void runPreview(prepared)
    } catch {
      if (id !== requestId.current) return
      setSentence(null)
    }
  }, [text, role, vocab, api, runPreview])

  function editPrepared(next: SmartSearchFilter, removed: boolean) {
    if (sentence?.status !== 'ready') return
    const { filter, dropped } = filterForRole(next, role)
    const prepared = { ...sentence.prepared, filter, dropped }
    if (removed) {
      void sentence.prepared.interpretation.logId
        .then((logId) => (logId ? api.reportChipRemoved(logId) : undefined))
        .catch(() => {})
    }
    void runPreview(prepared)
  }

  // ---------- options ----------

  const groups: Group[] = useMemo(() => {
    const list: Group[] = []
    if (sentence?.status === 'ready') {
      const { results, prepared } = sentence
      if (results) {
        if (results.people.length > 0) {
          list.push({
            id: 'people',
            title: 'אנשים',
            extra: `נמצאו ${results.people.length}`,
            options: results.people.slice(0, GROUP_SIZE).map((person) => ({
              key: `p-${person.id}`,
              kind: 'person',
              title: person.full_name,
              sub: personSub(person),
              run: () => {
                remember(prepared.query)
                close()
                onOpenPerson(person)
              },
            })),
          })
        }
        if (results.events.length > 0) {
          list.push({
            id: 'events',
            title: 'אירועים',
            extra: `נמצאו ${results.events.length >= PREVIEW_CAP ? `${PREVIEW_CAP}+` : results.events.length}`,
            options: results.events.slice(0, GROUP_SIZE).map((event) => eventOption(event, prepared.query)),
          })
        }
        if (showArchive && results.archive.length > 0) {
          list.push({
            id: 'archive',
            title: 'ארכיון האתר הישן',
            extra: `נמצאו ${results.archive.length >= PREVIEW_CAP ? `${PREVIEW_CAP}+` : results.archive.length}`,
            options: results.archive.slice(0, GROUP_SIZE).map((row) => archiveOption(row, prepared.query)),
          })
        }
      }
      list.push({
        id: 'actions',
        title: 'פעולות',
        options: [
          {
            key: 'all',
            kind: 'results',
            title: 'הצגת כל התוצאות',
            sub: 'עמוד החיפוש, עם המסננים',
            run: () => submit(prepared.query, prepared),
          },
        ],
      })
      return list
    }
    if (sentence) return list

    if (isBlankQuery(text)) {
      if (recent.length > 0) {
        list.push({
          id: 'recent',
          title: 'חיפושים אחרונים',
          extra: 'שמורים במכשיר הזה',
          options: [
            ...recent.map((q) => ({
              key: `r-${q}`,
              kind: 'recent' as const,
              title: q,
              run: () => {
                onQueryChange(q)
                setState(comboboxInput(q))
              },
            })),
            {
              key: 'clear-recent',
              kind: 'clear-recent' as const,
              title: 'נקה',
              sub: 'מחיקת החיפושים האחרונים מהמכשיר',
              run: () => {
                clearRecentSearches()
                setRecent([])
              },
            },
          ],
        })
      }
      if (shortcuts.length > 0) {
        list.push({
          id: 'shortcuts',
          title: 'קיצורים',
          options: shortcuts.map((link) => ({
            key: `s-${link.view}`,
            kind: 'shortcut',
            title: link.label,
            run: () => {
              close()
              onNavigate(link.view)
            },
          })),
        })
      }
      return list
    }

    const current = instant && instant.query === text ? instant : null
    if (current?.people.length) {
      list.push({
        id: 'people',
        title: 'אנשים',
        options: current.people.slice(0, GROUP_SIZE).map((person) => ({
          key: `p-${person.id}`,
          kind: 'person',
          title: person.full_name,
          sub: personSub(person),
          run: () => {
            remember(text)
            close()
            onOpenPerson(person)
          },
        })),
      })
    }
    if (current?.events.length) {
      list.push({
        id: 'events',
        title: 'אירועים',
        options: current.events.slice(0, GROUP_SIZE).map((event) => eventOption(event, text)),
      })
    }
    if (showArchive && current?.archive?.length) {
      list.push({
        id: 'archive',
        title: 'ארכיון האתר הישן',
        options: current.archive.slice(0, GROUP_SIZE).map((row) => archiveOption(row, text)),
      })
    }
    const matchingPages =
      text.length >= 2 ? pages.filter((link) => link.label.includes(text)).slice(0, GROUP_SIZE) : []
    const actions: Option[] = [
      ...matchingPages.map((link) => ({
        key: `v-${link.view}`,
        kind: 'page' as const,
        title: link.label,
        sub: 'מעבר לעמוד',
        run: () => {
          close()
          onNavigate(link.view)
        },
      })),
      {
        key: 'all',
        kind: 'results',
        title: `כל התוצאות ל־״${text}״`,
        sub: 'עמוד החיפוש',
        run: () => submit(text),
      },
    ]
    if (text.split(/\s+/).length >= 3) {
      actions.push({
        key: 'parse',
        kind: 'parse',
        title: 'פענוח המשפט למסננים',
        sub: 'רק השאלה נשלחת לפענוח, בלי נתונים מהמערכת',
        run: () => void parse(),
      })
    }
    list.push({ id: 'actions', title: 'עמודים ופעולות', options: actions })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options rebuild on what they show
  }, [sentence, text, recent, shortcuts, instant, pages, showArchive, audience])

  function eventOption(event: SearchEvent, q: string): Option {
    const stamp = lifecycleStamp(eventLifecycle(event), audience)
    return {
      key: `e-${event.id}`,
      kind: 'event',
      title: eventTitle(event),
      sub: `נמצא לפי: ${event.found_by}`,
      side: <StampChip label={stamp.label} tone={stamp.tone} progress={stamp.progress} />,
      run: () => {
        remember(q)
        close()
        onOpenEvent(event.id)
      },
    }
  }

  function archiveOption(row: ArchiveRow, q: string): Option {
    return {
      key: `a-${row.event_fk}`,
      kind: 'archive',
      title: (
        <>
          <span className="mono">{row.event_date ? formatDate(row.event_date) : 'ללא תאריך'}</span>
          {row.event_number ? (
            <>
              {' · דוח '}
              <span className="mono">{row.event_number}</span>
            </>
          ) : null}
          {row.road ? ` · כביש ${row.road}` : ''}
        </>
      ),
      sub: `נמצא לפי: ${row.found_by}`,
      run: () => {
        remember(q)
        close()
        onOpenArchive(row.event_fk, q)
      },
    }
  }

  const options = groups.flatMap((group) => group.options)
  const active = state.open && state.active >= 0 && state.active < options.length ? state.active : -1
  const optionId = (index: number) => `${baseId}-opt-${index}`

  useEffect(() => {
    if (active < 0) return
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids derive from baseId
  }, [active])

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const action = comboboxKeyDown({ ...state, query }, event.nativeEvent, options.length)
    if (!isHandled(action)) return
    if (action.type === 'close' && event.key === 'Tab') {
      close()
      return
    }
    event.preventDefault()
    switch (action.type) {
      case 'move':
        setState(action.state)
        break
      case 'pick':
        options[action.index]?.run()
        break
      case 'submit':
      case 'results':
        submit(query, sentence?.status === 'ready' ? sentence.prepared : undefined)
        break
      case 'close':
        close()
        break
      case 'clear':
        changeQuery('')
        setState({ open: false, active: -1, query: '' })
        break
    }
  }

  // ---------- panel ----------

  const current = instant && instant.query === text ? instant : null
  const notice: ReactNode = (() => {
    if (sentence?.status === 'loading') {
      return (
        <p className="search-panel__status" role="status">
          מפענחים את המשפט…
        </p>
      )
    }
    if (sentence?.status === 'ready') {
      const { prepared, results, failed } = sentence
      const lane = prepared.interpretation.lane
      const parts: ReactNode[] = []
      if (lane === 'fallback') {
        parts.push(
          <div key="fallback" className="search-panel__banner" role="status">
            <p className="search-panel__banner-title">לא הצלחנו לפענח את המשפט, חיפשנו לפי המילים.</p>
            <div className="search-panel__banner-actions">
              <button type="button" className="search-panel__btn" onClick={() => void parse()}>
                נסו שוב
              </button>
              <button type="button" className="search-panel__btn" onClick={() => setAddRequest((n) => n + 1)}>
                הוספת מסנן
              </button>
            </div>
          </div>,
        )
      }
      if (prepared.interpretation.filter.intent === 'unsupported_question') {
        parts.push(
          <div key="unsupported" className="search-panel__banner" role="status">
            <p className="search-panel__banner-title">החיפוש מוצא רשומות ולא מחשב סכומים.</p>
            {canOpenReports ? (
              <div className="search-panel__banner-actions">
                <button
                  type="button"
                  className="search-panel__btn"
                  onClick={() => {
                    close()
                    onNavigate('reports')
                  }}
                >
                  מעבר לדוחות
                </button>
              </div>
            ) : null}
          </div>,
        )
      } else if (failed) {
        parts.push(
          <p key="failed" className="search-panel__status" role="status">
            החיפוש נכשל. בדקו את החיבור ונסו שוב.
          </p>,
        )
      } else if (!results) {
        parts.push(
          <p key="loading" className="search-panel__status" role="status">
            מחפשים…
          </p>,
        )
      } else if (results.events.length + results.people.length + results.archive.length === 0) {
        parts.push(
          <div key="none" className="search-panel__empty" role="status">
            <p className="search-panel__banner-title">לא נמצאו תוצאות לכל המסננים יחד.</p>
            <p>אפשר להסיר מסנן אחד ולנסות שוב.</p>
          </div>,
        )
      }
      return (
        <>
          <div className="search-panel__filters">
            <SearchFilterBar
              filter={prepared.filter}
              role={role}
              audience={audience}
              vocab={vocab}
              ambiguity={prepared.ambiguity}
              dropped={prepared.dropped}
              addRequest={addRequest}
              onChange={(next, change) => editPrepared(next, Boolean(change.removed))}
            />
          </div>
          {parts}
        </>
      )
    }
    if (isBlankQuery(text)) return null
    if (current?.failed) {
      return (
        <p className="search-panel__status" role="status">
          החיפוש המיידי לא זמין כרגע. Enter מריץ חיפוש מלא.
        </p>
      )
    }
    if (!current && skeleton) {
      return (
        <div className="search-panel__skeleton" aria-busy="true" aria-label="טוען תוצאות">
          <span />
          <span />
          <span />
        </div>
      )
    }
    if (current && current.people.length + current.events.length + (current.archive?.length ?? 0) === 0) {
      return (
        <div className="search-panel__empty" role="status">
          <p className="search-panel__banner-title">אין התאמות מיידיות ל־״{text}״</p>
          <p>Enter מריץ חיפוש מלא{text.split(/\s+/).length >= 3 ? ', כולל פענוח של המשפט' : ''}.</p>
        </div>
      )
    }
    return null
  })()

  const showPanel = state.open && (groups.length > 0 || notice !== null)
  let index = -1

  const input = (
    <input
      ref={inputRef}
      id={`${baseId}-input`}
      className={variant === 'bar' ? 'dbar-search__input' : 'field__input search-bar__input'}
      type="search"
      enterKeyHint="search"
      autoComplete="off"
      spellCheck={false}
      role="combobox"
      aria-expanded={showPanel}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={active >= 0 ? optionId(active) : undefined}
      aria-keyshortcuts={variant === 'bar' ? 'Meta+K Control+K' : undefined}
      placeholder={placeholder ?? 'חיפוש אירועים ואנשים'}
      value={query}
      onChange={(event) => changeQuery(event.target.value)}
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        pointerFocus.current = true
      }}
      onFocus={() => {
        setFocus(pointerFocus.current ? 'pointer' : 'keyboard')
        pointerFocus.current = false
        setRecent(readRecentSearches())
        setState((s) => ({ ...s, open: true }))
      }}
      onBlur={(event) => {
        setFocus(null)
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) close()
      }}
    />
  )

  return (
    <div
      ref={rootRef}
      className={['search-combobox', `search-combobox--${variant}`].join(' ')}
      onKeyDown={(event) => {
        // Escape inside the panel (a chip, a button) closes it and returns to the field.
        if (event.key === 'Escape' && event.target !== inputRef.current && state.open) {
          event.preventDefault()
          close()
          inputRef.current?.focus()
        }
      }}
    >
      <div
        role="search"
        className={variant === 'bar' ? 'dbar-search' : 'search-bar search-combobox__field'}
        data-focus={variant === 'bar' ? (focus ?? undefined) : undefined}
      >
        <label className="visually-hidden" htmlFor={`${baseId}-input`}>
          חיפוש אירועים, אנשים ועמודים
        </label>
        {variant === 'bar' ? (
          <>
            <Search className="dbar-search__icon" aria-hidden="true" />
            {input}
            {query ? (
              <button
                type="button"
                className="dbar-search__clear"
                aria-label="ניקוי החיפוש"
                onPointerDown={() => {
                  pointerFocus.current = true
                }}
                onClick={() => {
                  changeQuery('')
                  inputRef.current?.focus()
                }}
              >
                <X aria-hidden="true" />
              </button>
            ) : (
              <kbd className="dbar-search__kbd" dir="ltr" aria-hidden="true">
                ⌘K
              </kbd>
            )}
          </>
        ) : (
          <div className="field search-bar__field">
            <div className="field__control">
              {input}
              <span className="field__affix search-bar__affix" aria-hidden="true">
                <Search size={20} strokeWidth={1.75} />
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="search-panel" hidden={!showPanel}>
        {notice}
        <div id={listId} role="listbox" aria-label="תוצאות החיפוש" className="search-panel__list">
          {groups.map((group) => (
            <div key={group.id} role="group" aria-labelledby={`${baseId}-g-${group.id}`} className="search-panel__group">
              <div className="search-panel__group-title" id={`${baseId}-g-${group.id}`}>
                <span>{group.title}</span>
                {group.extra ? <span className="search-panel__group-extra">{group.extra}</span> : null}
              </div>
              {group.options.map((option) => {
                index += 1
                const i = index
                return (
                  <div
                    key={option.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    className={['search-option', `search-option--${option.kind}`].join(' ')}
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerMove={() => {
                      if (state.active !== i) setState((s) => ({ ...s, active: i }))
                    }}
                    onClick={() => option.run()}
                  >
                    <span className="search-option__icon">{ICONS[option.kind]}</span>
                    <span className="search-option__main">
                      <span className="search-option__title">{option.title}</span>
                      {option.sub ? <span className="search-option__sub">{option.sub}</span> : null}
                    </span>
                    {option.side ? <span className="search-option__side">{option.side}</span> : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {variant === 'bar' ? (
          <div className="search-panel__foot" aria-hidden="true">
            <span>
              <kbd dir="ltr">↑↓</kbd> ניווט
            </span>
            <span>
              <kbd dir="ltr">Enter</kbd> פתיחה
            </span>
            <span>
              <kbd><bdo dir="ltr">⌘ Enter</bdo></kbd> כל התוצאות
            </span>
            <span>
              <kbd dir="ltr">Esc</kbd> סגירה
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
