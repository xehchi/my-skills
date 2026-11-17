---
name: knowledge-base
description: מאגר ידע ב-Apps Script — מאמרים, קטגוריות, תגיות, חיפוש בכותרת ובתוכן, עורך contenteditable, גרסאות, והקפצה מסגירת תקלה. השתמש כשעובדים על אחסון ותצוגת מאמרים, נהלים או מידע פנימי.
---

# מאגר ידע

> המקור: `docs/spec.md` §3.10. כולם עורכים — אין הרשאות מיוחדות. "מיקום קבצים" הוא טקסט במאמר, **לא** מודול קבצים.

## 1. סכימה (גיליון `knowledge`)

| עמודה | טיפוס | הערות |
|---|---|---|
| `id` | ref | `kn_xxx` |
| `title` | text | חובה |
| `body` | text | **HTML** (סניטציה בשרת) |
| `body_text` | text | טקסט נקי — לחיפוש. נבנה אוטומטית |
| `category` | text | מתוך `knowledge_categories` (או "כללי") |
| `tags` | list | JSON-array |
| `is_faq` | bool | "תקלה נפוצה" |
| `created_by`, `updated_by` | text | מייל |
| `created_at`, `updated_at` | ms | |
| `deleted_at` | ms | מחיקה רכה |

- **`body_text` חובה** — חיפוש על HTML גולמי מחזיר תגיות. נוצר ב-`stripHtml(body)` בכל שמירה.
- **`linked_incidents_count`** — לא עמודה; נגזר (`incidentsRepo.count({ knowledge_article_id: id })`).

## 2. חיפוש

```js
function searchKnowledge(q) {
  var needle = norm(q);                       // lowercase, הסרת ניקוד
  var all = knowledgeRepo.list();             // 100–500 מאמרים — זול
  return all.filter(function (a) {
    return norm(a.title).indexOf(needle) >= 0 || norm(a.body_text).indexOf(needle) >= 0;
  }).sort(function (a, b) {
    var at = norm(a.title).indexOf(needle) >= 0 ? 1 : 0;
    var bt = norm(b.title).indexOf(needle) >= 0 ? 1 : 0;
    return bt - at || b.updated_at - a.updated_at;   // כותרת קודמת, אחר כך עדכניות
  });
}
```
- **בצד השרת** — על כל המאמרים. הנפח קטן.
- ניקוד עברי — להסיר `[֑-ׇ]`. לקרוא גם בלי גרשיים.
- **לא** FTS — אין טבלה וירטואלית ב-Sheets.

## 3. עורך (Bear-style, contenteditable)

- `<div contenteditable="true" dir="rtl">` + toolbar: **H1–H3, הדגשה, נטוי, רשימה, ממוספרת, checklist, קישור, טבלה**. `document.execCommand` — נתמך בכל דפדפן מודרני ומספיק לשלב ראשון.
- **`body` = `editor.innerHTML`** — **רק** אחרי סניטציה בשרת (whitelist ב-`gas-api` §5).
- **אין Tiptap** — לא זמין ב-HtmlService בלי bundler.
- **קישור** — `prompt` ל-URL, `execCommand('createLink')`; לבדוק `^https?://` / `^mailto:`.

## 4. שמירה וגרסאות

- **אוטו-שמירה** — debounce ~2 שנ' אחרי עצירת הקלדה. לא בכל תו.
- **Optimistic**: שולחים `updated_at`; `CONFLICT` → "המאמר נערך במקום אחר. רעננו".
- **"שמור גרסה"** — ידני: גיליון `knowledge_versions`: `article_id | title | body | saved_by | saved_at`. לא אוטומטי.
- **שחזור גרסה** — פאנל צד + אישור.

## 5. הקפצת ידע מסגירת תקלה

- סגירה ל-`נפתר` (`domain-flow` §3) → מודאל **אחרי** הסגירה: "להוסיף למאגר הידע?".
- טיוטה: `title` = תיאור קצר של התקלה; `body` = `resolution` + הקשר (מחשב/חדר).
- "שמור טיוטה" → מאמר `is_faq = true`. **לא** נשמר אוטומטי.
- הקישור מהתקלה: `incidents.knowledge_article_id`.

## 6. תצוגה
- רשימה: כותרת, קטגוריה, תגיות, `updated_at` עברי. סינון לפי קטגוריה/תגית.
- **FAQ** — מקטע בראש הרשימה.
- מאמר: כותרת, גוף, "עודכן ע"י X ב-dd/mm/yyyy", כפתור "ערוך". `innerHTML` של `body` מאושר בלבד.
- **קישורים פנימיים** — `href="#/knowledge/<id>"`.

## 7. דגלים אדומים
- לשמור HTML בלי סניטציה → XSS.
- הדבקת Word ל-`contenteditable` — להדביק `text/plain` בלבד (`paste` handler).
- חיפוש על `body` — תמיד `body_text`.
- מחיקת קטגוריה עם מאמרים — להעביר ל"כללי" או לחסום.
- "נערך לאחרונה" לפי שעון הקליינט — תמיד `updated_at` מהשרת.
- הרשאות למאמר — **אין**; כולם עורכים.
