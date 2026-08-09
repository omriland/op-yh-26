/** Skeletons mirror the shape of the real component. Full-screen spinners are forbidden. */

export function Skeleton({ height, width = '100%' }: { height: number; width?: string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />
}

export function EventCardSkeleton() {
  return (
    <div className="card stack-3" aria-hidden="true">
      <div className="row-between">
        <Skeleton height={24} width="45%" />
        <Skeleton height={24} width="88px" />
      </div>
      <Skeleton height={20} width="70%" />
      <Skeleton height={16} width="55%" />
    </div>
  )
}

export function EventRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="table-wrap stack-3" style={{ padding: 'var(--space-4)' }} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={28} />
      ))}
    </div>
  )
}

export function EventListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="stack-3" aria-busy="true" aria-label="טוען אירועים">
      {Array.from({ length: count }, (_, index) => (
        <EventCardSkeleton key={index} />
      ))}
    </div>
  )
}
