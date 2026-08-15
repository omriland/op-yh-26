# Screen — מדיניות פרטיות

Legal reading surface. Logged-in only. Field or Command follows the host shell (same as the list the user left). Not a nav item.

## Entry

Footer next to the Snyk badge: ghost text `מדיניות פרטיות`. Hidden on immersive form/fill/detail, and hidden while this page is open.

## Layout

- System back: `detail__back` + ghost `חזרה` + ChevronRight (same as event/shift detail).
- One `--type-title`: `מדיניות פרטיות`.
- Caption: product line + `תאריך תחולה: DD.MM.YYYY`.
- Volunteer disclaimer in `banner banner--info`.
- Sections: `--type-section` headings, `--type-body` copy, width `--content-max`.
- Contact block: email as LTR isolate, address in Hebrew.

## Copy source

`src/lib/privacyPolicy.ts` — Hebrew only. Do not reintroduce English legal copy, leftover Responders-TLV fields (clothing, firearms), or a named vendor list.
