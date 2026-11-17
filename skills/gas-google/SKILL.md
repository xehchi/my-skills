---
name: gas-google
description: שילוב Gmail ב-Apps Script — GmailApp (sendEmail/search/send), קישור mailto בשלב 1, ותוסף Gmail אופציונלי (CardService) כשלב מאוחר. השתמש רק כשעוסקים בשליחת מייל מהמערכת או בתוסף Gmail.
---

# Gmail — שלב מאוחר בלבד

> **הפרויקט עצמו כבר רץ על Google Apps Script.** הסקיל הזה נוגע רק לחיבור ל-Gmail — לא לפלטפורמה (ראו `gas-core`).

## 1. אסור לפני שהמערכת עובדת בנטפרי
- `docs/spec.md` §6: "קישור ל-Gmail / שליחת מייל — שלב מאוחר בלבד... `GmailApp` דורש הרשאות שעלולות להיחסם".
- **בשלב 1** — קישור בלבד: `mailto:` או קישור לשרשור (`https://mail.google.com/mail/u/0/#all/<threadId>`).
- אין Gmail API, אין OAuth ידני, אין טוקנים. `GmailApp` מובנה.

## 2. שליחה

```js
function notifyByEmail_(to, subject, body) {
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body });     // פשוט
  } catch (e) {
    logEvent('mail_error', { to: to, msg: String(e && e.message) });
    throw new AppError('MAIL', 'send failed', 'המייל לא נשלח. אפשר לשלוח ידנית.');
  }
}
```
- **`MailApp`** מספיק לשליחת מייל. **`GmailApp`** כשצריך גישה לתיבה: `GmailApp.search(...)`, `sendEmail(msg, {from, name, htmlBody})`.
- **הרשאות:** `gmail.send` / `gmail.readonly` / `script.send_mail`. כל אחת דורשת אישור מחדש של כל משתמש (`security-auth` §4).
- **שליחה בשם** — `GmailApp.sendEmail(msg, { from: alias })` — רק לחשבון שמוגדר כאlias.
- **`htmlBody`** — סניטציה כמו בכל HTML (`security-auth` §6). לא לשלוח דוארינו-שלנו עם HTML שמכיל קלט משתמש גולמי.

## 3. קריאת מיילים (אם יבוא)
```js
var threads = GmailApp.search('subject:(תקלה) newer_than:2d', 0, 20);
threads.forEach(function (t) {
  var msgs = t.getMessages();
  var last = msgs[msgs.length - 1];
  // last.getSubject(), last.getFrom(), last.getPlainBody(), last.getBody()
});
```
- **`getPlainBody()`** ולא `getBody()` — HTML מלא של Gmail.
- **מכסה:** 20,000 קריאות/יום (רגיל), 100 מיילים/יום. לא לעשות polling על Gmail.
- **`GmailApp.getInboxUnreadCount()`** — זול, למונה.

## 4. תוסף Gmail (אופציונלי, שלב 9)
- פרויקט Apps Script **נפרד** עם `gmail.addons.current.message` manifest.
- `onGmailMessageOpen(e)` → `CardService` → `newCardBuilder()`.
- **כפתור "פתח את המערכת"** — `CardService.newOpenLink().setUrl(webAppUrl)`. אין לוגיקה עסקית בתוסף.
- **לא** להוסיף את התוסף לפרויקט הראשי — שתי השלכות: manifest שונה, ואישור נפרד.
- כל משתמש מאשר את התוסף בנפרד, ועובד רק בתוך Gmail.

## 5. דגלים אדומים
- להוסיף `gmail.*` ל-scopes לפני שהמשתמש אישר ספציפית.
- לשלוח מייל באופן אוטומטי מהטריגר בלי שהמשתמש ידע (ספאם, מכסה).
- `getBody()` שמכיל קוד/תמונות חיצוניות — לא להציג אותו ישירות ב-UI.
- להסתמך על `MailApp` כשהצוות על כמה דומיינים — לבדוק אפשרות שליחה.
- להציג "נשלח" כשרק נקראת הפונקציה — לחכות לתשובה מוצלחת.
