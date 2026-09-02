import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronUp, ListTree, Plus } from 'lucide-react'
import {
  canMutateClosedListItem,
  canReorderClosedList,
  closedListMeta,
  createClosedListItem,
  deleteClosedListItem,
  fetchClosedListItems,
  moveClosedListItem,
  persistClosedListOrder,
  updateClosedListItem,
  type ClosedListItem,
  type ClosedListMoveDirection,
} from '../lib/closedLists'
import {
  SETTINGS_BOT,
  SETTINGS_BROADCAST,
  SETTINGS_MENU_GROUPS,
  isClosedListPane,
  type SettingsPaneKey,
} from '../lib/settingsPanes'
import { PartnerBotSettings } from './PartnerBotSettings'
import { UnitBroadcastPage } from './UnitBroadcastPage'
import { SYSTEM_DISTRICT_LOCKED_ERROR } from '../lib/systemDistricts'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Button, IconButton } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { OverflowMenu } from '../components/ui/OverflowMenu'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'
import { useDesktopFormSubmit } from '../lib/useDesktopFormSubmit'

type Editor =
  | { mode: 'create' }
  | { mode: 'edit'; item: ClosedListItem }
  | null

export function AdminListsPage({ initialPane }: { initialPane?: SettingsPaneKey }) {
  const isDesktop = useIsDesktop()
  const { show } = useToast()
  const [selectedKey, setSelectedKey] = useState<SettingsPaneKey | null>(
    isDesktop ? (initialPane ?? 'districts') : (initialPane ?? null),
  )
  const [items, setItems] = useState<ClosedListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [editor, setEditor] = useState<Editor>(null)
  const [draftName, setDraftName] = useState('')
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [menuItemId, setMenuItemId] = useState<string | null>(null)
  const [orderSaving, setOrderSaving] = useState(false)

  const selectedListMeta = useMemo(
    () => (selectedKey && isClosedListPane(selectedKey) ? closedListMeta(selectedKey) : null),
    [selectedKey],
  )
  const selectedBroadcast = selectedKey === SETTINGS_BROADCAST.key
  const selectedBot = selectedKey === SETTINGS_BOT.key
  const selectedTitle = selectedBroadcast
    ? SETTINGS_BROADCAST.label
    : selectedBot
      ? SETTINGS_BOT.label
      : (selectedListMeta?.label ?? 'הגדרות')
  const selectedDescription = selectedBroadcast
    ? SETTINGS_BROADCAST.description
    : selectedListMeta?.description

  useEffect(() => {
    if (isDesktop && !selectedKey) setSelectedKey('districts')
  }, [isDesktop, selectedKey])

  useEffect(() => {
    if (!selectedKey || !isClosedListPane(selectedKey)) {
      setItems(null)
      setFailed(false)
      return
    }

    let active = true
    setItems(null)
    setFailed(false)
    setBanner(null)
    setEditor(null)
    fetchClosedListItems(selectedKey)
      .then((rows) => {
        if (active) setItems(rows)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [selectedKey, reloadKey])

  function openCreate() {
    setBanner(null)
    setDraftName('')
    setEditor({ mode: 'create' })
  }

  function openEdit(item: ClosedListItem) {
    if (!selectedKey || !isClosedListPane(selectedKey)) return
    if (!canMutateClosedListItem(selectedKey, item)) {
      show(SYSTEM_DISTRICT_LOCKED_ERROR, 'alert')
      return
    }
    setBanner(null)
    setDraftName(item.name)
    setEditor({ mode: 'edit', item })
  }

  async function saveEditor() {
    if (!selectedKey || !isClosedListPane(selectedKey) || !editor) return
    setSaving(true)
    const result =
      editor.mode === 'create'
        ? await createClosedListItem(selectedKey, draftName)
        : await updateClosedListItem(selectedKey, editor.item.id, draftName)
    setSaving(false)

    if (!result.ok) {
      show(result.error, 'alert')
      return
    }

    show(editor.mode === 'create' ? 'הפריט נוסף' : 'הפריט נשמר', 'done')
    setEditor(null)
    setDraftName('')
    setReloadKey((value) => value + 1)
  }

  async function removeItem(item: ClosedListItem) {
    if (!selectedKey || !isClosedListPane(selectedKey)) return
    if (!canMutateClosedListItem(selectedKey, item)) {
      show(SYSTEM_DISTRICT_LOCKED_ERROR, 'alert')
      return
    }
    setBanner(null)
    const result = await deleteClosedListItem(selectedKey, item.id)
    if (!result.ok) {
      if (result.inUse) {
        setBanner(result.error)
        return
      }
      show(result.error, 'alert')
      return
    }
    show('הפריט הוסר', 'done')
    setReloadKey((value) => value + 1)
  }

  async function moveItem(item: ClosedListItem, direction: ClosedListMoveDirection) {
    if (!selectedKey || !isClosedListPane(selectedKey) || !items || orderSaving) return
    const next = moveClosedListItem(items, item.id, direction)
    if (!next) return
    const previous = items
    setItems(next)
    setOrderSaving(true)
    const result = await persistClosedListOrder(selectedKey, next)
    setOrderSaving(false)
    if (!result.ok) {
      setItems(previous)
      show(result.error, 'alert')
    }
  }

  const showPicker = !isDesktop && !selectedKey

  return (
    <div className="stack-4">
      {showPicker ? (
        <>
          <div className="row-between" style={{ marginBlockEnd: 'var(--space-2)' }}>
            <h1 className="t-title">הגדרות</h1>
          </div>
          <SettingsMenus
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        </>
      ) : (
        <div className={['lists-layout', isDesktop ? 'lists-layout--desktop' : ''].join(' ')}>
          {isDesktop ? (
            <SettingsMenus
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          ) : null}

          <section className="lists-content stack-4">
            <div className="row-between" style={{ marginBlockEnd: 'var(--space-4)' }}>
              <div className="lists-title-row">
                {!isDesktop ? (
                  <IconButton
                    label="חזרה להגדרות"
                    variant="ghost"
                    onClick={() => {
                      setSelectedKey(null)
                      setEditor(null)
                      setBanner(null)
                    }}
                  >
                    <ArrowRight size={20} strokeWidth={1.75} />
                  </IconButton>
                ) : null}
                <div className="page-head__intro">
                  <h1 className="t-title">{selectedTitle}</h1>
                  {selectedDescription ? (
                    <p className="t-caption text-muted">
                      <ClosedListDescription text={selectedDescription} />
                    </p>
                  ) : null}
                </div>
              </div>
              {selectedKey && isClosedListPane(selectedKey) ? (
                isDesktop ? (
                  <Button
                    onClick={openCreate}
                    icon={<Plus size={20} strokeWidth={1.75} />}
                    disabled={Boolean(editor)}
                  >
                    הוספת פריט
                  </Button>
                ) : (
                  <IconButton label="הוספת פריט" onClick={openCreate} disabled={Boolean(editor)}>
                    <Plus size={20} strokeWidth={1.75} />
                  </IconButton>
                )
              ) : null}
            </div>

            {selectedBroadcast ? (
              <UnitBroadcastPage embedded />
            ) : selectedBot ? (
              <PartnerBotSettings />
            ) : (
              <>
            {banner ? (
              <p className="alert alert--info" role="status">
                {banner}
              </p>
            ) : null}

            {items === null && !failed ? <EventListSkeleton count={4} /> : null}

            {failed ? (
              <EmptyState
                icon={<ListTree size={40} strokeWidth={1.75} />}
                title="טעינת הרשימה נכשלה"
                caption="בדקו את החיבור ונסו שוב."
                action={
                  <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
                    רענון
                  </Button>
                }
              />
            ) : null}

            {items && items.length === 0 && editor?.mode !== 'create' ? (
              <EmptyState
                icon={<ListTree size={40} strokeWidth={1.75} />}
                title="אין פריטים ברשימה זו. הפריט הראשון ישמש בטפסים מיד לאחר הוספתו."
                action={
                  <Button onClick={openCreate} icon={<Plus size={20} strokeWidth={1.75} />}>
                    הוספת פריט
                  </Button>
                }
              />
            ) : null}

            {items && (items.length > 0 || editor) ? (
              <ul className="list-rows">
                {editor?.mode === 'create' ? (
                  <li className="list-rows__editor">
                    <InlineEditor
                      value={draftName}
                      onChange={setDraftName}
                      saving={saving}
                      onSave={() => void saveEditor()}
                      onCancel={() => {
                        setEditor(null)
                        setDraftName('')
                      }}
                    />
                  </li>
                ) : null}

                {items.map((item, index) =>
                  editor?.mode === 'edit' && editor.item.id === item.id ? (
                    <li key={item.id} className="list-rows__editor">
                      <InlineEditor
                        value={draftName}
                        onChange={setDraftName}
                        saving={saving}
                        onSave={() => void saveEditor()}
                        onCancel={() => {
                          setEditor(null)
                          setDraftName('')
                        }}
                      />
                    </li>
                  ) : (
                    <li key={item.id} className="list-rows__item">
                      <span className="list-rows__label">
                        <span className="t-body">{item.name}</span>
                        {selectedKey &&
                        isClosedListPane(selectedKey) &&
                        !canMutateClosedListItem(selectedKey, item) ? (
                          <span className="t-caption text-muted">מערכת</span>
                        ) : null}
                      </span>
                      <span className="list-rows__actions">
                        {selectedKey &&
                        isClosedListPane(selectedKey) &&
                        canReorderClosedList(selectedKey) ? (
                          <>
                            <IconButton
                              label="העלאה"
                              variant="ghost"
                              disabled={orderSaving || Boolean(editor) || index === 0}
                              onClick={() => void moveItem(item, 'up')}
                            >
                              <ChevronUp size={20} strokeWidth={1.75} />
                            </IconButton>
                            <IconButton
                              label="הורדה"
                              variant="ghost"
                              disabled={
                                orderSaving || Boolean(editor) || index === items.length - 1
                              }
                              onClick={() => void moveItem(item, 'down')}
                            >
                              <ChevronDown size={20} strokeWidth={1.75} />
                            </IconButton>
                          </>
                        ) : null}
                        {selectedKey &&
                        isClosedListPane(selectedKey) &&
                        canMutateClosedListItem(selectedKey, item) ? (
                          <OverflowMenu
                            open={menuItemId === item.id}
                            onOpenChange={(next) => setMenuItemId(next ? item.id : null)}
                            items={[
                              {
                                label: 'עריכה',
                                onSelect: () => openEdit(item),
                              },
                              {
                                label: 'הסרה',
                                danger: true,
                                onSelect: () => void removeItem(item),
                              },
                            ]}
                          />
                        ) : null}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            ) : null}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function SettingsMenus({
  selectedKey,
  onSelect,
}: {
  selectedKey: SettingsPaneKey | null
  onSelect: (key: SettingsPaneKey) => void
}) {
  return (
    <div className="lists-nav-stack">
      {SETTINGS_MENU_GROUPS.map((group) => (
        <nav key={group.label} className="lists-nav" aria-label={group.label}>
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="nav-item"
              aria-current={selectedKey === item.key ? 'page' : undefined}
              onClick={() => onSelect(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ))}
    </div>
  )
}

function ClosedListDescription({ text }: { text: string }) {
  const parts = text.split('Gov.il')
  if (parts.length === 1) return text
  return (
    <>
      {parts[0]}
      <span dir="ltr">Gov.il</span>
      {parts.slice(1).join('Gov.il')}
    </>
  )
}

function InlineEditor({
  value,
  onChange,
  saving,
  onSave,
  onCancel,
}: {
  value: string
  onChange: (value: string) => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const formRef = useRef<HTMLFormElement>(null)

  useDesktopFormSubmit(() => formRef.current?.requestSubmit(), {
    enabled: !saving,
    rootRef: formRef,
  })

  return (
    <form
      ref={formRef}
      className="list-inline-editor"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <TextField
        label="שם הפריט"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoFocus
        required
      />
      <div className="list-inline-editor__actions">
        <Button type="submit" loading={saving} loadingLabel="שומר…">
          שמירה
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          ביטול
        </Button>
      </div>
    </form>
  )
}
