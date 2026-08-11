# Mobile admin users card — design

Date: 2026-08-11  
Status: approved for implementation (aligns with `design-system-design-instructions/screens/admin.md` → משתמשים)

## Problem

On mobile, user cards feel packed inside (name / role chips / email), and the ⋮ overflow menu present on desktop rows is missing — invite resend, deactivate/reactivate, and delete are unreachable without opening edit.

## Decision

Restructure the mobile user card only (desktop table unchanged):

1. **Chrome:** `<div class="card user-card">` instead of a wrapping `<button>` (so ⋮ can be a real button without nested interactive content).
2. **Header row:** avatar + name/callsign at inline-start; `OverflowMenu` at inline-end. No detail-style hairline under the head (that pattern belongs to `responder-card` on detail screens).
3. **Body:** role/status chips, then email caption. Vertical gaps: head → chips `--space-3`, chips → email `--space-3`. Card stack uses existing `--space-3` list gap.
4. **Interaction:** tap on the card body (not the menu) opens edit — same as today. Menu `stopPropagation` keeps actions independent.
5. **Menu items:** identical to desktop — עריכה; when invite-pending: שליחת הזמנה מחדש + העתקת קישור הזמנה; השבתת משתמש / הפעלה מחדש; מחיקת משתמש.

## Out of scope

- Page gutter / shell padding changes (confirmed not the issue).
- Desktop table layout.
- New user actions beyond the existing desktop menu.
