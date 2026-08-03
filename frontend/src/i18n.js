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
    undo: "בטל פעולה אחרונה",
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
    recurrenceEndLabel: "תוקף/סיום",
    recurrenceNeverEnds: "ללא סוף",
    recurrenceEndsOnDate: "מסתיים בתאריך...",

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

    // Calendar / Monthly View
    monthNames: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
    dayNamesShort: ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ש\''],
    calendarMonthlyView: 'לוח שנה חודשי',
    calendarYearlyView: 'לוח שנה שנתי',
    calendarYearViewDesc: 'תצוגה מתגלגלת - 12 חודשים קדימה מהחודש הנוכחי',
    calendarToggleMonth: 'הצג חודש',
    calendarToggleYear: 'הצג שנה מלאה',

    // Calendar slot click
    slotClickPrefix: 'ביום',
    slotClickFrom: 'מ-',
    slotClickUntil: 'עד',

    // Analytics & Sidebar
    sidebarTitle: 'תפריט',
    sidebarAnalytics: '📊 ניתוח פעילות',
    sidebarPro: '⚡ שדרוג ל-Pro',
    sidebarSettings: '⚙️ הגדרות',
    sidebarInstall: '📱 הוסף למסך הבית',
    analyticsTitle: 'ניתוח פעילות',
    analyticsSport: 'ספורט',
    analyticsWork: 'עבודה',
    analyticsSleep: 'שינה',
    analyticsLeisure: 'פנאי',
    analyticsHours: 'שעות',
    analyticsPercent: 'אחוזים',
    analyticsCompleted: 'הושלם',
    analyticsOverdue: 'באיחור',
    analyticsGoalMetric: 'מדד עמידה ביעדים',
    settingsTitle: 'הגדרות',
    settingsLanguage: 'שפה',
    settingsDefaultStart: 'שעת התחלה ברירת מחדל',
    settingsDefaultEnd: 'שעת סיום ברירת מחדל',
    settingsSave: 'שמור הגדרות',
    settingsSaved: 'ההגדרות נשמרו',
    proTitle: 'שדרוג ל-Pro',
    proDesc: 'קבל גישה לכל התכונות המתקדמות:',
    proFeature1: 'לוח שנה ללא הגבלה',
    proFeature2: 'ייעוץ AI מתקדם',
    proFeature3: 'סנכרון Google Calendar',
    proFeature4: 'תזכורות חכמות',
    proFeature5: 'ניתוח נתונים מתקדם',
    proComingSoon: 'בקרוב...',

    // Booking Page
    bookingTitle: 'תיאום פגישה',
    bookingSubtitle: 'בחר את הזמנים המועדפים עליך',
    bookingPriority1: 'עדיפות ראשונה',
    bookingPriority2: 'עדיפות שנייה',
    bookingBusy: 'תפוס',
    bookingSelectTime: 'בחר זמנים פנויים',
    bookingConfirm: 'אשר תיאום',
    bookingConfirmation: 'בקשת התיאום נשלחה!',
    bookingOr: 'או',
    bookingAiFinder: 'תמצא לי זמן אחר 🪄',
    bookingAiFinderLoading: 'ה-AI מחפש את הזמן הטוב ביותר...',
    bookingAiNoResult: 'לא נמצא זמן מתאים. נסה יום אחר.',
    bookingAiSuggestion: 'הצעת AI:',
    bookingDayPicker: 'בחר יום:',
    bookingNoSlots: 'אין משבצות פנויות ליום זה.',
    bookingGuestName: 'שם האורח',
    bookingGuestNamePlaceholder: 'הכנס את שמך',
    bookingDuration: 'משך',
    bookingMinutes: 'דקות',
    bookingShowUnavailable: 'הצג גם זמנים תפוסים',
    bookingAvailableOnly: 'רק זמנים פנויים',
    bookingPrioritySelect: 'בחר עדיפות:',
    bookingFirstChoice: 'עדיפות ראשונה',
    bookingSecondChoice: 'עדיפות שנייה',
    bookingFirstChoiceColor: '🟦 עדיפות ראשונה',
    bookingSecondChoiceColor: '🟪 עדיפות שנייה',

    // Meeting Type Cards
    bookingMeetingType: 'בחר סוג פגישה:',
    bookingQuickChat: 'שיחה מהירה',
    bookingQuickChatDesc: 'פגישה קצרה של 15-30 דקות',
    bookingStandard: 'פגישה רגילה',
    bookingStandardDesc: 'פגישה סטנדרטית של 30-60 דקות',
    bookingConsultation: 'ייעוץ',
    bookingConsultationDesc: 'ייעוץ מעמיק של 60-90 דקות',
    bookingSelectCard: 'בחר',
    bookingSelectedCard: 'נבחר',

    // Booking Details Form
    bookingDetailsTitle: 'הפרטים שלך',
    bookingGuestEmail: 'אימייל',
    bookingGuestEmailPlaceholder: 'הכנס את כתובת האימייל שלך',
    bookingGuestPhone: 'טלפון / וואצאפ',
    bookingGuestPhonePlaceholder: 'הכנס מספר טלפון',
    bookingGuestNotes: 'הערות / נושא הפגישה',
    bookingGuestNotesPlaceholder: 'הכנס תיאור קצר או נושא לפגישה',
    bookingSlotUnavailable: 'המשבצת שנבחרה כבר לא פנויה. אנא בחר משבצת אחרת.',

    // Booking Success Screen
    bookingSuccessTitle: 'הפגישה נקבעה בהצלחה! ✅',
    bookingSuccessDesc: 'קיבלנו את בקשתך. נשלח לך אישור בדוא"ל ובטלפון.',
    bookingWhatsAppBtn: 'שלח תזכורת בוואצאפ',
    bookingWhatsAppMsg: 'היי, קבעתי פגישה דרך CalendAI. אשמח לתזכורת.',
    bookingEmailSent: '✅ אישור נשלח לכתובת האימייל שלך',
    bookingClose: 'סגור',

    // Share Booking Link
    shareBookingLink: '🔗 שתף קישור לתיאום',
    shareBookingTitle: 'שיתוף קישור לתיאום פגישות',
    shareBookingDesc: 'שלח קישור זה למשתתפים כדי שיוכלו לבחור זמנים פנויים:',
    shareBookingCopy: '📋 העתק קישור',
    shareBookingCopied: '✅ הועתק!',
    shareBookingPreview: '🔍 תצוגה מקדימה',
    shareBookingLinkLabel: 'קישור לתיאום פגישה:',

    // PWA / Install
    pwaInstall: '📱 התקן את האפליקציה',
    pwaInstallDesc: 'התקן את CalendAI במסך הבית לגישה מהירה',
    pwaInstallButton: 'התקן עכשיו',
    pwaIosSafariTitle: 'הוסף למסך הבית',
    pwaIosSafariDesc: 'לחץ על כפתור השיתוף ⎘ בתחתית הדפדפן, ואז בחר "הוסף למסך הבית"',
    pwaIosSafariStep1: '1. לחץ על כפתור השיתוף ⎘',
    pwaIosSafariStep2: '2. גלול מטה ובחר "הוסף למסך הבית"',
    pwaIosSafariStep3: '3. לחץ על "הוסף" בפינה העליונה',
    pwaOpenInSafari: 'פתח ב-Safari',
    pwaOpenInSafariDesc: 'יש לפתוח דף זה בדפדפן Safari כדי להוסיף למסך הבית',
    pwaNotAvailable: '⚠️ לא זמין בדפדפן זה',

    // Rate limit
    rateLimit: 'יותר מדי בקשות. אנא נסה שוב בעוד דקה.',

    // Profile Settings (Location moved to settings)
    profileTitle: 'הגדרות פרופיל',
    profileDefaultLocation: 'מיקום ברירת מחדל',
    profileLocationDesc: 'בחר מיקום ברירת מחדל לאירועים שלך (אופציונלי)',
    profileLocationSaved: 'מיקום ברירת מחדל נשמר',
    noLocation: 'ללא מיקום',

    // Wizard / Meeting Coordinator
    wizardTitle: 'תיאום פגישה חדשה!',
    wizardShort: 'תיאום',
    wizardStep1Title: 'אורך ונושא הפגישה',
    wizardStep1Desc: 'בחר אורך פגישה וכותרת',
    wizardDuration: 'אורך הפגישה:',
    wizardSubject: 'נושא/כותרת הפגישה:',
    wizardSubjectPlaceholder: 'הכנס כותרת לפגישה',
    wizardNext: 'המשך',
    wizardStep2Title: 'בחר חלונות פנויים',
    wizardStep2Desc: 'סמן את המשבצות שמתאימות לך',
    wizardShowOnlyFree: 'הצג רק לוז פנוי',
    wizardShowAll: 'הצג את כל המשבצות',
    wizardFreeSlot: 'פנוי',
    wizardBusySlot: 'תפוס',
    wizardStep3Title: 'צור קישור ושיתוף',
    wizardStep3Desc: 'שתף את הקישור עם האורח',
    wizardCreatingLink: 'יוצר קישור...',
    wizardCreateLink: 'צור קישור ייחודי',
    wizardLinkCopied: '✅ הקישור הועתק!',
    wizardCopyLink: '📋 העתק קישור',
    wizardWhatsApp: '📱 שתף בוואטסאפ',
    wizardEmail: '📧 שלח במייל',
    wizardClose: 'סגור',
    wizardNoSlots: 'לא נבחרו משבצות. בחר לפחות משבצת אחת פנויה.',
    wizardNoSlotsAvailable: 'אין משבצות פנויות ליום זה',
    wizardSelectDay: 'בחר יום:',
    wizardSelectSlots: 'בחר משבצות פנויות:',
    wizardDurationMinutes: 'דקות',
    wizardDuration15: '15 דקות',
    wizardDuration30: '30 דקות',
    wizardDuration45: '45 דקות',
    wizardDuration60: 'שעה',
    wizardDuration90: 'שעה וחצי',
    wizardDuration120: 'שעתיים',

    // Guest View
    guestViewTitle: 'בחר זמן נוח לך',
    guestViewSubtitle: 'המארח קבע את חלונות הזמן הבאים עבורך:',
    guestViewSelectSlot: 'בחר משבצת',
    guestViewSelected: 'נבחר',
    guestViewConfirm: 'אשר תיאום פגישה',
    guestViewConfirming: 'מאשר תיאום...',
    guestViewName: 'השם שלך:',
    guestViewNamePlaceholder: 'הכנס את שמך',
    guestViewSuccess: 'הפגישה תואמה בהצלחה! ✅',
    guestViewSuccessDesc: 'המארח קיבל הודעה. הפגישה נוספה ליומן.',
    guestViewError: 'שגיאה באישור התיאום. נסה שוב.',
    guestViewAlreadyBooked: 'המשבצת הזו כבר לא פנויה. בחר משבצת אחרת.',

    // Referral Banner (Guest View)
    referralBannerTitle: 'רוצה גם לנצל את המקסימום מהזמן שלך?',
    referralBannerSubtitle: 'הצטרף ל-CalendAI! 🚀',
    referralBannerButton: 'התחל עכשיו',
    referralBannerDesc: 'ניהול לו"ז חכם עם AI - תיאם פגישות, נהל משימות וחסוך זמן',

    // Guest Usage Limit
    guestLimitTitle: 'אוהב את CalendAI? 🚀',
    guestLimitDesc: 'הגעת ל-10 פעולות ניסיון בחינם. התחבר עם Google כדי לשמור את כל הנתונים שלך!',

    // Expiration & Extension Notification
    expiringTitle: 'הודעה על אירוע שמסתיים',
    expiringDesc: 'הפעולה "{eventTitle}" עומדת להסתיים בקרוב. האם ברצונך להאריך אותה לשנה נוספת?',
    extendOneYear: 'הארך לשנה נוספת',
    extendSuccess: 'האירוע הוארך לשנה נוספת בהצלחה!',
    extendLater: 'אולי מאוחר יותר',
    expiringDaysLeft: 'נשארו {days} ימים',

    // Booking UI Redesign
    bookingShowOnlyFree: 'הצג רק לוז פנוי',
    bookingShowAllSlots: 'הצג את כל המשבצות',
    bookingSlotBusyLabel: 'תפוס',
    bookingViralTitle: 'רוצה גם? הצטרף ל-CalendAI ותתחיל להוציא את המקסימום מהזמן שלך! 🚀',
    bookingViralButton: 'התחל בחינם',
    bookingDayGridLabel: 'בחר יום:',
    bookingSlotsLabel: 'משבצות זמינות:',
    bookingNoFreeSlots: 'אין משבצות פנויות ליום זה',

    // Smart Auth
    loginRequired: 'עליך להתחבר כדי לבצע פעולה זו',
    loginShort: 'התחבר',
    loginToSave: 'התחבר כדי לשמור',
    loginToSaveDesc: 'כדי לשמור אירועים בלוח השנה, עליך להתחבר קודם',

    // PWA Smart Install Banner
    pwaInstallBanner: '📱 התקן את CalendAI במסך הבית לגישה מהירה יותר',
    pwaInstallBannerAndroid: 'התקן אפליקציה',
    pwaInstallBannerIos: 'הוסף למסך הבית',
    pwaInstallBannerClose: 'סגור',

    // Booking Confirmation Toast (Real-time Notification)
    bookingToastTitle: 'תואמה פגישה בהצלחה! 🎉',
    bookingToastMessage: 'תואמה פגישה עם {guestName} בשעה {meetingTime} בהצלחה! 🎉',

    // Detect Location
    detectLocation: 'זהה מיקום אוטומטי 📍',
    detectLocationLoading: 'מזהה מיקום...',
    detectLocationSuccess: 'מיקום זוהה: {city}',
    detectLocationError: 'לא ניתן לזהות מיקום. בדוק הרשאות.',
    timezoneDetected: 'אזור זמן: {timezone}',

    // Timezone Converter for Booking
    bookingTimezoneNote: 'השעות מוצגות לפי {timezone}',
    bookingTimezoneDetected: 'השעות מותאמות לאזור הזמן שלך: {timezone}',

    // Viral Booking & Calendar Sync
    viralityBannerText: 'מופעל על ידי CalendAI ✨ | רוצה לנהל את הלו"ז שלך ב-AI? התחל בחינם',
    shareWhatsAppText: 'היי! מזמין אותך לתאם איתי פגישה בקלות ב-CalendAI 📅\nבחר את הזמן שנוח לך בקישור:',
    shareWhatsAppBtn: '📱 שלח בוואצאפ',
    shareEmailBtn: '📧 שלח במייל',
    shareEmailSubject: 'הזמנה לתיאום פגישה - CalendAI',
    shareEmailBody: 'היי! מזמין אותך לתאם איתי פגישה בקלות ב-CalendAI 📅\n\nבחר את הזמן שנוח לך בקישור:\n',
    shareAddCalendaiUser: 'הוסף חבר מ-CalendAI',
    shareAddCalendaiUserPlaceholder: 'הכנס שם או מייל של משתמש רשום',
    shareAddCalendaiUserBtn: 'שלח הזמנה',
    shareAddCalendaiUserSent: '✅ ההזמנה נשלחה!',
    addToGoogleCalendar: '📅 הוסף ל-Google Calendar',
    downloadIcs: '📥 הורד קובץ יומן (.ics)',
    bookingCreateLink: 'אישור ויצירת קישור שיתוף',
    bookingShareModalTitle: 'שיתוף קישור לתיאום',
    bookingShareModalDesc: 'שלח קישור זה למשתתפים כדי שיוכלו לבחור זמנים פנויים:',
    bookingPoweredBy: 'מופעל על ידי CalendAI ✨',
    bookingStartFree: 'רוצה לנהל את הלו"ז שלך ב-AI? התחל בחינם',
    bookingGuestAddToCalendar: 'הוסף ל-Google Calendar',
    bookingGuestCreateAccount: 'צור חשבון CalendAI וקבל ניהול לו"ז חכם',
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
    undo: "Undo",
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
    recurrenceEndLabel: "Ends",
    recurrenceNeverEnds: "Never Ends",
    recurrenceEndsOnDate: "Ends on date...",

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

    // Analytics & Sidebar
    sidebarTitle: 'Menu',
    sidebarAnalytics: '📊 Analytics & Insights',
    sidebarPro: '⚡ Upgrade to Pro',
    sidebarSettings: '⚙️ Settings',
    sidebarInstall: '📱 Install App',
    analyticsTitle: 'Analytics & Insights',
    analyticsSport: 'Sport',
    analyticsWork: 'Work',
    analyticsSleep: 'Sleep',
    analyticsLeisure: 'Leisure',
    analyticsHours: 'hours',
    analyticsPercent: 'percent',
    analyticsCompleted: 'Completed',
    analyticsOverdue: 'Overdue',
    analyticsGoalMetric: 'Goal Metric',
    settingsTitle: 'Settings',
    settingsLanguage: 'Language',
    settingsDefaultStart: 'Default Start Time',
    settingsDefaultEnd: 'Default End Time',
    settingsSave: 'Save Settings',
    settingsSaved: 'Settings saved',
    proTitle: 'Upgrade to Pro',
    proDesc: 'Get access to all advanced features:',
    proFeature1: 'Unlimited calendar',
    proFeature2: 'Advanced AI advice',
    proFeature3: 'Google Calendar sync',
    proFeature4: 'Smart reminders',
    proFeature5: 'Advanced analytics',
    proComingSoon: 'Coming soon...',

    // Rate limit
    rateLimit: 'Too many requests. Please try again in a minute.',

    // Booking Page
    bookingTitle: 'Calendar Booking',
    bookingSubtitle: 'Select your preferred time slots',
    bookingPriority1: 'First Priority',
    bookingPriority2: 'Second Priority',
    bookingBusy: 'Busy',
    bookingSelectTime: 'Select available times',
    bookingConfirm: 'Confirm Booking',
    bookingConfirmation: 'Your booking request has been sent!',
    bookingOr: 'or',
    bookingAiFinder: 'Find me another time 🪄',
    bookingAiFinderLoading: 'AI is searching for the best time...',
    bookingAiNoResult: 'No suitable time found. Try another day.',
    bookingAiSuggestion: 'AI Suggestion:',
    bookingDayPicker: 'Select a day:',
    bookingNoSlots: 'No available slots for this day.',
    bookingGuestName: 'Guest Name',
    bookingGuestNamePlaceholder: 'Enter your name',
    bookingDuration: 'Duration',
    bookingMinutes: 'minutes',
    bookingShowUnavailable: 'Show Unavailable Slots',
    bookingAvailableOnly: 'Available Slots Only',
    bookingPrioritySelect: 'Select priority:',
    bookingFirstChoice: 'First Choice',
    bookingSecondChoice: 'Second Choice',
    bookingFirstChoiceColor: '🟦 First Choice',
    bookingSecondChoiceColor: '🟪 Second Choice',

    // Meeting Type Cards
    bookingMeetingType: 'Choose a meeting type:',
    bookingQuickChat: 'Quick Chat',
    bookingQuickChatDesc: 'Short meeting of 15-30 minutes',
    bookingStandard: 'Standard Meeting',
    bookingStandardDesc: 'Standard meeting of 30-60 minutes',
    bookingConsultation: 'Consultation',
    bookingConsultationDesc: 'In-depth consultation of 60-90 minutes',
    bookingSelectCard: 'Select',
    bookingSelectedCard: 'Selected',

    // Booking Details Form
    bookingDetailsTitle: 'Your Details',
    bookingGuestEmail: 'Email',
    bookingGuestEmailPlaceholder: 'Enter your email address',
    bookingGuestPhone: 'Phone / WhatsApp',
    bookingGuestPhonePlaceholder: 'Enter your phone number',
    bookingGuestNotes: 'Notes / Meeting Topic',
    bookingGuestNotesPlaceholder: 'Enter a short description or topic',
    bookingSlotUnavailable: 'The selected slot is no longer available. Please choose another slot.',

    // Booking Success Screen
    bookingSuccessTitle: 'Booking Confirmed! ✅',
    bookingSuccessDesc: 'We received your request. A confirmation will be sent via email and phone.',
    bookingWhatsAppBtn: 'Send WhatsApp Reminder',
    bookingWhatsAppMsg: 'Hi, I booked a meeting through CalendAI. I would appreciate a reminder.',
    bookingEmailSent: '✅ Confirmation sent to your email',
    bookingClose: 'Close',

    // Share Booking Link
    shareBookingLink: '🔗 Share Booking Link',
    shareBookingTitle: 'Share Booking Link',
    shareBookingDesc: 'Send this link to participants so they can choose available times:',
    shareBookingCopy: '📋 Copy Link',
    shareBookingCopied: '✅ Copied!',
    shareBookingPreview: '🔍 Preview',
    shareBookingLinkLabel: 'Booking Link:',

    // PWA / Install
    pwaInstall: '📱 Install App',
    pwaInstallDesc: 'Install CalendAI on your home screen for quick access',
    pwaInstallButton: 'Install Now',
    pwaIosSafariTitle: 'Add to Home Screen',
    pwaIosSafariDesc: 'Tap the share button ⎘ at the bottom of the browser, then select "Add to Home Screen"',
    pwaIosSafariStep1: '1. Tap the share button ⎘',
    pwaIosSafariStep2: '2. Scroll down and select "Add to Home Screen"',
    pwaIosSafariStep3: '3. Tap "Add" at the top right',
    pwaOpenInSafari: 'Open in Safari',
    pwaOpenInSafariDesc: 'Please open this page in Safari to add to home screen',
    pwaNotAvailable: '⚠️ Not available in this browser',

    // Profile Settings (Location moved to settings)
    profileTitle: 'Profile Settings',
    profileDefaultLocation: 'Default Location',
    profileLocationDesc: 'Choose a default location for your events (optional)',
    profileLocationSaved: 'Default location saved',
    noLocation: 'No location',

    // Wizard / Meeting Coordinator
    wizardTitle: 'New Meeting Schedule!',
    wizardShort: 'Schedule',
    wizardStep1Title: 'Duration & Subject',
    wizardStep1Desc: 'Choose meeting duration and title',
    wizardDuration: 'Meeting Duration:',
    wizardSubject: 'Meeting Subject:',
    wizardSubjectPlaceholder: 'Enter meeting title',
    wizardNext: 'Next',
    wizardStep2Title: 'Choose Free Slots',
    wizardStep2Desc: 'Select the slots that work for you',
    wizardShowOnlyFree: 'Show Only Free Slots',
    wizardShowAll: 'Show All Slots',
    wizardFreeSlot: 'Free',
    wizardBusySlot: 'Busy',
    wizardStep3Title: 'Create Link & Share',
    wizardStep3Desc: 'Share the link with your guest',
    wizardCreatingLink: 'Creating link...',
    wizardCreateLink: 'Create Unique Link',
    wizardLinkCopied: '✅ Link copied!',
    wizardCopyLink: '📋 Copy Link',
    wizardWhatsApp: '📱 Share via WhatsApp',
    wizardEmail: '📧 Send via Email',
    wizardClose: 'Close',
    wizardNoSlots: 'No slots selected. Please select at least one free slot.',
    wizardNoSlotsAvailable: 'No free slots for this day',
    wizardSelectDay: 'Select Day:',
    wizardSelectSlots: 'Select Free Slots:',
    wizardDurationMinutes: 'min',
    wizardDuration15: '15 min',
    wizardDuration30: '30 min',
    wizardDuration45: '45 min',
    wizardDuration60: '1 hour',
    wizardDuration90: '1.5 hours',
    wizardDuration120: '2 hours',

    // Guest View
    guestViewTitle: 'Pick a Time That Works for You',
    guestViewSubtitle: 'The host has set the following time slots for you:',
    guestViewSelectSlot: 'Select Slot',
    guestViewSelected: 'Selected',
    guestViewConfirm: 'Confirm Booking',
    guestViewConfirming: 'Confirming...',
    guestViewName: 'Your Name:',
    guestViewNamePlaceholder: 'Enter your name',
    guestViewSuccess: 'Meeting Booked Successfully! ✅',
    guestViewSuccessDesc: 'The host has been notified. The meeting has been added to the calendar.',
    guestViewError: 'Error confirming booking. Please try again.',
    guestViewAlreadyBooked: 'This slot is no longer available. Please choose another slot.',

    // Referral Banner (Guest View)
    referralBannerTitle: 'Want to get the most out of your time too?',
    referralBannerSubtitle: 'Join CalendAI! 🚀',
    referralBannerButton: 'Start Free',
    referralBannerDesc: 'Smart AI schedule management - schedule meetings, manage tasks, and save time',

    // Guest Usage Limit
    guestLimitTitle: 'Love CalendAI? 🚀',
    guestLimitDesc: 'You\'ve reached 10 free trial actions. Log in with Google to save all your data!',

    // Expiration & Extension Notification
    expiringTitle: 'Expiring Event Alert',
    expiringDesc: 'The "{eventTitle}" event is about to expire. Would you like to extend it for another year?',
    extendOneYear: 'Extend for Another Year',
    extendSuccess: 'Event extended for another year successfully!',
    extendLater: 'Maybe Later',
    expiringDaysLeft: '{days} days left',

    // Booking UI Redesign
    bookingShowOnlyFree: 'Show Only Free Slots',
    bookingShowAllSlots: 'Show All Slots',
    bookingSlotBusyLabel: 'Busy',
    bookingViralTitle: 'Want too? Join CalendAI and start getting the most out of your time! 🚀',
    bookingViralButton: 'Start Free',
    bookingDayGridLabel: 'Select a day:',
    bookingSlotsLabel: 'Available slots:',
    bookingNoFreeSlots: 'No free slots for this day',

    // Smart Auth
    loginRequired: 'You need to log in to perform this action',
    loginShort: 'Login',
    loginToSave: 'Login to save',
    loginToSaveDesc: 'To save events to your calendar, please log in first',

    // PWA Smart Install Banner
    pwaInstallBanner: '📱 Install CalendAI on your home screen for faster access',
    pwaInstallBannerAndroid: 'Install App',
    pwaInstallBannerIos: 'Add to Home Screen',
    pwaInstallBannerClose: 'Dismiss',

    // Booking Confirmation Toast (Real-time Notification)
    bookingToastTitle: 'Meeting Booked Successfully! 🎉',
    bookingToastMessage: 'Meeting booked with {guestName} at {meetingTime} successfully! 🎉',

    // Detect Location
    detectLocation: 'Detect Location 📍',
    detectLocationLoading: 'Detecting location...',
    detectLocationSuccess: 'Location detected: {city}',
    detectLocationError: 'Could not detect location. Check permissions.',
    timezoneDetected: 'Timezone: {timezone}',

    // Timezone Converter for Booking
    bookingTimezoneNote: 'Times are shown in {timezone}',
    bookingTimezoneDetected: 'Times adjusted to your timezone: {timezone}',

    // Viral Booking & Calendar Sync
    viralityBannerText: 'Powered by CalendAI ✨ | Want to manage your schedule with AI? Start Free',
    shareWhatsAppText: 'Hey! I invite you to schedule a meeting with me easily on CalendAI 📅\nPick a time that works for you at:',
    shareWhatsAppBtn: '📱 Share via WhatsApp',
    shareEmailBtn: '📧 Share via Email',
    shareEmailSubject: 'Invitation to Schedule a Meeting - CalendAI',
    shareEmailBody: 'Hey! I invite you to schedule a meeting with me easily on CalendAI 📅\n\nPick a time that works for you at:\n',
    shareAddCalendaiUser: 'Add CalendAI User',
    shareAddCalendaiUserPlaceholder: 'Enter name or email of registered user',
    shareAddCalendaiUserBtn: 'Send Invitation',
    shareAddCalendaiUserSent: '✅ Invitation sent!',
    addToGoogleCalendar: '📅 Add to Google Calendar',
    downloadIcs: '📥 Download .ics File',
    bookingCreateLink: 'Confirm & Create Share Link',
    bookingShareModalTitle: 'Share Scheduling Link',
    bookingShareModalDesc: 'Send this link to participants so they can choose a convenient time:',
    bookingPoweredBy: 'Powered by CalendAI ✨',
    bookingStartFree: 'Want to manage your schedule with AI? Start Free',
    bookingGuestAddToCalendar: 'Add to Google Calendar',
    bookingGuestCreateAccount: 'Create a CalendAI account and get smart schedule management',
  }
};

export default translations;