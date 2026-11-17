---
name: security-auth
description: אימות והרשאות ב-Apps Script Web App — Session.getActiveUser, גיליון users, הרשאה בכל נקודת כניסה, scopes מינימליים, סניטציה ו-XSS, סודות ב-PropertiesService, והרשאות Gmail/Drive. השתמש בכל עבודה על כניסה, הרשאות, סודות או הגנה על נתונים.
---

# security-auth — אימות והרשאות (GAP)

## 1. זהות — `Session.getActiveUser()`

```js
function requireUser() {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  if (!email) throw new AppError('AUTH', 'no active user', 'לא זוהה משתמש מחובר. התחברו מחדש לחשבון גוגל.');
  var u = usersRepo.getByEmail(email);   // users sheet: email, name, role, active
  if (!u || u.active !== true) throw new AppError('AUTH', 'not authorized: ' + email, 'אין לך הרשאה למערכת. פנו למנהל.');
  return { email: email, name: u.name, role: u.role };
}
```

**תנאי הכרחי — `appsscript.json`:**
```json
{ "webapp": { "executeAs": "USER_ACCESSING", "access": "DOMAIN" } }
```
| `executeAs` | `getActiveUser()` | מתי |
|---|---|---|
| `USER_ACCESSING` | **המייל האמיתי** | **חובה** — זה המצב שלנו |
| `USER_DEPLOYING` | מחזיר את מי שפרס — **אסור!** | כל המשתמשים נראים אותו דבר |

- `access: "DOMAIN"` — רק חשבונות המוסד יכולים לטעון את הדף (הכי צר). `ANYONE_ANONYMOUS` — כל אחד, אבל ה-API חסום. אם הצוות על כמה דומיינים — `ANYONE`.
- **אם `getEmail()` ריק** (execution מהקונסול, או משתמש אנונימי) — **לדחות**, לא "לתת לבדיקה".
- **`Session.getEffectiveUser()`** — מי בעל הסקריפט. **לא** משמש לזיהוי.
- **`Session.getTemporaryActiveUserKey()`** — מזהה פסאודונימי, לא מתאים להרשאות.

## 2. איפה בודקים

| נקודת כניסה | בדיקה |
|---|---|
| `doGet` | לא בודק — מחזיר HTML בלבד. הדף טוען `whoami`, שבאמצעות Google מתגלה |
| `call(payload)` (dispatcher) | **`requireUser()` לפני כל פעולה** — בלי יוצא מן הכלל |
| `google.script.run.<f>` ישירות | **אסור** — כל פונקציה גלובלית חשופה לפגיעה. אלא אם היא `private` (שם עם `_` בסוף — לא הופך לחסין! הקונבנציה לא אכיפה) |
| triggers | `requireUser` לא זמין (אין משתמש). ה-trigger בודק שהוא עצמו (הרצה פנימית) |
| `onEdit` / `onOpen` | לא בשימוש |

- **כל** פונקציה אשר נראית כ-public ב-Script (כל `function xxx()` בלי `_` בסוף) — נגישה גם למשתמש לא מורשה דרך `google.script.run.xxx()`. לכן: **fפונקציות עזר תמיד מסתיימות ב-`_`**, וכל `api_*` בודק הרשאה (דרך ה-dispatcher).

## 3. הרשאות עדינות (לכשתצטרך)
כרגע כולם `admin` — טריוויאלי. אם משתנה:
```js
var PERMISSIONS = {
  'users.delete':  ['admin'],
  'incidents.close': ['admin', 'member'],
  '*':             ['admin', 'member']
};
function can(role, key) { return (PERMISSIONS[key] || PERMISSIONS['*']).indexOf(role) >= 0; }
```
- בדיקה ב-dispatcher לפי `module + '.' + action`, לפני הקריאה לפונקציה.
- **לא** להסתיר כפתור בלבד — הפעולה חשופה ל-API.
- **"מעבר בין משתמשים"** — **לא לממש** בלי אישור מפורש (`docs/spec.md` §12). אם יאושר — רק דרך Google: מייל ה-`submitted_by` הוא טקסט, לא זהות.

## 4. scopes — מינימום

```json
// appsscript.json — מה שנדרש לפי שלב
"oauthScopes": [
  "https://www.googleapis.com/auth/spreadsheets.currentonly",  // או spreadsheets אם openById
  "https://www.googleapis.com/auth/drive.file"                 // רק קבצים שהסקריפט יצר (גיבוי)
]
```
- `script.send_mail`/`gmail.modify` — **רק** כשמפעילים שליחת מייל (שלב 9). לבדוק את מסך ההרשאות עם המשתמשים.
- **`currentonly`** — לא מאפשר `openById` לגיליון אחר. אם הנתונים בגיליון אחר — `spreadsheets` (מלא).
- להציג "המערכת מבקשת:X" לפני האישור — להסביר למשתמשים מה ואיך להסיר אחר כך (`myaccount.google.com/permissions`).

## 5. סודות
- **`PropertiesService.getScriptProperties()`** — טוקנים/מפתחות (נדירים; בשלב 1 אין).
- **לא** בקוד, לא ב-git, לא ב-`clasp` (קובץ `appsscript.json` עולה ל-git — אין בו סודות).
- **`Session.getScriptTimeZone()`** — לא סוד, אבל לזכור.

## 6. XSS וסניטציה
- כל תוכן שכתב משתמש (פנייה, תיאור תקלה, מאמר ידע) — **סניטציה** בצד השרת (`gas-api` §5) **וצד הלקוח** ב-`textContent`.
- `innerHTML` — **רק** עם HTML שעבר סניטציה. דפוס: מאמרי ידע מיוצגים כ-HTML מאושר; COOKIE — לא.
- קישור `mailto:` / URL — לבדוק רציף `^https?://` / `^mailto:`. **לא** להריץ `javascript:`.
- **גיליון כתגובת HTML** — ערכים שהמשתמש הזין (`=cmd|...`) יכולים להיות מפורשים כפורמולה. יש להריץ `setNumberFormat('@')` או לוודא שכל טקסט שמתחיל ב-`=,+,-,@` נכתב כטקסט. **פרצת CSV-injection.**
- `=IMPORTXML` בגיליון של משתמש — מי שמפעיל יכול לשלוף נתונים פנימיים. לא לאפשר לכתוב "עמודה" כמחרוזת שנכנסת כמו שהיא.

## 7. דגלים אדומים
- `executeAs: USER_DEPLOYING` — כל המשתמשים זהים. **הטעות השכיחה ביותר.**
- `getActiveUser().getEmail()` ריק — לא לדלג "כי זה בדיקה". לדחות.
- להסתמך על `params.user` מהקליינט.
- `<div onclick>` → `eval`/`innerHTML` → XSS מלא (סקריפטים שעברו בסניטציה).
- למסור את כתובת הגיליון/מזההו בקליינט.
- scopes רחבים "ליתר ביטחון" — מסך אישור מפחיד, וסינון נטפרי עלול לחסום.
- `drive.file` לא מאפשר לשמור לקובץ/תיקייה שהמשתמש בחר ידנית? כן מאפשר קבצים שהסקריפט יצר — זה מה שאנחנו צריכים.
