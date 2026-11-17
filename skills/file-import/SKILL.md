---
name: file-import
description: קליטת קבצים ב-Apps Script — XLSX (SheetJS שמותקן כקובץ ב-web/) דרך הקליינט, התאמה דינמית של עמודות, טבלאות מורכבות, מיפוי שדות, פרופילי ייבוא, וטיפול בתאריכי Excel. השתמש בכל עבודה על ייבוא נתונים מקובץ.
---

# קליטת קבצים — Excel

## 0. איפה זה רץ ב-Apps Script

- **אין `npm` ב-HtmlService.** SheetJS מוטמע: `web/vendor/xlsx.full.min.js` (SheetJS CE, ~900KB). `<script><?!= include('web/vendor/xlsx.full.min.js') ?></script>`.
- **הקובץ לא עובר לשרת.** הקליינט קורא את ה-XLSX, מציג מיפוי, ושולח **רק שורות מומרות**: `call('import','apply',{ rows })`. חוסך round-trip כבד ו-`getBlob` בשרת.
- **מגבלה:** יותר מ-500 שורות בקריאה אחת — `job` (`gas-runtime`): שורות ב-`PropertiesService` (JSON חלקי) + `runChunk_` של 100 שורות לכותב.
- **שורות שמגיעות מהקליינט — לא מהימנות.** הן עוברות `validate()` בשרת (`gas-api` §5). אין "אני בודק בקליינט".
- **CSV** — SheetJS קורא גם אותו (`{ type: 'string' }`) אחרי `TextDecoder`. אותו מיפוי.

## 1. קריאה בקליינט (`web/lib/xlsx-read.js`)

```js
function readWorkbook(buffer) {
  var wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false, cellFormula: false });
  return wb.SheetNames.map(function (name) {
    return {
      name: name,
      sheet: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true }),
      merges: wb.Sheets[name]['!merges'] || []
    };
  });
}

// קריאת input type=file
function pickFile(input, onDone) {
  var f = input.files && input.files[0];
  if (!f) return;
  if (f.size > 10 * 1024 * 1024) return toast('הקובץ גדול מ-10MB', 'warn');
  var r = new FileReader();
  r.onload = function () { onDone(readWorkbook(r.result)); };
  r.readAsArrayBuffer(f);
}
```
- `header: 1` — מערך-מערכים. אנחנו מחליטים מה שורת כותרת.
- **`raw: true` תמיד.** `raw: false` מחזיר מחרוזות מעוצבות לפי שפת מערכת המשתמש — "1 במרץ" / "03/01/2026" — אי אפשר לפרסר לאורך זמן.
- **תאריך Excel = מספר סריאלי.** להמיר ל-ms: `Math.round((serial - 25569) * 86400000)` (עידן 1900) — ואז `dd/mm/yyyy` (`hebrew-dates`). ערך < 60 (1900 bug) — לבדוק שהתאריך הגיוני, לא סריאלי.

## 2. "טבלה מורכבת" — מה מזהים

1. **כותרות לאו דווקא בשורה הראשונה** — יש שורת כותרת של בית הספר ומעליה לוגו.
2. **מיזוגי תאים** בכותרת — "פרטי כיתה" מעל "שם | כיתה".
3. **שורות סיכום** בתחתית ("סה\"כ").
4. **עמודות ריקות** מפרידות אזורים.
5. **טבלאות מרובות** בגיליון אחד.

### שלבי חילוץ
1. גבולות אזור לא-ריק (השורה/העמודה הראשונה והאחרונה עם תוכן).
2. זיהוי שורת כותרת — השורה עם הכי הרבה תאי טקסט לא-ריקים לפני הנתונים; לסנן תא אחת "ממוזג" גדול.
3. **הצג למשתמש**: "האם זו שורת הכותרת? (שורה 3)" + כפתור "בחר שורה אחרת".
4. הפקת כותרות עם מיזוגים: `"פרטי כיתה / שם"`.
5. כל שורה שאחרי הכותרת — רשומה. שורה ריקה — עצירה; שורת סיכום — סימון "לדלג".

## 3. התאמה דינמית — עקרונות

- **לא לסמוך על שם עמודה.** "מחשב", "מספר מחשב", "תגית" — אותו שדה (`label`).
- **ציון**: 1.0 Exact; 0.8 נרדף (מילון); 0.5 לפי טיפוס תואם; 0 — לא.
- **הצגה**: טבלת "עמודה בקובץ → שדה במערכת (0.9)" עם dropdown לתיקון. שדות חובה שלא מופו — אדום, אי אפשר להמשיך.
- **שמירת פרופיל** — קובץ דומה יזכה בהצעה.

```js
// web/lib/mapping.js
function suggestMapping(headers, fields) {          // fields: [{ key, label, synonyms[], type }]
  return headers.map(function (h) {
    var norm = normalize(h); // trim, ניקוד, lowercase, רווחים מרובים
    var best = { field: null, confidence: 0 };
    fields.forEach(function (f) {
      var candidates = [f.label].concat(f.synonyms || []).map(normalize);
      var conf = candidates.indexOf(norm) >= 0 ? 1
               : candidates.some(function (c) { return norm.indexOf(c) >= 0 || c.indexOf(norm) >= 0; }) ? 0.8
               : 0;
      if (conf > best.confidence) best = { field: f.key, confidence: conf };
    });
    return { fileHeader: h, field: best.field, confidence: best.confidence };
  });
}
```
- המילון לנרדפים — לפי `SCHEMA[entity].synonyms` ב-`data/schema.gs`. **לא להמציא נרדפים שלא אושרו** על ידי המשתמש ("איך קוראים לעמודה הזאת אצלכם כיום?").
- **מזהה כפול** — אם מופה `id` ולא קיים במערכת: לא "מחדש" אלא "מקשר" או "זורק". **לשאול**.

## 4. שמירת פרופיל

```
sheet import_profiles: id | name | entity | mapping_json | header_fingerprint | created_at
```
- `mapping_json` = `{ "מספר מחשב": "label", "חדר": "room_id" }`.
- `header_fingerprint` = `Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, headers.map(normalize).join('|'))` (hex).
- התאמה → הצע את הפרופיל. **כל מיפוי שנערך ידנית — מבקש "לשמור כפרופיל?"**.

## 5. תאריכים ומספרים (המלכודות)

| מקרה | טיפול |
|---|---|
| תאריך Excel | סריאלי → ms → `dd/mm/yyyy` נשמר כטקסט `date`, או `ms` ל-`timestamp` |
| מחרוזת "01.03.2026" | פרסור מפורש `dd.mm.yyyy`, לסמן אזהרה אם הפורמט לא סטנדרטי |
| מחרוזת "2026-03-01" | ISO — לפרסר כמחרוזת ולא `new Date()` (שעון UTC) |
| "12/03" ו-"0112" (4 ספרות) | לבדוק מול הטופס במערכת, לא לנחש. אי-וודאות → שורה מסומנת |
| מספר עם פסיק "1,250" | להסיר פסיקים, לא לפרסר כ-float |
| `null` בעמודה חובה | שורה נדחית, מסומנת בטבלת "שגיאות שורה" |

- **טבלת שגיאות לפני שמירה**: שורה, עמודה, הודעה. המשתמש רואה ומתקן בקובץ או פוסל שורה.

## 6. בדיקות
- קובץ "רגיל" — שורת כותרת יחידה.
- קובץ עם שתי שורות כותרת / מיזוגים.
- קובץ RTL (עברית) — האם הערכים נכונים? **כן, אבל לא להפוך את העמודות.**
- קובץ עם תאריך טקסטואלי.
- קובץ ריק / גיליון ריק.
- קובץ xlsx שהוא בעצם xls — `XLSX.read` מזהה אוטומטית.
- **יבש (dry run)** לפני שמירה — דו"ח מה ייווצר, מה יחסם.

## 7. דגלים אדומים
- `raw: false` — פורמט תלוי שפה; אבדן תאריכים.
- לשים את ה-buffer עצמו ב-`google.script.run` — כבד, וחלף את המגבלה (הגבול ב-JSON, לא בקובץ).
- לשמור "במהירות" בלי `validate()` בשרת — נתוני זבל.
- להריץ ייבוא של 500 שורות בלי `job` → timeout באמצע → חצי ייבא. **תמיד** "כל-או-כלום" או job עם אפשרות ביטול.
- `import_profiles` "אוטומטי" בלי שהמשתמש אישר — מיפוי שגוי מפוזר על כל הנתונים.
