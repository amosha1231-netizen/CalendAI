import {
  Shield, Eye, Calendar, Sparkles, Share2, Globe, Clock, Lock, UserCheck, Baby, Cookie, RefreshCw, Mail
} from 'lucide-react';

// Privacy Policy in English and Hebrew. Keep the two versions in sync:
// same sections, same order, same meaning. When the app starts collecting
// something new or uses a new provider, update both versions.

const CONTACT = 'calendai555@gmail.com';
const MAILTO = `mailto:${CONTACT}`;
const GOOGLE_POLICY = 'https://developers.google.com/terms/api-services-user-data-policy';

const en = {
  back: 'Back to CalendAI',
  rights: 'All rights reserved.',
  title: 'Privacy Policy',
  updated: 'Last updated: November 26, 2026',
  intro: [
    'This Privacy Policy explains what information **CalendAI** ("we", "our", or "the App") collects when you use the website www.calendai.org and the CalendAI apps for Android and iOS, why we collect it, who we share it with, and the choices and rights you have. CalendAI is operated from Israel, and we are responsible for the personal information described here.',
    'You are not legally required to give us any of this information. However, without some of it (for example, an email address for an account) we cannot provide the relevant feature.'
  ],
  sections: [
    {
      id: 'collect', icon: Eye, color: 'text-blue-500', title: 'Information We Collect',
      blocks: [
        { p: '**Account information.** When you sign in with Google or Microsoft: your name, email address, and profile photo. When you register with email: your email address and your password, which we store only in hashed (scrambled) form.' },
        { p: '**Content you create.** Your events and schedule, tasks and their status, reminders, routines, goals, journal entries, expected expenses, booking page details (such as business name, services, and availability), and settings.' },
        { p: '**Requests to the AI assistant.** The text you type, the transcript of what you say (speech is turned into text by your device or browser\'s speech recognition service), and images you upload. We keep a history of your requests so that you can view and undo them.' },
        { p: '**Calendar data.** If you connect Google Calendar or Microsoft Outlook: access tokens that let us act on your behalf, the events we create or update for you, free/busy times (when you use mutual scheduling), and the titles and times of the day\'s events (only if you turn on the evening summary).' },
        { p: '**Location and time zone.** Your device\'s time zone and, only if you allow location access, approximate GPS coordinates. We use them to show times correctly and to calculate things like sunset and Shabbat times. We do not store GPS coordinates in your account and do not use them for tracking or advertising.' },
        { p: '**Information about other people.** When someone books a meeting through your link, the name, email, or phone number they enter. When you invite someone, the email or phone number you enter.' },
        { p: '**Purchases.** Your plan, subscription status and dates, and order or transaction identifiers from Lemon Squeezy, RevenueCat, Apple, or Google Play. We do not receive your full card details.' },
        { p: '**Notifications.** If you allow notifications, a technical address (push subscription) that lets us send notifications to your browser or device.' },
        { p: '**Usage and technical information.** Records of AI usage (such as the number of tokens and credits used), and technical logs kept by our servers and hosting provider (such as IP address, device and browser type, and error reports), used for operation, security, and troubleshooting.' }
      ]
    },
    {
      id: 'use', icon: Calendar, color: 'text-green-500', title: 'How We Use Your Information',
      blocks: [
        { ul: [
          'To provide the Service: create and manage your schedule, sync your calendars, run booking links, and send reminders and notifications.',
          'To process your requests with AI (see the next section).',
          'To manage your account, subscription, credits, and payments.',
          'To keep the Service secure, prevent abuse and fraud, and fix problems.',
          'To answer your questions and support requests.',
          'To comply with the law and protect our legal rights.'
        ] },
        { p: 'We do **not** sell your personal information, do not share it for advertising, and do not use it to show you ads.' }
      ]
    },
    {
      id: 'ai', icon: Sparkles, color: 'text-purple-500', title: 'AI Processing',
      blocks: [
        { p: 'When you use an AI feature, the text or image you submit, together with the context needed to answer (such as the current date, your time zone, and relevant parts of your schedule in CalendAI), is sent to **Anthropic**, the provider of the Claude AI model, which processes it to produce the answer. Anthropic does not use data sent through its API to train its models. Anthropic may process the data in other countries, including the United States. See [Anthropic\'s Privacy Policy](https://www.anthropic.com/legal/privacy).' },
        { p: 'We do not use your information to train AI models. Please avoid entering sensitive information that is not needed for scheduling.' }
      ]
    },
    {
      id: 'google', icon: Shield, color: 'text-red-500', title: 'Google User Data',
      blocks: [
        { p: 'When you sign in with Google, we request access to your basic profile (name, email, photo) and to your Google Calendar (calendar.events to create, read, update, and delete events, and calendar.freebusy to check free/busy times for mutual scheduling). We use this access only to provide the features you use, and only at your request or according to settings you turned on.' },
        { p: `CalendAI's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](${GOOGLE_POLICY}), including the Limited Use requirements. In particular:` },
        { ul: [
          'We do not sell Google user data or use it for advertising.',
          'We do not use Google user data to develop, improve, or train generalized AI or machine-learning models, and we do not send data read from your Google Calendar to AI providers.',
          'We do not transfer Google user data to others, except as needed to provide the Service, for security purposes, to comply with the law, or with your consent.',
          'People do not read Google user data, unless you give us permission (for example, in a support request), it is needed for security, or the law requires it.'
        ] },
        { p: 'You can revoke CalendAI\'s access at any time on your [Google Account permissions page](https://myaccount.google.com/permissions). Deleting your CalendAI account also revokes it.' }
      ]
    },
    {
      id: 'sharing', icon: Share2, color: 'text-indigo-500', title: 'Who We Share Information With',
      blocks: [
        { p: 'We share information only with service providers that help us run CalendAI, and only as needed for their role:' },
        { ul: [
          '**Hosting and database:** Render (servers) and our cloud database provider.',
          '**AI:** Anthropic (Claude).',
          '**Calendars and sign-in:** Google and Microsoft, when you connect them.',
          '**Payments:** Lemon Squeezy (website purchases), RevenueCat, Apple App Store, and Google Play (app purchases).',
          '**Notifications:** the push services of your browser or device (such as Google Firebase Cloud Messaging and Apple Push Notification service).',
          '**Your speech:** the speech recognition service of your browser or device (for example, Google or Apple), when you use voice input.'
        ] },
        { p: 'When you book a meeting through someone\'s booking link, or accept an invitation, the details you enter are shared with that person, and the meeting may be added to both calendars.' },
        { p: 'We may also disclose information if the law requires it, to protect the rights, property, or safety of users or the public, or as part of a merger or sale of the Service, in which case this Policy will continue to apply to your information.' }
      ]
    },
    {
      id: 'transfers', icon: Globe, color: 'text-teal-500', title: 'International Transfers',
      blocks: [
        { p: 'Our service providers store and process information on servers outside Israel, including in the United States and, for AI processing, possibly other countries. We take steps to ensure that information transferred abroad continues to be protected as required by Israeli law and, where it applies, by the GDPR.' }
      ]
    },
    {
      id: 'retention', icon: Clock, color: 'text-amber-500', title: 'How Long We Keep Information',
      blocks: [
        { ul: [
          'Account information and content: until you delete it or delete your account.',
          'AI request history: until you delete it or delete your account.',
          'Booking details entered by guests: until the host deletes them or their account.',
          'Purchase records: for as long as the law requires for tax and accounting purposes (in Israel, generally up to 7 years), even after your account is deleted.',
          'Technical logs and backups: for a limited period, after which they are deleted or overwritten.'
        ] },
        { p: 'You can delete your account at any time from the account menu in the App. See the [Delete Account](/delete-account) page for details.' }
      ]
    },
    {
      id: 'security', icon: Lock, color: 'text-slate-600', title: 'Security',
      blocks: [
        { p: 'We take reasonable technical and organizational measures to protect your information, including encrypted connections (HTTPS), hashed passwords, access tokens stored only on our servers and never sent to your browser, and access to data limited to what is needed to operate the Service.' },
        { p: 'No online service can be completely secure, and we cannot guarantee absolute security. If a security incident affects your personal information, we will act to address it and notify you and the authorities where the law requires.' }
      ]
    },
    {
      id: 'rights', icon: UserCheck, color: 'text-green-500', title: 'Your Rights and Choices',
      blocks: [
        { p: 'Under Israel\'s Privacy Protection Law, 5741-1981, you have the right to review the personal information we hold about you and to ask us to correct or delete information that is inaccurate, incomplete, unclear, or out of date. If you are in the European Economic Area or the United Kingdom, the GDPR also gives you rights to access, correct, delete, restrict, or object to processing of your data, to data portability, and to withdraw consent at any time.' },
        { p: 'You can also:' },
        { ul: [
          'View and edit your information in the App, and delete your account from the account menu.',
          'Disconnect Google Calendar or Microsoft Outlook in your Google or Microsoft account settings.',
          'Turn off location, notifications, and microphone access in your device or browser settings.',
          `Contact us at ${CONTACT} to exercise any of your rights. We will answer within the time set by law.`
        ] },
        { p: 'If you believe we have not handled your information properly, you may complain to the Israeli Privacy Protection Authority or, if you are in the EEA or the UK, to your local data protection authority. We would appreciate the chance to fix it first, so please contact us.' }
      ]
    },
    {
      id: 'children', icon: Baby, color: 'text-pink-500', title: 'Children',
      blocks: [
        { p: 'CalendAI is not intended for children under 13 (or under the higher minimum age set by the law of your country), and we do not knowingly collect their personal information. If you believe a child has given us personal information, please contact us and we will delete it.' }
      ]
    },
    {
      id: 'cookies', icon: Cookie, color: 'text-amber-600', title: 'Cookies and Local Storage',
      blocks: [
        { p: 'We use an essential cookie to keep you signed in, and your browser or device\'s local storage to remember your preferences (such as language) and to keep the App working offline. We do not use advertising cookies or third-party tracking tools.' }
      ]
    },
    {
      id: 'changes', icon: RefreshCw, color: 'text-slate-500', title: 'Changes to This Policy',
      blocks: [
        { p: 'We may update this Policy from time to time. The current version is always available on this page. If we make a material change, we will notify you in advance through the App or by email.' }
      ]
    },
    {
      id: 'contact', icon: Mail, color: 'text-blue-500', title: 'Contact',
      blocks: [
        { p: `If you have any questions about this Privacy Policy or how your information is handled, please contact us at [${CONTACT}](${MAILTO}).` }
      ]
    }
  ]
};

const he = {
  back: 'חזרה ל-CalendAI',
  rights: 'כל הזכויות שמורות.',
  title: 'מדיניות פרטיות',
  updated: 'עודכן לאחרונה: 26 בנובמבר 2026',
  intro: [
    'מדיניות פרטיות זו מסבירה איזה מידע **CalendAI** ("אנחנו", "האפליקציה") אוספת כשאתם משתמשים באתר www.calendai.org ובאפליקציות CalendAI ל-Android ול-iOS, למה אנחנו אוספים אותו, עם מי אנחנו משתפים אותו, ואילו בחירות וזכויות יש לכם. CalendAI מופעלת מישראל, ואנחנו האחראים למידע האישי המתואר כאן. המדיניות מנוסחת בלשון רבים מטעמי נוחות, ומתייחסת לכל המגדרים.',
    'אינכם חייבים לפי חוק למסור לנו את המידע הזה. עם זאת, בלי חלק ממנו (למשל, כתובת אימייל לחשבון) לא נוכל לספק את הפיצ\'ר הרלוונטי.'
  ],
  sections: [
    {
      id: 'collect', icon: Eye, color: 'text-blue-500', title: 'המידע שאנחנו אוספים',
      blocks: [
        { p: '**פרטי חשבון.** בהתחברות עם Google או Microsoft: השם, כתובת האימייל ותמונת הפרופיל. בהרשמה עם אימייל: כתובת האימייל והסיסמה, שנשמרת אצלנו רק בצורה מוצפנת חד-כיוונית (hash).' },
        { p: '**תוכן שאתם יוצרים.** אירועים ולו"ז, משימות והסטטוס שלהן, תזכורות, שגרות, יעדים, רשומות ביומן האישי, הוצאות צפויות, פרטי דף התיאום (כמו שם העסק, השירותים והזמינות) והגדרות.' },
        { p: '**בקשות לעוזר ה-AI.** הטקסט שאתם מקלידים, התמלול של מה שאתם אומרים (הדיבור הופך לטקסט על ידי שירות זיהוי הדיבור של המכשיר או הדפדפן) ותמונות שאתם מעלים. אנחנו שומרים היסטוריה של הבקשות כדי שתוכלו לראות ולבטל אותן.' },
        { p: '**מידע מהיומן.** אם חיברתם Google Calendar או Microsoft Outlook: אסימוני גישה (tokens) שמאפשרים לנו לפעול בשמכם, האירועים שאנחנו יוצרים או מעדכנים עבורכם, זמנים פנויים ותפוסים (כשאתם משתמשים בתיאום הדדי), והכותרות והשעות של אירועי היום (רק אם הפעלתם את סיכום הערב).' },
        { p: '**מיקום ואזור זמן.** אזור הזמן של המכשיר, ורק אם אישרתם גישה למיקום, קואורדינטות GPS משוערות. אנחנו משתמשים בהם כדי להציג שעות נכון ולחשב דברים כמו שקיעה וזמני שבת. איננו שומרים קואורדינטות GPS בחשבון שלכם ואיננו משתמשים בהן למעקב או לפרסום.' },
        { p: '**מידע על אנשים אחרים.** כשמישהו קובע פגישה דרך הקישור שלכם, השם, האימייל או הטלפון שהוא מזין. כשאתם מזמינים מישהו, האימייל או הטלפון שאתם מזינים.' },
        { p: '**רכישות.** המסלול, סטטוס המנוי ותאריכיו, ומזהי הזמנה או עסקה מ-Lemon Squeezy, מ-RevenueCat, מ-Apple או מ-Google Play. איננו מקבלים את פרטי כרטיס האשראי המלאים.' },
        { p: '**התראות.** אם אישרתם התראות, כתובת טכנית (push subscription) שמאפשרת לנו לשלוח התראות לדפדפן או למכשיר.' },
        { p: '**מידע טכני ושימוש.** רישום של השימוש ב-AI (כמו מספר הטוקנים והקרדיטים שנוצלו), ולוגים טכניים שנשמרים בשרתים שלנו ואצל ספק האחסון (כמו כתובת IP, סוג המכשיר והדפדפן ודיווחי שגיאות), לצורך תפעול, אבטחה ופתרון תקלות.' }
      ]
    },
    {
      id: 'use', icon: Calendar, color: 'text-green-500', title: 'איך אנחנו משתמשים במידע',
      blocks: [
        { ul: [
          'כדי לספק את השירות: ליצור ולנהל את הלו"ז, לסנכרן יומנים, להפעיל קישורי תיאום ולשלוח תזכורות והתראות.',
          'כדי לעבד את הבקשות שלכם בעזרת AI (ראו הסעיף הבא).',
          'כדי לנהל את החשבון, המנוי, הקרדיטים והתשלומים.',
          'כדי לשמור על אבטחת השירות, למנוע שימוש לרעה והונאות ולתקן תקלות.',
          'כדי לענות לשאלות ולפניות תמיכה.',
          'כדי לעמוד בדרישות החוק ולהגן על זכויותינו.'
        ] },
        { p: 'אנחנו **לא** מוכרים את המידע האישי שלכם, לא משתפים אותו לצורכי פרסום ולא משתמשים בו כדי להציג לכם פרסומות.' }
      ]
    },
    {
      id: 'ai', icon: Sparkles, color: 'text-purple-500', title: 'עיבוד בבינה מלאכותית',
      blocks: [
        { p: 'כשאתם משתמשים בפיצ\'ר AI, הטקסט או התמונה ששלחתם, יחד עם ההקשר הדרוש לתשובה (כמו התאריך, אזור הזמן וחלקים רלוונטיים מהלו"ז שלכם ב-CalendAI), נשלחים ל-**Anthropic**, ספקית מודל ה-AI ‏Claude, שמעבדת אותם כדי להפיק את התשובה. Anthropic לא משתמשת במידע שנשלח דרך ה-API שלה כדי לאמן את המודלים שלה. Anthropic עשויה לעבד את המידע במדינות אחרות, כולל ארצות הברית. ראו את [מדיניות הפרטיות של Anthropic](https://www.anthropic.com/legal/privacy).' },
        { p: 'איננו משתמשים במידע שלכם כדי לאמן מודלי AI. אנא הימנעו מהזנת מידע רגיש שאינו נחוץ לתזמון.' }
      ]
    },
    {
      id: 'google', icon: Shield, color: 'text-red-500', title: 'מידע ממשתמשי Google',
      blocks: [
        { p: 'בהתחברות עם Google אנחנו מבקשים גישה לפרופיל הבסיסי (שם, אימייל, תמונה) ול-Google Calendar (calendar.events כדי ליצור, לקרוא, לעדכן ולמחוק אירועים, ו-calendar.freebusy כדי לבדוק זמנים פנויים ותפוסים לתיאום הדדי). אנחנו משתמשים בגישה הזו רק כדי לספק את הפיצ\'רים שבהם אתם משתמשים, ורק לבקשתכם או לפי הגדרות שהפעלתם.' },
        { p: `השימוש של CalendAI במידע שמתקבל מממשקי Google והעברתו עומדים ב[מדיניות נתוני המשתמש של Google API Services](${GOOGLE_POLICY}), כולל דרישות ה-Limited Use. בפרט:` },
        { ul: [
          'איננו מוכרים מידע ממשתמשי Google ואיננו משתמשים בו לפרסום.',
          'איננו משתמשים במידע ממשתמשי Google כדי לפתח, לשפר או לאמן מודלים כלליים של AI או למידת מכונה, ואיננו שולחים מידע שנקרא מה-Google Calendar שלכם לספקי AI.',
          'איננו מעבירים מידע ממשתמשי Google לאחרים, אלא במידה הדרושה לאספקת השירות, לצורכי אבטחה, לפי החוק או בהסכמתכם.',
          'בני אדם אינם קוראים מידע ממשתמשי Google, אלא אם נתתם לנו רשות (למשל, בפניית תמיכה), הדבר נחוץ לאבטחה או החוק מחייב זאת.'
        ] },
        { p: 'אפשר לבטל את הגישה של CalendAI בכל עת ב[דף ההרשאות של חשבון Google](https://myaccount.google.com/permissions). גם מחיקת חשבון CalendAI מבטלת אותה.' }
      ]
    },
    {
      id: 'sharing', icon: Share2, color: 'text-indigo-500', title: 'עם מי אנחנו משתפים מידע',
      blocks: [
        { p: 'אנחנו משתפים מידע רק עם נותני שירות שעוזרים לנו להפעיל את CalendAI, ורק במידה הדרושה לתפקידם:' },
        { ul: [
          '**אחסון ומסד נתונים:** Render (שרתים) וספק מסד הנתונים בענן שלנו.',
          '**AI:** Anthropic ‏(Claude).',
          '**יומנים והתחברות:** Google ו-Microsoft, כשאתם מחברים אותם.',
          '**תשלומים:** Lemon Squeezy (רכישות באתר), RevenueCat, Apple App Store ו-Google Play (רכישות באפליקציה).',
          '**התראות:** שירותי ה-push של הדפדפן או המכשיר (כמו Google Firebase Cloud Messaging ו-Apple Push Notification service).',
          '**הדיבור שלכם:** שירות זיהוי הדיבור של הדפדפן או המכשיר (למשל של Google או Apple), כשאתם משתמשים בקלט קולי.'
        ] },
        { p: 'כשאתם קובעים פגישה דרך קישור תיאום של מישהו, או מקבלים הזמנה, הפרטים שאתם מזינים משותפים עם אותו אדם, והפגישה עשויה להתווסף לשני היומנים.' },
        { p: 'אנחנו עשויים לחשוף מידע גם אם החוק מחייב זאת, כדי להגן על הזכויות, הרכוש או הבטיחות של משתמשים או של הציבור, או במסגרת מיזוג או מכירה של השירות, ואז מדיניות זו תמשיך לחול על המידע שלכם.' }
      ]
    },
    {
      id: 'transfers', icon: Globe, color: 'text-teal-500', title: 'העברת מידע לחו"ל',
      blocks: [
        { p: 'נותני השירות שלנו שומרים ומעבדים מידע בשרתים מחוץ לישראל, כולל בארצות הברית, ולצורך עיבוד AI, ייתכן שגם במדינות אחרות. אנחנו פועלים כדי שמידע שמועבר לחו"ל ימשיך להיות מוגן כנדרש לפי הדין הישראלי, ולפי ה-GDPR כשהוא חל.' }
      ]
    },
    {
      id: 'retention', icon: Clock, color: 'text-amber-500', title: 'כמה זמן אנחנו שומרים מידע',
      blocks: [
        { ul: [
          'פרטי חשבון ותוכן: עד שתמחקו אותם או את החשבון.',
          'היסטוריית בקשות ל-AI: עד שתמחקו אותה או את החשבון.',
          'פרטי הזמנה שהזינו אורחים: עד שהמארח ימחק אותם או את החשבון שלו.',
          'רישומי רכישות: כל עוד החוק מחייב לצורכי מס והנהלת חשבונות (בישראל, בדרך כלל עד 7 שנים), גם אחרי מחיקת החשבון.',
          'לוגים טכניים וגיבויים: לתקופה מוגבלת, ולאחר מכן הם נמחקים או נדרסים.'
        ] },
        { p: 'אפשר למחוק את החשבון בכל עת מתפריט החשבון באפליקציה. פרטים בדף [מחיקת החשבון](/delete-account).' }
      ]
    },
    {
      id: 'security', icon: Lock, color: 'text-slate-600', title: 'אבטחת מידע',
      blocks: [
        { p: 'אנחנו נוקטים אמצעים טכנולוגיים וארגוניים סבירים כדי להגן על המידע שלכם, כולל חיבור מוצפן (HTTPS), שמירת סיסמאות בצורה מוצפנת חד-כיוונית, אסימוני גישה שנשמרים רק בשרתים שלנו ולעולם אינם נשלחים לדפדפן, והגבלת הגישה למידע למה שנחוץ להפעלת השירות.' },
        { p: 'אף שירות מקוון אינו מאובטח לחלוטין, ואיננו יכולים להבטיח אבטחה מוחלטת. אם אירוע אבטחה יפגע במידע האישי שלכם, נפעל לטפל בו ונודיע לכם ולרשויות כאשר החוק מחייב זאת.' }
      ]
    },
    {
      id: 'rights', icon: UserCheck, color: 'text-green-500', title: 'הזכויות והבחירות שלכם',
      blocks: [
        { p: 'לפי חוק הגנת הפרטיות, התשמ"א-1981, יש לכם זכות לעיין במידע האישי שלכם שנמצא אצלנו, ולבקש לתקן או למחוק מידע שאינו נכון, שלם, ברור או מעודכן. אם אתם באזור הכלכלי האירופי או בבריטניה, ה-GDPR מקנה לכם גם זכויות לגשת למידע, לתקן אותו, למחוק אותו, להגביל את עיבודו או להתנגד לו, לניידות מידע, ולחזור בכם מהסכמה בכל עת.' },
        { p: 'בנוסף, אתם יכולים:' },
        { ul: [
          'לצפות במידע ולערוך אותו באפליקציה, ולמחוק את החשבון מתפריט החשבון.',
          'לנתק את Google Calendar או Microsoft Outlook בהגדרות חשבון Google או Microsoft.',
          'לכבות גישה למיקום, להתראות ולמיקרופון בהגדרות המכשיר או הדפדפן.',
          `לפנות אלינו בכתובת ${CONTACT} כדי לממש כל אחת מהזכויות. נשיב בתוך הזמן הקבוע בחוק.`
        ] },
        { p: 'אם לדעתכם לא טיפלנו במידע שלכם כראוי, אתם רשאים להתלונן לרשות להגנת הפרטיות, ואם אתם באזור הכלכלי האירופי או בבריטניה, לרשות להגנת המידע במדינתכם. נשמח לקבל קודם הזדמנות לתקן, אז אנא פנו אלינו.' }
      ]
    },
    {
      id: 'children', icon: Baby, color: 'text-pink-500', title: 'ילדים',
      blocks: [
        { p: 'CalendAI אינה מיועדת לילדים מתחת לגיל 13 (או מתחת לגיל מינימלי גבוה יותר שקובע החוק במדינתכם), ואיננו אוספים ביודעין מידע אישי עליהם. אם אתם חושבים שילד מסר לנו מידע אישי, פנו אלינו ונמחק אותו.' }
      ]
    },
    {
      id: 'cookies', icon: Cookie, color: 'text-amber-600', title: 'עוגיות ואחסון מקומי',
      blocks: [
        { p: 'אנחנו משתמשים בעוגייה (cookie) הכרחית כדי שתישארו מחוברים, ובאחסון המקומי של הדפדפן או המכשיר כדי לזכור העדפות (כמו שפה) ולאפשר לאפליקציה לעבוד גם בלי חיבור. איננו משתמשים בעוגיות פרסום או בכלי מעקב של צד שלישי.' }
      ]
    },
    {
      id: 'changes', icon: RefreshCw, color: 'text-slate-500', title: 'שינויים במדיניות',
      blocks: [
        { p: 'אנחנו רשאים לעדכן מדיניות זו מעת לעת. הנוסח העדכני זמין תמיד בדף זה. אם נעשה שינוי מהותי, נודיע לכם מראש באפליקציה או באימייל.' }
      ]
    },
    {
      id: 'contact', icon: Mail, color: 'text-blue-500', title: 'יצירת קשר',
      blocks: [
        { p: `לכל שאלה על מדיניות פרטיות זו או על הטיפול במידע שלכם, אפשר לפנות אלינו בכתובת [${CONTACT}](${MAILTO}).` }
      ]
    }
  ]
};

export default { en, he };
