---
name: ui-chat
description: לוח הודעות פנימי ב-Apps Script — רשימות הודעות, "נקרא" אישי, קישור לישויות, ורענון (polling) ב-Web App. השתמש כשעובדים על מודול ההודעות או על עדכון חי של מסך.
---

# לוח הודעות (3 משתמשים)

## מצב
- **אין WebSocket ב-HtmlService.** רענון (polling) הוא הדרך.
- **3 אנשים** — עדכון כל 30–60 שנ' לדשבורד ההודעות מספיק. לעמוד ההודעות הפתוח — 15 שנ'.
- **`google.script.run` = הרצת סקריפט בכל קריאה.** polling של 5 שנ' × 3 משתמשים כל היום = אלפי executions. **לחסוך.**

## קריאה — גרסה מינימלית

```js
// api/messages.gs
function api_messages_poll(ctx) {
  var after = Number(ctx.params.after || 0);        // ms של ההודעה האחרונה
  var list = messagesRepo.list({ created_at__gt: after }, { limit: 50 });
  return { messages: list, serverTime: Date.now() };
}
```
```js
// web/components/messages.js
function startPolling(onNew) {
  var last = 0, fails = 0, timer = null;
  function tick() {
    if (document.hidden) return schedule(60000);      // טאב מוסתר — לדלל
    call('messages', 'poll', { after: last }).then(function (res) {
      fails = 0;
      if (res.messages.length) { last = res.serverTime; onNew(res.messages); }
      schedule(res.messages.length ? 15000 : 45000);
    }).catch(function () { fails++; schedule(Math.min(15000 * Math.pow(2, fails), 300000)); });
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
  tick();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
}
```
- **backoff** עד 5 דק' — לא להציף כשהרשת נפלה.
- `visibilitychange` — לחזור מיד כשהטאב נראה.
- **היסטוריה** — לא למשוך את כל ההודעות בכל פעם; `after` ms.
- **שולח** — מה-`ctx.user`, לא מהקליינט.

## "נקרא" אישי

- לכל משתמש — מהודעות שלא קראו. טבלה `message_reads`:
  `id, message_id, user_email, read_at` — או מפתח `read:<user>` ב-`userCache` של מזהי הודעות (קטן, אך נמחק ב-TTL).
- **מומלץ: גיליון `message_reads`** — אמת מתמשכת (לא נעלם כמו Cache). מונה "לא נקרא" נגזר.
- סימון כנקרא — כשהמשתמש פותח את ההודעה (לא ברשימה). **"אני בלבד"** — לא משפיע על אחרים.
- הודעה לאדם אחד (`recipient_id`) — אחרים לא רואים בכלל (או רואים "הודעה אישית" ואינם יכולים לפתוח, לפי design).

## קישור לישות
```js
// messages.linked_entity = { "type": "incident", "id": "inc_..." }
// במסך התקלה: "הודעות מקושרות" — list({ 'linked.type':'incident', 'linked.id': id })
```
- קישור דו-כיווני — במסך הישות "שלח הודעה", במסך ההודעה "פתח תקלה".

## UX
- הודעה חדשה — להוסיף לרשימה מיד; לא לחכות ל-pollינג.
- `aria-live="polite"` על רשימת ההודעות.
- Enter — שליחה? לא necessario. לנו ה"שלח" מפורש (פחות הטעות).
- מודע לזכויות: מייל — לא. מדובר בלוח פנימי.

## דגלים אדומים
- Polling כל שנייה — בזבוז מכסת ריצה. 15–45 שנ'.
- למשוך את כל ההיסטוריה בכל רענון.
- "נקרא" לכולם — מבטל את ה"אני בלבד".
- לעדכן `last` ל-`created_at` של ההודעה האחרונה כששנייה באותו ms — להחמיץ. להשתמש ב-`serverTime` (שרת) ולא בשעון המכשיר.
- Polling ממשיך גם כשה-UI לא במסך ההודעות — לעצור כשעוברים דף (`clearTimeout` + ביטול מאזינים).
- `recipient_id` ריק = כללי. **לא** להתעלם — ברירת מחדל כללי.
