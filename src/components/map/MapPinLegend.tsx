import { LIVE_CAR_PATH } from '../../lib/googleMaps'

export function MapPinLegend() {
  return (
    <div className="user-map-legend" role="note" aria-label="מקרא סיכות">
      <ul className="user-map-legend__list">
        <li className="user-map-legend__row">
          <span className="user-map-legend__swatch user-map-legend__swatch--volunteer" aria-hidden="true" />
          <span>מתנדב פעיל / חניכה ברכב פרטי</span>
        </li>
        <li className="user-map-legend__row">
          <span className="user-map-legend__swatch user-map-legend__swatch--phone" aria-hidden="true" />
          <span>חניכה טלפונית</span>
        </li>
        <li className="user-map-legend__row">
          <span className="user-map-legend__swatch user-map-legend__swatch--unavailable" aria-hidden="true" />
          <span>לא זמין</span>
        </li>
        <li className="user-map-legend__row">
          <span className="user-map-legend__swatch user-map-legend__swatch--live" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d={LIVE_CAR_PATH} />
              <circle cx="7" cy="17" r="2" />
              <path d="M9 17h6" />
              <circle cx="17" cy="17" r="2" />
            </svg>
          </span>
          <span>מתנדב במעקב חי · בדרך</span>
        </li>
      </ul>
    </div>
  )
}
