import { ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PRIVACY_POLICY } from '../lib/privacyPolicy'

type PrivacyPolicyPageProps = {
  onBack: () => void
}

export function PrivacyPolicyPage({ onBack }: PrivacyPolicyPageProps) {
  return (
    <article className="privacy">
      <div className="detail__back">
        <Button
          variant="ghost"
          onClick={onBack}
          icon={<ChevronRight size={20} strokeWidth={1.75} />}
        >
          חזרה
        </Button>
      </div>

      <header className="privacy__header">
        <h1 className="t-title">{PRIVACY_POLICY.title}</h1>
        <p className="t-caption text-muted">{PRIVACY_POLICY.productLine}</p>
        <p className="t-caption text-muted">תאריך תחולה: {PRIVACY_POLICY.effectiveDate}</p>
      </header>

      <p className="banner banner--info t-body">{PRIVACY_POLICY.disclaimer}</p>

      {PRIVACY_POLICY.sections.map((section) => (
        <section key={section.heading} className="privacy__section">
          <h2 className="t-section">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="t-body">
              {paragraph}
            </p>
          ))}
          {'items' in section && section.items ? (
            <ul className="privacy__list">
              {section.items.map((item) => (
                <li key={item} className="t-body">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <div className="privacy__contact">
        <p className="t-body">
          <span dir="ltr">{PRIVACY_POLICY.contact.email}</span>
        </p>
        <p className="t-body">{PRIVACY_POLICY.contact.address}</p>
      </div>
    </article>
  )
}
