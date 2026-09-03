import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PRIVACY_POLICY } from '../lib/privacyPolicy'

type DeleteDataPageProps = {
  onBack?: () => void
}

const DELETE_EMAIL_SUBJECT = 'בקשת מחיקת נתונים - אבן דרך'

export function DeleteDataPage({ onBack }: DeleteDataPageProps) {
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    return () => {
      robots.remove()
    }
  }, [])

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
        <h1 className="t-title">בקשת מחיקת נתונים</h1>
        <p className="t-caption text-muted">{PRIVACY_POLICY.productLine}</p>
      </header>

      <section className="privacy__section">
        <h2 className="t-section">איך מבקשים מחיקה</h2>
        <p className="t-body">
          כדי לבקש מחיקה של המידע האישי המשויך לחשבון שלכם, שלחו הודעת דוא״ל לכתובת:
        </p>
        <p className="t-body">
          <a href={`mailto:${PRIVACY_POLICY.contact.email}?subject=${encodeURIComponent(DELETE_EMAIL_SUBJECT)}`}>
            <span dir="ltr">{PRIVACY_POLICY.contact.email}</span>
          </a>
        </p>
        <ul className="privacy__list">
          <li className="t-body">כתבו את שמכם המלא ואת כתובת הדוא״ל או מספר הטלפון המשויכים לחשבון.</li>
          <li className="t-body">ציינו שהבקשה היא למחיקת נתונים מאפליקציית אבן דרך.</li>
          <li className="t-body">אם יש מידע מסוים שברצונכם למחוק בלבד, פרטו זאת בהודעה.</li>
        </ul>
      </section>

      <section className="privacy__section">
        <h2 className="t-section">מה נמחק ומה עשוי להישמר</h2>
        <ul className="privacy__list">
          <li className="t-body">נמחק או ננתק מהחשבון נתוני פרופיל, פרטי קשר, רכבים וכתובות אישיות לפי הצורך.</li>
          <li className="t-body">מדיה שהעליתם, כגון תמונות או קבצי שמע, תימחק כאשר היא משויכת לבקשה ולחשבון שלכם.</li>
          <li className="t-body">רשומות תפעול ואבטחה שכבר נדרשות לצורכי תיעוד, מניעת הונאה או עמידה בדרישות דין עשויות להישמר לתקופת שימור מוגבלת גם לאחר סגירת החשבון.</li>
        </ul>
      </section>

      <section className="privacy__section">
        <h2 className="t-section">זמן טיפול</h2>
        <p className="t-body">
          בקשות נבדקות ידנית. בדרך כלל נתחיל טיפול תוך 14 ימי עסקים ונעדכן אם נדרש אימות נוסף
          לפני השלמת המחיקה.
        </p>
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
