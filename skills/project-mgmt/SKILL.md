---
name: project-mgmt
description: מודל המשימות והפרויקטים — מבנה משימה/תת-משימה/פרויקט, סטטוסים, עדיפויות, תאריכים, שיוך, וקשרי תקלה/פנייה. השתמש בכל עבודה על סכימת משימות/פרויקטים, טפסים, או כללי התנהגות.
---

# מודל משימות ופרויקטים

> המקור המחייב: `docs/spec.md` §3.9. סכימת העמודות — `SCHEMA.tasks` ב-`data/schema.gs`.

## 1. ישויות

```
project 1───* task
user    1───* task.assigned_to
request / incident ──* task            (קישור אופציונלי, לא חובה)
```

- **פרויקט** — קבוצת משימות הקשורות ("רענון חדר 3"). **לא** חובה; רוב המשימות אינן בפרויקט.
- **משימה** — יחידת עבודה. עצמאית, או נוצרת מתקלה/פנייה (`incident_id` / `request_id`).
- **תת-משימות** — `parent_id` על `tasks`. **רמה אחת בלבד** (אב — בן). לא עץ אינסופי.

## 2. סכימה (עמודות בגיליון `tasks`)

| עמודה | טיפוס | הערות |
|---|---|---|
| `id` | ref | `tsk_xxx` |
| `title` | text | חובה |
| `description` | text | |
| `status` | enum | `לביצוע` / `בביצוע` / `בוצע` |
| `priority` | enum | `נמוכה` / `רגילה` / `גבוהה` / `דחוף` |
| `due_date` | date | `dd/mm/yyyy` או ריק |
| `assigned_to` | ref user | מייל; ריק = לא הוקצה |
| `project_id` | ref | nullable |
| `incident_id` | ref | nullable |
| `request_id` | ref | nullable |
| `room_id`, `computer_id`, `resource_id` | ref | nullable — שיוך הגיוני |
| `parent_id` | ref | תת-משימה |
| `created_at`, `updated_at` | ms | |
| `deleted_at` | ms | מחיקה רכה |

## 3. כללים

1. **סטטוסים — שלושה בלבד.** אין "בבדיקה"/"ממתין". אם צריך — בדשבורד ("באיחור" הוא נגזרת של `due_date`, לא סטטוס).
2. **עדיפות** — מ-`SCHEMA.enums`. ברירת מחדל `רגילה`.
3. **`due_date`** — עבר (ואינו `בוצע`) = **באיחור**. עברי, לפי `hebrew-dates`.
4. **`בוצע`** — שומר `updated_at`; אם יש תת-משימות פתוחות — **אזהרה** לא חסימה ("יש 2 תת-משימות פתוחות").
5. **מחיקה** — רכה. **מחיקת פרויקט** — לא מוחקת משימות; הן נשארות `project_id = null` (או שהמשתמש בוחר). `ON DELETE CASCADE` — **אסור** — כאוס.
6. **`parent_id`** — לא ניתן לשרשר בן לבן. לא ניתן להפוך בן לאב.
7. **`assigned_to`** — מייל מתוך `users`; אין להמציא.
8. **מיון** — לפי עדיפות ואז `due_date` ואז `created_at`.

## 4. API

```
tasks.list   { project_id?, status?, assigned_to?, overdue? }
tasks.get    { id }
tasks.create { title, ... }
tasks.update { id, patch, updated_at }      // optimistic (gas-data §5)
tasks.transition { id, to }                  // לביצוע → בביצוע → בוצע (ולא אחורה?)
tasks.remove { id }
projects.list / create / update / remove
```
- מעברים: `לביצוע → בביצוע → בוצע`; `בוצע → בביצוע` (פתיחה מחדש) — מותר. **לוג activity** בכל שינוי סטטוס.
- **שליחת `updated_at`** מהקליינט בכל update — `CONFLICT` אם השתנה.

## 5. דשבורד
- "להיום" — `due_date == today AND status != בוצע`.
- "באיחור" — `due_date < today AND status != בוצע`.
- **לא** "ספרינטים", **לא** לוח גאנט. היקף: בית ספר, 3 אנשים.

## 6. דגלים אדומים
- להוסיף סטטוס חדש בלי לעדכן `SCHEMA.enums` — ולידציה תתפוס, אבל ה-UI לא יציג.
- `due_date` כטקסט חופשי ("מחר") — לא. עברי קבוע.
- `parent_id` עצמי — לופ. לבדוק.
- מחיקת משתמש שחתום על משימות — להשאיר את המייל; להציג "משתמש שהוסר".
- לשנות `assigned_to` לכל המשימות של משתמש מושבת בפתאומיות — לשקול, ולעדכן ביומן.
