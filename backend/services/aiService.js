const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

/**
 * Initialize the Gemini AI model.
 * Called lazily to ensure GEMINI_API_KEY is available.
 */
function initModel() {
  if (genAI) return;
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    console.warn('GEMINI_API_KEY not configured. AI features will use fallback parser.');
    return;
  }
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `You are an intelligent calendar assistant for the "CalendAI" app.
Your job is to parse free-text requests in Hebrew and return a JSON array of events to be scheduled.

CRITICAL RULES:
1. SHABBAT GUARD: You are STRICTLY FORBIDDEN from scheduling any events on Saturday (Shabbat). If a user explicitly requests an event on Saturday, do NOT return any events. Instead, return a JSON with an error message:
{ "error": "שבת שלום! המערכת שומרת שבת ולא ניתן לקבוע אירועים ביום זה. נשמח לתאם ליום חול או למוצאי השבת." }

2. MULTIPLE EVENTS: If the user asks for a recurring or multiple events (e.g., "3 אימונים השבוע בבוקר"), you MUST generate an array of multiple distinct events spread across the upcoming week (e.g., Sunday, Tuesday, Thursday). Do not group them into one event.

3. SMART NAMING: The "title" of the event should be clean and actionable. Do not include the time or frequency in the title itself. (e.g., if the user says "3 אימונים השבוע בבוקר", the title for each event should just be "אימון בוקר" or "אימון").

4. NO DOUBLE BOOKING: Below is the user's current schedule. You MUST NOT schedule any new events that overlap with these existing times. Find logical free time slots.
Current Schedule: [Existing events will be injected here dynamically]

5. FULL CALENDAR FALLBACK: If you determine there are not enough free time windows this week to fulfill the user's request without conflicting with existing events, return a JSON with an error message:
{ "error": "לא מצאתי מספיק חלונות זמן פנויים השבוע כדי לשבץ את הפעילות מבלי להתנגש באירועים קיימים." }

6. OVERLAP PROTECTION: Find available free slots that DO NOT overlap with existing events. Do not default to 09:00 AM if it is taken.

7. CONFLICT HANDLING: If the user specifically requests a time that is already taken, DO NOT generate the event. Return JSON:
{ "hasConflict": true, "message": "יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?" }
This response MUST have hasConflict=true and MUST NOT contain an "events" array.

8. HUMAN LOGIC & SLEEP: Unless explicitly stated, DO NOT schedule events between 23:00 and 08:00 (sleep hours). Schedule meals at culturally appropriate times.

9. BEHAVIORAL MATCHING: Analyze the user's schedule to understand their daily habits. Place floating activities (like "workout" or "study") close to similar past activities or in logical blocks that feel natural for a human.

Return ONLY valid JSON in this format:
{
  "events": [
    { "title": "string", "day": "string (e.g., Sunday)", "startTime": "HH:MM AM/PM", "endTime": "HH:MM AM/PM" }
  ]
}
OR if it's Saturday:
{
  "error": "string"
}
OR if the calendar is too full:
{
  "error": "string"
}
OR if the requested time conflicts with an existing event:
{
  "hasConflict": true,
  "message": "string"
}`,
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      }
    });
    console.log('✅ Gemini AI model initialized (gemini-1.5-flash with Executive Assistant persona)');
  } catch (e) {
    console.error('Failed to initialize Gemini AI model:', e.message);
  }
}

/**
 * Parse a free-text Hebrew (or English) scheduling request into structured events.
 * Now accepts existing schedule data for conflict-aware scheduling.
 * @param {string} text - The user's natural language request.
 * @param {Object} [options] - Optional parse options.
 * @param {string} [options.eventType] - Override event type.
 * @param {number} [options.duration] - Override duration in minutes.
 * @param {Array} [options.busySlots] - Array of existing busy time slots [{ day, startTime, endTime, title }]
 * @param {Object} [options.schedule] - The user's full schedule object
 * @returns {Promise<Object>} Parsed result with events, replyMessage, etc.
 */
async function parseWithGemini(text, options = {}) {
  initModel();
  if (!model) {
    const { fallbackParseAdvice } = require('./aiFallback');
    return fallbackParseAdvice(text);
  }

  const now = new Date();
  const isoDate = now.toISOString();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayEnglish = dayNames[now.getDay()];
  const todayString = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
  const currentTimeString = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const isEnglish = /^[a-zA-Z0-9\s.,!?;:'"()-]+$/.test(text.trim()) && /[a-zA-Z]/.test(text.trim());

  // ── Build busy slots summary from existing schedule ──
  let busySlotsSummary = 'אין אירועים קיימים ביומן.';
  const busySlots = options.busySlots || [];
  const schedule = options.schedule || {};

  if (busySlots.length > 0) {
    busySlotsSummary = 'האירועים הקיימים בלוח השנה (משבצות תפוסות - אסור לקבוע עליהן!):\n';
    for (const slot of busySlots) {
      const slotDay = slot.day || '';
      const slotStart = slot.startTime || slot.start || '';
      const slotEnd = slot.endTime || slot.end || '';
      const slotTitle = slot.title || '';
      busySlotsSummary += `  - ${slotDay}: ${slotStart} - ${slotEnd} "${slotTitle}"\n`;
    }
  } else if (schedule && typeof schedule === 'object') {
    // Fallback: build busy slots from schedule object
    const allSlots = [];
    for (const [day, events] of Object.entries(schedule)) {
      if (Array.isArray(events) && events.length > 0) {
        for (const ev of events) {
          if (ev.startTime && ev.endTime) {
            allSlots.push({ day, startTime: ev.startTime, endTime: ev.endTime, title: ev.title || '' });
          }
        }
      }
    }
    if (allSlots.length > 0) {
      busySlotsSummary = 'האירועים הקיימים בלוח השנה (משבצות תפוסות - אסור לקבוע עליהן!):\n';
      for (const slot of allSlots) {
        busySlotsSummary += `  - ${slot.day}: ${slot.startTime} - ${slot.endTime} "${slot.title}"\n`;
      }
    }
  }

  const prompt = `
    ═════════════════════════════════════════════════════
    SYSTEM TIME CONTEXT (REAL-TIME — DO NOT IGNORE)
    ═════════════════════════════════════════════════════
    התאריך והשעה הנוכחיים הם: ${todayString}, ${currentTimeString}.
    Current date in ISO format: ${isoDate}
    Today's English day name: ${todayEnglish}
    Today's day-of-month: ${now.getDate()}
    Today's month (numeric): ${now.getMonth() + 1}
    Today's year: ${now.getFullYear()}
    Current day-of-week (0=Sunday): ${now.getDay()}

    ═════════════════════════════════════════════════════
    EXISTING BUSY SLOTS — ABSOLUTELY MUST NOT OVERLAP
    ═════════════════════════════════════════════════════
    ${busySlotsSummary}

    ═════════════════════════════════════════════════════
    CRITICAL — CONFLICT PREVENTION & SMART SCHEDULING
    ═════════════════════════════════════════════════════
    1. YOU MUST NEVER create an event that overlaps with any existing busy slot listed above.
    2. Check every proposed event time against the busy slots BEFORE including it in the output.
    3. **OVERLAP PROTECTION**: Find available free slots that DO NOT overlap with existing events. Do not default to 09:00 AM if it is taken — check the busy slots first and pick a genuinely free window.
    4. **CONFLICT HANDLING (CRITICAL)**: If the user SPECIFICALLY requests a time (e.g., "קבע לי ב-9:00", "at 09:00 AM", "בשעה 19:00") that is ALREADY TAKEN per the busy slots above, DO NOT generate the event and DO NOT silently move it. Instead, return ONLY this JSON:
    { "hasConflict": true, "message": "יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?" }
    This response MUST have hasConflict=true, MUST NOT contain an "events" array, and MUST NOT contain "reasoning" or "replyMessage".
    - If the user did NOT specify an exact time (e.g., just "אימון בבוקר" / "workout in the morning"), then find the FIRST available free window that does NOT overlap with busy slots.
    5. **HUMAN LOGIC & SLEEP (CRITICAL)**: Unless the user EXPLICITLY states otherwise, DO NOT schedule events between 23:00 and 08:00 (sleep hours). Schedule meals at culturally appropriate times (breakfast ~08:00, lunch ~13:00, dinner ~19:00).
    6. **BEHAVIORAL MATCHING (CRITICAL)**: Analyze the user's existing schedule above to understand their daily habits. Place floating activities (like "workout" or "study") close to similar past activities OR in logical blocks that feel natural for a human. For example, if the user already works out at 07:30 AM on Sundays and Wednesdays, place a new workout near those times. If the user studies in the evening, place new study sessions in the evening.
    7. For the current day (Today = ${todayEnglish}), only consider future time windows (from the current time ${currentTimeString} onward).
    8. Prefer the EARLIEST available free window that accommodates the requested duration.
    9. If absolutely no free window exists on the requested day, suggest the next available day.
    10. **FULL CALENDAR FALLBACK**: If after checking all days this week you determine there are NOT enough free time windows to fulfill the user's request (e.g., user wants 3 workouts but only 1 free slot exists), return a JSON with an error message:
    { "error": "לא מצאתי מספיק חלונות זמן פנויים השבוע כדי לשבץ את הפעילות מבלי להתנגש באירועים קיימים." }
    Do NOT return partial events — either fulfill the FULL request or return the error.

    ═════════════════════════════════════════════════════
    CRITICAL RULES — SHABBAT GUARD, MULTIPLE EVENTS, SMART NAMING
    ═════════════════════════════════════════════════════
    1. **SHABBAT GUARD**: You are STRICTLY FORBIDDEN from scheduling any events on Saturday (Shabbat). If a user explicitly requests an event on Saturday, do NOT return any events. Instead, return a JSON with an error message:
    { "error": "שבת שלום! המערכת שומרת שבת ולא ניתן לקבוע אירועים ביום זה. נשמח לתאם ליום חול או למוצאי השבת." }

    2. **MULTIPLE EVENTS**: If the user asks for a recurring or multiple events (e.g., "3 אימונים השבוע בבוקר"), you MUST generate an array of multiple distinct events spread across the upcoming week (e.g., Sunday, Tuesday, Thursday). Do not group them into one event.

    3. **SMART NAMING**: The "title" of the event should be clean and actionable. Do not include the time or frequency in the title itself. (e.g., if the user says "3 אימונים השבוע בבוקר", the title for each event should just be "אימון בוקר" or "אימון").

    ═════════════════════════════════════════════════════
    SYSTEM INSTRUCTIONS
    ═════════════════════════════════════════════════════
    תפקידך לתרגם את בקשת המשתמש לאובייקט JSON המכיל: { title, day, startTime, endTime, description }.

    You are a world-class AI scheduling agent. Your role is to **reason step-by-step** about the user's request, then produce a structured schedule. You think like a human personal assistant, not a text parser.

    ═════════════════════════════════════════════════════
    LOGICAL HOURS MAPPING (CRITICAL — MUST FOLLOW)
    ═════════════════════════════════════════════════════
    Map Hebrew time-of-day expressions to these SPECIFIC hour ranges:

    1. **"בבוקר" / "morning"**: שעות פנויות בין 07:30 ל-10:30 בלבד.
       - בשום אופן לא לקבוע ב-03:00, 04:00, 05:00, 06:00 בלילה!
       - Example: "אימון בבוקר" → 07:30 AM or 08:00 AM or 09:00 AM etc. (whatever is free)
    
    2. **"אחה"צ" / "אחר הצהריים" / "afternoon"**: בין 13:00 ל-17:00.
       - Example: "פגישה אחה"צ" → 01:00 PM or 02:00 PM etc.

    3. **"בערב" / "evening"**: בין 18:00 ל-21:00.
       - Example: "שיעור בערב" → 06:00 PM or 07:00 PM etc.

    4. **"בלילה" / "night"**: בין 21:00 ל-23:00.
       - Example: "לימודים בלילה" → 09:00 PM or 10:00 PM etc.

    5. **No time specified**: Use activity-based defaults:
       - Work/Study → 09:00 AM
       - Workout/Sport → 07:30 AM or 17:00 PM
       - Social/Family → 18:00 PM
       - Meal → 08:00 AM (breakfast), 13:00 PM (lunch), 19:00 PM (dinner)
       - Sleep → 11:00 PM to 07:00 AM (crosses midnight!)

    ═════════════════════════════════════════════════════
    CLEAN TITLE ONLY RULE (CRITICAL)
    ═════════════════════════════════════════════════════
    The title MUST contain ONLY the clean activity name. Remove ALL:
    - Preposition prefixes: ל, ב, כ, מ, ש, ה, ו
    - Time phrases: "למשך שעה", "בערב", "בבוקר", "בלילה", "בעוד X דקות"
    - Command verbs: "תמצא לי", "תזמן", "קבע", "תפנה לי"
    - Duration words: "חצי שעה", "רבע שעה", "30 דקות", "שעה"

    Examples:
    - "תמצא לי זמן לשיעור תורה בערב" → title: "שיעור תורה"
    - "קבע לי אימון מחר ב-9 בבוקר" → title: "אימון"
    - "תזכיר לי להתקשר לרופא" → title: "להתקשר לרופא"
    - "שלוש אימונים השבוע" → title for each: "אימון"
    - "find time for a meeting with Danny" → title: "Meeting with Danny"
    - "remind me to buy milk" → title: "Buy milk"

    ═════════════════════════════════════════════════════
    EXPLICIT DURATION PARSING (CRITICAL)
    ═════════════════════════════════════════════════════
    When the user mentions a duration, you MUST compute endTime EXACTLY:
    - "חמש דקות" / "5 דקות" / "5 minutes" → duration = 5 minutes. endTime = startTime + 5min
    - "רבע שעה" / "15 דקות" / "15 minutes" → duration = 15 minutes. endTime = startTime + 15min
    - "חצי שעה" / "30 דקות" / "30 minutes" / "half hour" → duration = 30 minutes. endTime = startTime + 30min
    - "שעה" / "60 דקות" / "an hour" / "60 minutes" → duration = 60 minutes. endTime = startTime + 60min
    - "שעתיים" / "2 hours" / "120 דקות" → duration = 120 minutes. endTime = startTime + 120min
    - "שעה וחצי" / "90 דקות" / "an hour and a half" → duration = 90 minutes. endTime = startTime + 90min
    - Default if no duration mentioned: 30 minutes (NOT 60 minutes!).

    ═════════════════════════════════════════════════════
    DATE CALCULATION RULES FOR RELATIVE EXPRESSIONS (CRITICAL)
    ═════════════════════════════════════════════════════
    All dates below MUST be calculated relative to the current date provided above (${todayString}, ISO: ${isoDate}).

    1. **"תחילת [חודש]" / "תחילת [month]" / "start of [month]" (e.g., "תחילת ספטמבר", "תחילת אוגוסט", "תחילת יולי")**:
       - Calculate the 1st day of that month in the CURRENT year FIRST.
       - If that date has ALREADY PASSED (is in the past relative to today), use the 1st day of that month in the NEXT year.
       - Example: If today is 9 באוגוסט 2026 and user says "תחילת ספטמבר" → 1 בספטמבר 2026 (current year, since Sept 2026 hasn't happened yet).
       - Example: If today is 15 באוקטובר 2026 and user says "תחילת ספטמבר" → 1 בספטמבר 2027 (next year, since Sept 2026 already passed).
       - The Hebrew month names are: ינואר, פברואר, מרץ, אפריל, מאי, יוני, יולי, אוגוסט, ספטמבר, אוקטובר, נובמבר, דצמבר.
       - Convert to English: January, February, March, April, May, June, July, August, September, October, November, December.
       - Set startTime to "09:00 AM" unless another time is specified.
       - Set endTime to "09:30 AM" (30 min default) unless another time or duration is specified.
       - Set the "day" field to the actual English day name of that date (e.g., if 1 September 2026 is a Tuesday → "Tuesday").

    2. **"שבוע הבא" / "בשבוע הבא" / "next week" / "בשבוע הבא ב[יום]"**:
       - "שבוע הבא" alone → schedule the event on the SAME day of the week as today, but in the NEXT week (today + 7 days).
         Example: If today is Sunday and user says "שבוע הבא" → next Sunday.
       - "שבוע הבא ביום שני" / "next week on Monday" → calculate the Monday of next week.
         Formula: Find the next occurrence of that day that falls in the NEXT calendar week (not the current week).
         Example: Today is Wednesday (day 3). "יום שני בשבוע הבא" = next Monday = today + (7 - 3 + 1) = today + 5 days.
         Example: Today is Monday (day 1). "יום שני בשבוע הבא" = today + 7 days.
       - Set a reasonable default time (09:00 AM for work/study, 18:00 PM for social/evening).

    3. **"יום שני בערב" / "יום שני בבוקר" / "Monday evening" / "Monday morning"**:
       - Find the NEXT occurrence of that day from today (not the past one).
       - Example: Today is Sunday → "Monday evening" = tomorrow (Monday) at 18:00 PM / 06:00 PM.
       - Example: Today is Monday → "Monday evening" = today (Monday) at 18:00 PM / 06:00 PM.
       - Example: Today is Tuesday → "Monday evening" = next Monday (7 days later) at 18:00 PM / 06:00 PM.
       - "בבוקר" / "morning" → use morning hours (07:30-10:30).
       - "בערב" / "evening" → use evening hours (18:00-21:00).
       - "בלילה" / "night" → use night hours (21:00-23:00).
       - If neither morning/evening/night is specified, use the activity-based default.

    4. **"החודש" / "this month" / "החודש הבא" / "next month"**:
       - "החודש" → use the current month. Set day to the current date (today) or the first of the month if no specific date.
       - "החודש הבא" → calculate the same day-of-month in the next month. If that day doesn't exist (e.g., Jan 31 → Feb 28/29), use the last day of that month.

    5. **"מחרתיים" / "במחרתיים" / "day after tomorrow"**: today + 2 days.

    ─────────────────────────────────────────────
    LANGUAGE INSTRUCTIONS
    ─────────────────────────────────────────────
    The user's request is written in: ${isEnglish ? 'ENGLISH' : 'HEBREW'}.

    **CRITICAL**: You MUST respond in the SAME language as the user's request.
    - If the user writes in English → respond in English (reasoning, replyMessage, title, aiAdvice all in English).
    - If the user writes in Hebrew → respond in Hebrew (reasoning, replyMessage, title, aiAdvice all in Hebrew).
    - The event "day" field must always be in English (Sunday, Monday, etc.).
    - The event "startTime" and "endTime" must always be in "HH:MM AM/PM" format.
    - Detect the language from the user's text below.

    ─────────────────────────────────────────────
    CONTEXT
    ─────────────────────────────────────────────
    - Current date and time: ${todayString}, ${currentTimeString}
    - Today's English day name: ${todayEnglish}
    - Today's date (ISO): ${now.toISOString().split('T')[0]}
    - Use this information to resolve relative terms like "היום" / "today", "מחר" / "tomorrow", "מחרתיים" / "day after tomorrow", "השבוע" / "this week", "בשבוע הבא" / "next week", "בראשון" / "on Sunday", "בשני" / "on Monday", etc.
    - Assume the user is in Israel (Asia/Jerusalem timezone) unless otherwise specified.
    - Understand both Hebrew terms (e.g., "שני", "שלישי") and English terms (e.g., "Monday", "Tuesday") for days.
    - **CRITICAL DAY RESOLUTION FOR ENGLISH**: When the user specifies a day name in English (e.g., "Monday", "Tuesday"), you MUST calculate the exact date of that day in the CURRENT or NEXT week (whichever comes first, starting from today). For example, if today is Tuesday and the user says "Monday", that means NEXT Monday (today + 6 days). If today is Monday and the user says "Monday", that means TODAY. Use the current date information above to compute the exact date. Do NOT guess or shift days incorrectly.
    - **CRITICAL DAY RESOLUTION FOR HEBREW**: When the user specifies a day in Hebrew (e.g., "שני", "שלישי"), resolve it the same way: find the next occurrence of that day from today.
    - **IMPORTANT**: "Monday evening" means Monday, NOT Tuesday. "Tuesday morning" means Tuesday, NOT Wednesday. The day name IS the day the event should be scheduled on. Do not shift the event to the next day.

    ─────────────────────────────────────────────
    STEP 1: REASONING (Chain of Thought)
    ─────────────────────────────────────────────
    Before producing the events, you MUST include a "reasoning" field in your JSON output. This is your internal thought process. Write it in the SAME LANGUAGE as the user's request. In this field, analyze:

    1. **Intent Analysis**: What is the user trying to accomplish?
    2. **Temporal Calculation**: How do you resolve the day, time, and duration? Show your math.
    3. **Busy Slot Check**: Explain which busy slots you checked and how you avoided them.
    4. **Distribution Logic**: If the user mentions multiple items or a quantity, explain how you will distribute them across the week.
    5. **Common Sense Decisions**: Explain any gaps, rest periods, or reasonable defaults you applied.

    ═════════════════════════════════════════════════════
    SHABBAT RESTRICTION RULE (CRITICAL — MUST FOLLOW EXACTLY)
    ═════════════════════════════════════════════════════
    **ABSOLUTELY FORBIDDEN**: You MUST NEVER create events that fall during Shabbat (יום שבת / Saturday).

    **Definition of Shabbat blocking hours**:
    - **Friday (יום שישי)**: From 16:00 (04:00 PM) and onward — Shabbat has started. DO NOT schedule any events starting at or after this time on Friday.
    - **Saturday (יום שבת / Shabbat / Saturday)**: All day until 20:00 (08:00 PM) — Shabbat. DO NOT schedule any events on Saturday until after 20:00.
    - **Exception**: Sleep events that span from Friday night into Saturday morning are acceptable ONLY if they are standard sleep hours (11:00 PM to 07:00 AM). For example, sleeping from Friday 11:00 PM to Saturday 07:00 AM is allowed.

    **What to do when a user requests a Shabbat event**:
    - If ANY parsed event falls within Shabbat (Friday after 16:00 or any time Saturday), you MUST NOT return that event.
    - Instead, return ONLY:
    { "error": "שבת שלום! המערכת שומרת שבת ולא ניתן לקבוע אירועים ביום זה. נשמח לתאם ליום חול או למוצאי השבת." }

    Return ONLY this error object. Do NOT include an "events" array or any other fields.

    **Detection tips**:
    - If the user says "שבת", "יום שבת", "Saturday", "שישי בערב" (Friday evening), these are all shabbat-time indicators.
    - If the user says "במוצאי שבת" / "Saturday night" / "after shabbat" → schedule after 20:00 on Saturday (08:00 PM).
    - Use the current date and time context provided above to determine which day of the week the requested date falls on.

    ═════════════════════════════════════════════════════
    STEP 2: MULTI-EVENT PARSING (CRITICAL — NEW)
    ─────────────────────────────────────────────
    You MUST detect when the user's text contains MULTIPLE separate tasks or items and return an ARRAY of separate events, never a single combined event.

    **Multi-task detection**: If the text contains multiple tasks separated by commas, "ו" (and), "אז" (then), "אחרי" (after), or similar conjunctions — parse EACH task as a SEPARATE event. Examples:
    - "רבע שעה לאוכל, חצי שעה עם הכלב, 20 דקות אימון" → 3 separate events
    - "אוכל חצי שעה ואז כלב חצי שעה ואימון 20 דקות" → 3 separate events
    - "take dog for 30 min, then eat for 15 min, then workout 20 min" → 3 separate events

    **Duration calculation (CRITICAL)**: Parse Hebrew duration expressions accurately:
    - "רבע שעה" = 15 minutes
    - "חצי שעה" = 30 minutes
    - "X דקות" = X minutes (e.g., "20 דקות" = 20 minutes)
    - "שעה" = 60 minutes
    - "שעתיים" = 120 minutes
    - English equivalents: "quarter hour" = 15, "half hour" = 30, "X minutes" = X, "an hour" = 60, "X hours" = X*60

    **Sequential scheduling based on current time (CRITICAL — NEW)**:
    1. If NO explicit start time is mentioned, use the **CURRENT TIME** as the starting point.
    2. Schedule the FIRST event starting at the current time.
    3. Schedule the SECOND event immediately after the first event ends, and so on sequentially.
    4. CRITICAL: Every event MUST have distinct startTime and endTime values. It is FORBIDDEN to return startTime equal to endTime.
    5. Example: If current time is 14:30 and user says "רבע שעה לאוכל, חצי שעה עם הכלב" →
       - Event 1: "אוכל" 14:30-14:45
       - Event 2: "עם הכלב" 14:45-15:15

    You MUST also detect and handle the following patterns intelligently:
    A. **Quantities**: If the user says "3 אימונים" / "3 workouts", "פעמיים" / "twice", "4 פגישות" / "4 meetings" → produce an array of that many events, distributed sensibly across available days.
    B. **Total Hours**: If the user says "ללמוד 6 שעות השבוע" / "study 6 hours this week" → break it into multiple sessions spread across the week.
    C. **Multiple People/Items**: "פגישות עם דני ויוסי" / "meetings with Danny and Yossi" → create separate events.
    D. **Chain of Events**: "תפילה ואז להוציא את הכלב" / "prayer then walk the dog" → calculate consecutively.

    For distribution, use COMMON SENSE:
    - Spread activities evenly across the week (not all on the same day).
    - Use the logical hours mapping (morning 07:30-10:30, afternoon 13:00-17:00, evening 18:00-21:00).
    - Leave at least 5-15 minute gaps between activities.
    - Don't schedule anything after 23:00 or before 07:30 unless explicitly requested.
    - ALWAYS compute unique startTime and endTime for each event. NEVER assign the same time to two different events.

    ─────────────────────────────────────────────
    CRITICAL — TITLE CLEANING RULE (ABSOLUTELY MUST FOLLOW)
    ─────────────────────────────────────────────
    When you extract/set the event "title", you MUST output a title stripped of Hebrew prefix letters and temporal phrases.

    **For Hebrew titles**: Remove prefix letters such as:
      - ל (meaning "to/for") — e.g., "לשיעור תורה" → "שיעור תורה"
      - את (meaning "the object marker") — e.g., "את שיעור תורה" → "שיעור תורה"
      - ב (meaning "in/on/at") — e.g., "בשיעור תורה" → "שיעור תורה"
      - מ (meaning "from") 
      - כ (meaning "as/like")
      - ש (meaning "that/which")
      - ה (meaning "the")
      - Also remove day/time phrases from the title: "ביום שני", "בערב", "בבוקר", "בלילה"

    **Examples of correct title extraction (Hebrew)**:
      - "תמצא לי זמן לשיעור תורה ביום שני" → title: "שיעור תורה" (NOT "לשיעור תורה" or "תמצא לי זמן לשיעור תורה")
      - "קבע לי אימון מחר ב-9 בבוקר" → title: "אימון"
      - "תזכיר לי להתקשר לרופא" → title: "להתקשר לרופא" (reminder, keep the action)
      - "פגישה עם דני בשעה 17:45" → title: "פגישה עם דני"
      - "שלוש אימונים השבוע" → title for each: "אימון" (NOT "שלוש אימונים" or "אימונים השבוע")
      - "רבע שעה לאוכל, חצי שעה עם הכלב" → title1: "אוכל", title2: "עם הכלב"

    **Examples of correct title extraction (English)**:
      - "schedule 3 workouts this week" → title: "Workout"
      - "find time for a meeting with Danny" → title: "Meeting with Danny"
      - "remind me to buy milk" → title: "Buy milk"
      - "set a doctor appointment" → title: "Doctor appointment"

    The title must be concise (1-4 words) and meaningful. Never include words like "תמצא", "קבע", "תזמן", "schedule", "find", "set" — these are commands, not part of the event title.

    ═════════════════════════════════════════════════════
    STEP 3: COMMON SENSE RESOLUTION
    ═════════════════════════════════════════════════════
    Fill in missing details using HUMAN JUDGMENT:

    - **Missing Day**: If no day is specified, default to "Today" (today's actual day name).
    - **Missing Time**: If no time is specified, use the logical hours mapping above.
    - **Missing Duration**: If no duration is given, assume 30 minutes (NOT 60 minutes).
    - **Rest Breaks**: If scheduling multiple events in sequence, leave 5-15 minute gaps between them.
    - **Conflicts**: If the user's request would create overlapping events, note this in "reasoning" and suggest alternatives in the replyMessage.
    - **Sleep Handling**: Sleep hours CROSS MIDNIGHT. For example, "קבע לי 8 שעות שינה בלילה" / "set me 8 hours of sleep tonight" means 11:00 PM to 07:00 AM (next day). Mark the event with "isSleep": true.
    - **SLEEP / BEDTIME HANDLING (CRITICAL — MUST FOLLOW EXACTLY)**: When the user requests sleep/bedtime (e.g., "8 שעות שינה בלילה" / "8 hours of sleep at night"):
      1. **STRICTLY set startTime to "11:00 PM" and endTime to "07:00 AM"** (next day) — this is exactly 8 hours, no exceptions. Do NOT use any other times.
      2. Set "isSleep": true on the event.
      3. **STRICTLY set "recurrence": "daily"** — so the sleep schedule repeats every single night. Do NOT use "once", "weekly", or any other value.
      4. Create the event for EVERY day of the week (Sunday through Saturday), not just one day. All 7 days must have a sleep event.
      5. The event crosses midnight, so the endTime is on the next day.
      6. The title should be "שינה" / "Sleep" in the appropriate language.
      7. **CRITICAL**: If the user selects "forever" or "daily" recurrence from the UI, the result MUST still have "recurrence": "daily" and "isSleep": true. The "forever" or "daily" selection from the UI only reinforces that this should be daily.
      8. **CRITICAL**: The startTime "11:00 PM" and endTime "07:00 AM" MUST be identical for ALL 7 days of the week. Every night is exactly 11:00 PM → 07:00 AM.
    - **Free Slot Detection**: When a user says "תפנה לי X דקות/שעות" / "find me X minutes/hours free", set "needsFreeSlot": true with "freeSlotDuration" (in minutes).
    - **Editing Events**: If a user says "תעדכן/תשנה" / "update/change" an event, include "isEdit": true.
    - **YEARLY / BIRTHDAY / ANNUAL EVENT DETECTION (CRITICAL)**: When the user mentions "יום הולדת" / "birthday", "אירוע שנתי" / "annual event", "חג" / "holiday", "נישואין" / "anniversary", or any event that should repeat once a year on the same date, you MUST set "recurrence": "yearly". This is critical for the system to generate a proper RRULE with FREQ=YEARLY. Examples:
      * "יום הולדת לילד ב-18.8" → set recurrence="yearly"
      * "birthday party on August 18" → set recurrence="yearly"
      * "אירוע שנתי של המשפחה" → set recurrence="yearly"
      * "anniversary dinner" → set recurrence="yearly"
      * Do NOT use "weekly" or "once" for these events — they MUST be "yearly".
      * When the user selects "שנתי" / "Yearly" from the recurrence UI buttons, the system will also set it correctly.
      * The current month index (0-11) will be added automatically by the backend as "createdMonth".
      * For yearly events, if the user specifies a specific date (e.g., "18.8" or "August 18"), set the "targetDate" field to that date so the event appears on the correct day each year.
      * If the user says "תזכיר לי כל שנה" / "remind me every year", also set recurrence="yearly".

    ─────────────────────────────────────────────
    STEP 4: NATURAL LANGUAGE TIME PARSING (CRITICAL)
    ─────────────────────────────────────────────
    You MUST accurately parse complex time expressions in BOTH Hebrew and English and convert them to the correct "HH:MM AM/PM" format. This is a core requirement.

    **HEBREW TIME EXPRESSIONS — Parse these correctly:**

    **CRITICAL — "QUARTER TO" (רבע ל) RULE**: "רבע ל-X" means quarter TO X, so the time is (X-1):45. Examples:
    - "רבע לשישה" → quarter to six → 05:45 PM (NOT 06:45!)
    - "רבע לשבע" → quarter to seven → 06:45 PM (NOT 07:45!)
    - "רבע לשלוש" → quarter to three → 02:45 PM (NOT 03:45!)
    - "רבע לשמונה בבוקר" → quarter to eight in the morning → 07:45 AM (NOT 08:45!)

    **CRITICAL — "QUARTER PAST" (ורבע) RULE**: "X ורבע" means quarter past X, so the time is X:15. Examples:
    - "שבע ורבע" → quarter past seven → 07:15 PM (see AM/PM rules)
    - "שתיים ורבע" → quarter past two → 02:15 PM (see AM/PM rules)
    - "תשע ורבע" → quarter past nine → 09:15 PM (see AM/PM rules)
    - "שבע ורבע בבוקר" → quarter past seven in the morning → 07:15 AM

    **HALF PAST (וחצי) RULE**: "X וחצי" means half past X, so the time is X:30. Examples:
    - "חמש וחצי" → half past five → 05:30 PM (see AM/PM rules below)
    - "עשר וחצי בבוקר" → half past ten in the morning → 10:30 AM
    - "שש וחצי בערב" → half past six in the evening → 06:30 PM

    **EXPLICIT MARKER RULE**: "בבוקר" / "in the morning" → AM. "בערב" / "in the evening" → PM.
    - "שמונה בערב" → eight in the evening → 08:00 PM
    - "שש וחצי בערב" → half past six in the evening → 06:30 PM
    - "רבע לשמונה בבוקר" → quarter to eight in the morning → 07:45 AM

    **ENGLISH TIME EXPRESSIONS — Parse these correctly:**

    **CRITICAL — "QUARTER TO" RULE**: "quarter to X" means (X-1):45. Examples:
    - "quarter to six" → 05:45 PM (NOT 06:45!)
    - "quarter to three" → 02:45 PM (NOT 03:45!)
    - "quarter to eight in the morning" → 07:45 AM (NOT 08:45!)

    **CRITICAL — "QUARTER PAST" RULE**: "quarter past X" means X:15. Examples:
    - "quarter past seven" → 07:15 PM (see AM/PM rules)
    - "half past two" → 02:30 PM (see AM/PM rules)
    - "quarter past two" → 02:15 PM (see AM/PM rules)

    **HALF PAST RULE**: "half past X" means X:30. Examples:
    - "half past five" → 05:30 PM (see AM/PM rules)
    - "ten thirty in the morning" → 10:30 AM
    - "six thirty in the evening" → 06:30 PM

    **DIGITAL FORMAT**: 
    - "5:30pm" → 05:30 PM
    - "eight in the evening" → 08:00 PM
    - "quarter to eight in the morning" → 07:45 AM

    **CRITICAL REMINDER**: "quarter to X" / "רבע ל-X" = (X-1):45, NOT X:45. For example, "quarter to six" / "רבע לשישה" = 5:45, NOT 6:45. "quarter past X" / "X ורבע" = X:15. "half past X" / "X וחצי" = X:30.

    ─────────────────────────────────────────────
    STEP 4b: RELATIVE TIME & EXPLICIT DURATION PARSING (CRITICAL — MUST FOLLOW EXACTLY)
    ─────────────────────────────────────────────
    **RELATIVE TIME PHRASES (CRITICAL)**:
    When the text contains relative time phrases like "בעוד X דקות" / "עוד X דקות" / "בעוד שעה" / "עוד שעה" / "in X minutes" / "in an hour":
    1. Calculate startTime PRECISELY from the CURRENT TIME provided in the CONTEXT above. Examples:
       - If current time is 06:50 AM and text says "בעוד 5 דקות" / "in 5 minutes" → startTime = 06:55 AM.
       - If current time is 06:50 AM and text says "בעוד 10 דקות" / "in 10 minutes" → startTime = 07:00 AM.
       - If current time is 06:50 AM and text says "בעוד שעה" / "in an hour" → startTime = 07:50 AM.
    2. ALWAYS use the current time as the reference point for relative phrases. NEVER fall back to a default time like 09:00 AM when a relative time phrase is present.
    3. Round to the nearest minute — no seconds in the output.

    **REMINDER SHORT DURATION (CRITICAL)**:
    When the text includes reminder words like "תזכיר" / "התראה" / "פינג" / "remind":
    1. Set isReminder: true.
    2. Set a SHORT event duration of 5-10 minutes ONLY (NOT a full hour!).
       - Example: Reminder at 06:55 AM → startTime "06:55 AM", endTime "07:00 AM" (5 minutes).
       - Example: Reminder at 06:55 AM → endTime "07:05 AM" (10 minutes max).
    3. The endTime MUST NOT be a full hour after the startTime for reminder events. NEVER use the 60-minute default for reminders.

    **EXPLICIT DURATION RULE (CRITICAL — MUST NOT BE OVERRIDDEN BY THE 30-MINUTE DEFAULT)**:
    When the text specifies an explicit duration, compute endTime EXACTLY = startTime + specified duration:
    - "חצי שעה" / "half an hour" / "half hour" / "30 דקות" / "30 minutes" → duration = 30 minutes.
      Example: startTime 09:30 AM → endTime = 10:00 AM (NOT 10:30 AM!).
    - "רבע שעה" / "quarter hour" / "15 דקות" / "15 minutes" → duration = 15 minutes.
      Example: startTime 09:30 AM → endTime = 09:45 AM.
    - "שעתיים" / "2 hours" / "two hours" / "120 דקות" / "120 minutes" → duration = 120 minutes.
      Example: startTime 09:00 AM → endTime = 11:00 AM.
    - "שעה" / "an hour" / "60 דקות" / "60 minutes" → duration = 60 minutes.
    - "שעה ורבע" / "an hour and a quarter" / "75 דקות" / "75 minutes" → duration = 75 minutes.
    - "שעה וחצי" / "an hour and a half" / "90 דקות" / "90 minutes" → duration = 90 minutes.
    - **NEVER apply the default 30-minute duration when the text explicitly states a duration.** The explicit duration ALWAYS wins.

    ─────────────────────────────────────────────
    STEP 5: AM/PM SMART LOGIC (CRITICAL)
    ─────────────────────────────────────────────
    Apply the following AM/PM resolution rules STRICTLY:

    1. **Explicit morning/evening markers override everything**:
       - "בבוקר" / "in the morning" / "AM" → treat as AM (morning)
       - "בערב" / "in the evening" / "PM" / "באחה"צ" / "אחר הצהריים" → treat as PM (afternoon/evening)
       - "בלילה" / "at night" → treat as PM (night)

    2. **Low hours (1-7) WITHOUT explicit marker → DEFAULT TO PM (afternoon/evening)**:
       - "חמש וחצי" → 05:30 PM (17:30), NOT 05:30 AM
       - "five thirty" → 05:30 PM (17:30), NOT 05:30 AM
       - "שתיים ורבע" → 02:15 PM (14:15), NOT 02:15 AM
       - "half past two" → 02:30 PM (14:30), NOT 02:30 AM
       - "שש" → 06:00 PM (18:00), NOT 06:00 AM
       - "six" → 06:00 PM (18:00), NOT 06:00 AM
       - "שבע" → 07:00 PM (19:00), NOT 07:00 AM
       - "seven" → 07:00 PM (19:00), NOT 07:00 AM
       - "רבע לשישה" → 05:45 PM (17:45), NOT 05:45 AM
       - "quarter to six" → 05:45 PM (17:45), NOT 05:45 AM

    3. **Hours 8-11 WITHOUT explicit marker → DEFAULT TO AM (morning)**:
       - "שמונה" → 08:00 AM, NOT 08:00 PM
       - "eight" → 08:00 AM, NOT 08:00 PM
       - "תשע" → 09:00 AM, NOT 09:00 PM
       - "nine" → 09:00 AM, NOT 09:00 PM
       - "עשר" → 10:00 AM, NOT 10:00 PM
       - "ten" → 10:00 AM, NOT 10:00 PM
       - "אחת עשרה" → 11:00 AM, NOT 11:00 PM
       - "eleven" → 11:00 AM, NOT 11:00 PM

    4. **Hours 12+ are unambiguous**:
       - "שתים עשרה" / "twelve" → 12:00 PM (noon) unless "בבוקר" specified
       - "13:00" → 01:00 PM
       - "ארבע אחר הצהריים" → 04:00 PM

    5. **Digital format (e.g., "5:30pm", "17:30")**:
       - If "am"/"pm" suffix is present → use it directly
       - If 24h format (e.g., "17:30") → convert to 12h AM/PM correctly

    **CRITICAL REMINDER**: When the user says "חמש וחצי" or "five thirty" WITHOUT "בבוקר" / "in the morning", the time is 05:30 PM (17:30), NOT 05:30 AM. This is the most common mistake to avoid.

    ─────────────────────────────────────────────
    STEP 6: SEAMLESS TEXT PARSING (CRITICAL)
    ─────────────────────────────────────────────
    When the user's text is dense or lacks punctuation, you MUST intelligently separate:
    - The **time** (when the event happens)
    - The **duration** (how long it lasts, if mentioned)
    - The **title** (what the event is about)

    **Rules for seamless parsing**:

    1. **Time comes first, then title**: In Hebrew, the time expression typically appears at the beginning of the phrase. Extract the time, then the remaining text is the title.
       - "חמש וחצי ספרים לעמי" → time: 17:30, title: "ספרים לעמי"
       - "שבע בערב ארוחת ערב" → time: 19:00, title: "ארוחת ערב"
       - "רבע לשישה פגישה עם דני" → time: 17:45, title: "פגישה עם דני"
       - "שמונה וחצי בבוקר קפה עם יוסי" → time: 08:30, title: "קפה עם יוסי"

    2. **English patterns**:
       - "five thirty books for ami" → time: 17:30, title: "Books for Ami"
       - "seven pm dinner" → time: 19:00, title: "Dinner"
       - "quarter to six meeting with Danny" → time: 17:45, title: "Meeting with Danny"
       - "half past eight morning coffee with Yossi" → time: 08:30, title: "Coffee with Yossi"

    3. **Duration extraction**: If a duration is mentioned (e.g., "שעה", "חצי שעה", "שעתיים", "30 דקות", "an hour", "half hour", "2 hours"), calculate the endTime accordingly.
       - "חמש וחצי שעה ספרים לעמי" → start: 17:30, duration: 1 hour, end: 18:30, title: "ספרים לעמי"
       - "five thirty for an hour books for ami" → start: 17:30, duration: 1 hour, end: 18:30, title: "Books for Ami"

    4. **No time mentioned**: If no time expression is found, use the default time based on activity type (see STEP 3).

    5. **Title cleanup**: The title should be the remaining text after removing time expressions, duration expressions, and filler words. Keep it concise (max 4 words).

    ─────────────────────────────────────────────
    OUTPUT FORMAT
    ─────────────────────────────────────────────
    Return a single JSON object with these keys:

    {
      "reasoning": "string – analysis in the SAME LANGUAGE as the user's request",
      "replyMessage": "string – friendly, conversational summary in the SAME LANGUAGE as the user's request",
      "events": [
        {
          "title": "string – Short Clean Title (max 4 words, in the SAME LANGUAGE as the user's request)",
          "day": "string – English day name (Sunday, Monday, etc.)",
          "startTime": "string – HH:MM AM/PM format",
          "endTime": "string – HH:MM AM/PM format",
          "recurrence": "string – 'once', 'daily', 'weekly', 'monthly', 'yearly', or 'forever'. For sleep/bedtime events, use 'daily'.",
          "isRecurring": "boolean – true if this repeats weekly or daily",
          "isSleep": "boolean – true if this is a sleep/bedtime event",
          "hasAdvice": "boolean – true if user asked for help/ideas",
          "aiAdvice": "string – practical advice in the SAME LANGUAGE as the user's request, or empty string"
        }
      ]
    }

    CRITICAL: You MUST return an ARRAY of events, even if there's only one event. Always wrap in [ ].

    ─────────────────────────────────────────────
    EXAMPLES
    ─────────────────────────────────────────────

    Example 1 (Hebrew): Multi-event with chain
    User text: "היום משבע ורבע בבוקר תפילה שעה ורבע, אחרי זה להוציא את הכלב חצי שעה"
    Expected JSON:
    {
      "reasoning": "המשתמש מתאר שרשרת אירועים להיום. היום הוא יום שישי. תפילה מתחילה ב-07:15 בבוקר ונמשכת שעה ורבע (75 דקות) = עד 08:30. אחרי זה מיד מוציאים את הכלב לחצי שעה = 08:30-09:00.",
      "replyMessage": "בטח, קבעתי לך שני אירועים להיום (יום שישי): תפילה מ-07:15 עד 08:30, ואז להוציא את הכלב מ-08:30 עד 09:00. שיהיה יום נהדר!",
      "events": [
        { "title": "תפילה", "day": "Friday", "startTime": "07:15 AM", "endTime": "08:30 AM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" },
        { "title": "להוציא את הכלב", "day": "Friday", "startTime": "08:30 AM", "endTime": "09:00 AM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 2 (English): Schedule a workout
    User text: "Schedule 3 workouts this week in the morning"
    Expected JSON:
    {
      "reasoning": "The user wants 3 workouts this week in the morning. Today is Monday, so remaining days are: Monday, Tuesday, Wednesday, Thursday, Friday. I will distribute workouts on Monday, Wednesday, Friday at 07:30 AM, following the logical hours mapping for morning (07:30-10:30). Each workout will be 30 minutes (default).",
      "replyMessage": "I've scheduled 3 workouts for this week: Monday, Wednesday, and Friday at 07:30 AM. Each workout is 30 minutes. Good luck!",
      "events": [
        { "title": "Workout", "day": "Monday", "startTime": "07:30 AM", "endTime": "08:00 AM", "recurrence": "weekly", "isRecurring": true, "isSleep": false, "hasAdvice": false, "aiAdvice": "" },
        { "title": "Workout", "day": "Wednesday", "startTime": "07:30 AM", "endTime": "08:00 AM", "recurrence": "weekly", "isRecurring": true, "isSleep": false, "hasAdvice": false, "aiAdvice": "" },
        { "title": "Workout", "day": "Friday", "startTime": "07:30 AM", "endTime": "08:00 AM", "recurrence": "weekly", "isRecurring": true, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 3 (English): Reminder
    User text: "Remind me to buy milk tomorrow at 9 AM"
    Expected JSON:
    {
      "reasoning": "The user wants a reminder to buy milk tomorrow. Today is Monday, so tomorrow is Tuesday. The reminder should fire at 09:00 AM on Tuesday.",
      "replyMessage": "I've set a reminder for you to buy milk tomorrow (Tuesday) at 09:00 AM.",
      "events": [
        { "title": "Buy milk", "day": "Tuesday", "startTime": "09:00 AM", "endTime": "09:05 AM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "", "isReminder": true, "reminderTime": "2026-07-29T06:00:00.000Z" }
      ]
    }

    Example 4 (Hebrew): Sleep request
    User text: "קבע לי 8 שעות שינה בלילה"
    Expected JSON:
    {
      "reasoning": "המשתמש מבקש 8 שעות שינה בלילה. ברירת המחדל לשינה היא 23:00-07:00 (8 שעות). השינה חוצה חצות. אני אקבע אירוע שינה יומי (daily) לכל ימות השבוע עם isSleep: true.",
      "replyMessage": "קבעתי לך 8 שעות שינה בכל לילה, מ-23:00 עד 07:00 למחרת. לילה טוב!",
      "events": [
        { "title": "שינה", "day": "Sunday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Monday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Tuesday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Wednesday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Thursday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Friday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Saturday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 5 (Hebrew): Seamless text parsing — time + title without punctuation
    User text: "חמש וחצי ספרים לעמי"
    Expected JSON:
    {
      "reasoning": "המשתמש רוצה לקבוע אירוע בשם 'ספרים לעמי' בשעה 17:30. 'חמש וחצי' ללא ציון בוקר/ערב מתפרש כשעה 17:30 לפי חוקי ה-AM/PM (שעות נמוכות 1-7 ברירת מחדל אחה״צ). משך ברירת מחדל: 30 דקות, עד 18:00.",
      "replyMessage": "קבעתי לך 'ספרים לעמי' להיום (יום חמישי) בשעה 17:30-18:00.",
      "events": [
        { "title": "ספרים לעמי", "day": "Thursday", "startTime": "05:30 PM", "endTime": "06:00 PM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 6 (English): Seamless text parsing — time + title without punctuation
    User text: "five thirty books for ami"
    Expected JSON:
    {
      "reasoning": "The user wants to schedule an event called 'Books for Ami' at 17:30. 'five thirty' without AM/PM marker defaults to PM (low hours 1-7 default to afternoon/evening). Default duration: 30 minutes, until 18:00.",
      "replyMessage": "I've scheduled 'Books for Ami' for today (Thursday) at 05:30 PM - 06:00 PM.",
      "events": [
        { "title": "Books for Ami", "day": "Thursday", "startTime": "05:30 PM", "endTime": "06:00 PM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 7 (Hebrew): Quarter to pattern
    User text: "רבע לשישה פגישה עם דני"
    Expected JSON:
    {
      "reasoning": "המשתמש רוצה לקבוע פגישה עם דני. 'רבע לשישה' = 17:45 (רבע לשש בערב, לפי חוקי ה-AM/PM). משך ברירת מחדל: 30 דקות, עד 18:15.",
      "replyMessage": "קבעתי לך פגישה עם דני להיום (יום חמישי) בשעה 17:45-18:15.",
      "events": [
        { "title": "פגישה עם דני", "day": "Thursday", "startTime": "05:45 PM", "endTime": "06:15 PM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 8 (English): Quarter to pattern
    User text: "quarter to six meeting with Danny"
    Expected JSON:
    {
      "reasoning": "The user wants a meeting with Danny. 'quarter to six' = 5:45 PM (quarter to six in the evening, default PM for low hours). Default duration: 30 minutes, until 6:15 PM.",
      "replyMessage": "I've scheduled a meeting with Danny for today (Thursday) at 05:45 PM - 06:15 PM.",
      "events": [
        { "title": "Meeting with Danny", "day": "Thursday", "startTime": "05:45 PM", "endTime": "06:15 PM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    ─────────────────────────────────────────────
    REMINDER HANDLING
    ─────────────────────────────────────────────
    The user may ask for reminders in either language. Examples:
    - "תזכיר לי להתקשר למורן בעוד חצי שעה"
    - "תזכיר לי לשלם חשבון ב-16:00"
    - "remind me to buy milk tomorrow at 9 AM"
    - "תזכיר לי בעוד שעה להתקשר לרופא"

    When the user requests a REMINDER (any phrase containing "תזכיר" / "remind" / "תזכורת" / "התראה" / "פינג"):
    1. Set isReminder: true on the event.
    2. Set reminderTime to the ISO date/time string of when the alert should fire.
    3. The event title should describe what the reminder is about.
    4. Set startTime and endTime to bracket the reminder time. **CRITICAL: Reminder events MUST have a SHORT duration of 5-10 minutes ONLY** (e.g., startTime "06:55 AM" → endTime "07:00 AM"). NEVER set a full hour for a reminder event.
    5. Set recurrence: "once" for one-time reminders.
    6. IMPORTANT: Do not confuse reminder events with regular schedule events.

    ─────────────────────────────────────────────
    USER REQUEST
    ─────────────────────────────────────────────
    "${text}"

    Now produce your JSON output with reasoning, replyMessage, and events. Remember: respond in the SAME LANGUAGE as the user's request!
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const raw = response.text() || '{}';
    const parsed = JSON.parse(raw);

    // Clean titles on all events
    if (parsed.events && Array.isArray(parsed.events)) {
      parsed.events = parsed.events.map(ev => ({
        ...ev,
        title: cleanTitle(ev.title || text)
      }));
    }

    // Handle Shabbat error response (new format: { "error": "..." })
    if (parsed.error && typeof parsed.error === 'string') {
      return {
        isBlocked: true,
        blockedMessage: parsed.error,
        events: [],
        replyMessage: parsed.error
      };
    }

    // Handle Shabbat block response (legacy format: { "isBlocked": true, "blockedMessage": "..." })
    if (parsed.isBlocked === true) {
      return {
        isBlocked: true,
        blockedMessage: parsed.blockedMessage || 'האפליקציה אינה קובעת פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.',
        events: [],
        replyMessage: parsed.blockedMessage || 'האפליקציה אינה קובעת פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.'
      };
    }

    // Handle CONFLICT response: user requested a time that is already taken.
    // The server MUST NOT save any event and MUST NOT deduct an AI credit.
    if (parsed.hasConflict === true) {
      return {
        hasConflict: true,
        conflictMessage: parsed.message || 'יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?',
        events: [],
        replyMessage: parsed.message || 'יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?'
      };
    }

    // Handle the new structure with reasoning field
    if (parsed.reasoning && parsed.events && parsed.replyMessage) {
      return parsed;
    }

    // Handle simple format: just { "events": [...] } without reasoning/replyMessage
    if (parsed.events && Array.isArray(parsed.events) && parsed.events.length > 0) {
      const count = parsed.events.length;
      return {
        reasoning: isEnglish ? `Parsed ${count} event(s) from the request.` : `נ przeanalizowano ${count} אירועים מהבקשה.`,
        replyMessage: isEnglish ? `Added ${count} new event(s).` : `נוספו ${count} אירועים חדשים.`,
        events: parsed.events.map(ev => ({
          ...ev,
          title: cleanTitle(ev.title || text)
        }))
      };
    }

    // Graceful fallback: if the model returned events in an unexpected format
    if (parsed.events && parsed.replyMessage) {
      return {
        reasoning: parsed.reasoning || '',
        replyMessage: parsed.replyMessage,
        events: parsed.events.map(ev => ({
          ...ev,
          title: cleanTitle(ev.title || text)
        }))
      };
    }

    // Last resort fallback: if the model returned a flat array of events
    if (Array.isArray(parsed)) {
      return {
        reasoning: isEnglish ? 'The model returned an array of events without explanation. Accepted by the system.' : 'המודל החזיר מערך אירועים ללא הסבר. התקבל על ידי המערכת.',
        replyMessage: isEnglish ? `Added ${parsed.length} new events.` : `נוספו ${parsed.length} אירועים חדשים.`,
        events: parsed.map(ev => ({
          ...ev,
          title: cleanTitle(ev.title || text)
        }))
      };
    }

    // If the response is a single event object
    if (parsed.title && parsed.day) {
      return {
        reasoning: parsed.reasoning || (isEnglish ? 'The model returned a single event.' : 'המודל החזיר אירוע בודד.'),
        replyMessage: parsed.replyMessage || (isEnglish ? 'Added one new event.' : 'נוסף אירוע אחד חדש.'),
        events: [{
          ...parsed,
          title: cleanTitle(parsed.title || text)
        }]
      };
    }

    // If nothing matched, use fallback
    console.warn('Gemini returned unexpected structure, using fallback. Raw:', raw.slice(0, 200));
    const { fallbackParseAdvice } = require('./aiFallback');
    return fallbackParseAdvice(text);

  } catch (error) {
    console.error('Gemini parse failed, using fallback:', error);
    const { fallbackParseAdvice } = require('./aiFallback');
    return fallbackParseAdvice(text);
  }
}

/**
 * Clean a title by removing Hebrew prefix letters and temporal/duration phrases.
 */
function cleanTitle(title) {
  if (!title || typeof title !== 'string') return 'פגישה / אירוע';
  
  let t = title.trim();
  
  // Remove Hebrew prefix letters: ל, ב, כ, מ, ש, ה, ו
  t = t.replace(/^(ל|ב|כ|מ|ש|ה|ו|לה|לכ|למ|לש)(?:ה|ו)?\s+/, '').trim();
  t = t.replace(/^את\s+/, '').trim();
  
  // Remove day-of-week references
  t = t.replace(/\sב(יום\s+)?(שני|שלישי|רביעי|חמישי|שישי|שבת|ראשון|א|ב|ג|ד|ה|ו|ש)\s*/g, ' ').trim();
  t = t.replace(/\sביום\s+\S+/g, ' ').trim();
  
  // Remove relative time phrases
  t = t.replace(/\s(בעוד|עוד|in|after|לפני|בערך|כ|כמו)\s+\S+(\s+\S+)?/g, ' ').trim();
  
  // Remove duration words
  t = t.replace(/\s+(עשרים|שלושים|ארבעים|חמישים|ששים|עשר|עשרה)\s*(דקות|דקה|שעות|שעה)\s*/g, ' ').trim();
  t = t.replace(/\s+\d+\s*(דקות|דקה|שעות|שעה|minutes?|min|hours?|hrs?)\s*/gi, ' ').trim();
  t = t.replace(/\s*(חצי\s*שעה|רבע\s*שעה|half\s*hour|quarter\s*hour)\s*/gi, ' ').trim();
  
  // Remove standalone prefixes at word boundaries
  t = t.replace(/\bל(?:\s|$)/g, ' ').trim();
  
  // Collapse multiple spaces
  t = t.replace(/\s+/g, ' ').trim();
  
  // Remove trailing/leading punctuation
  t = t.replace(/^[,!?;:.\s]+|[,!?;:.\s]+$/g, '').trim();
  
  // If too short or empty, use default
  if (!t || t.length < 2) {
    return 'פגישה / אירוע';
  }
  
  return t;
}

/**
 * Parse a free-text scheduling request using the SMART TRACK.
 * This is used when the user makes a GENERAL request (e.g., "תמצא לי זמן לאימון מחר")
 * and the system MUST fetch existing events, inject them into the prompt,
 * and instruct the AI to find a completely free slot with a 15-minute buffer.
 * 
 * @param {string} text - The user's natural language request.
 * @param {Object} [options] - Optional parse options.
 * @param {string} [options.eventType] - Override event type.
 * @param {number} [options.duration] - Override duration in minutes.
 * @param {Array} [options.busySlots] - Array of existing busy time slots [{ day, startTime, endTime, title }]
 * @param {Object} [options.schedule] - The user's full schedule object
 * @returns {Promise<Object>} Parsed result with events, replyMessage, etc.
 */
async function parseWithGeminiSmart(text, options = {}) {
  initModel();
  if (!model) {
    const { fallbackParseAdvice } = require('./aiFallback');
    return fallbackParseAdvice(text);
  }

  const now = new Date();
  const isoDate = now.toISOString();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayEnglish = dayNames[now.getDay()];
  const todayString = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
  const currentTimeString = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const isEnglish = /^[a-zA-Z0-9\s.,!?;:'"()-]+$/.test(text.trim()) && /[a-zA-Z]/.test(text.trim());

  // ── Build busy slots summary from existing schedule ──
  let busySlotsSummary = 'אין אירועים קיימים ביומן.';
  const busySlots = options.busySlots || [];
  const schedule = options.schedule || {};

  if (busySlots.length > 0) {
    busySlotsSummary = 'האירועים הקיימים בלוח השנה (משבצות תפוסות - אסור לקבוע עליהן!):\n';
    for (const slot of busySlots) {
      const slotDay = slot.day || '';
      const slotStart = slot.startTime || slot.start || '';
      const slotEnd = slot.endTime || slot.end || '';
      const slotTitle = slot.title || '';
      busySlotsSummary += `  - ${slotDay}: ${slotStart} - ${slotEnd} "${slotTitle}"\n`;
    }
  } else if (schedule && typeof schedule === 'object') {
    // Fallback: build busy slots from schedule object
    const allSlots = [];
    for (const [day, events] of Object.entries(schedule)) {
      if (Array.isArray(events) && events.length > 0) {
        for (const ev of events) {
          if (ev.startTime && ev.endTime) {
            allSlots.push({ day, startTime: ev.startTime, endTime: ev.endTime, title: ev.title || '' });
          }
        }
      }
    }
    if (allSlots.length > 0) {
      busySlotsSummary = 'האירועים הקיימים בלוח השנה (משבצות תפוסות - אסור לקבוע עליהן!):\n';
      for (const slot of allSlots) {
        busySlotsSummary += `  - ${slot.day}: ${slot.startTime} - ${slot.endTime} "${slot.title}"\n`;
      }
    }
  }

  const prompt = `
    ═════════════════════════════════════════════════════
    SYSTEM TIME CONTEXT (REAL-TIME — DO NOT IGNORE)
    ═════════════════════════════════════════════════════
    התאריך והשעה הנוכחיים הם: ${todayString}, ${currentTimeString}.
    Current date in ISO format: ${isoDate}
    Today's English day name: ${todayEnglish}
    Today's day-of-month: ${now.getDate()}
    Today's month (numeric): ${now.getMonth() + 1}
    Today's year: ${now.getFullYear()}
    Current day-of-week (0=Sunday): ${now.getDay()}

    ═════════════════════════════════════════════════════
    EXISTING BUSY SLOTS — ABSOLUTELY MUST NOT OVERLAP
    ═════════════════════════════════════════════════════
    ${busySlotsSummary}

    ═════════════════════════════════════════════════════
    SMART TRACK — 15-MINUTE BUFFER & FREE SLOT FINDING
    ═════════════════════════════════════════════════════
    **CRITICAL — YOU ARE IN SMART TRACK MODE**

    The user has asked you to FIND a free time slot for them. This means:
    1. You MUST find a completely free time window that does NOT overlap with any existing busy slot.
    2. **15-MINUTE BUFFER RULE**: You MUST leave a buffer of at least 15 minutes BEFORE and AFTER every existing busy slot. For example:
       - If an existing event is 09:00-10:00, the earliest you can start a new event before it is 08:45 (15 min buffer before), and the latest you can end a new event after it is 10:15 (15 min buffer after).
       - Calculate the buffer as: availableStart = busyEnd + 15min, availableEnd = busyStart - 15min.
    3. Do NOT suggest a time that falls within the buffer zone of any existing event.
    4. If you find a free slot, schedule the new event in that exact slot.
    5. **FULL CALENDAR FALLBACK**: If you determine there are NO free time windows available on the requested day(s) that can accommodate the user's request (including the 15-minute buffers), return a JSON with an error message:
    { "error": "לא מצאתי חלון זמן פנוי מתאים. נסה יום אחר או שעה אחרת." }
    6. **NO FREE SLOT AT ALL**: If there is absolutely no free time on any of the upcoming days, return:
    { "error": "לא נמצאו חלונות זמן פנויים ביומן השבוע. נסה לבדוק שבוע הבא." }

    ═════════════════════════════════════════════════════
    CRITICAL — CONFLICT PREVENTION & SMART SCHEDULING
    ═════════════════════════════════════════════════════
    1. YOU MUST NEVER create an event that overlaps with any existing busy slot listed above.
    2. Check every proposed event time against the busy slots BEFORE including it in the output.
    3. **OVERLAP PROTECTION**: Find available free slots that DO NOT overlap with existing events AND respect the 15-minute buffer. Do not default to 09:00 AM if it is taken — check the busy slots first and pick a genuinely free window.
    4. **HUMAN LOGIC & SLEEP (CRITICAL)**: Unless the user EXPLICITLY states otherwise, DO NOT schedule events between 23:00 and 08:00 (sleep hours). Schedule meals at culturally appropriate times (breakfast ~08:00, lunch ~13:00, dinner ~19:00).
    5. **BEHAVIORAL MATCHING (CRITICAL)**: Analyze the user's existing schedule above to understand their daily habits. Place floating activities (like "workout" or "study") close to similar past activities OR in logical blocks that feel natural for a human. For example, if the user already works out at 07:30 AM on Sundays and Wednesdays, place a new workout near those times. If the user studies in the evening, place new study sessions in the evening.
    6. For the current day (Today = ${todayEnglish}), only consider future time windows (from the current time ${currentTimeString} onward).
    7. Prefer the EARLIEST available free window that accommodates the requested duration.
    8. If absolutely no free window exists on the requested day, suggest the next available day.
    9. **FULL CALENDAR FALLBACK**: If after checking all days this week you determine there are NOT enough free time windows to fulfill the user's request (e.g., user wants 3 workouts but only 1 free slot exists), return a JSON with an error message:
    { "error": "לא מצאתי מספיק חלונות זמן פנויים השבוע כדי לשבץ את הפעילות מבלי להתנגש באירועים קיימים." }
    Do NOT return partial events — either fulfill the FULL request or return the error.

    ═════════════════════════════════════════════════════
    CRITICAL RULES — SHABBAT GUARD, MULTIPLE EVENTS, SMART NAMING
    ═════════════════════════════════════════════════════
    1. **SHABBAT GUARD**: You are STRICTLY FORBIDDEN from scheduling any events on Saturday (Shabbat). If a user explicitly requests an event on Saturday, do NOT return any events. Instead, return a JSON with an error message:
    { "error": "שבת שלום! המערכת שומרת שבת ולא ניתן לקבוע אירועים ביום זה. נשמח לתאם ליום חול או למוצאי השבת." }

    2. **MULTIPLE EVENTS**: If the user asks for a recurring or multiple events (e.g., "3 אימונים השבוע בבוקר"), you MUST generate an array of multiple distinct events spread across the upcoming week (e.g., Sunday, Tuesday, Thursday). Do not group them into one event.

    3. **SMART NAMING**: The "title" of the event should be clean and actionable. Do not include the time or frequency in the title itself. (e.g., if the user says "3 אימונים השבוע בבוקר", the title for each event should just be "אימון בוקר" or "אימון").

    ═════════════════════════════════════════════════════
    SYSTEM INSTRUCTIONS
    ═════════════════════════════════════════════════════
    תפקידך לתרגם את בקשת המשתמש לאובייקט JSON המכיל: { title, day, startTime, endTime, description }.

    You are a world-class AI scheduling agent. Your role is to **reason step-by-step** about the user's request, then produce a structured schedule. You think like a human personal assistant, not a text parser.

    ═════════════════════════════════════════════════════
    LOGICAL HOURS MAPPING (CRITICAL — MUST FOLLOW)
    ═════════════════════════════════════════════════════
    Map Hebrew time-of-day expressions to these SPECIFIC hour ranges:

    1. **"בבוקר" / "morning"**: שעות פנויות בין 07:30 ל-10:30 בלבד.
       - בשום אופן לא לקבוע ב-03:00, 04:00, 05:00, 06:00 בלילה!
       - Example: "אימון בבוקר" → 07:30 AM or 08:00 AM or 09:00 AM etc. (whatever is free)
    
    2. **"אחה"צ" / "אחר הצהריים" / "afternoon"**: בין 13:00 ל-17:00.
       - Example: "פגישה אחה"צ" → 01:00 PM or 02:00 PM etc.

    3. **"בערב" / "evening"**: בין 18:00 ל-21:00.
       - Example: "שיעור בערב" → 06:00 PM or 07:00 PM etc.

    4. **"בלילה" / "night"**: בין 21:00 ל-23:00.
       - Example: "לימודים בלילה" → 09:00 PM or 10:00 PM etc.

    5. **No time specified**: Use activity-based defaults:
       - Work/Study → 09:00 AM
       - Workout/Sport → 07:30 AM or 17:00 PM
       - Social/Family → 18:00 PM
       - Meal → 08:00 AM (breakfast), 13:00 PM (lunch), 19:00 PM (dinner)
       - Sleep → 11:00 PM to 07:00 AM (crosses midnight!)

    ═════════════════════════════════════════════════════
    CLEAN TITLE ONLY RULE (CRITICAL)
    ═════════════════════════════════════════════════════
    The title MUST contain ONLY the clean activity name. Remove ALL:
    - Preposition prefixes: ל, ב, כ, מ, ש, ה, ו
    - Time phrases: "למשך שעה", "בערב", "בבוקר", "בלילה", "בעוד X דקות"
    - Command verbs: "תמצא לי", "תזמן", "קבע", "תפנה לי"
    - Duration words: "חצי שעה", "רבע שעה", "30 דקות", "שעה"

    Examples:
    - "תמצא לי זמן לשיעור תורה בערב" → title: "שיעור תורה"
    - "קבע לי אימון מחר ב-9 בבוקר" → title: "אימון"
    - "תזכיר לי להתקשר לרופא" → title: "להתקשר לרופא"
    - "שלוש אימונים השבוע" → title for each: "אימון"
    - "find time for a meeting with Danny" → title: "Meeting with Danny"
    - "remind me to buy milk" → title: "Buy milk"

    ═════════════════════════════════════════════════════
    EXPLICIT DURATION PARSING (CRITICAL)
    ═════════════════════════════════════════════════════
    When the user mentions a duration, you MUST compute endTime EXACTLY:
    - "חמש דקות" / "5 דקות" / "5 minutes" → duration = 5 minutes. endTime = startTime + 5min
    - "רבע שעה" / "15 דקות" / "15 minutes" → duration = 15 minutes. endTime = startTime + 15min
    - "חצי שעה" / "30 דקות" / "30 minutes" / "half hour" → duration = 30 minutes. endTime = startTime + 30min
    - "שעה" / "60 דקות" / "an hour" / "60 minutes" → duration = 60 minutes. endTime = startTime + 60min
    - "שעתיים" / "2 hours" / "120 דקות" → duration = 120 minutes. endTime = startTime + 120min
    - "שעה וחצי" / "90 דקות" / "an hour and a half" → duration = 90 minutes. endTime = startTime + 90min
    - Default if no duration mentioned: 30 minutes (NOT 60 minutes!).

    ═════════════════════════════════════════════════════
    DATE CALCULATION RULES FOR RELATIVE EXPRESSIONS (CRITICAL)
    ═════════════════════════════════════════════════════
    All dates below MUST be calculated relative to the current date provided above (${todayString}, ISO: ${isoDate}).

    1. **"תחילת [חודש]" / "תחילת [month]" / "start of [month]" (e.g., "תחילת ספטמבר", "תחילת אוגוסט", "תחילת יולי")**:
       - Calculate the 1st day of that month in the CURRENT year FIRST.
       - If that date has ALREADY PASSED (is in the past relative to today), use the 1st day of that month in the NEXT year.
       - Example: If today is 9 באוגוסט 2026 and user says "תחילת ספטמבר" → 1 בספטמבר 2026 (current year, since Sept 2026 hasn't happened yet).
       - Example: If today is 15 באוקטובר 2026 and user says "תחילת ספטמבר" → 1 בספטמבר 2027 (next year, since Sept 2026 already passed).
       - The Hebrew month names are: ינואר, פברואר, מרץ, אפריל, מאי, יוני, יולי, אוגוסט, ספטמבר, אוקטובר, נובמבר, דצמבר.
       - Convert to English: January, February, March, April, May, June, July, August, September, October, November, December.
       - Set startTime to "09:00 AM" unless another time is specified.
       - Set endTime to "09:30 AM" (30 min default) unless another time or duration is specified.
       - Set the "day" field to the actual English day name of that date (e.g., if 1 September 2026 is a Tuesday → "Tuesday").

    2. **"שבוע הבא" / "בשבוע הבא" / "next week" / "בשבוע הבא ב[יום]"**:
       - "שבוע הבא" alone → schedule the event on the SAME day of the week as today, but in the NEXT week (today + 7 days).
         Example: If today is Sunday and user says "שבוע הבא" → next Sunday.
       - "שבוע הבא ביום שני" / "next week on Monday" → calculate the Monday of next week.
         Formula: Find the next occurrence of that day that falls in the NEXT calendar week (not the current week).
         Example: Today is Wednesday (day 3). "יום שני בשבוע הבא" = next Monday = today + (7 - 3 + 1) = today + 5 days.
         Example: Today is Monday (day 1). "יום שני בשבוע הבא" = today + 7 days.
       - Set a reasonable default time (09:00 AM for work/study, 18:00 PM for social/evening).

    3. **"יום שני בערב" / "יום שני בבוקר" / "Monday evening" / "Monday morning"**:
       - Find the NEXT occurrence of that day from today (not the past one).
       - Example: Today is Sunday → "Monday evening" = tomorrow (Monday) at 18:00 PM / 06:00 PM.
       - Example: Today is Monday → "Monday evening" = today (Monday) at 18:00 PM / 06:00 PM.
       - Example: Today is Tuesday → "Monday evening" = next Monday (7 days later) at 18:00 PM / 06:00 PM.
       - "בבוקר" / "morning" → use morning hours (07:30-10:30).
       - "בערב" / "evening" → use evening hours (18:00-21:00).
       - "בלילה" / "night" → use night hours (21:00-23:00).
       - If neither morning/evening/night is specified, use the activity-based default.

    4. **"החודש" / "this month" / "החודש הבא" / "next month"**:
       - "החודש" → use the current month. Set day to the current date (today) or the first of the month if no specific date.
       - "החודש הבא" → calculate the same day-of-month in the next month. If that day doesn't exist (e.g., Jan 31 → Feb 28/29), use the last day of that month.

    5. **"מחרתיים" / "במחרתיים" / "day after tomorrow"**: today + 2 days.

    ─────────────────────────────────────────────
    LANGUAGE INSTRUCTIONS
    ─────────────────────────────────────────────
    The user's request is written in: ${isEnglish ? 'ENGLISH' : 'HEBREW'}.

    **CRITICAL**: You MUST respond in the SAME language as the user's request.
    - If the user writes in English → respond in English (reasoning, replyMessage, title, aiAdvice all in English).
    - If the user writes in Hebrew → respond in Hebrew (reasoning, replyMessage, title, aiAdvice all in Hebrew).
    - The event "day" field must always be in English (Sunday, Monday, etc.).
    - The event "startTime" and "endTime" must always be in "HH:MM AM/PM" format.
    - Detect the language from the user's text below.

    ─────────────────────────────────────────────
    CONTEXT
    ─────────────────────────────────────────────
    - Current date and time: ${todayString}, ${currentTimeString}
    - Today's English day name: ${todayEnglish}
    - Today's date (ISO): ${now.toISOString().split('T')[0]}
    - Use this information to resolve relative terms like "היום" / "today", "מחר" / "tomorrow", "מחרתיים" / "day after tomorrow", "השבוע" / "this week", "בשבוע הבא" / "next week", "בראשון" / "on Sunday", "בשני" / "on Monday", etc.
    - Assume the user is in Israel (Asia/Jerusalem timezone) unless otherwise specified.
    - Understand both Hebrew terms (e.g., "שני", "שלישי") and English terms (e.g., "Monday", "Tuesday") for days.
    - **CRITICAL DAY RESOLUTION FOR ENGLISH**: When the user specifies a day name in English (e.g., "Monday", "Tuesday"), you MUST calculate the exact date of that day in the CURRENT or NEXT week (whichever comes first, starting from today). For example, if today is Tuesday and the user says "Monday", that means NEXT Monday (today + 6 days). If today is Monday and the user says "Monday", that means TODAY. Use the current date information above to compute the exact date. Do NOT guess or shift days incorrectly.
    - **CRITICAL DAY RESOLUTION FOR HEBREW**: When the user specifies a day in Hebrew (e.g., "שני", "שלישי"), resolve it the same way: find the next occurrence of that day from today.
    - **IMPORTANT**: "Monday evening" means Monday, NOT Tuesday. "Tuesday morning" means Tuesday, NOT Wednesday. The day name IS the day the event should be scheduled on. Do not shift the event to the next day.

    ─────────────────────────────────────────────
    STEP 1: REASONING (Chain of Thought)
    ─────────────────────────────────────────────
    Before producing the events, you MUST include a "reasoning" field in your JSON output. This is your internal thought process. Write it in the SAME LANGUAGE as the user's request. In this field, analyze:

    1. **Intent Analysis**: What is the user trying to accomplish?
    2. **Temporal Calculation**: How do you resolve the day, time, and duration? Show your math.
    3. **Busy Slot Check**: Explain which busy slots you checked and how you avoided them, including the 15-minute buffer.
    4. **Distribution Logic**: If the user mentions multiple items or a quantity, explain how you will distribute them across the week.
    5. **Common Sense Decisions**: Explain any gaps, rest periods, or reasonable defaults you applied.

    ═════════════════════════════════════════════════════
    SHABBAT RESTRICTION RULE (CRITICAL — MUST FOLLOW EXACTLY)
    ═════════════════════════════════════════════════════
    **ABSOLUTELY FORBIDDEN**: You MUST NEVER create events that fall during Shabbat (יום שבת / Saturday).

    **Definition of Shabbat blocking hours**:
    - **Friday (יום שישי)**: From 16:00 (04:00 PM) and onward — Shabbat has started. DO NOT schedule any events starting at or after this time on Friday.
    - **Saturday (יום שבת / Shabbat / Saturday)**: All day until 20:00 (08:00 PM) — Shabbat. DO NOT schedule any events on Saturday until after 20:00.
    - **Exception**: Sleep events that span from Friday night into Saturday morning are acceptable ONLY if they are standard sleep hours (11:00 PM to 07:00 AM). For example, sleeping from Friday 11:00 PM to Saturday 07:00 AM is allowed.

    **What to do when a user requests a Shabbat event**:
    - If ANY parsed event falls within Shabbat (Friday after 16:00 or any time Saturday), you MUST NOT return that event.
    - Instead, return ONLY:
    { "error": "שבת שלום! המערכת שומרת שבת ולא ניתן לקבוע אירועים ביום זה. נשמח לתאם ליום חול או למוצאי השבת." }

    Return ONLY this error object. Do NOT include an "events" array or any other fields.

    **Detection tips**:
    - If the user says "שבת", "יום שבת", "Saturday", "שישי בערב" (Friday evening), these are all shabbat-time indicators.
    - If the user says "במוצאי שבת" / "Saturday night" / "after shabbat" → schedule after 20:00 on Saturday (08:00 PM).
    - Use the current date and time context provided above to determine which day of the week the requested date falls on.

    ═════════════════════════════════════════════════════
    STEP 2: MULTI-EVENT PARSING (CRITICAL — NEW)
    ─────────────────────────────────────────────
    You MUST detect when the user's text contains MULTIPLE separate tasks or items and return an ARRAY of separate events, never a single combined event.

    **Multi-task detection**: If the text contains multiple tasks separated by commas, "ו" (and), "אז" (then), "אחרי" (after), or similar conjunctions — parse EACH task as a SEPARATE event. Examples:
    - "רבע שעה לאוכל, חצי שעה עם הכלב, 20 דקות אימון" → 3 separate events
    - "אוכל חצי שעה ואז כלב חצי שעה ואימון 20 דקות" → 3 separate events
    - "take dog for 30 min, then eat for 15 min, then workout 20 min" → 3 separate events

    **Duration calculation (CRITICAL)**: Parse Hebrew duration expressions accurately:
    - "רבע שעה" = 15 minutes
    - "חצי שעה" = 30 minutes
    - "X דקות" = X minutes (e.g., "20 דקות" = 20 minutes)
    - "שעה" = 60 minutes
    - "שעתיים" = 120 minutes
    - English equivalents: "quarter hour" = 15, "half hour" = 30, "X minutes" = X, "an hour" = 60, "X hours" = X*60

    **Sequential scheduling based on current time (CRITICAL — NEW)**:
    1. If NO explicit start time is mentioned, use the **CURRENT TIME** as the starting point.
    2. Schedule the FIRST event starting at the current time.
    3. Schedule the SECOND event immediately after the first event ends, and so on sequentially.
    4. CRITICAL: Every event MUST have distinct startTime and endTime values. It is FORBIDDEN to return startTime equal to endTime.
    5. Example: If current time is 14:30 and user says "רבע שעה לאוכל, חצי שעה עם הכלב" →
       - Event 1: "אוכל" 14:30-14:45
       - Event 2: "עם הכלב" 14:45-15:15

    You MUST also detect and handle the following patterns intelligently:
    A. **Quantities**: If the user says "3 אימונים" / "3 workouts", "פעמיים" / "twice", "4 פגישות" / "4 meetings" → produce an array of that many events, distributed sensibly across available days.
    B. **Total Hours**: If the user says "ללמוד 6 שעות השבוע" / "study 6 hours this week" → break it into multiple sessions spread across the week.
    C. **Multiple People/Items**: "פגישות עם דני ויוסי" / "meetings with Danny and Yossi" → create separate events.
    D. **Chain of Events**: "תפילה ואז להוציא את הכלב" / "prayer then walk the dog" → calculate consecutively.

    For distribution, use COMMON SENSE:
    - Spread activities evenly across the week (not all on the same day).
    - Use the logical hours mapping (morning 07:30-10:30, afternoon 13:00-17:00, evening 18:00-21:00).
    - Leave at least 5-15 minute gaps between activities.
    - Don't schedule anything after 23:00 or before 07:30 unless explicitly requested.
    - ALWAYS compute unique startTime and endTime for each event. NEVER assign the same time to two different events.

    ─────────────────────────────────────────────
    CRITICAL — TITLE CLEANING RULE (ABSOLUTELY MUST FOLLOW)
    ─────────────────────────────────────────────
    When you extract/set the event "title", you MUST output a title stripped of Hebrew prefix letters and temporal phrases.

    **For Hebrew titles**: Remove prefix letters such as:
      - ל (meaning "to/for") — e.g., "לשיעור תורה" → "שיעור תורה"
      - את (meaning "the object marker") — e.g., "את שיעור תורה" → "שיעור תורה"
      - ב (meaning "in/on/at") — e.g., "בשיעור תורה" → "שיעור תורה"
      - מ (meaning "from") 
      - כ (meaning "as/like")
      - ש (meaning "that/which")
      - ה (meaning "the")
      - Also remove day/time phrases from the title: "ביום שני", "בערב", "בבוקר", "בלילה"

    **Examples of correct title extraction (Hebrew)**:
      - "תמצא לי זמן לשיעור תורה ביום שני" → title: "שיעור תורה" (NOT "לשיעור תורה" or "תמצא לי זמן לשיעור תורה")
      - "קבע לי אימון מחר ב-9 בבוקר" → title: "אימון"
      - "תזכיר לי להתקשר לרופא" → title: "להתקשר לרופא" (reminder, keep the action)
      - "פגישה עם דני בשעה 17:45" → title: "פגישה עם דני"
      - "שלוש אימונים השבוע" → title for each: "אימון" (NOT "שלוש אימונים" or "אימונים השבוע")
      - "רבע שעה לאוכל, חצי שעה עם הכלב" → title1: "אוכל", title2: "עם הכלב"

    **Examples of correct title extraction (English)**:
      - "schedule 3 workouts this week" → title: "Workout"
      - "find time for a meeting with Danny" → title: "Meeting with Danny"
      - "remind me to buy milk" → title: "Buy milk"
      - "set a doctor appointment" → title: "Doctor appointment"

    The title must be concise (1-4 words) and meaningful. Never include words like "תמצא", "קבע", "תזמן", "schedule", "find", "set" — these are commands, not part of the event title.

    ═════════════════════════════════════════════════════
    STEP 3: COMMON SENSE RESOLUTION
    ═════════════════════════════════════════════════════
    Fill in missing details using HUMAN JUDGMENT:

    - **Missing Day**: If no day is specified, default to "Today" (today's actual day name).
    - **Missing Time**: If no time is specified, use the logical hours mapping above.
    - **Missing Duration**: If no duration is given, assume 30 minutes (NOT 60 minutes).
    - **Rest Breaks**: If scheduling multiple events in sequence, leave 5-15 minute gaps between them.
    - **Conflicts**: If the user's request would create overlapping events, note this in "reasoning" and suggest alternatives in the replyMessage.
    - **Sleep Handling**: Sleep hours CROSS MIDNIGHT. For example, "קבע לי 8 שעות שינה בלילה" / "set me 8 hours of sleep tonight" means 11:00 PM to 07:00 AM (next day). Mark the event with "isSleep": true.
    - **SLEEP / BEDTIME HANDLING (CRITICAL — MUST FOLLOW EXACTLY)**: When the user requests sleep/bedtime (e.g., "8 שעות שינה בלילה" / "8 hours of sleep at night"):
      1. **STRICTLY set startTime to "11:00 PM" and endTime to "07:00 AM"** (next day) — this is exactly 8 hours, no exceptions. Do NOT use any other times.
      2. Set "isSleep": true on the event.
      3. **STRICTLY set "recurrence": "daily"** — so the sleep schedule repeats every single night. Do NOT use "once", "weekly", or any other value.
      4. Create the event for EVERY day of the week (Sunday through Saturday), not just one day. All 7 days must have a sleep event.
      5. The event crosses midnight, so the endTime is on the next day.
      6. The title should be "שינה" / "Sleep" in the appropriate language.
      7. **CRITICAL**: If the user selects "forever" or "daily" recurrence from the UI, the result MUST still have "recurrence": "daily" and "isSleep": true. The "forever" or "daily" selection from the UI only reinforces that this should be daily.
      8. **CRITICAL**: The startTime "11:00 PM" and endTime "07:00 AM" MUST be identical for ALL 7 days of the week. Every night is exactly 11:00 PM → 07:00 AM.
    - **Free Slot Detection**: When a user says "תפנה לי X דקות/שעות" / "find me X minutes/hours free", set "needsFreeSlot": true with "freeSlotDuration" (in minutes).
    - **Editing Events**: If a user says "תעדכן/תשנה" / "update/change" an event, include "isEdit": true.
    - **YEARLY / BIRTHDAY / ANNUAL EVENT DETECTION (CRITICAL)**: When the user mentions "יום הולדת" / "birthday", "אירוע שנתי" / "annual event", "חג" / "holiday", "נישואין" / "anniversary", or any event that should repeat once a year on the same date, you MUST set "recurrence": "yearly". This is critical for the system to generate a proper RRULE with FREQ=YEARLY. Examples:
      * "יום הולדת לילד ב-18.8" → set recurrence="yearly"
      * "birthday party on August 18" → set recurrence="yearly"
      * "אירוע שנתי של המשפחה" → set recurrence="yearly"
      * "anniversary dinner" → set recurrence="yearly"
      * Do NOT use "weekly" or "once" for these events — they MUST be "yearly".
      * When the user selects "שנתי" / "Yearly" from the recurrence UI buttons, the system will also set it correctly.
      * The current month index (0-11) will be added automatically by the backend as "createdMonth".
      * For yearly events, if the user specifies a specific date (e.g., "18.8" or "August 18"), set the "targetDate" field to that date so the event appears on the correct day each year.
      * If the user says "תזכיר לי כל שנה" / "remind me every year", also set recurrence="yearly".

    ─────────────────────────────────────────────
    STEP 4: NATURAL LANGUAGE TIME PARSING (CRITICAL)
    ─────────────────────────────────────────────
    You MUST accurately parse complex time expressions in BOTH Hebrew and English and convert them to the correct "HH:MM AM/PM" format. This is a core requirement.

    (Same time parsing rules as the main parseWithGemini function)

    ─────────────────────────────────────────────
    STEP 4b: RELATIVE TIME & EXPLICIT DURATION PARSING (CRITICAL — MUST FOLLOW EXACTLY)
    ─────────────────────────────────────────────

    (Same relative time parsing rules as the main parseWithGemini function)

    ─────────────────────────────────────────────
    STEP 5: AM/PM SMART LOGIC (CRITICAL)
    ─────────────────────────────────────────────

    (Same AM/PM logic as the main parseWithGemini function)

    ─────────────────────────────────────────────
    STEP 6: SEAMLESS TEXT PARSING (CRITICAL)
    ─────────────────────────────────────────────

    (Same seamless text parsing rules as the main parseWithGemini function)

    ─────────────────────────────────────────────
    OUTPUT FORMAT
    ─────────────────────────────────────────────
    Return a single JSON object with these keys:

    {
      "reasoning": "string – analysis in the SAME LANGUAGE as the user's request",
      "replyMessage": "string – friendly, conversational summary in the SAME LANGUAGE as the user's request",
      "events": [
        {
          "title": "string – Short Clean Title (max 4 words, in the SAME LANGUAGE as the user's request)",
          "day": "string – English day name (Sunday, Monday, etc.)",
          "startTime": "string – HH:MM AM/PM format",
          "endTime": "string – HH:MM AM/PM format",
          "recurrence": "string – 'once', 'daily', 'weekly', 'monthly', 'yearly', or 'forever'. For sleep/bedtime events, use 'daily'.",
          "isRecurring": "boolean – true if this repeats weekly or daily",
          "isSleep": "boolean – true if this is a sleep/bedtime event",
          "hasAdvice": "boolean – true if user asked for help/ideas",
          "aiAdvice": "string – practical advice in the SAME LANGUAGE as the user's request, or empty string"
        }
      ]
    }

    CRITICAL: You MUST return an ARRAY of events, even if there's only one event. Always wrap in [ ].

    ─────────────────────────────────────────────
    USER REQUEST
    ─────────────────────────────────────────────
    "${text}"

    Now produce your JSON output with reasoning, replyMessage, and events. Remember: respond in the SAME LANGUAGE as the user's request!
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const raw = response.text() || '{}';
    const parsed = JSON.parse(raw);

    // Clean titles on all events
    if (parsed.events && Array.isArray(parsed.events)) {
      parsed.events = parsed.events.map(ev => ({
        ...ev,
        title: cleanTitle(ev.title || text)
      }));
    }

    // Handle Shabbat error response
    if (parsed.error && typeof parsed.error === 'string') {
      return {
        isBlocked: true,
        blockedMessage: parsed.error,
        events: [],
        replyMessage: parsed.error
      };
    }

    // Handle Shabbat block response (legacy format)
    if (parsed.isBlocked === true) {
      return {
        isBlocked: true,
        blockedMessage: parsed.blockedMessage || 'האפליקציה אינה קובעת פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.',
        events: [],
        replyMessage: parsed.blockedMessage || 'האפליקציה אינה קובעת פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.'
      };
    }

    // Handle CONFLICT response
    if (parsed.hasConflict === true) {
      return {
        hasConflict: true,
        conflictMessage: parsed.message || 'יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?',
        events: [],
        replyMessage: parsed.message || 'יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?'
      };
    }

    // Handle the new structure with reasoning field
    if (parsed.reasoning && parsed.events && parsed.replyMessage) {
      return parsed;
    }

    // Handle simple format: just { "events": [...] } without reasoning/replyMessage
    if (parsed.events && Array.isArray(parsed.events) && parsed.events.length > 0) {
      const count = parsed.events.length;
      return {
        reasoning: isEnglish ? `Parsed ${count} event(s) from the request.` : `נ przeanalizowano ${count} אירועים מהבקשה.`,
        replyMessage: isEnglish ? `Added ${count} new event(s).` : `נוספו ${count} אירועים חדשים.`,
        events: parsed.events.map(ev => ({
          ...ev,
          title: cleanTitle(ev.title || text)
        }))
      };
    }

    // Graceful fallback
    if (parsed.events && parsed.replyMessage) {
      return {
        reasoning: parsed.reasoning || '',
        replyMessage: parsed.replyMessage,
        events: parsed.events.map(ev => ({
          ...ev,
          title: cleanTitle(ev.title || text)
        }))
      };
    }

    // Last resort fallback
    if (Array.isArray(parsed)) {
      return {
        reasoning: isEnglish ? 'The model returned an array of events without explanation. Accepted by the system.' : 'המודל החזיר מערך אירועים ללא הסבר. התקבל על ידי המערכת.',
        replyMessage: isEnglish ? `Added ${parsed.length} new events.` : `נוספו ${parsed.length} אירועים חדשים.`,
        events: parsed.map(ev => ({
          ...ev,
          title: cleanTitle(ev.title || text)
        }))
      };
    }

    // If the response is a single event object
    if (parsed.title && parsed.day) {
      return {
        reasoning: parsed.reasoning || (isEnglish ? 'The model returned a single event.' : 'המודל החזיר אירוע בודד.'),
        replyMessage: parsed.replyMessage || (isEnglish ? 'Added one new event.' : 'נוסף אירוע אחד חדש.'),
        events: [{
          ...parsed,
          title: cleanTitle(parsed.title || text)
        }]
      };
    }

    // If nothing matched, use fallback
    console.warn('Gemini returned unexpected structure, using fallback. Raw:', raw.slice(0, 200));
    const { fallbackParseAdvice } = require('./aiFallback');
    return fallbackParseAdvice(text);

  } catch (error) {
    console.error('Gemini smart parse failed, using fallback:', error);
    const { fallbackParseAdvice } = require('./aiFallback');
    return fallbackParseAdvice(text);
  }
}

/**
 * Reschedule events using Gemini AI.
 */
async function rescheduleWithGemini(currentSchedule, reason) {
  initModel();
  if (!model) {
    throw new Error("AI model is not initialized.");
  }

  const now = new Date();
  const todayString = now.toLocaleString('he-IL', { dateStyle: 'full', timeStyle: 'short' });
  const isoDate = now.toISOString();

  const prompt = `
    You are a world-class AI assistant specializing in calendar management and rescheduling. Your task is to intelligently reorganize a user's schedule based on a given reason, in Hebrew.

    CONTEXT:
    - The current time is: ${todayString}.
    - Current ISO time: ${isoDate}
    - The user's reason for rescheduling is: "${reason}"
    - The user's current schedule is provided below in JSON format.

    RULES:
    1.  **Analyze Today**: Based on the current time, determine which events for "Today" have already passed and which are yet to happen. Only reschedule events from the current time forward.
    2.  **Identify Flexible Events**: Identify events that are likely flexible. Good candidates for rescheduling include tasks with titles like "אימון", "לימודים", "סידורים", "ריצה", "קניות". Do NOT reschedule events with titles like "פגישה", "שיעור", "תור לרופא", "אירוע" unless the user's reason explicitly asks for it.
    3.  **Apply the Reason**:
        - If the reason is "אני באיחור של X דקות/שעה" (I'm late by X mins/hour), shift all of today's upcoming events forward by that duration. Find new slots for any events that now conflict, prioritizing later today or tomorrow.
        - If the reason is "דחה משימות שלא בוצעו למחר" (Postpone uncompleted tasks to tomorrow), move all of today's flexible, uncompleted tasks to available slots on the next day.
    4.  **Find Free Slots**: When moving events, find logical free slots. Avoid scheduling things too late at night (e.g., after 11 PM) unless necessary. 
    5.  **Maintain Structure**: The output must be a valid JSON object containing the *entire* modified schedule, maintaining the exact same structure as the input (keys for every day of the week).
    6.  **Provide Summary**: The JSON object must also include a "summary" key with a short, friendly Hebrew message explaining the changes you made.

    INPUT SCHEDULE:
    ${JSON.stringify(currentSchedule, null, 2)}

    EXAMPLE OUTPUT:
    {
      "summary": "הבנתי, אתה מאחר בשעה. הזזתי את המשימות שלך להיום קדימה, והעברתי את האימון למחר בבוקר כי לא נשאר זמן. שיהיה המשך יום מוצלח!",
      "newSchedule": {
        "Sunday": [...],
        "Monday": [...],
        "Tuesday": [...],
        "Wednesday": [...],
        "Thursday": [...],
        "Friday": [...],
        "Saturday": [...],
        "Today": [...]
      }
    }

    Generate the JSON output now.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const raw = response.text() || '{}';
    const parsed = JSON.parse(raw);

    if (!parsed.newSchedule || !parsed.summary) {
      throw new Error("AI response is missing 'newSchedule' or 'summary'.");
    }

    return parsed;

  } catch (error) {
    console.error('Gemini reschedule failed:', error);
    throw new Error('Failed to get a valid reschedule plan from AI.');
  }
}

module.exports = { parseWithGemini, parseWithGeminiSmart, rescheduleWithGemini, cleanTitle };
