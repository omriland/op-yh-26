import type { ReactNode } from 'react'

type DateGroupsProps = {
  children: ReactNode
}

type DateGroupProps = {
  heading: ReactNode
  children?: ReactNode
}

/** Shared list of groups. Each DateGroup is a section so sticky stays in-range. */
export function DateGroups({ children }: DateGroupsProps) {
  return <div className="event-groups">{children}</div>
}

export function DateGroup({ heading, children }: DateGroupProps) {
  return (
    <section className="event-group">
      <h2 className="group-head">{heading}</h2>
      {children}
    </section>
  )
}
