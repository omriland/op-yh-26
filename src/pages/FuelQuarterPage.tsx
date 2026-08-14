import { useEffect, useMemo, useRef, useState } from 'react'
import { Fuel, ShieldAlert } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  defaultFuelQuarter,
  loadFuelQuarterWorkbook,
  lockFuelQuarter,
  saveFuelQuarterDraft,
  type FuelQuarterRow,
  type FuelQuarterWorkbook,
} from '../lib/fuelQuarterReport'
import { remainingKm } from '../lib/fuelQuarterMath'
import {
  cardNumbersMatchCount,
  parseCardNumbers,
  serializeCardNumbers,
} from '../lib/fuelQuarterCards'
import { formatNumber, monoClass } from '../lib/format'
import { useIsDesktop } from '../lib/useMediaQuery'
import { useToast } from '../components/ui/Toast'
import { Button } from '../components/ui/Button'
import { CardNumbersField } from '../components/admin/CardNumbersField'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { TextField } from '../components/ui/TextField'

const QUARTERS: { id: 1 | 2 | 3 | 4; label: string }[] = [
  { id: 1, label: 'רבעון 1' },
  { id: 2, label: 'רבעון 2' },
  { id: 3, label: 'רבעון 3' },
  { id: 4, label: 'רבעון 4' },
]

const AUTOSAVE_MS = 1800

type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

function rowsCardNumbersValid(list: FuelQuarterRow[]): boolean {
  return list.every((row) =>
    cardNumbersMatchCount(parseCardNumbers(row.card_numbers), row.cards),
  )
}

export function FuelQuarterPage() {
  const isDesktop = useIsDesktop()
  const { profile } = useAuth()
  const { show } = useToast()
  const initial = defaultFuelQuarter()
  const [year, setYear] = useState(String(initial.year))
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(initial.quarter)
  const [workbook, setWorkbook] = useState<FuelQuarterWorkbook | null>(null)
  const [rows, setRows] = useState<FuelQuarterRow[]>([])
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [confirmLock, setConfirmLock] = useState(false)
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle')
  const autosaveGen = useRef(0)

  const yearNum = Number(year)
  const yearValid = Number.isInteger(yearNum) && yearNum >= 2000 && yearNum <= 2100

  useEffect(() => {
    if (!yearValid) {
      setWorkbook(null)
      setRows([])
      return
    }

    let active = true
    setWorkbook(null)
    setRows([])
    setFailed(false)
    setAutosaveStatus('idle')

    void loadFuelQuarterWorkbook(yearNum, quarter)
      .then((next) => {
        if (!active) return
        setWorkbook(next)
        setRows(next.rows)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [yearNum, quarter, yearValid, reloadKey])

  const dirty = useMemo(() => {
    if (!workbook) return false
    if (rows.length !== workbook.rows.length) return true
    return rows.some((row, i) => {
      const orig = workbook.rows[i]
      if (!orig || orig.responder_id !== row.responder_id) return true
      return orig.cards !== row.cards || orig.card_numbers !== row.card_numbers
    })
  }, [workbook, rows])

  const locked = workbook?.status === 'locked'

  useEffect(() => {
    if (!workbook || locked || !dirty) return

    setAutosaveStatus('pending')
    const gen = ++autosaveGen.current
    const timer = window.setTimeout(() => {
      void (async () => {
        if (autosaveGen.current !== gen) return
        setAutosaveStatus('saving')
        try {
          await saveFuelQuarterDraft(workbook, rows)
          if (autosaveGen.current !== gen) return
          setWorkbook({ ...workbook, rows: rows.map((r) => ({ ...r })) })
          setAutosaveStatus('saved')
        } catch {
          if (autosaveGen.current !== gen) return
          setAutosaveStatus('error')
        }
      })()
    }, AUTOSAVE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [dirty, rows, workbook, locked])

  useEffect(() => {
    if (autosaveStatus !== 'saved') return
    const timer = window.setTimeout(() => setAutosaveStatus('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [autosaveStatus])

  function updateRow(responderId: string, patch: Partial<Pick<FuelQuarterRow, 'cards' | 'card_numbers'>>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.responder_id !== responderId) return row
        const cards =
          patch.cards !== undefined ? Math.max(0, Math.floor(Number(patch.cards) || 0)) : row.cards
        let card_numbers = patch.card_numbers !== undefined ? patch.card_numbers : row.card_numbers
        if (patch.cards !== undefined) {
          const nums = parseCardNumbers(card_numbers)
          if (nums.length > cards) {
            card_numbers = serializeCardNumbers(nums.slice(0, cards))
          }
        }
        return {
          ...row,
          cards,
          card_numbers,
          remaining_km: remainingKm(row.payable_km, cards),
        }
      }),
    )
  }

  async function onSave() {
    if (!workbook || locked) return
    autosaveGen.current += 1
    setSaving(true)
    setAutosaveStatus('saving')
    try {
      await saveFuelQuarterDraft(workbook, rows)
      setWorkbook({ ...workbook, rows: rows.map((r) => ({ ...r })) })
      setAutosaveStatus('saved')
    } catch {
      setAutosaveStatus('error')
      show('שמירה נכשלה. נסו שוב.', 'alert')
    } finally {
      setSaving(false)
    }
  }

  async function onLock() {
    if (!workbook || locked || !profile?.id) return
    if (!rowsCardNumbersValid(rows)) {
      show('מספר הכרטיסים חייב להתאים למספרי הכרטיסים שהוזנו בכל השורות.', 'alert')
      setConfirmLock(false)
      return
    }
    autosaveGen.current += 1
    setSaving(true)
    try {
      await lockFuelQuarter(workbook, rows, profile.id)
      show('הרבעון ננעל.', 'done')
      setConfirmLock(false)
      setReloadKey((k) => k + 1)
    } catch {
      show('נעילה נכשלה. נסו שוב.', 'alert')
    } finally {
      setSaving(false)
    }
  }

  const autosaveLabel =
    autosaveStatus === 'pending'
      ? 'שמירה אוטומטית…'
      : autosaveStatus === 'saving'
        ? 'שומר…'
        : autosaveStatus === 'saved'
          ? 'נשמר אוטומטית'
          : autosaveStatus === 'error'
            ? 'שמירה נכשלה'
            : null

  return (
    <div className="fuel-quarter">
      <header className="fuel-quarter__head">
        <div className="fuel-quarter__intro">
          <h1 className="t-title">ניהול כרטיסי דלק</h1>
          <p className="t-caption text-muted">
            חלוקת כרטיסי דלק לפי רבעון — יתרות עוברות לרבעון הבא
          </p>
        </div>
        {workbook ? (
          <div className="fuel-quarter__actions">
            {autosaveLabel ? (
              <span
                className={[
                  't-caption',
                  'fuel-quarter-autosave',
                  autosaveStatus === 'error' ? 'text-danger' : 'text-muted',
                ].join(' ')}
                aria-live="polite"
              >
                {autosaveLabel}
              </span>
            ) : (
              <span className="fuel-quarter-autosave fuel-quarter-autosave--slot" aria-hidden="true" />
            )}
            <div className="fuel-quarter__action-btns">
              {locked ? <span className="t-caption text-muted">נעול</span> : null}
              {!locked ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={!dirty || saving}
                    onClick={() => void onSave()}
                  >
                    שמירה
                  </Button>
                  <Button variant="primary" disabled={saving} onClick={() => setConfirmLock(true)}>
                    נעילת רבעון
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      <div className="fuel-quarter__toolbar">
        <div className="fuel-quarter__control">
          <label className="fuel-quarter__label" htmlFor="fuel-quarter-year">
            שנה
          </label>
          <input
            id="fuel-quarter-year"
            className="fuel-quarter__year-input mono"
            type="number"
            required
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div className="fuel-quarter__control fuel-quarter__control--quarters">
          <span className="fuel-quarter__label" id="fuel-quarter-label">
            רבעון
          </span>
          <div
            className="fuel-quarter__quarters"
            role="tablist"
            aria-labelledby="fuel-quarter-label"
          >
            {QUARTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className="fuel-quarter__quarter"
                aria-selected={quarter === item.id}
                aria-pressed={quarter === item.id}
                onClick={() => setQuarter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!yearValid ? (
        <p className="t-caption text-danger">שנה לא תקינה</p>
      ) : null}

      {yearValid && !workbook && !failed ? (
        isDesktop ? <EventRowsSkeleton rows={6} /> : <EventListSkeleton count={4} />
      ) : null}

      {failed ? (
        <EmptyState
          icon={<ShieldAlert size={40} strokeWidth={1.75} />}
          title="לא הצלחנו לטעון את כרטיסי הדלק."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
              רענון
            </Button>
          }
        />
      ) : null}

      {workbook && rows.length === 0 ? (
        <EmptyState
          icon={<Fuel size={40} strokeWidth={1.75} />}
          title="אין כוננים עם ק״מ או יתרה ברבעון זה."
        />
      ) : null}

      {workbook && rows.length > 0 && isDesktop ? (
        <div className="table-wrap table-wrap--fuel-quarter">
          <table className="table table--fuel-quarter">
            <thead>
              <tr>
                <th scope="col" className="table--fuel-quarter__sticky">
                  כונן
                </th>
                <th scope="col">יתרה מרבעון קודם</th>
                <th scope="col">{workbook.monthLabels[0]}</th>
                <th scope="col">{workbook.monthLabels[1]}</th>
                <th scope="col">{workbook.monthLabels[2]}</th>
                <th scope="col">סה״כ ק״מ</th>
                <th scope="col">ליטרים</th>
                <th scope="col">כרטיסים</th>
                <th scope="col">יתרה (ק״מ)</th>
                <th scope="col">מספרי כרטיסים</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.responder_id}>
                  <td className="table--fuel-quarter__sticky">
                    <div className="table--fuel-quarter__name">{row.full_name}</div>
                    <div className={`t-caption text-muted ${monoClass(row.callsign)}`}>
                      {row.callsign}
                    </div>
                  </td>
                  <td className="num mono">{formatNumber(row.opening_balance_km)}</td>
                  <td className="num mono">{formatNumber(row.km_month_1)}</td>
                  <td className="num mono">{formatNumber(row.km_month_2)}</td>
                  <td className="num mono">{formatNumber(row.km_month_3)}</td>
                  <td className="num mono">{formatNumber(row.quarter_km)}</td>
                  <td className="num mono">{formatNumber(Number(row.liters.toFixed(1)))}</td>
                  <td className="table-cell--edit">
                    {locked ? (
                      <span className="num mono">{formatNumber(row.cards)}</span>
                    ) : (
                      <div className="table-edit__row">
                        <input
                          className="table-input table-input--cards mono"
                          type="number"
                          min={0}
                          step={1}
                          value={row.cards}
                          aria-label={`כרטיסים ל${row.full_name}`}
                          onChange={(e) =>
                            updateRow(row.responder_id, { cards: Number(e.target.value) })
                          }
                        />
                        <button
                          type="button"
                          className="table-edit__suggest"
                          onClick={() =>
                            updateRow(row.responder_id, { cards: row.suggested_cards })
                          }
                        >
                          מומלץ <span className="mono">{formatNumber(row.suggested_cards)}</span>
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="num mono">{formatNumber(row.remaining_km)}</td>
                  <td className="table-cell--edit table--fuel-quarter__cards">
                    {locked ? (
                      parseCardNumbers(row.card_numbers).join(' · ') || '—'
                    ) : (
                      <CardNumbersField
                        compact
                        cards={row.cards}
                        value={row.card_numbers}
                        onChange={(next) =>
                          updateRow(row.responder_id, { card_numbers: next })
                        }
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {workbook && rows.length > 0 && !isDesktop ? (
        <div className="stack-4">
          {rows.map((row) => (
            <article key={row.responder_id} className="card stack-3">
              <div className="row-between">
                <div>
                  <div className="t-body">{row.full_name}</div>
                  <div className={`t-caption text-muted ${monoClass(row.callsign)}`}>
                    {row.callsign}
                  </div>
                </div>
                <div className="num mono t-body">{formatNumber(row.remaining_km)} יתרה</div>
              </div>
              <p className="t-caption text-muted">
                יתרה מרבעון קודם {formatNumber(row.opening_balance_km)} · סה״כ{' '}
                {formatNumber(row.quarter_km)} ק״מ · {formatNumber(Number(row.liters.toFixed(1)))}{' '}
                ל׳
              </p>
              {!locked ? (
                <>
                  <TextField
                    label="כרטיסים"
                    type="number"
                    value={String(row.cards)}
                    onChange={(e) =>
                      updateRow(row.responder_id, { cards: Number(e.target.value) })
                    }
                    hint={`מומלץ: ${formatNumber(row.suggested_cards)}`}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => updateRow(row.responder_id, { cards: row.suggested_cards })}
                  >
                    שימוש במומלץ ({formatNumber(row.suggested_cards)})
                  </Button>
                  <CardNumbersField
                    cards={row.cards}
                    value={row.card_numbers}
                    onChange={(next) => updateRow(row.responder_id, { card_numbers: next })}
                  />
                </>
              ) : (
                <p className="t-caption">
                  כרטיסים: <span className="mono">{formatNumber(row.cards)}</span>
                  {parseCardNumbers(row.card_numbers).length > 0
                    ? ` · ${parseCardNumbers(row.card_numbers).join(' · ')}`
                    : ''}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : null}

      <Dialog
        open={confirmLock}
        title="נעילת רבעון"
        onClose={() => setConfirmLock(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLock(false)}>
              ביטול
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void onLock()}>
              נעילה
            </Button>
          </>
        }
      >
        <p className="t-body">לנעול את הרבעון? לא ניתן לערוך לאחר הנעילה. היתרות יעברו לרבעון הבא.</p>
        {dirty ? (
          <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-2)' }}>
            שינויים שלא נשמרו יישמרו לפני הנעילה.
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}
