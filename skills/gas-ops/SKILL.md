---
name: gas-ops
description: תפעול ותחזוקה — clasp + Git, הפרדת dev/prod, מיגרציות סכימה, בדיקות (יחידה Node, mock לגיליון, בדיקה ידנית ב-Web App), לוגים, observability קל, וביצועים תפיסתיים. השתמש בכל עבודה על פריסה, בדיקות, מיגרציה, לוגים, או מדידת ביצועים.
---

# gas-ops — פריסה, בדיקות, תחזוקה

## 1. clasp + Git

```
src/          ← מקור האמת (מסונכרן ל-Apps Script)
  .clasp.json ← לא ב-Git (Script ID אישי)
  appsscript.json
tools/        ← סקריפטים: deploy.sh, test, audit, migration
tests/        ← בדיקות Node (לא נדחף)
docs/         ← איפיון, החלטות
```

```bash
npm i -g @google/clasp
clasp login                       # פעם אחת
clasp create --type webapp --title "ניהול חדרי מחשבים" --rootDir src
clasp push                        # src/ → Script
clasp pull                        # Script → src/
clasp deploy -d "prod v1.0.3"     # פרסום (@ge...)
clasp deployments                 # רשימת deployments
```

**הפרדת dev/prod:** שני פרויקטים ב-Apps Script (או שני `rootDir`), ושני `deploy` (Head vs. version):
- **dev** — `clasp push` + פתיחת `Deployment > Test deployments` (Web App URL). מיידי, לא יציב.
- **prod** — `clasp deploy` (gרסא קבועה) → ה-URL של `@published`. מזהה רק אחרי אישור.

**כלל בטיחות:**
1. `git commit` לפני `clasp push`.
2. `clasp pull` לפני `push` אם מישהו ערך בקונסולה (אבל עדיף לא לערוך בקונסולה בכלל).
3. גיליון הנתונים (**לא** להריץ `clasp` עליו) — הוא הדאטה. `backup` לפני כל מיגרציה.
4. **App → prod**: לא לפרוס גרסה עם `CONFLICT` ידוע. רשימת changelog ב-`docs/CHANGELOG.md` (אם נוצר).

## 2. מיגרציות סכימה

מיגרציה = שינוי מבנה הגיליון/SCHEMA. תמיד: **backup → migration → אימות**.

```js
// data/migrations.gs
var MIGRATIONS = [
  { id: '001-add-incidents-resolution',
    up: function () { addColumnIfMissing('incidents', 'resolution', ''); } },
  { id: '002-add-msg-reads',
    up: function () { ensureSheet('message_reads', ['id','message_id','user_email','read_at']); } }
];

function runMigrations() {
  var props = PropertiesService.getScriptProperties();
  var done = JSON.parse(props.getProperty('migrations') || '[]');
  backupNow_();                                   // gas-runtime §6
  MIGRATIONS.forEach(function (m) {
    if (done.indexOf(m.id) >= 0) return;
    m.up();
    done.push(m.id);
    props.setProperty('migrations', JSON.stringify(done));
  });
}
```
- **`addColumnIfMissing`** — מוסיף עמודה בקצה, לא באמצע. לא משנים שם עמודה.
- כל מיגרציה **idempotent** — בטוחה להרצה כפולה.
- בענק כשל — לשחזר גיבוי, לתקן את המיגרציה, להריץ שוב.

## 3. בדיקות — מה אפשר ומה לא

### יחידה (Node, מחוץ ל-GAP) — עיקר הערך
```js
// tests/domain.rules.test.mjs  (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlaps } from '../tests/_load.mjs';   // טוען קובץ .gs כ-מודול (Function constructor)
const a = { room_id: 'r1', day_of_week: 'ראשון', start_time: '08:30', end_time: '09:45' };
const b = { room_id: 'r1', day_of_week: 'ראשון', start_time: '09:00', end_time: '10:00' };
test('חפיפת שיבוץ באותו חדר — מזוהה', () => assert.equal(overlaps(a, b), true));
test('שני חדרים שונים — אין חפיפה', () => assert.equal(overlaps(a, { ...b, room_id: 'r2' }), false));
```
- **ללא `SpreadsheetApp`** — פונקציות טהורות בלבד: `validate`, `overlaps`, `generateMonthly`, `formatDate`, `computeStatus`.
- זה מה שהכי קל לשבור בלי לשים לב — לבדוק.

### אינטגרציה (גיליון בדיקה)
- פונקציה `runSmokeTests()` בתוך Apps Script: יוצרת גיליון `_test`, מריצה create/update/remove בחדר, ומנקה.
- להריץ ידנית מהקונסול. לא לתזמן (צורך הרשאות).
- **`_test`** — גיליון נפרד, **לא** הנתונים האמיתיים.

### בדיקה ידנית בדפדפן (הקריטית)
- dev URL: `https://script.google.com/macros/s/AKfy.../exec`
- שלב לא נגמר בלי אישור המשתמשת (`delivery-plan`).
- שלושת **המסלולים** לפחות: כניסה כמורשה, כניסה כזר (צריך דחייה), חזרה אחרי רענון.

### לא
- **לא Playwright/Puppeteer** מול `script.google.com` — מגבלות אימות/הרשאות. **לא** להשקיע.
- **לא** jsdom מלא עם `google.script.run` — מדומה מדי.

## 4. לוגים ו-observability

```js
// domain/logger.gs
function logEvent(kind, fields) {
  console.log(JSON.stringify(Object.assign({ kind: kind, ts: new Date().toISOString() }, fields || {})));
}
```
- פלט `console.log` — ב-Stackdriver (Cloud Logging) של הפרויקט. חיפוש לפי `kind`/`trace`.
- **שלושה סוגים**: `api` (module/action/trace/duration_ms), `error` (`gas-api` §6), `job` (type/cursor).
- **מדידת משך**:
```js
var t0 = Date.now();
var out = fn();
logEvent('api', { module: m, action: a, trace: traceId, ms: Date.now() - t0 });
```
- לתעד במידה. לא לכתוב לתוך הגיליון כל בקשה (נפח).
- **תראות למשתמשת**: "הפעולה ארכה 4 שנ'" מוצג כש>3 שנ'. בלי מונחי מפתח.

## 5. ביצועים — מדידה, לא ניחוש

**תקציבי זמן ל-UI (יעד):**
| פעולה | יעד | מקסימום |
|---|---|---|
| טעינת מסך רשימה | < 1.5 שנ' | 3 שנ' |
| שמירה | < 1 שנ' (עם optimistic) | 3 שנ' |
| טעינת דשבורד | < 2 שנ' | 4 שנ' |
| חיפוש (בצד הלקוח) | < 100ms | — |

- כל סטייה — למדוד קודם: `api` log מצביע על מה איטי (קריאת גיליון? Cache miss?).
- **ההאטות הטיפוסיות:** `getValues` ללא `getDataRange`, `appendRow` בלולאה, `SpreadsheetApp.flush()` בכל איטרציה, בניית DOM מחדש של טבלה של 1,000 שורות.
- **לא** לנחש. לתקן את מה שנמדד.
- אם משהו איטי ואפשר להזיז לקליינט — להזיז (עריכת טבלה, סינון).

## 6. שגרת תחזוקה

| מתי | מה |
|---|---|
| כל שלב | בדיקה ידנית, אישור משתמשת, `git commit` |
| פעם בשבוע | בדיקת `activity_log` לא-תקינים, שגיאות ב-Stackdriver |
| פעם בחודש | בדיקת גיבויים (שחזור לבדיקה), גודל גיליונות |
| פעם בשנה | עדכון טבלת החגים (`hebrew-dates`), בדיקת מכסות |

## 7. דגלים אדומים
- `clasp push --force` על prod בלי commit/backup.
- לשכוח `deploy` (רק `push`) — dev מתעדכן, prod לא. להצהיר "נפרס" רק אחרי `deploy`.
- בדיקות שרצות על הגיליון האמיתי → מחיקה/ערבוב נתונים.
- לוגים עם `Sensitive` (טוקנים, תוכן פניות) — לא לרשום.
- "עובד אצלי" — לבדוק בדפדפן אמיתי עם user אמיתי (אחרת `Session` ריק — ראו `gas-core`).
- `clasp` מול Script ID של prod בטעות — לאמת `cat .clasp.json` בכל סשן.
