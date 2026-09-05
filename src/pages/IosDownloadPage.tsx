import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import {
  canEnrollAnotherDevice,
  listMyIosDevices,
  mintIosEnrollProfileUrl,
  volunteerIosScreen,
  type IosDevice,
} from '../lib/iosDevices'
import {
  IOS_ENROLLED_PATH,
  IOS_FOOTER_LINK,
  fetchIosInstallHref,
  isIosDevice,
  isIosSafari,
} from '../lib/iosDownload'
import { stashPostLoginPath } from '../lib/postLoginPath'

type IosDownloadPageProps = {
  onBack: () => void
  signedIn: boolean
  onRequestLogin: () => void
  justEnrolled?: boolean
}

const STATUS_LABEL: Record<IosDevice['status'], string> = {
  pending: 'ממתין לאישור',
  approved: 'מאושר — ממתין לפרסום',
  registered: 'רשום — ניתן להתקין',
  rejected: 'נדחה',
  retired: 'הוצא משימוש',
}

export function IosDownloadPage({
  onBack,
  signedIn,
  onRequestLogin,
  justEnrolled = false,
}: IosDownloadPageProps) {
  const { show } = useToast()
  const iphone = useMemo(
    () => (typeof navigator === 'undefined' ? false : isIosDevice(navigator.userAgent)),
    [],
  )
  const safari = useMemo(
    () => (typeof navigator === 'undefined' ? false : isIosSafari(navigator.userAgent)),
    [],
  )
  const [installHref, setInstallHref] = useState<string | null>(null)
  const [devices, setDevices] = useState<IosDevice[] | null>(null)
  const [enrollBusy, setEnrollBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchIosInstallHref().then((href) => {
      if (!cancelled) setInstallHref(href)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!signedIn) {
      setDevices([])
      return
    }
    let cancelled = false
    void listMyIosDevices()
      .then((rows) => {
        if (!cancelled) setDevices(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setDevices([])
          show('טעינת מכשירים נכשלה. נסו לרענן.', 'alert')
        }
      })
    return () => {
      cancelled = true
    }
  }, [signedIn, show])

  const screen = volunteerIosScreen({
    iphone,
    safari,
    signedIn,
    devices: devices ?? [],
  })

  const activeCount = (devices ?? []).filter(
    (d) =>
      d.status === 'pending' || d.status === 'approved' || d.status === 'registered',
  ).length
  const canEnroll = canEnrollAnotherDevice(activeCount)

  async function startEnroll() {
    setEnrollBusy(true)
    const result = await mintIosEnrollProfileUrl()
    setEnrollBusy(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    window.location.href = result.url
  }

  function requestLogin() {
    stashPostLoginPath(justEnrolled ? IOS_ENROLLED_PATH : '/ios')
    onRequestLogin()
  }

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

      {justEnrolled && (
        <div className="banner banner--info t-body" role="status">
          המכשיר נרשם וממתין לאישור מנהל. תקבלו מייל כשהגרסה תהיה מוכנה להתקנה.
        </div>
      )}

      {screen === 'need_iphone' && (
        <div className="banner banner--info t-body" role="status">
          יש לפתוח את העמוד הזה מדפדפן ספארי באייפון כדי לרשום ולהתקין את האפליקציה.
          <br />
          קישור לשיתוף: yahpz.com{IOS_FOOTER_LINK.href}
        </div>
      )}

      {screen === 'need_safari' && (
        <div className="banner banner--alert t-body" role="alert">
          יש לפתוח את העמוד הזה בדפדפן ספארי. בדפדפנים אחרים ההתקנה והרישום לא
          יעבדו.
        </div>
      )}

      {screen === 'need_login' && (
        <div className="ios-download__panel stack-3">
          <p className="t-body">יש להתחבר כדי לרשום את המכשיר ולהתקין את האפליקציה.</p>
          <Button type="button" block onClick={requestLogin}>
            התחברות
          </Button>
        </div>
      )}

      {screen === 'enroll' && (
        <div className="ios-download__panel stack-3">
          <ol className="ios-download__steps t-body">
            <li>לחצו על «רישום מכשיר» והתקינו את פרופיל ההגדרות שמופיע.</li>
            <li>
              הפרופיל יופיע כ־«לא מאומת» — זה צפוי. המשיכו בהתקנה דרך הגדרות ←
              פרופיל שהורד.
            </li>
            <li>לאחר האישור במערכת תקבלו מייל עם קישור להתקנה.</li>
          </ol>
          {canEnroll ? (
            <Button type="button" block disabled={enrollBusy} onClick={() => void startEnroll()}>
              {enrollBusy ? 'מכין פרופיל…' : 'רישום מכשיר'}
            </Button>
          ) : (
            <div className="banner banner--alert t-body" role="alert">
              ניתן לרשום עד שני מכשירים למשתמש.
            </div>
          )}
        </div>
      )}

      {screen === 'pending' && (
        <div className="banner banner--info t-body" role="status">
          המכשיר ממתין לאישור מנהל המערכת. אין צורך בפעולה נוספת כרגע.
        </div>
      )}

      {screen === 'approved' && (
        <div className="banner banner--info t-body" role="status">
          המכשיר אושר. הגרסה תפורסם בקרוב — תקבלו מייל עם קישור להורדה.
        </div>
      )}

      {screen === 'rejected' && (
        <div className="banner banner--alert t-body" role="alert">
          בקשת הרישום נדחתה. פנו למנהל היחידה לבירור.
        </div>
      )}

      {screen === 'install' && (
        <div className="ios-download__panel stack-3">
          <ol className="ios-download__steps t-body">
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
      )}

      {signedIn && devices && devices.length > 1 && (
        <div className="ios-download__panel stack-2">
          <h2 className="t-subtitle">המכשירים שלי</h2>
          <ul className="ios-download__steps t-body">
            {devices.map((device) => (
              <li key={device.id}>
                {device.device_name || device.product_type || 'מכשיר'} —{' '}
                {STATUS_LABEL[device.status]}
              </li>
            ))}
          </ul>
          {canEnroll && screen !== 'enroll' && (
            <Button
              type="button"
              variant="ghost"
              disabled={enrollBusy}
              onClick={() => void startEnroll()}
            >
              רישום מכשיר נוסף
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
