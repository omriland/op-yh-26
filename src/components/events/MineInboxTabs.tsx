import { MINE_LOGGED_TAB_LABEL, minePendingTabLabel, type MineInboxTab } from '../../lib/mineInbox'

export type { MineInboxTab }

type MineInboxTabsProps = {
  tab: MineInboxTab
  pendingCount: number
  /** While filters narrow the list, the logged tab shows its count too. */
  loggedCount?: number | null
  onChange: (tab: MineInboxTab) => void
}

export function MineInboxTabs({ tab, pendingCount, loggedCount = null, onChange }: MineInboxTabsProps) {
  return (
    <div className="chips admin-segments mine-inbox-tabs" role="tablist" aria-label="תצוגת האירועים שלי">
      <button
        type="button"
        role="tab"
        className="chip"
        aria-selected={tab === 'pending'}
        aria-pressed={tab === 'pending'}
        onClick={() => onChange('pending')}
      >
        {minePendingTabLabel(pendingCount)}
      </button>
      <button
        type="button"
        role="tab"
        className="chip"
        aria-selected={tab === 'logged'}
        aria-pressed={tab === 'logged'}
        onClick={() => onChange('logged')}
      >
        {loggedCount === null ? MINE_LOGGED_TAB_LABEL : `${MINE_LOGGED_TAB_LABEL} ${loggedCount}`}
      </button>
    </div>
  )
}
