# Desktop form submit shortcut (⌘/Ctrl+Enter)

Date: 2026-08-10  
Status: implemented

## Goal

On desktop web only, every edit/create form can be submitted with the OS-standard chord, with a small hint next to the primary action.

## Decisions

- Desktop only (`min-width: 1025px`); no shortcut or hint on mobile/tablet
- Mac → `Meta+Enter` (⌘); Windows/Linux → `Control+Enter`
- Always fires the **primary** action (not draft/cancel)
- **Not** used on confirmation dialogs (leave, deactivate, delete)
- Opt-in via `useDesktopFormSubmit` + `SubmitShortcutHint` (not a global click guesser)
- Page-level shortcuts are blocked while any modal is open; form dialogs pass `rootRef` so they still work inside their own modal
- When modals stack, the topmost (`querySelectorAll` last) wins for arbitration

## Surfaces

- Login: sign-in, reset, set-password
- Event create/edit
- Responder fill → סיום דיווח
- Admin user create/edit dialog
- Admin closed-list inline editor

## Copy

Hebrew label `לשמירה מהירה` + LTR key figure (`⌘`/`Ctrl` + `Enter`).
