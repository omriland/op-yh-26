import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import {
  ANDROID_FOOTER_LINK,
  fetchAndroidApkHref,
  isAndroidMobile,
} from '../lib/androidDownload'

type AndroidDownloadPageProps = {
  onBack: () => void
}

export function AndroidDownloadPage({ onBack }: AndroidDownloadPageProps) {
  const android = useMemo(
    () => (typeof navigator === 'undefined' ? false : isAndroidMobile(navigator.userAgent)),
    [],
  )
  const [apkHref, setApkHref] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAndroidApkHref().then((href) => {
      if (!cancelled) setApkHref(href)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <article className="android-download" data-theme="field">
      <div className="detail__back">
        <Button
          variant="ghost"
          onClick={onBack}
          icon={<ChevronRight size={20} strokeWidth={1.75} />}
        >
          חזרה
        </Button>
      </div>

      <header className="android-download__header">
        <h1 className="t-title">אפליקציית אנדרואיד</h1>
        <p className="t-body text-secondary">
          מטעמי אבטחה - האפליקציה אינה חשופה לחנות האפליקציות.
          <br />
          על מנת להתקינה:
        </p>
      </header>

      {android ? (
        <div className="android-download__panel stack-3">
          <ol className="android-download__steps t-body">
            <li>לחצו על «הורדת האפליקציה» בתחתית העמוד והמתינו לסיום ההורדה.</li>
            <li>
              אם הדפדפן מבקש אישור להתקין אפליקציות ממקור זה — אשרו (למשל «אפשר»
              או «הגדרות» ואז הפעלת ההתקנה מהדפדפן).
            </li>
            <li>פתחו את קובץ ה־APK שהורד כדי להתחיל בהתקנה.</li>
            <li>
              אם הטלפון חוסם את ההתקנה או מציג אזהרה — בחרו «התקן בכל זאת»
              (לעיתים מאחורי «פרטים נוספים» או תפריט דומה). זה תקין להתקנה מחוץ לחנות.
            </li>
          </ol>
          <p className="t-caption text-muted">
            את ההתקנה הזו עושים פעם אחת. מהגרסה הבאה האפליקציה מציעה את העדכון בתוכה,
            ואין צורך להוריד קובץ מהדפדפן.
          </p>
          {apkHref ? (
            <a className="btn btn--primary btn--block" href={apkHref} download>
              <Download size={20} strokeWidth={1.75} aria-hidden="true" />
              הורדת האפליקציה
            </a>
          ) : (
            <Button type="button" block disabled>
              טוען קישור הורדה…
            </Button>
          )}
        </div>
      ) : (
        <div className="banner banner--info t-body" role="status">
          יש לפתוח את העמוד הזה מדפדפן באנדרואיד כדי להוריד את האפליקציה.
          <br />
          קישור לשיתוף: yahpz.com{ANDROID_FOOTER_LINK.href}
        </div>
      )}
    </article>
  )
}
