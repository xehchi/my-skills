---
name: gas-data
description: שכבת הנתונים ב-Apps Script — Google Sheets כטבלה, סכימת עמודות, SheetsRepository, batch (getValues/setValues), אינדקסים בזיכרון, כתיבה בטוחה עם optimistic concurrency, רכה/קשה מחיקה, ובחירת אחסון (Sheets/Properties/Cache/Drive). השתמש בכל עבודה על גיליון, repository, סכימה או שמירת נתונים.
---

# gas-data — Sheets כשכבת נתונים

## 1. בחירת אחסון

| אחסון | מתאים ל | לא מתאים ל |
|---|---|---|
| **Sheets** | ישויות עם שורות (~100 מחשבים, תקלות מצטברות) | קונפיגורציה, מונה, נעילות |
| **PropertiesService** | קונפיגורציה, גרסאות cache, אינדקסים קטנים | יותר מ-9KB לערך |
| **CacheService** | תוצאות קריאה, TTL קצר (`gas-core` §5) | אמת |
| **Drive** | גיבוי גיליון (xlsx/csv), נספחים | נתונים חיים |

**גיליון = טבלה.** גיליון לכל ישות (ראו `docs/architecture-decision.md` §5). אם גיליון עובר ~50 אלף שורות — לפצל לארכיון לפי שנה, לא לפני.

## 2. סכימה (`data/schema.gs`) — גורם אמת אחד

```js
var SCHEMA = {
  computers: {
    sheet: 'computers',
    idPrefix: 'cmp',
    columns: ['id', 'room_id', 'label', 'status', 'notes', 'tags', 'created_at', 'updated_at', 'deleted_at'],
    types:   { room_id: 'ref', status: 'enum', tags: 'list', created_at: 'ms', updated_at: 'ms', deleted_at: 'ms' },
    required: ['room_id', 'label'],
    enums: { status: ['תקין', 'תקול', 'בתחזוקה', 'מושבת'] },
    defaults: { notes: '', tags: [] }
  },
  // ...
};
```
- **כל שינוי עמודה** = עדכון הסכימה + מיגרציה (`gas-ops`). עמודה קיימת — לא משנים שמה, מוסיפים חדשה.
- טיפוסים: `text`, `num`, `ms` (Unix ms), `date` (`dd/mm/yyyy`), `bool`, `enum`, `ref`, `list` (JSON-array בעמודה בודדת), `json`.
- `id` — `idPrefix + '_' + 11 תווים אקראיים` (Base36). לא UUID4 מלא: קריא, קצר, ייחודי מספיק לאלפי שורות.

## 3. SheetsRepository (`data/sheets-repo.gs`)

```js
function repoSheet(entity) {
  var s = SCHEMA[entity];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(s.sheet) || ss.insertSheet(s.sheet);
  if (sh.getLastRow() === 0) {                       // יצירת כותרת בפעם הראשונה
    sh.getRange(1, 1, 1, s.columns.length).setValues([s.columns]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function repoReadAll(entity) {                       // קריאה אחת — כל הישות
  var s = SCHEMA[entity];
  var sh = repoSheet(entity);
  var last = sh.getLastRow();
  if (last < 2) return { cols: s.columns, rows: [] };
  var values = sh.getRange(2, 1, last - 1, s.columns.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var o = {};
    for (var c = 0; c < s.columns.length; c++) o[s.columns[c]] = decodeCell(s.types[s.columns[c]], values[i][c]);
    o._row = i + 2;                                  // מיקום בגיליון — פנימי בלבד
    out.push(o);
  }
  return { cols: s.columns, rows: out };
}
```

**עקרונות:**
1. **קריאה בסינגלוטון per-execution.** קובץ `data` מחזיק משתנה מודולרי `var __cache = {};` שמטמון את `repoReadAll` של כל ישות לאורך ה-execution. הכל קורא ממנו; כתיבה מעדכנת אותו — אחרת אי-עקביות בתוך אותה בקשה.
2. **כתיבה ב-`setValues` רציף בלבד.** לעולם לא `getRange(r,c).setValue()` בתוך לולאה.
3. **עדכון שורה:** קריאת כל הישות → איתור `_row` → כתיבת מערך השורה → `setValues`.
4. **הוספה:** `appendRow` כששורה אחת; כמה — `getRange(last+1,1,n,cols).setValues(...)`.
5. **מחיקה רכה** — `deleted_at = now`. כל קריאה מסננת `deleted_at` ריק. **קשה** — רק להודעות ולטיוטות: מחיקת שורה בגיליון (`deleteRow`) — ניסיון למינימום.

## 4. API של ה-Repository (הממשק שהעתיד יחזור עליו ב-SQL)

```js
repo.list(entity, filter)    // filter: { field: value | function } -> [] ישויות "wire"
repo.get(entity, id)         // ישות או null
repo.insert(entity, obj)     // מחזיר את הישות עם id/created_at/updated_at
repo.update(entity, id, patch, opts)  // opts.version -> optimistic
repo.remove(entity, id, { hard: false })
repo.bulkInsert(entity, arr)
```
- `domain` קורא **רק** את הממשק הזה. אין `SpreadsheetApp` מחוץ ל-`data/`.

## 5. בטיחות כתיבה (3 משתמשים בו-זמנית)

```js
function repoTx(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new AppError('BUSY', 'המערכת עסוקה, נסו שוב בעוד רגע');
  try {
    var out = fn();
    SpreadsheetApp.flush();           // אחת, בסוף הכותב
    return out;
  } finally { lock.releaseLock(); }
}
```
- **כל נתיב כתיבה** — `repoTx`. קריאה — בלי lock (Cache ממזער קונפליקטים).
- **Optimistic:** הקליינט שולח `updated_at` של הרשומה שעריכה. ה-repository בודק — אם השתנה, `AppError('CONFLICT', 'מישהו אחר עדכן את הרשומה. רעננו ונסו שוב.')`.
- **מניעת כתיבה כפולה** — מפתח idempotency מהקליינט (ראו `gas-api`) נשמר ב-`userCache` ל-60 שנ'.

## 6. אינדקסים בזיכרון

```js
function repoIndex(entity, field) {
  var all = repoReadAll(entity).rows;
  var map = {};
  for (var i = 0; i < all.length; i++) {
    var k = String(all[i][field] || '');
    (map[k] = map[k] || []).push(all[i]);
  }
  return map;
}
```
- נבנה per-execution (100 שורות — זניח). לא לשרשר `filter` על `filter` עם גיליון שנקרא כל פעם.
- להעביר **ליסטים של מזהים** לשורות — לא אובייקטים כבדים בצרכים מזדמנים.

## 7. פורמט תא
- `ms` — מספר; בתצוגה `hebrew-dates`. לעולם לא `setNumberFormat` לתא timestamp כדי שלא יישמר כמחרוזת.
- `date` — טקסט `dd/mm/yyyy` (עריכה ישירה בגיליון ידידותית), עם `data validation` ואימות ב-repository.
- `list` — `JSON.stringify(array)` בעמודה; `decodeCell` מפרסר בבטחה (ערך פגום → `[]`, לא קריסה).
- `bool` — `true/false` אמיתי; לא `'כן'`/`'לא'`.

## 8. דגלים אדומים
- `getRange(...).getValue()` בלולאה → פי 100 פי זמן. תמיד `getValues`.
- `appendRow` אלף פעמים → איטי ובסיכון timeout. `bulkInsert`.
- לקרוא גיליון של פעמיים בשני מקומות → קרא פעם אחת ב-execution.
- `SpreadsheetApp.openById` בכל פונקציה — פעם אחת, עם `getActive()`.
- לשנות שם עמודה → שבירת כל הקריאות. מיגרציה מפורשת בלבד.
