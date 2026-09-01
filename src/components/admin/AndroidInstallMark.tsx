import { HoverTip } from '../ui/HoverTip'

type AndroidInstallMarkProps = {
  tip: string
}

/** Super Admin-only Android robot next to a user who last signed in on the app. */
export function AndroidInstallMark({ tip }: AndroidInstallMarkProps) {
  if (!tip) return null

  return (
    <HoverTip text={tip} mode="always" className="android-install-mark" theme="field">
      <span className="android-install-mark__hit" aria-label={tip} onClick={(event) => event.stopPropagation()}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M17.6 9.48c.32 0 .59.27.59.6v5.84a.6.6 0 0 1-.59.6h-.01a.6.6 0 0 1-.6-.6V10.08c0-.33.27-.6.6-.6zm-11.2 0c.33 0 .6.27.6.6v5.84a.6.6 0 0 1-.6.6h-.01a.6.6 0 0 1-.59-.6V10.08c0-.33.26-.6.6-.6zM16.2 8.1H7.8c-.5 0-.9.4-.9.9v6.6c0 .9.73 1.62 1.62 1.62h.18v2.16c0 .4.33.72.72.72s.72-.32.72-.72V17.22h3.72v2.16c0 .4.32.72.72.72.39 0 .72-.32.72-.72V17.22h.18c.89 0 1.62-.73 1.62-1.62V9c0-.5-.4-.9-.9-.9zM9.06 6.42 8.1 4.74a.37.37 0 0 1 .12-.51.37.37 0 0 1 .51.12l.9 1.56A5.4 5.4 0 0 1 12 5.58c.8 0 1.56.16 2.25.42l.9-1.56a.37.37 0 0 1 .51-.12.37.37 0 0 1 .12.51l-.96 1.68c1.29.66 2.16 1.86 2.16 3.24H7.02c0-1.38.87-2.58 2.04-3.24zM10.2 10.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm3.6 0a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z"
          />
        </svg>
      </span>
    </HoverTip>
  )
}
