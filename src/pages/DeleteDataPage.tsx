import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PRIVACY_POLICY } from '../lib/privacyPolicy'
import { useAuth } from '../lib/auth'
import { DeleteAccountSection } from '../components/DeleteAccountSection'

type DeleteDataPageProps = {
  onBack?: () => void
}

const DELETE_EMAIL_SUBJECT = 'בקשת מחיקת חשבון - אבן דרך'

export function DeleteDataPage({ onBack }: DeleteDataPageProps) {
  const { session } = useAuth()
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
        <h1 className="t-title">מחיקת חשבון ונתונים</h1>
        <p className="t-caption text-muted">{PRIVACY_POLICY.productLine}</p>
      </header>

      <section className="privacy__section">
        <h2 className="t-section">איך מוחקים את החשבון</h2>
        {session ? (
          <>
            <p className="t-body">
              אפשר למחוק כאן את החשבון ואת המידע האישי שלכם, מיד. אותה אפשרות נמצאת גם במסך הפרופיל באפליקציה ובאתר.
            </p>
            <DeleteAccountSection />
          </>
        ) : (
          <p className="t-body">
            התחברו לאפליקציה או לאתר, פתחו את מסך הפרופיל ובחרו ״מחיקת חשבון״. המחיקה מתבצעת מיד, אחרי אישור כפול.
          </p>
        )}
        <p className="t-body">אין לכם גישה לחשבון? שלחו בקשת מחיקה בדוא״ל לכתובת:</p>
        <p className="t-body">
          <a href={`mailto:${PRIVACY_POLICY.contact.email}?subject=${encodeURIComponent(DELETE_EMAIL_SUBJECT)}`}>
            <span dir="ltr">{PRIVACY_POLICY.contact.email}</span>
          </a>
        </p>
        <ul className="privacy__list">
          <li className="t-body">כתבו את שמכם המלא ואת כתובת הדוא״ל או מספר הטלפון המשויכים לחשבון.</li>
          <li className="t-body">ציינו שהבקשה היא למחיקת חשבון מאפליקציית אבן דרך.</li>
        </ul>
      </section>

      <section className="privacy__section">
        <h2 className="t-section">מה נמחק ומה נשמר</h2>
        <ul className="privacy__list">
          <li className="t-body">
            נמחקים מיד: פרטי הפרופיל והקשר (שם, אות קריאה, דוא״ל וטלפון), רכבים, כתובות, מכשירים רשומים, תמונות,
            סרטונים ומשובים שהעליתם, והכניסה לחשבון בכל המכשירים.
          </li>
          <li className="t-body">
            נשמרים ללא הפרטים האישיים שלכם: תיעוד אירועים ומשמרות שהשתתפתם בהם, שהיחידה נדרשת לו (למשל דוחות קילומטרים
            והחזרי דלק), ורשומות ביקורת ואבטחה.
          </li>
        </ul>
      </section>

      <section className="privacy__section">
        <h2 className="t-section">זמן טיפול</h2>
        <p className="t-body">
          מחיקה מתוך האפליקציה או האתר מתבצעת מיד. בקשות בדוא״ל נבדקות ידנית, ובדרך כלל נתחיל טיפול תוך 14 ימי עסקים.
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
