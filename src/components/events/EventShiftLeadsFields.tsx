import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '../ui/Button'
import { Ledger, LedgerRow } from '../ui/Ledger'
import { SelectField } from '../ui/SelectField'
import { Avatar } from '../ui/Avatar'
import { monoClass } from '../../lib/format'
import type { AssignableUser } from '../../lib/eventForm'
import {
  MAIN_LEAD_LABEL,
  MAIN_LEAD_LOCKED_HINT,
  SECONDARY_LEAD_ADD,
  SECONDARY_LEAD_LABEL,
  SECONDARY_LEAD_LOCKED_HINT,
  SECONDARY_LEAD_PICKER_EMPTY,
  SECONDARY_LEAD_PICKER_NONE,
  SECONDARY_LEAD_REMOVE,
  canChangeEventMainLead,
  canManageSecondaryLeads,
  canRemoveSecondaryLead,
  eventLeadFieldLabel,
  filterShiftLeadPicker,
  formatLeadPerson,
  mapSecondaryLeadRows,
  reassignMainLeads,
  type SecondaryLead,
} from '../../lib/eventShiftLeads'

export function EventLeadLedgerRows({
  main,
  secondaries,
}: {
  main: { full_name: string; callsign: string } | null | undefined
  secondaries?: unknown
}) {
  const mapped = mapSecondaryLeadRows(secondaries)
  return (
    <>
      <LedgerRow
        label={eventLeadFieldLabel(mapped.length > 0)}
        value={formatLeadPerson(main) || undefined}
      />
      {mapped.map((row) => (
        <LedgerRow
          key={row.user_id}
          label={SECONDARY_LEAD_LABEL}
          value={formatLeadPerson(row) || undefined}
        />
      ))}
    </>
  )
}

type EventShiftLeadsFieldsProps = {
  roles: readonly string[]
  viewerId: string | undefined
  eventExists: boolean
  shiftLeadId: string | undefined
  shiftLead: { full_name: string; callsign: string }
  secondaryLeads: SecondaryLead[]
  shiftLeadUsers: AssignableUser[]
  onChange: (next: {
    shift_lead_id: string
    shift_lead: { full_name: string; callsign: string }
    secondary_leads: SecondaryLead[]
  }) => void
}

export function EventShiftLeadsFields({
  roles,
  viewerId,
  eventExists,
  shiftLeadId,
  shiftLead,
  secondaryLeads,
  shiftLeadUsers,
  onChange,
}: EventShiftLeadsFieldsProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const canManage = canManageSecondaryLeads(roles)
  const canChangeMain = canChangeEventMainLead({
    roles,
    eventExists,
    viewerIsCurrentMain: Boolean(viewerId && shiftLeadId && viewerId === shiftLeadId),
    hasSecondaries: secondaryLeads.length > 0,
  })
  const exclude = [shiftLeadId, ...secondaryLeads.map((row) => row.user_id)].filter(
    Boolean,
  ) as string[]
  const pickerOptions = useMemo(
    () =>
      filterShiftLeadPicker(
        shiftLeadUsers.map((row) => ({
          id: row.id,
          full_name: row.full_name,
          callsign: row.callsign,
        })),
        exclude,
        query,
      ),
    [shiftLeadUsers, exclude, query],
  )
  const mainOptions = shiftLeadUsers.map((row) => ({
    value: row.id,
    label: `${row.full_name} · ${row.callsign}`,
  }))

  function applyMain(nextId: string) {
    const picked = shiftLeadUsers.find((row) => row.id === nextId)
    if (!picked || !shiftLeadId) return
    const next = reassignMainLeads({
      previousMainId: shiftLeadId,
      nextMainId: nextId,
      previousMain: shiftLead,
      secondaries: secondaryLeads,
    })
    onChange({
      shift_lead_id: next.mainId,
      shift_lead: { full_name: picked.full_name, callsign: picked.callsign },
      secondary_leads: next.secondaries,
    })
  }

  function addSecondary(person: AssignableUser) {
    if (person.id === shiftLeadId) return
    if (secondaryLeads.some((row) => row.user_id === person.id)) return
    onChange({
      shift_lead_id: shiftLeadId ?? person.id,
      shift_lead: shiftLead,
      secondary_leads: [
        ...secondaryLeads,
        {
          user_id: person.id,
          locked: false,
          full_name: person.full_name,
          callsign: person.callsign,
        },
      ],
    })
    setQuery('')
    setPickerOpen(false)
  }

  function removeSecondary(userId: string) {
    onChange({
      shift_lead_id: shiftLeadId ?? '',
      shift_lead: shiftLead,
      secondary_leads: secondaryLeads.filter((row) => row.user_id !== userId),
    })
  }

  useEffect(() => {
    if (!pickerOpen) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (pickerRef.current?.contains(target)) return
      setPickerOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setPickerOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pickerOpen])

  return (
    <div className="event-shift-leads stack-3">
      {canChangeMain ? (
        <SelectField
          label={eventLeadFieldLabel(secondaryLeads.length > 0)}
          searchable
          searchPlaceholder="חיפוש לפי שם או או״ק"
          value={shiftLeadId ?? ''}
          options={mainOptions}
          onChange={(event) => applyMain(event.target.value)}
        />
      ) : (
        <Ledger>
          <LedgerRow
            label={eventLeadFieldLabel(secondaryLeads.length > 0)}
            value={formatLeadPerson(shiftLead) || undefined}
          />
        </Ledger>
      )}
      {!canChangeMain && canManage && eventExists ? (
        <p className="t-caption text-muted">{MAIN_LEAD_LOCKED_HINT}</p>
      ) : null}

      {secondaryLeads.length > 0 ? (
        <ul className="assignment-list">
          {secondaryLeads.map((row) => {
            const canRemove = canRemoveSecondaryLead({ roles, locked: row.locked })
            return (
              <li key={row.user_id} className="assignment-list__row">
                <span className="assignment-list__open" aria-hidden="true">
                  <span className="t-caption text-muted">{SECONDARY_LEAD_LABEL}</span>
                  <span className="t-body">{row.full_name}</span>
                  <span className="t-caption text-muted">
                    או״ק <span className={monoClass(row.callsign)}>{row.callsign}</span>
                  </span>
                  {row.locked ? (
                    <span className="t-caption text-muted">{SECONDARY_LEAD_LOCKED_HINT}</span>
                  ) : null}
                </span>
                {canRemove ? (
                  <button
                    type="button"
                    className="assignment-list__remove"
                    onClick={() => removeSecondary(row.user_id)}
                  >
                    {SECONDARY_LEAD_REMOVE}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {canManage ? (
        <div className="responder-picker" ref={pickerRef}>
          <Button
            variant="secondary"
            icon={<Plus size={20} strokeWidth={1.75} />}
            onClick={() => setPickerOpen((open) => !open)}
            aria-expanded={pickerOpen}
          >
            {SECONDARY_LEAD_ADD}
          </Button>
          {pickerOpen ? (
            <div className="responder-picker__panel" role="listbox" aria-label={SECONDARY_LEAD_ADD}>
              <label className="search-field">
                <Search size={20} strokeWidth={1.75} aria-hidden="true" />
                <span className="visually-hidden">חיפוש אחמ״שים</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="חיפוש לפי שם או או״ק"
                />
              </label>
              <ul className="responder-picker__list">
                {pickerOptions.length === 0 ? (
                  <li className="responder-picker__empty t-caption text-muted">
                    {shiftLeadUsers.length === 0
                      ? SECONDARY_LEAD_PICKER_EMPTY
                      : SECONDARY_LEAD_PICKER_NONE}
                  </li>
                ) : (
                  pickerOptions.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        className="responder-picker__option"
                        onClick={() =>
                          addSecondary({
                            id: person.id,
                            full_name: person.full_name,
                            callsign: person.callsign,
                            hasVehicle: true,
                          })
                        }
                      >
                        <Avatar name={person.full_name} />
                        <span className="responder-picker__meta">
                          <span className="t-body-strong">{person.full_name}</span>
                          <span className="t-caption text-muted">
                            או״ק{' '}
                            <span className={monoClass(person.callsign)}>{person.callsign}</span>
                          </span>
                        </span>
                        <span className="responder-picker__add t-caption">הוספה</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
