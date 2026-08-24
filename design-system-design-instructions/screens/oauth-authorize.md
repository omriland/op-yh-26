# Screen — OAuth authorize (אישור גישה)

Partner-app consent after login. Same portal as login: Command stage, Field document card. No app shell / tab bar.

## Theme

- Page = **Command** (`data-theme="command"` on `.login`)
- Card = **Field** (`data-theme="field"` on `.login__card`)
- Reuse `.login` / `.login__stage` / `.login__masthead` / `.login__card` — do not invent a third portal.

## Entry

`https://yahpz.com/oauth/authorize?client_id=&redirect_uri=&state=&scope=responder:fill`  
Logged-in volunteers connect from **פרופיל → חבר לטלגרם** (no extra login). This URL is for when Telegram sent them here while logged out, then this screen after OTP / password setup.

## Layout

Masthead: **אבן דרך** + unit lockup (same as login).

Card:

1. `--type-title` equivalent via `.login__heading`: `אישור גישה`
2. Body `--type-body` / `--text-secondary`: היישום **{name}** ישלים דיווחי אירועים בשמך בטלגרם למשך 60 ימים.
3. Primary block: `אשר והמשך לטלגרם` (loading `מאשר…`)
4. Ghost: `לא עכשיו`

One primary control.

## States

- Loading client name: body `טוען פרטי יישום…`; primary disabled
- Invalid link: body is the error; primary disabled
- Impersonation: alert `לא ניתן לאשר יישום בזמן התחזות.` Primary disabled
- Edge error: `alert--error` keep the form
- Denied: heading `הגישה לא אושרה`; caption `לא חיברנו את היישום לחשבון. אפשר לסגור את החלון ולחזור לטלגרם.` No primary
- Success: browser navigates to `https://t.me/<bot>?start=yp_…`

## Out of scope

Partner HTTP is not a product screen. No English on this card.
