import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import {
  IOS_FOOTER_LINK,
  fetchIosInstallHref,
  isIosDevice,
  isIosSafari,
} from '../lib/iosDownload'

type IosDownloadPageProps = {
  onBack: () => void
}

export function IosDownloadPage({ onBack }: IosDownloadPageProps) {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const iphone = useMemo(() => isIosDevice(ua), [ua])
  const safari = useMemo(() => isIosSafari(ua), [ua])
  const [installHref, setInstallHref] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchIosInstallHref().then((href) => {
      if (!cancelled) setInstallHref(href)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <article className="ios-download" data-theme="field">
      <div className="detail__back">
        <Button
          variant="ghost"
          onClick={onBack}
          icon={<ChevronRight size={20} strokeWidth={1.75} />}
        >
          חזרה
        </Button>
      </div>

      <header className="ios-download__header">
        <h1 className="t-title">אפליקציית אייפון</h1>
        <p className="t-body text-secondary">
          מטעמי אבטחה - האפליקציה אינה חשופה לחנות האפליקציות.
          <br />
          ההתקנה אפשרית רק במכשיר שנרשם מראש אצל מנהל המערכת.
        </p>
      </header>

      {iphone ? (
        <div className="ios-download__panel stack-3">
          {!safari && (
            <div className="banner banner--alert t-body" role="alert">
              יש לפתוח את העמוד הזה בדפדפן ספארי. בדפדפנים אחרים כפתור ההתקנה
              לא יגיב.
            </div>
          )}
          <ol className="ios-download__steps t-body">
            <li>ודאו שמסרתם למנהל המערכת את פרטי המכשיר ושקיבלתם אישור שהגרסה מוכנה.</li>
            <li>לחצו על «התקנת האפליקציה» בתחתית העמוד.</li>
            <li>באישור שמופיע - בחרו «התקן».</li>
            <li>סגרו את הדפדפן וחכו שהסמל יופיע במסך הבית. ההתקנה נמשכת מספר שניות.</li>
          </ol>
          {installHref ? (
            <a className="btn btn--primary btn--block" href={installHref}>
              <Download size={20} strokeWidth={1.75} aria-hidden="true" />
              התקנת האפליקציה
            </a>
          ) : (
            <Button type="button" block disabled>
              טוען קישור התקנה…
            </Button>
          )}
        </div>
      ) : (
        <div className="banner banner--info t-body" role="status">
          יש לפתוח את העמוד הזה מדפדפן ספארי באייפון כדי להתקין את האפליקציה.
          <br />
          קישור לשיתוף: yahpz.com{IOS_FOOTER_LINK.href}
        </div>
      )}
    </article>
  )
}
