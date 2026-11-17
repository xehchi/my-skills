---
name: gas-client
description: שכבת ה-UI — HTML/CSS/JS טהור ב-HtmlService, עטיפת Promise ל-google.script.run, מערכת עיצוב (טוקנים, CSS logical), RTL, נגישות, מצבי UI (loading/empty/error), קומפוננטות (טבלה, מודאל, טוסט), טיפול בדפוסי נתונים בצד הלקוח. השתמש בכל עבודה על מסך, רכיב, עיצוב, טופס או אינטראקציה.
---

# gas-client — ה-UI

## 1. הקבצים וההזרקה (HtmlService, בלי bundler)

```
web/index.html            shell
web/api-client.js         google.script.run wrapped in Promise
web/app.js                router + init
web/lib/dates.js          hebrew-dates
web/lib/dom.js            el(), text(), setState helpers
web/components/*.js       table.js modal.js toast.js form.js
web/styles/tokens.css     design tokens
web/styles/app.css
Code.gs                   doGet -> buildPage()
```
**HtmlService אין import.** כל `<script>` מוזרק לפי הסדר, וממלא אותו סקופ גלובלי:

```js
// Code.gs
function doGet() {
  return HtmlService.createTemplateFromFile('web/index')
    .evaluate()
    .setTitle('ניהול חדרי מחשבים')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(file) { return HtmlService.createHtmlOutputFromFile(file).getContent(); }
```
```html
<!-- web/index.html -->
<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><base target="_top">
  <link rel="stylesheet" href="<?= include('web/styles/tokens.css') ?>">
  <link rel="stylesheet" href="<?= include('web/styles/app.css') ?>">
</head>
<body>
  <div id="app" aria-live="polite"></div>
  <script><?!= include('web/lib/dates.js') ?></script>
  <script><?!= include('web/lib/dom.js') ?></script>
  <script><?!= include('web/api-client.js') ?></script>
  <script><?!= include('web/components/table.js') ?></script>
  <script><?!= include('web/app.js') ?></script>
</body></html>
```
- `<?= ?>` — escape; `<?!= ?>` — raw. **לתוכן HTML/JS תמיד `<?!= ?>`.**
- **אין `<script src>` חיצוני** אלא אם אושר מול נטפרי (`cdnjs`, `jsdelivr` — אחד פתוח, אחר לא). ברירת מחדל: להעתיק ספרייה לקובץ מקומי ולהזכיר את מקורה. כל ספרייה חיצונית — באישור מפורש.

## 2. `api-client.js` — העטיפה היחידה

```js
function call(module, action, params) {
  return new Promise(function (resolve, reject) {
    google.script.run
      .withSuccessHandler(function (res) {
        if (!res) return reject({ code: 'INTERNAL', message: 'לא התקבלה תשובה מהשרת' });
        if (res.ok) return resolve(res.data);
        reject(res.error);
      })
      .withFailureHandler(function (err) {
        reject({ code: 'NETWORK', message: 'אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.', detail: String(err) });
      })
      .call({ module: module, action: action, params: params || {}, _reqId: uid() });
  });
}
```
- **`google.script.run` אסור בכל מקום אחר.** כל קריאה — `call('rooms', 'list', {})`.
- `uid()` — מזהה בקשה (idempotency, `gas-api` §7).
- retry: לא אוטומטי לשינויי נתונים (יכול להכפיל). retry יחיד ל-`NETWORK` בקריאות קריאה (`list`/`get`) בלבד.
- הקליינט לא יודע שמות טבלאות/עמודות — מקבל `data` מהשרת ("wire"). **לא** להמיר `Date` בקליינט; השרת שולח `ms`.

## 3. מערכת העיצוב — טוקנים (`tokens.css`)

```css
:root {
  --c-bg: #f7f7f5;        --c-surface: #ffffff;
  --c-text: #1f2328;      --c-text-muted: #5b6470;
  --c-border: #e3e5e8;    --c-accent: #2563eb;   --c-accent-hover: #1d4ed8;
  --c-ok: #15803d;        --c-warn: #b45309;      --c-danger: #b91c1c;
  --c-status-open: #b45309; --c-status-fixed: #15803d;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px;
  --fs-xs: 12px; --fs-sm: 14px; --fs-md: 16px; --fs-lg: 20px; --fs-xl: 26px;
  --r-md: 8px; --shadow-sm: 0 1px 2px rgb(0 0 0 / .06);
}
body { font-family: "Assistant", "Heebo", "Segoe UI", system-ui, sans-serif;
       font-size: var(--fs-md); color: var(--c-text); background: var(--c-bg); }
```
- גופנים עבריים: **Assistant / Heebo / Rubik** — להטמיע (font-face מקומי) או להיסמך על גופן מערכת אם חסום. אין גופן חיצוני לא מאושר.
- **אין צבע/גודל/מרווח אקראי** מחוץ לטוקנים.
- `:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }` — לא לכבות.

## 4. CSS logical + RTL

- `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-inline-start`.
- `text-align: start|end` — לא `left/right`.
- `flex-direction: row` — מתהפך אוטומטית ב-RTL.
- **בלוקים LTR**: `<span dir="ltr">` — מספרי טלפון, אי-מייל, קודי מחשב (`A14`), IP, נתיבים.
- `unicode-bidi: plaintext` על תוכן חופשי מעורב — מונע קפיצת "סוף משפט" לנקודה.
- אייקונים — `lucide` כ-SVG מוטמע או סמלים פשוטים; חצים/chevron — להסתמך על RTL (`transform: scaleX(-1)` ב-chevron כשצריך, לא כל חץ).

## 5. מצבי UI — חובה בכל מסך

| מצב | מה המצב |
|---|---|
| `loading` | שלדים (skeleton) של המבנה — **לא** מסך לבן, לא ספינר בלבד |
| `empty` | הודעה + כפתור הפעולה הראשי ("אין מחשבים בחדר — הוספת מחשב") |
| `error` | הודעה אנושית + "נסה שוב" + `traceId` קטן |
| `success` | טוסט קצר; אין "הצלחה" שנשארת על המסך |
| `partial` | חלק מהנתונים נטענו — להציג מה שיש ולהמשיך לטעון |
| `offline` | `navigator.onLine === false` — "אין חיבור" + כפתור ניסיון חוזר |

```js
function renderState(state, data) { /* switch על state; לכל אחד renderer */ }
```

## 6. קומפוננטות — חוזים

| קומפוננטה | חוזה |
|---|---|
| `table(opts)` | `columns:[{key,label,render?,width?}]`, `rows`, `emptyText`, `onRowClick`, `rowActions` |
| `modal(opts)` | `title`, `content(el)`, `onConfirm`, `confirmText`, `danger`; Escape סוגר; focus-trapped; `aria-modal` |
| `toast(msg, kind)` | `kind: ok|warn|err`; `aria-live`; נעלם ב-4 שנ' |
| `form(schema, values)` | לפי `SCHEMA` מהשרת — שדה לכל עמודה, שגיאה inline, "שמור" מושבת עד שינוי |
| `filterBar(fields)` | search + dropdowns; סינון בצד הלקוח על ה-`list` |
| `badge(status)` | צבע + טקסט (לא צבע בלבד) |

- **DOM APIs**, לא `innerHTML` עם תוכן משתמשים. `el('div', {class:'x'}, text)` — עוזר קטן ב-`dom.js`.
- כל קומפוננטה — פונקציה שמחזירה `HTMLElement`. אין class components גלובליים.

## 7. ניהול מצב בצד הלקוח

```js
var STATE = { user: null, route: 'home', data: {}, loading: {} };
function setState(patch) { Object.assign(STATE, patch); renderApp(); }
```
- **מצב אחד לכל העמוד.** `renderApp()` מדפיס מחדש לפי `route` (פשוט; 6 מסכים).
- נתונים שנטענים — ב-`STATE.data[module]`; לא לשמור בכפילות.
- מפות/אינדקסים בצד הלקוח: `byId`, `byRoom` — נבנים פעם אחרי טעינה.
- **אל תגרור ספריית state**. ES modules לא קיימים ב-HtmlService — זה רכיב יחיד.

## 8. דפוסי UX לממשקי נתונים

- ולידציה inline בעת שמירה (לא בכל הקלדה); הודעת שגיאה מתחת לשדה, מקושרת ב-`aria-describedby`.
- שמירה — כפתור ראשי תמיד גלוי; **Ctrl+S** שמור; Escape — ביטול מודאל.
- "נשמר לפני רגע" / "טיוטה" — לפחות עדיף על איבוד נתונים.
- Mark dirty → `beforeunload` אזהרה.
- מספרים בכ-`table` — `font-variant-numeric: tabular-nums`; יישור לפי כיוון (התחלה של הספרה).
- טבלה צרה במובייל → הופכת לכרטיסים. **לא גלילה אופקית!**
- קיצורים: `/` — חיפוש; `n` — חדש. מתועדים ב-footer.

## 9. נגישות (חובה)
- `<button>` אמיתי (לא `div onclick`), `<label for>`. `aria-pressed` על כפתורי toggle.
- **ניווט מקלדת מלא**: Tab, Shift+Tab, Enter, Space, Escape, חצים בטבלה.
- ניגודיות ≥ 4.5:1 לטקסט.
- אייקון "הצלחה/שגיאה" — תמיד עם טקסט.
- `aria-live="polite"` לאזור הודעות; `aria-busy` בזמן טעינה.
- `lang="he" dir="rtl"` על `<html>`.

## 10. דגלים אדומים
- `google.script.run` מפוזר — אין טיפול אחיד בשגיאות.
- `innerHTML` עם תוכן מהמשתמש — XSS.
- `<div class="btn" onclick>` — לא נגיש, לא ממוקד.
- `position:absolute; left:0` — ב-RTL גם צריך `inset-inline-start`.
- לשכוח `setTitle()`/viewport → המובייל לא תקין.
- טעינה ארוכה שנתקעת ב-6 דקות — להציג התקדמות (`gas-runtime`).
- תלות ב-CDN שלא נבדק בנטפרי.

## 11. קשרים
`gas-core` (שכבות) · `gas-api` (פורמט תשובה) · `hebrew-dates` · `gas-runtime` (פעולות ארוכות) · `gas-ops` (פריסה).
