// i18n translations for CalendAI
// Supports Hebrew (he) and English (en)

const translations = {
  he: {
    // Splash
    splashSubtitle: "מכין את הלו\"ז החכם שלך...",
    splashVersion: "v1.0",

    // Header
    besod: "בס\"ד",
    tagline: "✨ העוזר האישי שלך לניהול הזמן",
    loginWithGoogle: "התחבר עם Google",
    logout: "התנתק",
    languageLabel: "🌐 EN",

    // Input Section
    inputTitle: "הזן לוח זמנים בשפה חופשית",
    tryForExample: "נסה למשל:",
    frequency: "תדירות:",
    parseButton: "הוסף ללוח שנה",
    parsing: "מפענח...",
    clearAll: "נקה הכל",
    eventEditTitle: "עריכת אירוע",
    cancel: "בטל",
    saveChanges: "שמור שינויים",
    update: "מעדכן...",

    // Recurrence
    recurrenceOnce: "חד פעמי",
    recurrenceDaily: "יומי",
    recurrenceWeekly: "שבועי",
    recurrenceMonthly: "חודשי",
    recurrenceYearly: "שנתי",
    recurrenceForever: "לכל החיים",

    // Reminder
    reminderNone: "ללא תזכורת",
    reminder5min: "5 דקות לפני",
    reminder15min: "15 דקות לפני",
    reminder30min: "30 דקות לפני",
    reminder1hour: "שעה לפני",
    reminderLabel: "תזכורת מקדימה",
    reminderMinutes: "דקות לפני",
    reminderTitle: "CalendAI - תזכורת",
    reminderStartsIn: "מתחיל בעוד",

    // Placeholder Examples
    placeholderExamples: [
      'תפנה לי זמן איכות עם המשפחה בסופ"ש',
      'תמצא לי זמן לשיעור תורה בשני בערב',
      'תזמן לי 3 אימונים השבוע בבוקר',
      'תארגן לי זמן להכין אוכל ברביעי בערב',
      'קבע לי פגישת עבודה ביום שני ב-10:00',
      'תזכיר לי לשלם חשבונות בראשון בערב',
      'תארגן לי זמן ללימודים פעמיים השבוע'
    ],

    // Suggestion Chips
    suggestionChips: [
      'זמן איכות עם המשפחה',
      'שיעור תורה בשני בערב',
      '3 אימונים השבוע בבוקר',
      'הכנת אוכל ברביעי בערב',
      'פגישת עבודה ביום שני',
      'תשלום חשבונות',
      'לימודים פעמיים השבוע',
      '8 שעות שינה בלילה'
    ],
    suggestionSleep: '🛌 8 שעות שינה',

    // Day Names
    daySunday: 'יום ראשון',
    dayMonday: 'יום שני',
    dayTuesday: 'יום שלישי',
    dayWednesday: 'יום רביעי',
    dayThursday: 'יום חמישי',
    dayFriday: 'יום שישי',
    daySaturday: 'יום שבת',
    dayToday: 'היום',
    dayTodayLabel: 'היום',

    // Weekly Schedule
    weeklyScheduleTitle: 'הלו"ז השבועי שלך',
    noEvents: 'אין אירועים',
    fixSchedule: 'תקן לי את הלו"ז',
    allLocations: 'כל המיקומים',
    sleepLabel: '🌙 לילה',
    reminderColon: 'תזכורת:',

    // Reschedule Modal
    rescheduleTitle: 'תקן לי את הלו"ז',
    rescheduleLoading: 'העוזר החכם מארגן את הלו"ז...',
    rescheduleLoadingSub: 'זה עשוי לקחת מספר רגעים.',
    rescheduleOffer: 'העוזר מציע:',
    reschedulePreview: 'תצוגה מקדימה:',
    rescheduleConfirm: 'אשר עדכון',
    rescheduleChooseDelay: 'בחר איך לארגן מחדש עקב איחור של',
    rescheduleMinutes: 'דקות:',
    mergeGaps: '✅ בטל הפסקות',
    gapsFound: 'נמצאו',
    gapsFound2: 'הפסקות.',
    noGaps: '❌ אין חלונות למיזוג',
    shiftAll: '🕐 הזז הכל קדימה ב',
    shiftAll2: 'דקות',
    chooseDelay: 'בחר בכמה זמן אתה מאחר:',
    delay30: 'אני באיחור של 30 דקות',
    delay1hour: 'אני באיחור של שעה',
    delayTomorrow: 'דחה משימות שלא בוצעו למחר',
    aiOrganizing: 'העוזר החכם מארגן את הלו"ז...',

    // Free Slots Modal
    freeSlotsTitle: 'חלונות פנויים',
    freeSlotsLoading: 'מחפש חלונות פנויים...',
    freeSlotsFound: 'נמצאו',
    freeSlotsRequested: 'דרושות',
    freeSlotsMinutes: 'דקות:',
    noFreeSlots: 'לא נמצאו חלונות מתאימים.',
    freeSlotDuration: 'משך:',
    freeSlotMinutes: 'דקות',
    freeSlotPrompt: 'הכנס כותרת:',
    freeSlotAdded: 'נוסף',

    // Edit Modal
    editTitle: 'כותרת',
    editStartTime: 'שעת התחלה',
    editEndTime: 'שעת סיום',
    editRecurrence: 'תדירות',
    editSleepLabel: 'שעות שינה (חוצה חצות)',
    eventUpdated: 'האירוע עודכן!',

    // Conflicts
    conflictTitle: '⚠️ התנגשות ב',
    conflictOverlaps: 'חופף לאירועים:',
    conflictSuggestions: '🕒 שעות פנויות מומלצות:',
    conflictChangeTime: 'שנה שעה ל',

    // Success / Error
    successAdded: 'נוספו',
    successEvents: 'אירועים!',
    scheduleCleared: 'כל האירועים נמחקו',
    failedRequest: 'נכשלה פנייה:',

    // Footer
    footerVersion: 'גרסה מעודכנת:',
    footerLocal: 'מקומית',
    footerPrivacy: 'Privacy Policy',

    // Toast notifications
    toastReminder: 'תזכורת:',

    // Calendar slot click
    slotClickPrefix: 'ביום',
    slotClickFrom: 'מ-',
    slotClickUntil: 'עד',

    // Rate limit
    rateLimit: 'יותר מדי בקשות. אנא נסה שוב בעוד דקה.',
  },

  en: {
    // Splash
    splashSubtitle: "Preparing your smart schedule...",
    splashVersion: "v1.0",

    // Header
    besod: "B\"SD",
    tagline: "✨ Your personal AI time management assistant",
    loginWithGoogle: "Login with Google",
    logout: "Logout",
    languageLabel: "🌐 HE",

    // Input Section
    inputTitle: "Enter your schedule in natural language",
    tryForExample: "Try for example:",
    frequency: "Frequency:",
    parseButton: "Add to Calendar",
    parsing: "Parsing...",
    clearAll: "Clear All",
    eventEditTitle: "Edit Event",
    cancel: "Cancel",
    saveChanges: "Save Changes",
    update: "Updating...",

    // Recurrence
    recurrenceOnce: "Once",
    recurrenceDaily: "Daily",
    recurrenceWeekly: "Weekly",
    recurrenceMonthly: "Monthly",
    recurrenceYearly: "Yearly",
    recurrenceForever: "Forever",

    // Reminder
    reminderNone: "No reminder",
    reminder5min: "5 minutes before",
    reminder15min: "15 minutes before",
    reminder30min: "30 minutes before",
    reminder1hour: "1 hour before",
    reminderLabel: "Reminder",
    reminderMinutes: "minutes before",
    reminderTitle: "CalendAI - Reminder",
    reminderStartsIn: "Starts in",

    // Placeholder Examples
    placeholderExamples: [
      'Find me quality time with family this weekend',
      'Find time for Torah study on Monday evening',
      'Schedule 3 workouts this week in the morning',
      'Arrange time to prepare food on Wednesday evening',
      'Set a work meeting on Monday at 10:00',
      'Remind me to pay bills on Sunday evening',
      'Arrange study time twice this week'
    ],

    // Suggestion Chips
    suggestionChips: [
      'Quality time with family',
      'Torah study Monday evening',
      '3 workouts this week morning',
      'Prepare food Wednesday evening',
      'Work meeting Monday',
      'Pay bills',
      'Study twice this week',
      '8 hours sleep at night'
    ],
    suggestionSleep: '🛌 8 hours sleep',

    // Day Names
    daySunday: 'Sunday',
    dayMonday: 'Monday',
    dayTuesday: 'Tuesday',
    dayWednesday: 'Wednesday',
    dayThursday: 'Thursday',
    dayFriday: 'Friday',
    daySaturday: 'Saturday',
    dayToday: 'Today',
    dayTodayLabel: 'Today',

    // Weekly Schedule
    weeklyScheduleTitle: 'Your Weekly Schedule',
    noEvents: 'No events',
    fixSchedule: 'Fix my schedule',
    allLocations: 'All locations',
    sleepLabel: '🌙 Night',
    reminderColon: 'Reminder:',

    // Reschedule Modal
    rescheduleTitle: 'Fix my schedule',
    rescheduleLoading: 'The smart assistant is reorganizing your schedule...',
    rescheduleLoadingSub: 'This may take a moment.',
    rescheduleOffer: 'Assistant suggests:',
    reschedulePreview: 'Preview:',
    rescheduleConfirm: 'Confirm update',
    rescheduleChooseDelay: 'Choose how to reorganize due to a delay of',
    rescheduleMinutes: 'minutes:',
    mergeGaps: '✅ Remove gaps',
    gapsFound: 'Found',
    gapsFound2: 'gaps.',
    noGaps: '❌ No gaps to merge',
    shiftAll: '🕐 Shift everything forward by',
    shiftAll2: 'minutes',
    chooseDelay: 'How late are you?',
    delay30: 'I\'m 30 minutes late',
    delay1hour: 'I\'m 1 hour late',
    delayTomorrow: 'Postpone unfinished tasks to tomorrow',
    aiOrganizing: 'The smart assistant is reorganizing your schedule...',

    // Free Slots Modal
    freeSlotsTitle: 'Free Slots',
    freeSlotsLoading: 'Searching for free slots...',
    freeSlotsFound: 'Found',
    freeSlotsRequested: 'requested',
    freeSlotsMinutes: 'minutes:',
    noFreeSlots: 'No suitable free slots found.',
    freeSlotDuration: 'Duration:',
    freeSlotMinutes: 'min',
    freeSlotPrompt: 'Enter a title:',
    freeSlotAdded: 'Added',

    // Edit Modal
    editTitle: 'Title',
    editStartTime: 'Start Time',
    editEndTime: 'End Time',
    editRecurrence: 'Recurrence',
    editSleepLabel: 'Sleep hours (crosses midnight)',
    eventUpdated: 'Event updated!',

    // Conflicts
    conflictTitle: '⚠️ Conflict on',
    conflictOverlaps: 'overlaps with events:',
    conflictSuggestions: '🕒 Recommended free slots:',
    conflictChangeTime: 'Change time to',

    // Success / Error
    successAdded: 'Added',
    successEvents: 'events!',
    scheduleCleared: 'All events cleared',
    failedRequest: 'Request failed:',

    // Footer
    footerVersion: 'Version:',
    footerLocal: 'Local',
    footerPrivacy: 'Privacy Policy',

    // Toast notifications
    toastReminder: 'Reminder:',

    // Calendar slot click
    slotClickPrefix: 'On',
    slotClickFrom: 'from',
    slotClickUntil: 'until',

    // Calendar / Monthly View
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    calendarMonthlyView: 'Monthly Calendar',
    calendarYearlyView: 'Full Year Calendar',
    calendarYearViewDesc: 'Rolling view - 12 months ahead from current month',
    calendarToggleMonth: 'Show Month',
    calendarToggleYear: 'Show Full Year',

    // AI Success message (used as fallback when backend doesn't provide replyMessage)
    successAIMessage: 'Successfully added {count} event(s) from your text.',

    // Rate limit
    rateLimit: 'Too many requests. Please try again in a minute.',
  }
};

export default translations;