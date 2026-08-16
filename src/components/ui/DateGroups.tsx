import type { ReactNode } from 'react'

type DateGroupsProps = {
  children: ReactNode
}

type DateGroupProps = {
  heading: ReactNode
  children?: ReactNode
  /** Recede completed cards (אירועים שתועדו). */
  logged?: boolean
}

/** Shared list of groups. Each DateGroup is a section so sticky stays in-range. */
export function DateGroups({ children }: DateGroupsProps) {
  return <div className="event-groups">{children}</div>
}

export function DateGroup({ heading, children, logged = false }: DateGroupProps) {
  return (
    <section className={logged ? 'event-group event-group--logged' : 'event-group'}>
      <h2 className="group-head">{heading}</h2>
      {children}
    </section>
  )
}
