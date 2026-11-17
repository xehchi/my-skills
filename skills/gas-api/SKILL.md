---
name: gas-api
description: שכבת ה-API — dispatcher יחיד {module, action, params} → {ok, data|error}, בדיקת הרשאה בכל entry point, ולידציית קלט וסניטציה, XSS, קודי שגיאה, idempotency, ורישום לוג. השתמש בכל עבודה על dispatcher, פעולה במודול, הרשאות, או פורמט תשובה.
---

# gas-api — dispatcher, הרשאות, שגיאות

## 1. dispatcher (קובץ יחיד: `api/dispatcher.gs`)

```js
var MODULES = { rooms: true, computers: true, resources: true, requests: true,
                incidents: true, tasks: true, knowledge: true, messages: true,
                schedule: true, users: true, system: true };

function call(payload) {
  var traceId = Utilities.getUuid().slice(0, 8);
  try {
    if (!payload || !MODULES[payload.module]) throw new AppError('API', 'בקשה לא תקינה');
    var user = requireUser();                                   // §2
    var fn = this['api_' + payload.module + '_' + payload.action];  // ראו §3
    if (typeof fn !== 'function') throw new AppError('API', 'פעולה לא קיימת');
    var data = fn({ user: user, params: payload.params || {}, traceId: traceId });
    return toWire({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    var known = err instanceof AppError;
    logError(traceId, payload, err);                            // §6
    return { ok: false, error: { code: known ? err.code : 'INTERNAL',
                                 message: known ? err.userMessage : 'אירעה תקלה. נסו שוב.',
                                 traceId: traceId } };
  }
}
```

> בקליינט: `google.script.run.call(payload)` — הפונקציה הגלובלית `call` היא נקודת הכניסה. פעם אחת בלבד בכל הפרויקט.

- **`doGet` לא קורא ל-`call`** (ראו `gas-core` §2). כל נתון עובר דרך `google.script.run`.
- תשובה **תמיד** `{ ok, data }` או `{ ok:false, error:{code,message,traceId} }`. לא לזרוק חריגה לקליינט.

## 2. הרשאה — `requireUser()`

```js
function requireUser() {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  if (!email) throw new AppError('AUTH', 'לא זוהה משתמש מחובר. נסו להיכנס מחדש.');
  var u = usersRepo.getByEmail(email);           // users sheet: email, name, role, active
  if (!u || u.active !== true) throw new AppError('AUTH', 'אין לך הרשאה למערכת');
  return { email: email, name: u.name, role: u.role };
}
```
- **בכל קריאת API** — בלי יוצא מן הכלל. ה-UI לא מבקר גישה.
- כרגע כולם `admin`; אם יוספו תפקידים — טבלת `PERMISSIONS` של `module.action → roles[]` בתוך dispatcher, ובדיקה לפני הקריאה לפונקציה.
- **אסור** לסמוך על `params.userEmail`/`params.role`. זה מגיע מהקליינט — זייף בקלות.
- "מעבר בין משתמשים" — **לא לממש** בלי אישור מפורש (`docs/spec.md` §12).

## 3. קונבנציה לפונקציות פעולה

```js
// api/computers.gs
function api_computers_list(ctx) {
  return computersDomain.list({ roomId: ctx.params.room_id, includeDeleted: false });
}
function api_computers_create(ctx) {
  var input = validate('computers', ctx.params);        // entities.gs — סכימה אחת
  return repoTx(function () {
    var created = computersDomain.create(input, ctx.user);
    logActivity(ctx.user, 'computer', created.id, 'create', null);
    return created;
  });
}
```
- שם: `api_<module>_<action>`. `list/create/get/update/remove/transition`.
- **ולידציה בשרת** גם אם יש בצד הלקוח (שלוחה קוראת ישירות — לא להגן עליה).
- **אין לוגיקה עסקית כאן.** ה-dispatcher מעביר. כל חוק — ב-`domain`.
- **`userId` של הפעולה** — תמיד מ-`ctx.user`, לא מ-`params`.

## 4. קודי שגיאה (מוגדרים ב-`domain/errors.gs`)

| code | משמעות | הודעה למשתמש |
|---|---|---|
| `AUTH` | לא מחובר / לא מורשה | "אין לך הרשאה…" |
| `VALIDATION` | שדה חסר/לא תקין | "יש למלא…" + שדות |
| `NOT_FOUND` | מזהה לא קיים | "הרשומה לא נמצאה" |
| `CONFLICT` | עדכון על גרסה ישנה | "מישהו אחר עדכן… רעננו" |
| `BUSY` | lock תפוס | "המערכת עסוקה…" |
| `RULE` | חוק עסקי (מחיקת חדר עם מחשבים) | טקסט מה-domain |
| `TIMEOUT` | מעל 5 דקות | "פעולה ארוכה — ממשיכה ברקע" (`gas-runtime`) |
| `INTERNAL` | לא צפוי | "אירעה תקלה. נסו שוב." |

`AppError(code, internalMessage, userMessage)` — `internalMessage` ללוג, `userMessage` למשתמש. **שמות שדות/מזהים פנימיים לא מופיעים ב-`userMessage`.**

## 5. ולידציה ושמירת מחרוזות

```js
function validate(entity, input) {
  var s = SCHEMA[entity], out = {};
  s.columns.forEach(function (col) {
    var v = input[col];
    if (v === undefined) v = s.defaults ? s.defaults[col] : null;
    if (s.required.indexOf(col) >= 0 && (v == null || v === ''))
      throw new AppError('VALIDATION', entity + '.' + col + ' missing', 'יש למלא: ' + labelOf(col));
    if (v != null) out[col] = coerce(s.types[col], v, s.enums && s.enums[col]);
  });
  return out;                                            // רק שדות מוכרים — לא "הכל עובר"
}
```
- **Whitelist**: רק עמודות בסכימה נכנסות. אין "העברת אובייקט כפי שהוא" ל-repository.
- **סניטציה של HTML** (שדות `text` עשיר בלבד — `knowledge.body`): `stripHtmlExceptWhitelist()` (b/strong/i/em/u/ul/ol/li/p/h1-h3/a[href]/br/table) — לא `script`, לא `onclick`, לא `javascript:`.
- **אין** להשתמש ב-`innerHTML` בצד הלקוח עם תוכן שכתב משתמש. אם צריך — `textContent`; לתוכן עשיר — sanitize קודם.
- שמות שדות/ערכים באנום — קבועים; לא לשמור טקסט חופשי בערך של enum.

## 6. לוג שגיאות וקורלציה

```js
function logError(traceId, payload, err) {
  console.error(JSON.stringify({
    trace: traceId, ts: new Date().toISOString(), module: payload && payload.module,
    action: payload && payload.action, msg: String(err && err.message),
    stack: err && err.stack && String(err.stack).slice(0, 1500)
  }));
}
```
- `traceId` מוחזר למשתמש בהודעת שגיאה, ומופיע בקונסול (Stackdriver). חיפוש בשם = קורלציה.
- **לא לרשום `params` גולמיים** אם יש בהם תוכן רגיש; שמות מזהים בלבד.
- `logActivity` (יומן פעולות) — לוג עסקי, לאיסטיה של שגיאות. שני דברים שונים.

## 7. idempotency
- הקליינט שולח `params._reqId` (מזהה בקשה), וזהה פעולה ב-`userCache` 60 שנ': אם קיים — מחזיר את התשובה הקודמת. מונע יצירת פנייה כפולה בלחיצה כפולה / ניסיון חוזר.

## 8. דגלים אדומים
- `if (params.role === 'admin')` → זיוף במאגר קליינט. תמיד מ-`ctx.user`.
- לזרוק חריגה מ-`api_*` → הקליינט מקבל "unknown error". לעטוף ב-`AppError`.
- לבדוק הרשאה בנקודת כניסה אחת בלבד (למשל `doGet`) — שאר הפעולות נשארות פרוצות.
- לסנן קלט רק בקליינט — כל אחד יכול לקרוא ל-`call` מכתב אחר.
- הודעת שגיאה עם `err.message` הגולמי מציגה פרטים פנימיים למשתמש.
