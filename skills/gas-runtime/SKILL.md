---
name: gas-runtime
description: פעולות ארוכות ומשימות רקע ב-Apps Script — chunking עם continuation token, triggers מתוזמנים ואירועיים, מניעת לופים, מכסות, UrlFetch חיצוני עם retry, וגיבוי Drive מתוזמן. השתמש בכל עבודה על פעולה שעלולה לעבור 5 דקות, טריגר, ייבוא גדול, ייצוא, גיבוי, או קריאה ל-API חיצוני.
---

# gas-runtime — פעולות ארוכות, טריגרים, חיצוני

## 1. מתי בכלל צריך chunking

| גודל | דרכי |
|---|---|
| < 200 שורות / < 5,000 קריאות תאים | ריצה ישירה |
| 200–2,000 שורות | `setValues` באצווה אחת — לרוב פחות מ-30 שנ' |
| > 2,000 שורות או ייבוא קובץ= | **job + chunk** |
| עבודה מעל ~4.5 דקות | **job + continuation** |

**כלל:** לא להריץ עבודה ארוכה בזמן שהמשתמש ממתין. מבצעים 30 שנ' + חוזרים "ממשיך ברקע".

## 2. Job עם continuation (`data/jobs.gs`)

```js
// גיליון jobs: id, type, params(JSON), cursor, total, done, status, owner, created_at, updated_at, error
function startJob(type, params, total) {
  var j = jobsRepo.insert({ type: type, params: JSON.stringify(params), cursor: 0,
                            total: total, done: 0, status: 'running', owner: currentUser().email });
  runChunk_(j.id);                    // שלב ראשון עכשיו, סינכרונית
  return j.id;                        // ה-UI מקבל id ומציג התקדמות
}

function runChunk_(jobId) {
  var j = jobsRepo.get(jobId);
  if (!j || j.status !== 'running') return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;                     // כבר רץ
  var t0 = Date.now(), step = 50, processed = 0;
  try {
    while (processed < step && Date.now() - t0 < 25000) {
      if (j.cursor >= j.total) break;
      processOneJobItem_(j);                           // ← הלוגיקה העסקית
      j.cursor++; j.done++; processed++;
    }
    j.updated_at = Date.now();
    if (j.cursor >= j.total) { j.status = 'done'; jobsRepo.update(jobId, j); }
    else {
      jobsRepo.update(jobId, j);
      ScriptApp.newTrigger('jobResume_' + jobId).timeBased()
        .after(1000).create();                         // חוזר בעוד שנייה
    }
  } catch (e) {
    j.status = 'error'; j.error = String(e && e.message);
    jobsRepo.update(jobId, j);
  } finally { lock.releaseLock(); }
}
function jobResume_(e) {                  // פקודת המשיך — trigger יחיד
  var j = e && e.triggerUid;
  if (j) ScriptApp.deleteTrigger(e.triggerUid);         // ← מוחק את עצמו
  runChunk_(j);
}
```
**רעיון**: *אותו* קוד של עבודה אחת יכול לרוץ ב-Web App, בטריגר, או ב-`withFailureHandler` — תמיד דרך `jobs`. המימוש בפועל בפרויקט: trigger מתוזמן אחד בשם `jobResumeDispatch_` שסורק job-ים פתוחים. **אל תיצור trigger לכל job** — תקרה של triggers וסינון.

### גרסה פשוטה (מומלצת בפרויקט שלנו)
```js
// trigger אחד קבוע, כל 5 דקות
function jobResumeDispatch_() {
  var pending = jobsRepo.list({ status: 'running' });
  for (var i = 0; i < pending.length; i++) runChunk_(pending[i].id);
}
```

### מקצה:וות דיווח על התקדמות ל-UI
```js
// api/tasks: api_system_jobStatus(ctx) -> {status, done, total}
// UI: polling כל 2 שנ', או 5 שנ'; מציג "טופלו 240 מתוך 800"
```
- **polling** ולא התראה — אין WebSocket. **לעצור polling כשהטאב לא נראה** (`visibilitychange`).
- כשה-job מסתיים — reload של הרשימה.

## 3. Triggers

| סוג | שימוש בפרויקט | מכסה (חשבון חינמי) |
|---|---|---|
| `timeBased` (דקות/שעות/יום) | `jobResumeDispatch_`, גיבוי יומי | 90 דק' ריצה/יום |
| `onEdit(e)` | לא בשימוש — הסתמכות על API | 20,000/יום (וגם: `onEdit` דורש אימות של כל מי שעורך) |
| `onOpen(e)` | לא (Web App בלבד) | — |

- **Git/`clasp`** — טריגרים לא נכללים בפרויקט. **סקריפט `setupTriggers()`** (`gas-ops`) שמתקין אותם — חד-פעמי, ותיעוד.
- **מניעת לופים:** כל trigger שנכנס — בודק אם job קיים; אם לא — נמחק. שום trigger לא *מפעיל* trigger שלא ב-`jobResumeDispatch_`.
- **`ScriptApp.getProjectTriggers()`** — לבדוק כפילות לפני `newTrigger().create()`.
- **הרשאה חדשה** — טריגר חדש מבקש הרשאה, גם אם הפרויקט נפרס. לתעד זאת.
- **מכסת טריגר** — `ScriptApp.newTrigger` > 90 דקות/יום → לא יודעים; לא להסתמך על פעולות אוטומטיות כבדות.

## 4. מכסות — לטיפול מודע (ועדיין לא לחשבן)

| משאב | מכסה יומית (חשבון רגיל) | נקודת התייחסות |
|---|---|---|
| `UrlFetchApp` | 20,000 קריאות, ~100MB | לא בשימוש רב בפרויקט (אין אינטגרציה חיצונית בשלב 1) |
| זמן ריצה כולל | 90 דק'/יום (?) — משתנה | יותר מ-3 משתמשים × עשרות בקשות/יום — בטוח |
| `MailApp/GmailApp` | 100 מיילים/יום | שלב מאוחר; לא להפעיל אוטומטית |
| `CacheService` | 6 שעות TTL, 100KB לערך | — |
| `PropertiesService` | 500KB/סקריפט, 9KB/ערך | — |
| `SpreadsheetApp` קריאות | 1 מיליון/יום (?) | זניח בהיקפנו |
| `LockService` המתנה | 15 שנ' מומלץ | 3 משתמשים — לא אמורה להיתקע |

**עיקרון:** אין להסתמך על מכסה; לתכנן כך שנוכל לחזור למצב תקין אם ריצה נכשלה (job state).

## 5. UrlFetchApp (שלבי-עתיד / אינטגרציה)

```js
function fetchJson(url, opts) {
  opts = opts || {};
  for (var attempt = 0, delay = 1000; attempt < 3; attempt++, delay *= 2) {
    try {
      var res = UrlFetchApp.fetch(url, {
        method: opts.method || 'get',
        contentType: 'application/json',
        headers: opts.headers || {},
        payload: opts.body ? JSON.stringify(opts.body) : undefined,
        muteHttpExceptions: true,          // ← כדי לקרוא status, לא לזרוק
        followRedirects: true
      });
      var code = res.getResponseCode();
      if (code >= 400) { if (code < 500 && code !== 429) break; throw new Error('HTTP ' + code); }
      var text = res.getContentText();
      try { return JSON.parse(text); } catch (e) { throw new Error('תשובה לא JSON: ' + text.slice(0, 200)); }
    } catch (e) {
      if (attempt === 2) throw new AppError('EXTERNAL', String(e.message), 'שירות חיצוני לא זמין כרגע');
      Utilities.sleep(delay + Math.random() * 500);
    }
  }
}
```
- **תמיד `muteHttpExceptions: true`** — שליטה על קודי שגיאה. אחרת apps script חוסם.
- **backoff אקספוננציאלי** עם jitter. 429/5xx — retry; 400/401/403 — לא.
- **rate limiting** — אם API חיצוני: máximo X בקשות/דקה. במצב כזה — `CacheService` + batch.
- **אין לא להמציא API** — אם לא ידוע — לתעד ולבדוק.

## 6. גיבוי מתוזמן (`system.gs`)

```js
function backupDaily_() {
  var folder = DriveApp.getFoldersByName('גיבוי מערכת חדרים').next();
  var ssFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  var name = 'גיבוי - ' + Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd HHmm');
  ssFile.makeCopy(name, folder);
  // שמירה על 30 אחרונים — למחוק את הישנים
  var files = folder.getFiles();
  var list = []; while (files.hasNext()) list.push(files.next());
  list.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = 30; i < list.length; i++) list[i].setTrashed(true);
}
```
- trigger יומי אחד (בלילה) — `setupTriggers()`.
- **רגילה**: גם לפני מיגרציה — `backupNow_()` ביד.

## 7. דגלים אדומים
- לא "לשכוח" שכל בקשה חדשה היא execution חדש: כל משתנה גלובלי — מתאפס.
- `timeBased().everyMinutes(1)` → responsive trigger — **זול** אבל 1 דק' × 60 × 24 = 1,440 הפעלות. לפרויקט — כל 5–15 דק'.
- trigger שנשאר אחרי שהפרויקט הוסר — לשמור על מיעוט.
- `try { ... } catch` ריק — ה-job מופיע "running" לתמיד.
- `Utilities.sleep(300000)` — 5 דק' שינה = timeout. לא לנסות "לחכות".
- `UrlFetchApp` בלי `muteHttpExceptions` — כל 404 הופך לחריטה כללית.
- לגעת בגיליון ה"מקורי" של משתמש — תמיד ב-`SpreadsheetApp.getActive()` (הגיליון שלנו).
