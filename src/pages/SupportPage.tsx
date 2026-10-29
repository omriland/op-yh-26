import { ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { DELETE_DATA_PATH } from '../lib/deleteDataPage'
import { PRIVACY_PATH } from '../lib/privacyPageToken'
import { PRIVACY_POLICY } from '../lib/privacyPolicy'

type SupportPageProps = {
  onBack?: () => void
}

const SUPPORT_EMAIL_SUBJECT = 'פנייה לתמיכה - אבן דרך'

/** Public, logged out: the App Store support URL. Contact details come from the privacy policy. */
export function SupportPage({ onBack }: SupportPageProps) {
  return (
    <article className="privacy">
      {onBack ? (
        <div className="detail__back">
          <Button
            variant="ghost"
            onClick={onBack}
            icon={<ChevronRight size={20} strokeWidth={1.75} />}
          >
            חזרה
          </Button>
        </div>
      ) : null}

      <header className="privacy__header">
        <h1 className="t-title">תמיכה</h1>
        <p className="t-caption text-muted">{PRIVACY_POLICY.productLine}</p>
      </header>

      <section className="privacy__section">
        <h2 className="t-section">מה זו אבן דרך</h2>
        <p className="t-body">
          אבן דרך היא המערכת של היחידה הארצית לפינוי צירים (יחפ״צ), יחידת מתנדבים שמפנה רכבים
          תקועים ומפגעים מכבישים מהירים. במערכת מנהלים אירועים ומשמרות, כל מתנדב משלים את התיעוד
          שלו, ומעדכנים זמינות ופרטי קשר.
        </p>
      </section>

      <section className="privacy__section">
        <h2 className="t-section">למי היא מיועדת</h2>
        <p className="t-body">
          לאנשי היחידה המורשים בלבד. אין הרשמה עצמית: מנהלי היחידה פותחים את החשבונות, והכניסה
          היא בדוא״ל ובסיסמה, באתר ובאפליקציה.
        </p>
      </section>

      <section className="privacy__section">
        <h2 className="t-section">איך מקבלים עזרה</h2>
        <ul className="privacy__list">
          <li className="t-body">שכחתם סיסמה? במסך הכניסה בחרו ״שכחתי סיסמה״ ויישלח אליכם קישור לאיפוס בדוא״ל.</li>
          <li className="t-body">אנשי יחידה מחוברים יכולים לדווח על תקלה או להציע שיפור מכפתור המשוב באפליקציה.</li>
          <li className="t-body">לכל שאלה אחרת, כתבו לנו בדוא״ל:</li>
        </ul>
        <p className="t-body">
          <a href={`mailto:${PRIVACY_POLICY.contact.email}?subject=${encodeURIComponent(SUPPORT_EMAIL_SUBJECT)}`}>
            <span dir="ltr">{PRIVACY_POLICY.contact.email}</span>
          </a>
        </p>
      </section>

      <section className="privacy__section">
        <h2 className="t-section">פרטיות ומחיקת נתונים</h2>
        <ul className="privacy__list">
          <li className="t-body">
            <a href={PRIVACY_PATH}>מדיניות פרטיות</a>
          </li>
          <li className="t-body">
            <a href={DELETE_DATA_PATH}>בקשת מחיקת נתונים</a>
          </li>
        </ul>
      </section>

      <div className="privacy__contact">
        <p className="t-body">
          <span dir="ltr">{PRIVACY_POLICY.contact.email}</span>
        </p>
        <p className="t-body">{PRIVACY_POLICY.contact.address}</p>
      </div>
    </article>
  )
}
