---
name: hebrew-dates
description: תאריכים עבריים — פורמט dd/mm/yyyy ו-HH:mm, ימי שבוע בעברית, אזור Asia/Jerusalem, המרות תאריך לועזי↔עברי, חגי ישראל וחופשות, וחישוב ימי עבודה (ראשון–שישי). השתמש בכל עבודה על תאריך, שעה, לוח שנה עברי, או חישוב ימים.
---

# hebrew-dates — תאריכים ולוח עברי

## 1. מוסכמה מחייבת (מסמך האיפיון §מוסכמה)

| הקשר | פורמט |
|---|---|
| תצוגה | `dd/mm/yyyy`, שעה `HH:mm` (24 שעות) |
| ימים | ראשון, שני, שלישי, רביעי, חמישי, שישי (שבת — לא ביום עבודה) |
| אחסון timestamp | **מספר** Unix ms |
| אחסון תאריך בלבד (`due_date`) | טקסט `dd/mm/yyyy` |
| אזור זמן | `Asia/Jerusalem` (גם ב-`appsscript.json`) |

**אסור:** `mm/dd/yyyy`, חודשים/ימים באנגלית, ISO בתצוגה למשתמש.

## 2. פורמט בצד הלקוח (`web/lib/dates.js`)

```js
var DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
var MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function pad(n) { return n < 10 ? '0' + n : String(n); }

// ms -> dd/mm/yyyy
function fmtDate(ms) {
  if (ms == null) return '';
  var d = new Date(Number(ms));
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
}

// ms -> dd/mm/yyyy HH:mm
function fmtDateTime(ms) {
  if (ms == null) return '';
  var d = new Date(Number(ms));
  return fmtDate(ms) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// dd/mm/yyyy -> ms בתחילת היום (לפי שעון המכשיר)
function parseDate(str) {
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(str || '').trim());
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

// "לפני 5 דקות" / "אתמול"
function relative(ms) { /* ... */ }
```
- **`new Date(ms)` ומספרים** — להציג ב-`dir="ltr"` (בלוק `.num`), כדי שהמפריד לא יתבלגן ב-RTL.
- **`<input type="date">`** — דפדפן מציג לפי locale של המכשיר. להשתמש בו רק אם מקבלים ש-`value` ב-ISO והופכים ב-`onChange` ל-`dd/mm/yyyy`. אחרת — שני שדות או `inputmode="numeric"` עם מסכה.

## 3. בצד השרת (`domain/dates.gs`)

```js
var TZ = 'Asia/Jerusalem';

// Date -> "dd/mm/yyyy" לפי TZ
function msToDdMmYyyy(ms) {
  return Utilities.formatDate(new Date(ms), TZ, 'dd/MM/yyyy');
}
// "dd/mm/yyyy" -> ms של חצות TZ
function ddMmYyyyToMs(str) {
  if (!str) return null;
  var p = String(str).split('/');
  if (p.length !== 3) return null;
  var y = +p[2], m = +p[1], d = +p[0];
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}
// שעה "HH:mm" -> דקות מתחילת היום (null אם פגום)
function hmToMin(hm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  if (!m) return null;
  return (+m[1]) * 60 + (+m[2]);
}
function minToHm(min) { return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60); }
```
- **מלכודת אזור הזמן:** `new Date(...)` בשרת Apps Script רץ בשעון UTC. `getDate()`/`getHours()` שם מחזירים ערכים של UTC — לא של ישראל. לתצוגה בצד השרת תמיד `Utilities.formatDate(d, TZ, ...)`.

## 4. תאריך עברי — המרה לועזי↔עברי

ב-Apps Script אין API מובנה לתאריך עברי. שתי דרכים:

### א. `Intl` (V8) — התצוגה בלבד
```js
function hebrewDateLabel(ms) {
  return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(ms));         // "ט״ו כסלו תשפ״ה"
}
function hebrewYearLabel(ms) {
  return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { year: 'numeric' }).format(new Date(ms));
}
```
- **מתאים לתצוגה.** לא לסמוך עליו להמרות אריתמטיות או לזיהוי חג בלי בדיקה מול מנוע ידני. במנועי V8 בדפדפן/בשרת של גוגל — נתמך.

### ב. מנוע מותאם (מומלץ לשיבוץ) — טבלת חודשי שנה
לחישוב שיבוץ לפי חודש עברי, **אל תחשב את החגים מה-Intl בכל בקשה**; שמור טבלה סטטית אחת (עבור טווח השנים של המערכת, למשל תשפ״ה–תשפ״ז):

```js
// domain/hebrew-calendar.gs
var HEBREW_MONTHS = ['תשרי','חשוון','כסלו','טבת','שבט','אדר','ניסן','אייר','סיוון','תמוז','אב','אלול'];
var CALENDAR = {
  'תשפ״ה': {
    months: ['תשרי','חשוון','כסלו','טבת','שבט','אדר','ניסן','אייר','סיוון','תמוז','אב','אלול'],
    starts: { תשרי: '02/10/2024', חשוון: '01/11/2024', כסלו: '01/12/2024' /* ... */ }
  }
};
var HOLIDAYS = {   // dd/mm/yyyy -> שם
  '03/10/2024': 'ראש השנה', '12/10/2024': 'יום כיפור', '17/10/2024': 'סוכות',
  '24/04/2025': 'יום העצמאות', '02/06/2025': 'שבועות'
};
```

> **⚠️ ה-`starts`/`HOLIDAYS` هنا הם דוגמה בלבד.** אסור להעתיקם לפרודקשן בלי אימות מול לוח שנה אמיתי של השנים הרלוונטיות. עודכן פעם בשנה, ב-`docs/`.

- **למה טבלה:** ניתנת לבדיקה בקלות, לא תלויה בכל שינוי דפדפן, ניתנת לסקירה ע"י הצוות ("נראה נכון?").
- **`Intl`** — לתצוגת "ט״ו כסלו תשפ״ה" בלבד, לא לאמת.
- **המרה עברי→לועזי** — לפי `CALENDAR[year].starts[month]` + הוספת ימים, עם טיפול בחודשי 29/30 יום.

## 5. חגים וחופשות (למודול השיבוץ)

```js
function isHoliday(ms) { return !!HOLIDAYS[msToDdMmYyyy(ms)]; }
function isWeekendOrHoliday(ms) {
  var day = new Date(ms).getDay();          // 0=ראשון, 5=שישי, 6=שבת
  return day === 6 || isHoliday(ms);
}
```
- **חופשות בית ספר** (חנוכה, פסח, בין הזמנים) — טבלה נפרדת: `VACATIONS = [{from, to, name}]`. "מבחן בגרות"/אירועי בית ספר — באים מה-`schedule_monthly` (kind: `חג`/`ביטול`).

## 6. ימי עבודה

- ימי עבודה: ראשון–שישי. שישי רגיל 8:30–19:30 (מ-`docs/spec.md` §3.6).
- **`getDay()`** — 0=ראשון … 6=שבת. **לא 1=שני כמו "ISO".** טעות נפוצה — יוצרת הזזה של יום שלם.
- חישוב "n ימי עבודה קדימה" — דילוג על שישי/שבת/חגים/חופשות.
- **אסור** להשתמש ב-`Date` בשעון שרת (UTC) לתצוגת שעה. גם `getHours()` על `new Date(ms)` בשרת — UTC. לתצוגה בשרת: `Utilities.formatDate(..., TZ, 'HH:mm')`.

## 7. דגלים אדומים
- `d.getMonth() + 1` vs. `d.getMonth()` — ינואר = 0.
- `toLocaleDateString('he-IL')` בלי `timeZone` — הדפדפן/שרת עלולים להיות ב-UTC.
- שמירת `Date` בגיליון וגם מחרוזת — ערבוב טיפוסים שקט. תמיד `ms` או `dd/mm/yyyy`, לא שניהם.
- `parseDate` שמקבל `03/25/2025` בלי לבדוק — יוצר תאריך שגוי בשקט. לבדוק שהחודש ≤ 12 והיום ≤ 31.
- השוואת תאריכים כמחרוזות `dd/mm/yyyy` — שגוי בסדר. להשוות `ms`.
