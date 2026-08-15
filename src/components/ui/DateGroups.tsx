import type { ReactNode } from 'react'

type DateGroupsProps = {
  children: ReactNode
}

type DateGroupProps = {
  heading: ReactNode
  children?: ReactNode
}

/** Shared parent for sticky date headers — do not wrap each day in its own section. */
export function DateGroups({ children }: DateGroupsProps) {
  return <div className="event-groups">{children}</div>
}

export function DateGroup({ heading, children }: DateGroupProps) {
  return (
    <>
      <h2 className="group-head">{heading}</h2>
      {children}
    </>
  )
}
