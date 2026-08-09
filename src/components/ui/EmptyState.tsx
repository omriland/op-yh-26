import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon: ReactNode
  title: string
  caption?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, caption, action }: EmptyStateProps) {
  return (
    <div className="empty">
      {icon}
      <h2 className="t-section">{title}</h2>
      {caption ? <p className="t-caption text-muted">{caption}</p> : null}
      {action}
    </div>
  )
}
