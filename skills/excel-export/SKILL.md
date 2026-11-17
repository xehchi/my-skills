---
name: excel-export
description: ייצוא Excel ב-Apps Script — יצירת XLSX אמיתי דרך clone של גיליון, הורדה לקליינט (Drive או Base64), עיצוב הדוח, וניקוי קבצים זמניים. השתמש בכל עבודה על ייצוא דוח ל-Excel.
---

# excel-export — ייצוא XLSX

## 1. שלוש דרכים לייצר XLSX מ-Apps Script

| דרך | טוב ל | חסרונות |
|---|---|---|
| **A. Sheet clone** — `copyTo` לגיליון זמני, ואז להוריד אותו | גיליון עם יותר משני "חשבונות" | דורש Drive; איטי; משאיר זבל |
| **B. HTML-as-Excel** — טבלת `<table>` עם `Content-Type: application/vnd.ms-excel` | דוח פשוט, מהיר, בלי Drive | Excel פותח בהזהרה; לא XLSX אמיתי; JS ב-`<th>` לא |
| **C. SheetJS (xlsx library) כ-Apps Script Library + לקוח** | XLSX אמיתי, עיצוב, גיליונות מרובים | תלות ספרייה |

**ברירת מחדל לפרויקט הזה: A — Sheet clone.** הוא XLSX אמיתי, בלי תלות חיצונית, והנתונים שלנו כבר ב-Sheet.

## 2. ייצוא (דרך A)

```js
// api/system.gs
function api_system_export(ctx) {
  var type = ctx.params.type;              // incidents | tasks | computers | ...
  var rows = exportRows(type, ctx.params.filter || {});
  var meta = SCHEMA[type];
  var temp = SpreadsheetApp.create('ייצוא ' + type + ' ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HHmm'));
  var sh = temp.getActiveSheet();
  sh.getRange(1, 1, 1, meta.columns.length).setValues([meta.columns]).setFontWeight('bold');
  hamed_set_format_(sh, meta.columns);
  if (rows.length) sh.getRange(2, 1, rows.length, meta.columns.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, meta.columns.length);
  return toWire({ fileId: temp.getId(), name: temp.getName() + '.xlsx' });
}
```

**ההורדה לקליינט:** `google.script.run` לא יכול להוריד קובץ. שלוש אפשרויות:

```js
// web/app.js — ההורדה
function download(fileId, name) {
  var a = document.createElement('a');
  a.href = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(fileId);
  a.download = name;
  a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
```
- **תוודא שהמשתמש מחובר ל-Google** — אחרת Drive מבקש התחברות.
- חלופה מומלצת אם נטפרי מסרב: **החזרת Base64 דרך `google.script.run`** והמשתמש מוריד עם `URL.createObjectURL`:
```js
function exportAsBase64(type, filter) {
  /* ...יוצר זמני, ממיר xlsx→Base64, גורס את הזמני... */
}
```
- **ניקוי**: `DriveApp.getFileById(temp.getId()).setTrashed(true)` אחרי שהמשתמש הוריד — או מתוזמנת. אחרת `temp` זבל.

## 3. מה לעצב (ולא)

- **פורמט תאריך**: `dd/mm/yyyy` — `sh.getRange(...).setNumberFormat('dd/mm/yyyy')` על עמודות `date`; `ms` — `dd/mm/yyyy HH:mm`.
- **רוחב עמודות**: `autoResizeColumns`. מקסימום 300px.
- **שורה ראשונה**: כחול/אפור, לבן, מודגש, מוצמדת.
- **סינון** (Excel AutoFilter): `sh.getRange(1,1,...).createFilter?.()` — API קיים ב-Apps Script? **כן** — SpreadsheetApp: `sh.getFilter()` / `sh.getRange().createFilter()` (בדוק גרסה).
- **מה לא**: ניקוב לשניים, ציורים, גרפים מותאמים. דוח נקי, לקריאה.
- **לא** לשים את שמות העמודות הפנימיים (`room_id`) — להשתמש ב-`label` מהסכימה אם יש. **כן** להוסיף את ה-id בסוף "לצרכים פנימיים".

## 4. דוח רישיונות / דשבורד

- סדרה של גיליונות נפרדים עדיף על גיליון אחד צבוע.
- שמותיהם — בעברית (`תקלות`, `סיכום`).
- "עובדות" מחושבות = פונקציות טהורות — לתת לייצוא לקרוא מן ה-API, לא לחשב מחדש.

## 5. דגלים אדומים
- `SpreadsheetApp.create` בכל בקשת UI → Drive זבל. תיצור רק כשמבקשים.
- `export` ל-XLSX של יותר מ~50k שורות — timeout. `job` (`gas-runtime`).
- `a.download` לא עובד תמיד בגלל CORS של Drive — **לוודא את הקישור** בטסט; אם הבסיס מבוקש ישיר — ללכת ל-Base64.
- לתעד "נשמר" כשרק הקובץ נוצר; צריך לבדוק שהמשתמש באמת הוריד.
