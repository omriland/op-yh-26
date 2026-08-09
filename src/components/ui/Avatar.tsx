import { initials } from '../../lib/format'

type AvatarProps = {
  name: string
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar({ name, size = 'md' }: AvatarProps) {
  const modifier = size === 'md' ? '' : `avatar--${size}`

  return (
    <span className={['avatar', modifier].filter(Boolean).join(' ')} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
