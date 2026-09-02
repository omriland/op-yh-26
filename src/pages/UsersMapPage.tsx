import { OpsMapPanel } from '../components/map/OpsMapPanel'

export function UsersMapPage() {
  return (
    <div className="user-map-page stack-4">
      <div>
        <h1 className="t-title">מפה</h1>
        <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-2)' }}>
          חפשו כתובת כדי לראות מי המתנדבים הקרובים. כל סיכה היא כתובת אחת של משתמש פעיל.
        </p>
      </div>
      <OpsMapPanel />
    </div>
  )
}
