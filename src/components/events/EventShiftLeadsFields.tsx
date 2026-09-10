import { useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { FieldNote } from '../ui/FieldNote'
import { Ledger, LedgerRow } from '../ui/Ledger'
import { SelectField } from '../ui/SelectField'
import { monoClass } from '../../lib/format'
import type { AssignableUser } from '../../lib/eventForm'
import {
  MAIN_LEAD_LABEL,
  MAIN_LEAD_LABEL_SHORT,
  MAIN_LEAD_LOCKED_HINT,
  SECONDARY_LEAD_ADD,
  SECONDARY_LEAD_ADD_SHORT,
  SECONDARY_LEAD_LABEL,
  SECONDARY_LEAD_LOCKED_HINT,
  applySecondaryLeadSelection,
  buildSecondaryLeadOptions,
  canChangeEventMainLead,
  canManageSecondaryLeads,
  eventLeadFieldLabel,
  formatLeadPerson,
  formatSecondaryLeadTrigger,
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
  /** Mobile: button until a secondary exists (or they tap add). */
  secondaryAddButton?: boolean
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
  secondaryAddButton = false,
  onChange,
}: EventShiftLeadsFieldsProps) {
  const [addingSecondary, setAddingSecondary] = useState(false)
  const canManage = canManageSecondaryLeads(roles)
  const canChangeMain = canChangeEventMainLead({
    roles,
    eventExists,
    viewerIsCurrentMain: Boolean(viewerId && shiftLeadId && viewerId === shiftLeadId),
    hasSecondaries: secondaryLeads.length > 0,
  })
  const candidates = useMemo(
    () =>
      shiftLeadUsers.map((row) => ({
        id: row.id,
        full_name: row.full_name,
        callsign: row.callsign,
      })),
    [shiftLeadUsers],
  )
  const secondaryOptions = useMemo(
    () =>
      buildSecondaryLeadOptions({
        candidates,
        selected: secondaryLeads,
        mainLeadId: shiftLeadId,
        roles,
      }).map((option) => ({
        value: option.id,
        label: `${option.full_name} · ${option.callsign}`,
        disabled: option.selected && !option.removable,
        content: (
          <span className="lead-option">
            <span className="t-body">{option.full_name}</span>
            <span className="t-caption text-muted">
              או״ק <span className={monoClass(option.callsign)}>{option.callsign}</span>
            </span>
            {option.selected && !option.removable ? (
              <span className="t-caption text-muted">{SECONDARY_LEAD_LOCKED_HINT}</span>
            ) : null}
          </span>
        ),
      })),
    [candidates, roles, secondaryLeads, shiftLeadId],
  )
  const mainOptions = shiftLeadUsers.map((row) => ({
    value: row.id,
    label: `${row.full_name} · ${row.callsign}`,
  }))
  const showSecondaryPicker =
    canManage && (secondaryLeads.length > 0 || !secondaryAddButton || addingSecondary)
  const mainLabel =
    secondaryAddButton && secondaryLeads.length === 0
      ? MAIN_LEAD_LABEL_SHORT
      : canManage
        ? MAIN_LEAD_LABEL
        : eventLeadFieldLabel(secondaryLeads.length > 0)

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

  function applySecondaries(values: string[]) {
    onChange({
      shift_lead_id: shiftLeadId ?? '',
      shift_lead: shiftLead,
      secondary_leads: applySecondaryLeadSelection({
        values,
        current: secondaryLeads,
        candidates,
        mainLeadId: shiftLeadId,
        roles,
      }),
    })
  }

  return (
    <div className="event-shift-leads stack-3">
      <div className="event-leads-row">
        <div className="event-leads-row__main">
          <FieldNote field="shift_lead_id" />
          {canChangeMain ? (
            <SelectField
              label={mainLabel}
              searchable
              searchPlaceholder="חיפוש לפי שם או או״ק"
              value={shiftLeadId ?? ''}
              options={mainOptions}
              onChange={(event) => applyMain(event.target.value)}
            />
          ) : (
            <Ledger>
              <LedgerRow label={mainLabel} value={formatLeadPerson(shiftLead) || undefined} />
            </Ledger>
          )}
        </div>
        {canManage && showSecondaryPicker ? (
          <div className="event-leads-row__secondary">
            <FieldNote field="secondary_leads" />
            <SelectField
              label={SECONDARY_LEAD_LABEL}
              multiple
              searchable
              searchPlaceholder="חיפוש לפי שם או או״ק"
              placeholder={SECONDARY_LEAD_ADD_SHORT}
              summaryLabel={formatSecondaryLeadTrigger(secondaryLeads)}
              values={secondaryLeads.map((row) => row.user_id)}
              options={secondaryOptions}
              onValuesChange={applySecondaries}
            />
          </div>
        ) : canManage && secondaryAddButton ? (
          <div className="event-leads-row__secondary">
            <Button block variant="secondary" onClick={() => setAddingSecondary(true)}>
              {SECONDARY_LEAD_ADD}
            </Button>
          </div>
        ) : null}
      </div>
      {!canChangeMain && canManage && eventExists ? (
        <p className="t-caption text-muted">{MAIN_LEAD_LOCKED_HINT}</p>
      ) : null}

      {!canManage && secondaryLeads.length > 0 ? (
        <Ledger>
          {secondaryLeads.map((row) => (
            <LedgerRow
              key={row.user_id}
              label={SECONDARY_LEAD_LABEL}
              value={formatLeadPerson(row) || undefined}
            />
          ))}
        </Ledger>
      ) : null}
    </div>
  )
}
