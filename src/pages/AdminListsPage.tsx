import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ListTree, Plus } from 'lucide-react'
import {
  CLOSED_LISTS,
  closedListMeta,
  createClosedListItem,
  deleteClosedListItem,
  fetchClosedListItems,
  updateClosedListItem,
  type ClosedListItem,
  type ClosedListKey,
} from '../lib/closedLists'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Button, IconButton } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { OverflowMenu } from '../components/ui/OverflowMenu'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'

type Editor =
  | { mode: 'create' }
  | { mode: 'edit'; item: ClosedListItem }
  | null

export function AdminListsPage() {
  const isDesktop = useIsDesktop()
  const { show } = useToast()
  const [selectedKey, setSelectedKey] = useState<ClosedListKey | null>(
    isDesktop ? 'districts' : null,
  )
  const [items, setItems] = useState<ClosedListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [editor, setEditor] = useState<Editor>(null)
  const [draftName, setDraftName] = useState('')
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [menuItemId, setMenuItemId] = useState<string | null>(null)

  const selectedMeta = useMemo(
    () => (selectedKey ? closedListMeta(selectedKey) : null),
    [selectedKey],
  )

  useEffect(() => {
    if (isDesktop && !selectedKey) setSelectedKey('districts')
  }, [isDesktop, selectedKey])

  useEffect(() => {
    if (!selectedKey) {
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
    setBanner(null)
    setDraftName(item.name)
    setEditor({ mode: 'edit', item })
  }

  async function saveEditor() {
    if (!selectedKey || !editor) return
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
    if (!selectedKey) return
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

  const showPicker = !isDesktop && !selectedKey

  return (
    <div className="stack-4">
      {showPicker ? (
        <>
          <div className="row-between" style={{ marginBlockEnd: 'var(--space-2)' }}>
            <h1 className="t-title">הגדרות</h1>
          </div>
          <div className="stack-3">
            {CLOSED_LISTS.map((list) => (
              <button
                key={list.key}
                type="button"
                className="card list-pick-card"
                onClick={() => setSelectedKey(list.key)}
              >
                <span className="t-section">{list.label}</span>
                <span className="t-caption text-muted">ניהול פריטי הרשימה</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className={['lists-layout', isDesktop ? 'lists-layout--desktop' : ''].join(' ')}>
          {isDesktop ? (
            <nav className="lists-nav" aria-label="הגדרות">
              {CLOSED_LISTS.map((list) => (
                <button
                  key={list.key}
                  type="button"
                  className="nav-item"
                  aria-current={selectedKey === list.key ? 'page' : undefined}
                  onClick={() => setSelectedKey(list.key)}
                >
                  {list.label}
                </button>
              ))}
            </nav>
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
                <h1 className="t-title">{selectedMeta?.label ?? 'הגדרות'}</h1>
              </div>
              {isDesktop ? (
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
              )}
            </div>

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

                {items.map((item) =>
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
                      <span className="t-body">{item.name}</span>
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
                    </li>
                  ),
                )}
              </ul>
            ) : null}
          </section>
        </div>
      )}
    </div>
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
  return (
    <form
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
