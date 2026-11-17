# my-skills

אוסף סקילים (Skills) ל‑**Claude Code**, לפרויקטי **Google Apps Script (GAS)** — מערכות Web App על Google Sheets, עם ממשק עברי ו‑RTL.

הסקילים מכסים את כל מחזור החיים של פרויקט כזה: איפיון, ארכיטקטורה, שכבת נתונים, API, ממשק, תאריכים עבריים, דחיסת פעולות ארוכות, בדיקות ופריסה.

---

## התקנה

1. העתיקו את תיקיית `skills/` אל תיקיית הסקילים של הפרויקט שלכם:

```bash
cp -r skills/* <your-project>/.claude/skills/
```

2. או התקינו ברמה הגלובלית (`~/.claude/skills/`), כדי שיהיו זמינים בכל פרויקט.

3. בכל פרויקט, ודאו שקיים `CLAUDE.md` שמפנה לסקילים הרלוונטיים (ראו [דוגמה](#claude-md-לדוגמה)).

> אין צורך בהתקנת תלויות. כל סקיל הוא קובץ Markdown יחיד עם frontmatter (`name`, `description`).

---

## הסקילים

### א. שכבת הפלטפורמה

| סקיל | מהירות הידע |
|---|---|
| [`gas-core`](skills/gas-core/SKILL.md) | מודל ההרצה של Apps Script (V8, 6 דקות, `google.script.run`, גבול טיפוסים, `Date`), ארכיטקטורת השכבות `web → api → domain → data`, מבנה תיקיות, `appsscript.json`, שכבת Cache |
| [`gas-data`](skills/gas-data/SKILL.md) | Google Sheets כשכבת נתונים: סכימה, Repository, batch (`getValues`/`setValues`), בטיחות כתיבה עם `LockService`, optimistic concurrency, אינדקסים בזיכרון, מחיקה רכה/קשה |
| [`gas-runtime`](skills/gas-runtime/SKILL.md) | פעולות ארוכות: chunking עם continuation, jobs, triggers, מניעת לופים, תקציבי מכסות, `UrlFetchApp` עם retry, גיבוי Drive מתוזמן |

### ב. שכבת ה‑API והנתונים

| סקיל | מהירות הידע |
|---|---|
| [`gas-api`](skills/gas-api/SKILL.md) | dispatcher יחיד `{module, action, params} → {ok, data\|error}`, הרשאה בכל entry point, ולידציה וסניטציה, XSS, קודי שגיאה, idempotency, לוגי שגיאה |
| [`security-auth`](skills/security-auth/SKILL.md) | `Session.getActiveUser`, רשימת מורשים בגיליון `users`, scopes מינימליים, סודות, סניטציה, פרצת CSV‑injection בגיליון |
| [`hebrew-dates`](skills/hebrew-dates/SKILL.md) | `dd/mm/yyyy` ו‑`HH:mm`, ימים בעברית, `Asia/Jerusalem`, המרות תאריך לועזי↔עברי, חגי ישראל, חישוב ימי עבודה |

### ג. שכבת ה‑UI

| סקיל | מהירות הידע |
|---|---|
| [`gas-client`](skills/gas-client/SKILL.md) | HTML/CSS/JS טהור ב‑HtmlService, עטיפת Promise ל‑`google.script.run`, מערכת עיצוב עם טוקנים, CSS logical, RTL, נגישות, מצבי UI, קומפוננטות |
| [`ui-chat`](skills/ui-chat/SKILL.md) | לוח הודעות פנימי: polling עם backoff, "נקרא" אישי, קישור לישויות |

### ד. הדומיין

| סקיל | מהירות הידע |
|---|---|
| [`domain-flow`](skills/domain-flow/SKILL.md) | זרימת פנייה → תקלה → משימה, ירושת תקלות חדר, משאבים ותוכנות, דוח רישיונות, שיבוץ שבועי/חודשי בעברית |
| [`project-mgmt`](skills/project-mgmt/SKILL.md) | מודל משימות ופרויקטים: סטטוסים, עדיפויות, תת‑משימות, קשרי תקלה/פנייה |
| [`knowledge-base`](skills/knowledge-base/SKILL.md) | מאגר ידע: מאמרים, קטגוריות, תגיות, חיפוש, עורך `contenteditable`, גרסאות, הקפצה מסגירת תקלה |
| [`app-settings`](skills/app-settings/SKILL.md) | מסך הניהול: משתמשים, קונפיגורציה, יומן פעולות, גיבוי |

### ה. קבצים

| סקיל | מהירות הידע |
|---|---|
| [`file-import`](skills/file-import/SKILL.md) | ייבוא XLSX (SheetJS בקליינט), התאמה דינמית של עמודות, טבלאות מורכבות, פרופילי ייבוא, תאריכי Excel |
| [`excel-export`](skills/excel-export/SKILL.md) | ייצוא XLSX דרך clone גיליון, הורדה לקליינט (Drive/Base64), עיצוב, ניקוי |

### ו. תהליך העבודה

| סקיל | מהירות הידע |
|---|---|
| [`spec-intake`](skills/spec-intake/SKILL.md) | תהליך האיפיון: סדר השאלות, מילוי `docs/spec.md`, אישור לפני קוד |
| [`delivery-plan`](skills/delivery-plan/SKILL.md) | פירוק לשלבים, קריטריונים לסיום שלב, דגלים אדומים |
| [`gas-ops`](skills/gas-ops/SKILL.md) | `clasp` + Git, dev/prod, מיגרציות סכימה, בדיקות (יחידה/אינטגרציה/ידניות), לוגים, ביצועים |
| [`gas-google`](skills/gas-google/SKILL.md) | Gmail: `mailto` בשלב 1, `MailApp`/`GmailApp` בשלב מאוחר, תוסף Gmail אופציונלי |

---

## כלים

| כלי | מהירות |
|---|---|
| [`tools/skills-audit.mjs`](tools/skills-audit.mjs) | בקרת תוכן: מאתר שאריות של ארכיטקטורות אחרות (Cloudflare, D1, React, Tiptap) בסקילים. הרצה: `node tools/skills-audit.mjs` |

---

## עקרונות שהסקילים האלה מיישמים

1. **מודולריות אמיתית** — `web → api → domain → data`. החלפת שכבת הנתונים (Sheets → SQL) אינה נוגעת בלוגיקה ובממשק.
2. **תאריכים עבריים** — `dd/mm/yyyy`, `HH:mm`, `Asia/Jerusalem`. שמירה כ־Unix ms, תצוגה בעברית.
3. **RTL מלא** — CSS logical properties בכל מקום, ללא `margin-left`/`text-align: left`.
4. **נגישות חובה** — כפתורים אמיתיים, `label`, focus visible, ניווט מקלדת, ניגודיות.
5. **חסכון במכסות** — batch קריאות/כתיבות, Cache עם גרסה, `LockService` עם timeout, chunking לפעולות ארוכות.
6. **אבטחה** — הרשאה בכל `api_*`, ולידציה בשרת גם כשיש בקליינט, סניטציה של HTML, פרצת CSV‑injection בגיליונות.

---

## CLAUDE.md לדוגמה

```markdown
## סקילים — רלוונטיים לפרויקט זה (GAP)

| סקיל | נושא | סטטוס |
|---|---|---|
| `spec-intake` | תשאול לאיפיון | ✅ פעיל |
| `delivery-plan` | שלבי עבודה | ✅ פעיל |
| `gas-core` | שלד Apps Script | ✅ פעיל |
| `gas-data` | Sheets, batch | ✅ פעיל |
| `gas-api` | dispatcher, הרשאות | ✅ פעיל |
| `gas-client` | HtmlService, RTL | ✅ פעיל |
| `hebrew-dates` | תאריכים עבריים | ✅ פעיל |
| `domain-flow` | זרימת ישויות | ✅ פעיל |
| `gas-ops` | clasp, בדיקות | ✅ פעיל |
```

Claude Code קורא את ה‑frontmatter של כל סקיל ומפעיל אותו אוטומטית כשהמשימה מתאימה.

---

## רישיון

ראו [LICENSE](LICENSE).
