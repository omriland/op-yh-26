/**
 * One odometer order rule for every surface that logs two readings.
 *
 * An equal pair is a real record: a vehicle that never left the spot, or a
 * responder who logs 0 in both fields. Only a reversed pair is a typo, so the
 * copy names the rule it enforces — smaller, not equal.
 */
export const ODOMETER_ORDER_ERROR = 'מד אוץ סיום אינו יכול להיות קטן ממד אוץ התחלה'
