---
name: gas-core
description: שלד Apps Script — מודל ההרצה (V8, 6 דקות, google.script.run, גבול טיפוסים, Date), ארכיטקטורת השכבות web/api/domain/data, מבנה תיקיות, appsscript.json, עזרי המרה, ושכבת Cache. השתמש בכל עבודה על תשתית הפרויקט, doGet, dispatcher, או החלטת מבנה.
---

# gas-core — שלד הפלטפורמה

> המקור לארכיטקטורה: `docs/architecture-decision.md`. אסור לסטות: `web` → `api` → `domain` → `data`. אין דילוג שכבות.

## 1. מודל ההרצה — עובדות שמעצבות את הקוד

| נושא | העובדה | ההשלכה |
|---|---|---|
| V8 | ES2019+, `?.`, `??` — כן. **אין `import`.** כל קובץ `.gs` נטען לסקופ גלובלי אחד. | שמות ייחודיים: `roomsRepo`, לא `Repo`. אין משתנים גלובליים לשינוי מצב. |
| זמן ריצה | עד 6 דקות לריצת Web App. | פעולה כבדה — chunking/trigger (`gas-runtime`). |
| גבול תקשורת | רק JSON-able: `string, number, boolean, null, Array, plain Object`. | **אסור** להחזיר `Date`, `Map`, `Set`, instance של class. `undefined` בתוך אובייקט — נמחק בשקט. |
| `Date` | בתא גיליון — אובייקט `Date`; דרך `google.script.run` — מחרוזת או איבוד אזור זמן. | **כלל ברזל:** בתשקורת — רק `number` (Unix ms). המרות ב-`domain/dates.gs`. |
| `Uint8Array` | עובר בקליינט; `Blob` לא. | קבצים — `file-import`, `excel-export`. |
| `google.script.run` | אסינכרוני, מחזיר `void`. | עטיפה אחת ב-`web/api-client.js` שמחזירה Promise. **אין קריאה ישירה** בקוד UI. |
| `Session.getActiveUser()` | מחזיר מייל רק כש-`executeAs: USER_ACCESSING`. אחרת — מחרוזת ריקה. | לבדוק ריקנות תמיד (`gas-api`). |

## 2. השכבות

```
web/*.html|js        UI. אין לוגיקה עסקית, אין קריאה ישירה ל-google.script.run
  ↓ api.call({module, action, params})
api/*.gs             dispatcher: הרשאה, ולידציה גסה, פורמט { ok, data | error }
  ↓
domain/*.gs          ישויות, חוקים, מעברים, חישובים. לא מכיר Sheets!
  ↓
data/*.gs            SheetsRepository: SpreadsheetApp, LockService, המרות תא. רק כאן.
```

- `doGet(e)` — **רק** מחזיר HTML (`HtmlService`). אין בו קריאת נתונים ואין בו בדיקת הרשאה; מי שמחובר אך לא מורשה רואה דף "אין הרשאה" אחרי `whoami`.
- `domain` לא נוגע ב-`SpreadsheetApp`; `data` לא מחליט החלטה עסקית.
- `domain/entities.gs` — סכימה לשמות שדות/טיפוסים/חובה לכל ישות. גורם אמת אחד ל: ולידציה, repository, גיבוי.

## 3. מבנה קבצים

```
src/
  Code.gs            doGet + include()
  appsscript.json
  api/    dispatcher.gs rooms.gs computers.gs resources.gs requests.gs
          incidents.gs tasks.gs knowledge.gs messages.gs schedule.gs users.gs system.gs
  domain/ entities.gs errors.gs rules.gs dates.gs
  data/   schema.gs sheets-repo.gs cache.gs
  web/    index.html app.js api-client.js styles.css components/*.js
```

`appsscript.json` — ערכים מחייבים:
```json
{
  "timeZone": "Asia/Jerusalem",
  "locale": "he",
  "runtimeVersion": "V8",
  "webapp": { "executeAs": "USER_ACCESSING", "access": "ANYONE_ANONYMOUS" }
}
```
- `ANYONE_ANONYMOUS` + הגנת API = כל אחד עם הקישור יכול לטעון את ה-HTML, אבל לא לראות נתון אחד בלי להיות ב-`users`. גישה חלופית (צר יותר): `DOMAIN` — רק חשבונות המוסד. להעדיף `DOMAIN` כשכל הצוות באותו דומיין.
- `oauthScopes` — מינימלי ומפורש (spreadsheets.currentonly אם אתר; drive.file אם גיבוי; script.send_mail רק בשלב המייל).

## 4. עזרי המרה (`domain/dates.gs`, `utils.gs`)

```js
function toMs(v) {                      // תא גיליון / Date / מספר  ->  number | null
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (Object.prototype.toString.call(v) === '[object Date]') return v.getTime();
  return null;                          // מחרוזת — לא נכנסת: timestamps נשמרים כמספר
}

function toWire(obj) {                  // כל תשובת API עוברת כאן
  return JSON.parse(JSON.stringify(obj, function (k, v) {
    if (Object.prototype.toString.call(v) === '[object Date]') return v.getTime();
    return v === undefined ? null : v;
  }));
}
```
- `toWire` בכל `return` ב-`api/`. זה מה שמונע "התאריך ריק ב-UI".
- שדות "תאריך יעד" (`due_date`) — טקסט `dd/mm/yyyy` (`hebrew-dates`).

## 5. שכבת Cache (`data/cache.gs`)

```js
```js
function cacheKey(entity, params) {
  var ver = PropertiesService.getScriptProperties().getProperty('ver:' + entity) || 0;
  return 'v' + ver + ':' + entity + ':' + stableJson(params);   // stableJson = מפתחות ממוינים
}

function cached(entity, params, ttlSec, compute) {
  var cache = CacheService.getScriptCache();
  var key = cacheKey(entity, params);
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var data = compute();
  var json = JSON.stringify(data);
  if (json.length < 90 * 1024) cache.put(key, json, Math.min(ttlSec, 21600));
  return data;
}

function invalidate(entity) {                        // בכל כתיבה מוצלחת
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ver:' + entity, String(Number(props.getProperty('ver:' + entity) || 0) + 1));
}
```

- `scriptCache` — משותף לצוות. `userCache` — לנתונים אישיים בלבד ("נקרא" אישי, תזכורות שלי); אחרת דליפה בין משתמשים.
- **לא לשמור:** > 100KB לערך, הרשאות, תוצאה מיד אחרי כתיבה (לקרוא טרי), כלום יותר מ-6 שעות.
- TTL: דשבורד 60 שנ'; רשימות 300 שנ'; קטלוגים (חדרים/תוכנות) 3600 שנ'.

## 6. דגלים אדומים
- להחזיר `Date`/`Map`/`Set` מ-`api` → שדות ריקים בלקוח.
- `SpreadsheetApp` בתוך `domain` → שבירת המודולריות; המעבר העתידי נוגע בכל השכבות.
- `google.script.run` מפוזר ב-UI → אין טיפול אחיד בשגיאות (`gas-api`).
- להניח ש-`Session` מחזיר מייל. לבדוק ריקנות — אחרת כל אחד עובר.
- מפתח cache בלי גרסה → אחרי כתיבה ה-UI מציג ישן עד TTL.

## 7. קשרים
`gas-data` · `gas-api` · `gas-client` · `gas-runtime` · `hebrew-dates` · `gas-ops`.
