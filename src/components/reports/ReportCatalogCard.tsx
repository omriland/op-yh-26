import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ChevronLeft,
  ClipboardList,
  Copy,
  Gauge,
  GitCompareArrows,
  Users,
} from 'lucide-react'

const OPEN_LABEL = 'לפתיחת הדוח'

/** Matches the service-card palette: red → white → gray → blue, then repeat. */
export const REPORT_CATALOG_VARIANTS = ['red', 'default', 'gray', 'blue'] as const
export type ReportCatalogVariant = (typeof REPORT_CATALOG_VARIANTS)[number]

const ICONS: Record<string, LucideIcon> = {
  open_documentation: ClipboardList,
  events_by_responder: Users,
  km_discrepancy: GitCompareArrows,
  km_exceptions: Gauge,
  duplicate_events: Copy,
}

type ReportCatalogCardProps = {
  id: string
  title: string
  includes: string
  /** 0-based position in the visible catalog — drives repeating color cycle. */
  index: number
  onOpen: () => void
}

export function reportCatalogIcon(id: string): LucideIcon {
  return ICONS[id] ?? AlertTriangle
}

export function reportCatalogVariant(index: number): ReportCatalogVariant {
  return REPORT_CATALOG_VARIANTS[index % REPORT_CATALOG_VARIANTS.length]!
}

export function ReportCatalogCard({ id, title, includes, index, onOpen }: ReportCatalogCardProps) {
  const Icon = reportCatalogIcon(id)
  const variant = reportCatalogVariant(index)

  return (
    <button
      type="button"
      className={`report-catalog-card report-catalog-card--${variant}`}
      onClick={onOpen}
    >
      <span className="report-catalog-card__copy">
        <span className="report-catalog-card__title t-section">{title}</span>
        <span className="report-catalog-card__includes t-body">{includes}</span>
        <span className="report-catalog-card__cta t-body-strong">
          {OPEN_LABEL}
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </span>
      <Icon
        className="report-catalog-card__glyph"
        size={160}
        strokeWidth={1.25}
        aria-hidden="true"
      />
    </button>
  )
}
