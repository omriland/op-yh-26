import type { SmartSearchFilter, SmartSearchVocab } from './smartSearchFilter.ts'

/** Today's date as YYYY-MM-DD in Asia/Jerusalem (en-CA formats as ISO). */
export function jerusalemToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Worked examples. Dates assume today = 2026-11-01 (a Sunday). */
export const SMART_SEARCH_EXAMPLES: { q: string; filter: Partial<SmartSearchFilter> }[] = [
  { q: 'אירוע בכביש 531 בשבוע שעבר', filter: { entity: 'events', road: '531', date_from: '2026-10-25', date_to: '2026-10-31' } },
  { q: 'אירועים מאתמול', filter: { entity: 'events', date_from: '2026-10-31', date_to: '2026-10-31' } },
  { q: 'שלשום', filter: { date_from: '2026-10-30', date_to: '2026-10-30' } },
  { q: 'מה קרה השבוע', filter: { date_from: '2026-11-01', date_to: '2026-11-07' } },
  { q: 'אירועים בחודש שעבר', filter: { entity: 'events', date_from: '2026-10-01', date_to: '2026-10-31' } },
  { q: 'בינואר', filter: { date_from: '2026-01-01', date_to: '2026-01-31' } },
  { q: 'רבעון 3 2025 ייצוא', filter: { intent: 'export', date_from: '2025-07-01', date_to: '2025-09-30' } },
  { q: 'אירועים בקיץ', filter: { entity: 'events', date_from: '2026-06-01', date_to: '2026-08-31' } },
  { q: 'לפני חודשיים', filter: { date_from: '2026-09-01', date_to: '2026-09-30' } },
  { q: '14.1', filter: { date_from: '2026-01-14', date_to: '2026-01-14' } },
  { q: 'סוזוקי שנפגעה', filter: { entity: 'events', vehicle_text: 'סוזוקי suzuki', damaged: true } },
  { q: 'פגוש קדמי', filter: { entity: 'events', damage_location: 'פגוש קדמי' } },
  { q: 'לדני כהן', filter: { person: 'דני כהן' } },
  { q: 'מתי משה התחבר לאחרונה', filter: { entity: 'people', person: 'משה' } },
  { q: 'כמה כרטיסי דלק נקנו החודש', filter: { intent: 'unsupported_question' } },
  { q: 'חילוצים במחוז מרכז', filter: { entity: 'events', event_type: 'חילוץ', district: 'מרכז' } },
  { q: 'לוחית 12-345-67', filter: { entity: 'events', plate: '1234567' } },
  { q: 'דוחות מהאתר הישן באוקטובר', filter: { source: 'archive', date_from: '2026-10-01', date_to: '2026-10-31' } },
  { q: 'xuzueh', filter: { entity: 'events', vehicle_text: 'סוזוקי suzuki' } },
  { q: 'damaged Toyota last week', filter: { entity: 'events', vehicle_text: 'טויוטה toyota', damaged: true, date_from: '2026-10-25', date_to: '2026-10-31' } },
  { q: 'האירועים של יוסי בצפון בחודש שעבר', filter: { entity: 'events', person: 'יוסי', district: 'צפון', date_from: '2026-10-01', date_to: '2026-10-31' } },
  { q: 'אחמ״ש רונית אתמול', filter: { entity: 'events', person: 'רונית', person_role: 'lead', date_from: '2026-10-31', date_to: '2026-10-31' } },
  { q: 'מתנדבים פעילים בלי משמרת השבוע', filter: { entity: 'people', volunteer_status: 'active_volunteer', no_shift_from: '2026-11-01', no_shift_to: '2026-11-07' } },
  { q: 'חניכים טלפוניים', filter: { entity: 'people', volunteer_status: 'phone_training' } },
]

const RULES = `אתה ממיר שאלה של משתמש ביחידה בעברית למסנן חיפוש בפורמט JSON. החזר רק JSON התואם לסכמה. אל תענה על השאלה עצמה.

כללי שפה
- הקלט בדרך כלל בעברית. עברית מדביקה לפני מילים את האותיות ב ה ו כ ל מ ש (בכביש 531, שנפגע, בסוזוקי, לדני). הוצא תמיד ערך חשוף בלי הקידומת: 531, סוזוקי, דני.
- מחרוזת לטינית חסרת פשר עשויה להיות עברית שהוקלדה במקלדת אנגלית (xuzueh = סוזוקי). תרגם אותה למילה העברית.
- שדה vehicle_text כולל גם איות עברי וגם לטיני של אותו רכב, מופרדים ברווח (סוזוקי suzuki).
- plate הוא ספרות בלבד, בלי מקפים ורווחים.
- תאריכים תמיד בפורמט YYYY-MM-DD. בקלט, תאריך מספרי הוא יום קודם לחודש (DD.MM או DD/MM/YY), לעולם לא חודש קודם ליום.
- ערכי event_type, district ו-damage_location חייבים להיות בדיוק מהרשימות למטה, או null.

כללי תאריך
- שבוע הוא ראשון עד שבת (השבוע הישראלי). "בשבוע שעבר" הוא השבוע המלא הקודם, ראשון עד שבת. "השבוע" הוא ראשון עד שבת של השבוע הנוכחי.
- חודש בלי שנה הוא המופע האחרון שכבר עבר (ינואר ב-1 בנובמבר 2026 הוא ינואר 2026). תאריך מספרי בלי שנה (14.1) גם הוא המופע האחרון שעבר.
- רבעון הוא רבעון קלנדרי: 1 ינואר עד מרץ, 2 אפריל עד יוני, 3 יולי עד ספטמבר, 4 אוקטובר עד דצמבר.
- "אתמול", "שלשום", "החודש", "בחודש שעבר", "לפני חודשיים" (החודש הקלנדרי המלא), "בקיץ" (יוני עד אוגוסט האחרון שעבר).
- תאריך עברי (ט״ו בשבט) לא נתמך: שים אותו ב-text.
- date_from ו-date_to כוללים את הקצוות.

כללי שדות
- intent: find כברירת מחדל. export כשמבקשים ייצוא, הורדה או אקסל. unsupported_question כששואלים על סכומים או ספירה (כמה, מה הסכום, ממוצע).
- יוצא מן הכלל: "מתי X התחבר לאחרונה" הוא חיפוש אנשים: entity people, person X.
- entity: events לאירועים, people לאנשים, both כשלא ברור. source: new לאירועים חדשים, archive לאתר הישן או ארכיון, both כברירת מחדל.
- נזק, נפגע, פגוע, פגיעה, מעוך, תאונה (בהקשר של רכב) הם damaged: true. מילות איבר (פגוש, דלת נהג, שמשה) הן damage_location לפי הרשימה.
- person הוא שם אדם (של יוסי, ליוסי, כונן יוסי). person_role הוא responder (כונן, מתנדב) או lead (אחמ״ש) רק אם נאמר במפורש.
- volunteer_status רק כשמבקשים אנשים לפי מעמד: מתנדב פעיל active_volunteer, חניכה בסיסית basic_training, חניכה טלפונית phone_training, חניכה ברכב פרטי personal_vehicle_training, משמרות בלבד shifts_only, מנהלה administration.
- "בלי משמרת" או "לא עשו משמרת" בטווח הם no_shift_from ו-no_shift_to של הטווח, עם entity people.
- text הוא מה שנשאר ולא התאים לשדה אחר. שדה שלא הוזכר הוא null.
- רק ה-JSON, בלי הסבר.`

const list = (xs: string[]) => xs.join(', ')

/**
 * The parser prompt. `system` depends only on the vocab, so it stays byte-identical
 * across queries and days; today's date goes in the user turn with the query.
 */
export function buildSmartSearchPrompt(
  query: string,
  today: string,
  vocab: SmartSearchVocab,
): { system: string; user: string } {
  const examples = SMART_SEARCH_EXAMPLES
    .map((e) => `שאלה: ${e.q}\nJSON: ${JSON.stringify(e.filter)}`)
    .join('\n\n')
  const system = [
    RULES,
    `סוגי אירוע: ${list(vocab.eventTypes)}`,
    `מחוזות: ${list(vocab.districts)}`,
    `מיקומי נזק: ${list(vocab.hitTypes)}`,
    `דוגמאות (בדוגמאות היום הוא 2026-11-01, יום ראשון; מופיעים רק השדות שאינם ברירת מחדל):\n\n${examples}`,
  ].join('\n\n')
  return { system, user: `התאריך היום (Asia/Jerusalem): ${today}\nשאלה: ${query}` }
}
