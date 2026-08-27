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
          <span className="user-map-legend__swatch user-map-legend__swatch--live" aria-hidden="true" />
          <span>בדרך</span>
        </li>
        <li className="user-map-legend__row">
          <span className="user-map-legend__swatch user-map-legend__swatch--cluster" aria-hidden="true" />
          <span>קבוצת כתובות</span>
        </li>
      </ul>
    </div>
  )
}
