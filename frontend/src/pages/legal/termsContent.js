import {
  Shield, Activity, User, Sparkles, Bell, Calendar, Link2, CreditCard, RotateCcw,
  AlertCircle, FileText, Gavel, ExternalLink, Ban, Lock, PauseCircle, Power, RefreshCw, Scale, Mail
} from 'lucide-react';

// Terms of Service in English and Hebrew. Keep the two versions in sync:
// same sections, same order, same meaning. Section numbers come from order.

const CONTACT = 'calendai555@gmail.com';
const MAILTO = `mailto:${CONTACT}`;

const en = {
  back: 'Back to CalendAI',
  rights: 'All rights reserved.',
  title: 'Terms of Service',
  updated: 'Last updated: November 15, 2026',
  intro: [
    'Welcome to **CalendAI** ("the App", "the Service", "we", "our", or "us"), an AI scheduling assistant operated from Israel. These Terms of Service ("Terms") apply to the website www.calendai.org, the CalendAI apps for Android and iOS, and every feature they offer.',
    'By creating an account, signing in, or otherwise using the Service, you agree to these Terms and to our [Privacy Policy](/privacy). If you do not agree, please do not use the Service.'
  ],
  sections: [
    {
      id: 'acceptance', icon: Shield, color: 'text-green-500', title: 'Acceptance and Eligibility',
      blocks: [
        { p: 'You must be at least 13 years old to use CalendAI (or older, if the law of your country sets a higher minimum age for using online services without parental consent). If you are under 18, you may use the Service, and in particular buy a subscription, only with the consent of a parent or legal guardian.' },
        { p: 'If you use CalendAI on behalf of a business or organization, you confirm that you are authorized to accept these Terms on its behalf.' }
      ]
    },
    {
      id: 'service', icon: Activity, color: 'text-blue-500', title: 'The Service',
      blocks: [
        { p: 'CalendAI helps you manage your time. Depending on the version and plan you use, it lets you:' },
        { ul: [
          'Create events, tasks, and reminders by typing, speaking, or uploading an image, with the help of AI.',
          'View and edit your schedule, routines, goals, journal, and expected expenses.',
          'Sync events with Google Calendar or Microsoft Outlook, if you choose to connect them.',
          'Share booking links and coordinate meeting times with other people.',
          'Receive reminders, alarms, and notifications.'
        ] },
        { p: 'We are continually improving CalendAI, so features may be added, changed, or removed over time (see "Changes to and Discontinuation of the Service").' }
      ]
    },
    {
      id: 'accounts', icon: User, color: 'text-indigo-500', title: 'Your Account',
      blocks: [
        { p: 'You can sign in with Google, with Microsoft, or with an email address and password. You may also try parts of the App as a guest, with usage limits. When you create an account, you agree to:' },
        { ul: [
          'Provide accurate information and keep it up to date.',
          'Keep your login details, and any personal key you create (for example, for Siri Shortcuts), confidential and secure.',
          `Tell us promptly at ${CONTACT} if you suspect unauthorized use of your account.`,
          'Be responsible for activity under your account, unless it results from a failure on our part.'
        ] }
      ]
    },
    {
      id: 'ai', icon: Sparkles, color: 'text-purple-500', title: 'AI Features',
      blocks: [
        { p: 'Some features use artificial intelligence provided by third parties (currently through OpenRouter). AI can make mistakes: it may misunderstand a request, set the wrong date or time, or miss details. **Please check events and reminders created by AI before you rely on them.**' },
        { p: 'Text, voice transcripts, and images you submit to AI features are sent to our AI provider for processing, as described in our [Privacy Policy](/privacy). Please do not include sensitive information (such as health, financial, or ID details) that you do not need in order to schedule something.' },
        { p: 'AI suggestions are not professional advice (medical, legal, financial, or otherwise).' }
      ]
    },
    {
      id: 'reminders', icon: Bell, color: 'text-amber-500', title: 'Reminders, Alarms, and Notifications',
      blocks: [
        { p: 'Reminders, alarms, and notifications depend on your device, its operating system, battery and "do not disturb" settings, the permissions you grant, and your internet connection. We work to deliver them on time but **cannot guarantee that every reminder or alarm will be delivered or will sound**.' },
        { p: 'Do not rely on CalendAI as your only reminder for anything critical, such as taking medication, flights, court or official deadlines, or waking up for an important event.' }
      ]
    },
    {
      id: 'calendars', icon: Calendar, color: 'text-amber-500', title: 'Google Calendar and Microsoft Outlook',
      blocks: [
        { p: 'Connecting Google Calendar or Microsoft Outlook is optional. When you connect one:' },
        { ul: [
          'You allow CalendAI to create, update, and delete events in your calendar, and to read the information needed for the features you use (for example, free/busy times for mutual scheduling, or the day\'s events for an evening summary you turned on).',
          'We use calendar data only to provide the features you use, and never for advertising.',
          'You can disconnect at any time from your Google or Microsoft account settings, or by deleting your CalendAI account.'
        ] },
        { p: 'CalendAI\'s use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.' }
      ]
    },
    {
      id: 'booking', icon: Link2, color: 'text-teal-500', title: 'Booking Links and Other People',
      blocks: [
        { p: 'When you share a booking link or invite someone, the people who use your link may give you their name, email, or phone number, and the meeting may be added to their calendar and yours.' },
        { ul: [
          'You are responsible for your use of other people\'s details, and for having their permission to contact them.',
          'Do not use booking links or invitations to send spam or unwanted messages.',
          'If you offer paid services through a booking page, the arrangement (including payment, cancellation, and the quality of the service) is between you and your customer. CalendAI is not a party to it.'
        ] }
      ]
    },
    {
      id: 'payments', icon: CreditCard, color: 'text-emerald-500', title: 'Pro Subscription, Credits, and Payments',
      blocks: [
        { p: 'Basic use of CalendAI is free. Some features and higher AI usage require a paid **Pro** subscription or AI credits. The price, the billing period, and what is included are shown to you before you pay. Prices shown in Israeli shekels include VAT where it applies.' },
        { ul: [
          '**Automatic renewal:** a Pro subscription renews automatically at the end of each billing period, and you are charged for the next period, until you cancel.',
          '**On the website,** payments are processed by Lemon Squeezy, which acts as the seller of record and issues the receipt or invoice. Its terms also apply to the purchase.',
          '**In the Android or iOS app,** purchases are made through Google Play or the Apple App Store and are subject to their terms. On iOS, the [Apple Standard EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/) also applies.',
          '**AI credits** are a usage allowance inside the App. They have no cash value, cannot be transferred or exchanged for money, and expire when your account is deleted. The monthly Pro allowance does not roll over.',
          '**Price changes:** we may change prices. A new price will apply to an existing subscription only from the next renewal after we notify you in advance, and you may cancel before it takes effect.'
        ] },
        { p: 'We do not receive or store your full card details.' }
      ]
    },
    {
      id: 'cancellation', icon: RotateCcw, color: 'text-sky-500', title: 'Cancellation and Refunds',
      blocks: [
        { p: '**You may cancel your subscription at any time:**' },
        { ul: [
          `Website purchases: in the App, open the account menu and choose "Manage or cancel subscription", or email us at ${CONTACT}.`,
          'App purchases: through your Google Play or Apple App Store subscription settings.'
        ] },
        { p: 'After you cancel, no further renewals will be charged, and Pro stays active until the end of the period you already paid for, unless the law entitles you to an earlier end and refund.' },
        { p: '**Your rights under the law come first.** If you are a consumer in Israel, you have the rights granted by the Consumer Protection Law, 5741-1981, and its regulations, including the right to cancel a distance purchase within the period set by law and to cancel an ongoing subscription. Consumers elsewhere have the rights given by the law of their country. Nothing in these Terms limits those rights.' },
        { p: `To request a refund for a website purchase, email us at ${CONTACT}. Refunds for app purchases are handled by Google Play or Apple under their policies; where the law gives you a right that the store does not handle, contact us and we will help.` }
      ]
    },
    {
      id: 'acceptable-use', icon: AlertCircle, color: 'text-green-500', title: 'Acceptable Use',
      blocks: [
        { p: 'You agree to use CalendAI only lawfully and in line with these Terms. You agree not to:' },
        { ul: [
          'Use the Service for any illegal, harmful, or fraudulent purpose.',
          'Try to gain unauthorized access to the Service, to other users\' accounts, or to our systems.',
          'Interfere with or disrupt the Service, or overload it (including through automated scripts or scraping).',
          'Use the Service to send spam, harass others, or distribute malicious or illegal content.',
          'Reverse engineer, decompile, or disassemble the App, except where the law allows this.',
          'Get around usage limits, credit limits, or payment.'
        ] }
      ]
    },
    {
      id: 'content', icon: FileText, color: 'text-slate-500', title: 'Your Content',
      blocks: [
        { p: 'You keep all rights to the content you put into CalendAI, such as your events, notes, and journal. You give us a limited permission to store, process, and transmit that content only as needed to provide the Service to you (for example, sending a request to our AI provider or adding an event to your calendar). We do not use your content to advertise to you or sell it.' }
      ]
    },
    {
      id: 'ip', icon: Gavel, color: 'text-purple-500', title: 'Intellectual Property',
      blocks: [
        { p: 'The CalendAI name, logo, design, and software belong to us or to our licensors. You may not copy, modify, distribute, sell, or lease any part of the Service without our prior written consent.' }
      ]
    },
    {
      id: 'third-parties', icon: ExternalLink, color: 'text-indigo-500', title: 'Third-Party Services',
      blocks: [
        { p: 'CalendAI works with services run by other companies, including Google, Microsoft, OpenRouter and AI model providers, Lemon Squeezy, RevenueCat, Apple, and Google Play. Your use of those services is also subject to their own terms and privacy policies. We are not responsible for services we do not control, including their availability.' }
      ]
    },
    {
      id: 'liability', icon: Ban, color: 'text-red-500', title: 'Disclaimer and Limitation of Liability',
      blocks: [
        { p: 'CalendAI is provided "as is" and "as available". We work to keep it accurate and available, but we do not promise that it will be uninterrupted, error-free, or suitable for every purpose. To the fullest extent permitted by law:' },
        { ul: [
          'We are not liable for missed appointments, scheduling conflicts, or missed reminders that result from using the App.',
          'We are not liable for data loss or service interruptions, beyond our obligation to take reasonable care.',
          'We are not liable for indirect, incidental, special, or consequential damages, or for loss of profit or income.',
          'Our total liability for any claim relating to the Service is limited to the amount you paid us (if any) in the 12 months before the claim.'
        ] },
        { p: 'Nothing in these Terms excludes or limits liability that cannot be excluded or limited by law, including liability for intentional misconduct or gross negligence, or your rights as a consumer.' }
      ]
    },
    {
      id: 'security', icon: Lock, color: 'text-slate-600', title: 'Security and Unauthorized Access',
      blocks: [
        { p: 'We take reasonable technical and organizational measures to protect the Service and your data. However, no online service, network, or method of storage or transmission can be completely secure, and we cannot promise that the Service will be free from hacking, unauthorized access, viruses, or other security incidents.' },
        { p: 'To the fullest extent permitted by law, we are not liable for damage caused by unauthorized access to, or use of, the Service or your data by third parties (including hacking or cyber attacks), unless the damage results from our failure to take reasonable security measures.' },
        { p: 'If we become aware of a security incident that affects your personal data, we will take reasonable steps to address it, and will notify you and the relevant authorities where the law requires.' }
      ]
    },
    {
      id: 'termination', icon: PauseCircle, color: 'text-orange-500', title: 'Suspension and Termination',
      blocks: [
        { p: 'We may suspend or terminate your access to CalendAI, in whole or in part, at any time, including if we reasonably believe that you have violated these Terms, misused the Service, or acted in a way that harms the Service, us, or other users. Where reasonable, we will try to notify you in advance and explain why. In cases of misuse, security risk, or a legal requirement, we may act immediately and without prior notice.' },
        { p: 'If we terminate a paid subscription without a breach on your part, we will refund the unused part of any period you paid for on the website. App-store purchases are refunded through the store where possible.' },
        { p: 'You may stop using CalendAI at any time, and delete your account from the account menu or as described on the [Delete Account](/delete-account) page.' }
      ]
    },
    {
      id: 'discontinuation', icon: Power, color: 'text-amber-500', title: 'Changes to and Discontinuation of the Service',
      blocks: [
        { p: 'We may suspend, modify, or discontinue the Service or any part of it (including any feature, integration, or plan), temporarily or permanently, at any time. Where reasonable, we will give advance notice before discontinuing the Service or a paid feature.' },
        { p: 'If we discontinue the Service or a paid plan, paid subscriptions will not renew, and we will refund the unused part of any period you paid for on the website. Other than that, and to the fullest extent permitted by law, we are not liable for any suspension, modification, or discontinuation of the Service.' }
      ]
    },
    {
      id: 'changes', icon: RefreshCw, color: 'text-slate-500', title: 'Changes to These Terms',
      blocks: [
        { p: 'We may update these Terms from time to time. The current version is always available on this page. If we make a material change, we will notify you in advance through the App or by email. If you do not agree to the change, you may stop using the Service and cancel your subscription before the change takes effect. Continuing to use CalendAI after the change takes effect means you accept the updated Terms.' }
      ]
    },
    {
      id: 'law', icon: Scale, color: 'text-slate-600', title: 'Governing Law and Language',
      blocks: [
        { p: 'These Terms are governed by the laws of the State of Israel, and the competent courts in Israel have jurisdiction over any dispute relating to them. If you are a consumer living outside Israel, this does not take away the protection of mandatory laws of your country of residence, or your right to bring a claim there.' },
        { p: 'These Terms are available in Hebrew and English. If there is a conflict between the two versions, the Hebrew version prevails, unless the law requires otherwise.' }
      ]
    },
    {
      id: 'contact', icon: Mail, color: 'text-blue-500', title: 'Contact',
      blocks: [
        { p: `If you have any questions about these Terms, please contact us at [${CONTACT}](${MAILTO}).` }
      ]
    }
  ]
};

const he = {
  back: 'חזרה ל-CalendAI',
  rights: 'כל הזכויות שמורות.',
  title: 'תנאי שימוש',
  updated: 'עודכן לאחרונה: 15 בנובמבר 2026',
  intro: [
    'ברוכים הבאים ל-**CalendAI** ("האפליקציה", "השירות", "אנחנו"), עוזר תזמון מבוסס בינה מלאכותית המופעל מישראל. תנאי שימוש אלה ("התנאים") חלים על האתר www.calendai.org, על אפליקציות CalendAI ל-Android ול-iOS ועל כל השירותים הניתנים בהם.',
    'ביצירת חשבון, בהתחברות או בכל שימוש אחר בשירות, אתם מסכימים לתנאים אלה ול[מדיניות הפרטיות](/privacy). אם אינכם מסכימים, אנא אל תשתמשו בשירות. התנאים מנוסחים בלשון רבים מטעמי נוחות, ומתייחסים לכל המגדרים.'
  ],
  sections: [
    {
      id: 'acceptance', icon: Shield, color: 'text-green-500', title: 'הסכמה לתנאים וגיל מינימלי',
      blocks: [
        { p: 'השימוש ב-CalendAI מותר מגיל 13 ומעלה (או מגיל גבוה יותר, אם החוק במדינתכם קובע גיל מינימלי גבוה יותר לשימוש בשירותים מקוונים ללא הסכמת הורה). מתחת לגיל 18, מותר להשתמש בשירות, ובמיוחד לרכוש מנוי, רק בהסכמת הורה או אפוטרופוס.' },
        { p: 'אם אתם משתמשים ב-CalendAI מטעם עסק או ארגון, אתם מאשרים שאתם מוסמכים לקבל תנאים אלה בשמו.' }
      ]
    },
    {
      id: 'service', icon: Activity, color: 'text-blue-500', title: 'השירות',
      blocks: [
        { p: 'CalendAI עוזרת לכם לנהל את הזמן. בהתאם לגרסה ולמסלול שבהם אתם משתמשים, היא מאפשרת:' },
        { ul: [
          'ליצור אירועים, משימות ותזכורות בהקלדה, בדיבור או בהעלאת תמונה, בעזרת בינה מלאכותית.',
          'לצפות ולערוך את הלו"ז, השגרות, היעדים, היומן האישי וההוצאות הצפויות.',
          'לסנכרן אירועים עם Google Calendar או Microsoft Outlook, אם בחרתם לחבר אותם.',
          'לשתף קישורי תיאום ולתאם זמני פגישות עם אנשים אחרים.',
          'לקבל תזכורות, שעונים מעוררים והתראות.'
        ] },
        { p: 'אנחנו משפרים את CalendAI כל הזמן, ולכן פיצ\'רים עשויים להתווסף, להשתנות או להיות מוסרים (ראו "שינוי השירות והפסקתו").' }
      ]
    },
    {
      id: 'accounts', icon: User, color: 'text-indigo-500', title: 'החשבון שלכם',
      blocks: [
        { p: 'אפשר להתחבר עם Google, עם Microsoft או עם כתובת אימייל וסיסמה. אפשר גם לנסות חלק מהאפליקציה כאורחים, עם מגבלות שימוש. ביצירת חשבון אתם מתחייבים:' },
        { ul: [
          'למסור פרטים נכונים ולעדכן אותם.',
          'לשמור בסוד ובאופן מאובטח את פרטי ההתחברות שלכם וכל מפתח אישי שיצרתם (למשל, לקיצורי Siri).',
          `להודיע לנו מיד בכתובת ${CONTACT} אם אתם חושדים בשימוש לא מורשה בחשבון.`,
          'לשאת באחריות לפעולות שנעשות בחשבונכם, אלא אם הן נובעות מכשל מצדנו.'
        ] }
      ]
    },
    {
      id: 'ai', icon: Sparkles, color: 'text-purple-500', title: 'פיצ\'רים של בינה מלאכותית',
      blocks: [
        { p: 'חלק מהפיצ\'רים משתמשים בבינה מלאכותית של צדדים שלישיים (כיום דרך OpenRouter). בינה מלאכותית עלולה לטעות: להבין בקשה לא נכון, לקבוע תאריך או שעה שגויים או להשמיט פרטים. **אנא בדקו אירועים ותזכורות שנוצרו בעזרת AI לפני שאתם מסתמכים עליהם.**' },
        { p: 'טקסט, תמלול קולי ותמונות שאתם שולחים לפיצ\'רי ה-AI מועברים לספק ה-AI שלנו לעיבוד, כמתואר ב[מדיניות הפרטיות](/privacy). אנא אל תכללו מידע רגיש (כמו מידע רפואי, פיננסי או מספרי זהות) שאינו נחוץ כדי לתזמן משהו.' },
        { p: 'הצעות ה-AI אינן ייעוץ מקצועי (רפואי, משפטי, פיננסי או אחר).' }
      ]
    },
    {
      id: 'reminders', icon: Bell, color: 'text-amber-500', title: 'תזכורות, שעונים מעוררים והתראות',
      blocks: [
        { p: 'תזכורות, שעונים מעוררים והתראות תלויים במכשיר שלכם, במערכת ההפעלה, בהגדרות הסוללה ו"נא לא להפריע", בהרשאות שנתתם ובחיבור לאינטרנט. אנחנו פועלים כדי שיגיעו בזמן, אבל **איננו יכולים להבטיח שכל תזכורת או שעון מעורר יגיעו או יצלצלו**.' },
        { p: 'אל תסתמכו על CalendAI כתזכורת היחידה לדבר קריטי, כמו נטילת תרופות, טיסות, מועדים בבית משפט או ברשויות, או השכמה לאירוע חשוב.' }
      ]
    },
    {
      id: 'calendars', icon: Calendar, color: 'text-amber-500', title: 'Google Calendar ו-Microsoft Outlook',
      blocks: [
        { p: 'חיבור Google Calendar או Microsoft Outlook הוא אופציונלי. כשאתם מחברים יומן:' },
        { ul: [
          'אתם מאפשרים ל-CalendAI ליצור, לעדכן ולמחוק אירועים ביומן, ולקרוא את המידע הדרוש לפיצ\'רים שבהם אתם משתמשים (למשל, זמנים פנויים ותפוסים לתיאום הדדי, או אירועי היום לסיכום ערב שהפעלתם).',
          'אנחנו משתמשים במידע מהיומן רק כדי לספק את הפיצ\'רים שבהם אתם משתמשים, ולעולם לא לפרסום.',
          'אפשר לנתק את החיבור בכל עת בהגדרות חשבון Google או Microsoft, או במחיקת חשבון CalendAI.'
        ] },
        { p: 'השימוש של CalendAI במידע שמתקבל מממשקי Google עומד ב[מדיניות נתוני המשתמש של Google API Services](https://developers.google.com/terms/api-services-user-data-policy), כולל דרישות ה-Limited Use.' }
      ]
    },
    {
      id: 'booking', icon: Link2, color: 'text-teal-500', title: 'קישורי תיאום ואנשים אחרים',
      blocks: [
        { p: 'כשאתם משתפים קישור תיאום או מזמינים מישהו, מי שמשתמש בקישור עשוי למסור לכם את שמו, האימייל או מספר הטלפון שלו, והפגישה עשויה להתווסף ליומן שלו ושלכם.' },
        { ul: [
          'אתם אחראים לשימוש שלכם בפרטים של אנשים אחרים, ולכך שיש לכם רשות לפנות אליהם.',
          'אין להשתמש בקישורי תיאום או בהזמנות כדי לשלוח דואר זבל או הודעות לא רצויות.',
          'אם אתם מציעים שירות בתשלום דרך דף תיאום, ההתקשרות (כולל תשלום, ביטול ואיכות השירות) היא ביניכם לבין הלקוח שלכם. CalendAI אינה צד לה.'
        ] }
      ]
    },
    {
      id: 'payments', icon: CreditCard, color: 'text-emerald-500', title: 'מנוי Pro, קרדיטים ותשלומים',
      blocks: [
        { p: 'השימוש הבסיסי ב-CalendAI הוא בחינם. חלק מהפיצ\'רים ושימוש מוגבר ב-AI דורשים מנוי **Pro** בתשלום או קרדיטים ל-AI. המחיר, תקופת החיוב ומה שכלול בהם מוצגים לכם לפני התשלום. מחירים בשקלים כוללים מע"מ, כשהוא חל.' },
        { ul: [
          '**חידוש אוטומטי:** מנוי Pro מתחדש אוטומטית בסוף כל תקופת חיוב, ואתם מחויבים על התקופה הבאה, עד שתבטלו.',
          '**באתר,** התשלומים מעובדים על ידי Lemon Squeezy, שפועלת כמוכרת הרשומה (Merchant of Record) ומנפיקה את הקבלה או החשבונית. גם התנאים שלה חלים על הרכישה.',
          '**באפליקציה ל-Android או ל-iOS,** הרכישה נעשית דרך Google Play או Apple App Store ובכפוף לתנאים שלהן. ב-iOS חל גם [הסכם הרישיון הסטנדרטי של Apple (EULA)](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/).',
          '**קרדיטים ל-AI** הם מכסת שימוש בתוך האפליקציה. אין להם ערך כספי, אי אפשר להעביר אותם או להמיר אותם לכסף, והם פוקעים כשהחשבון נמחק. המכסה החודשית של Pro אינה נצברת לחודש הבא.',
          '**שינוי מחיר:** אנחנו רשאים לשנות מחירים. מחיר חדש יחול על מנוי קיים רק מהחידוש הבא אחרי שהודענו לכם מראש, ותוכלו לבטל לפני שהוא נכנס לתוקף.'
        ] },
        { p: 'איננו מקבלים ואיננו שומרים את פרטי כרטיס האשראי המלאים שלכם.' }
      ]
    },
    {
      id: 'cancellation', icon: RotateCcw, color: 'text-sky-500', title: 'ביטול והחזרים',
      blocks: [
        { p: '**אפשר לבטל את המנוי בכל עת:**' },
        { ul: [
          `רכישה באתר: באפליקציה, פתחו את תפריט החשבון ובחרו "ניהול או ביטול המנוי", או כתבו לנו לכתובת ${CONTACT}.`,
          'רכישה באפליקציה: דרך הגדרות המינויים ב-Google Play או ב-Apple App Store.'
        ] },
        { p: 'אחרי הביטול לא יהיו חיובים נוספים, ו-Pro יישאר פעיל עד סוף התקופה ששילמתם עליה, אלא אם החוק מזכה אתכם בסיום מוקדם יותר ובהחזר.' },
        { p: '**הזכויות שלכם לפי החוק קודמות.** אם אתם צרכנים בישראל, עומדות לכם הזכויות לפי חוק הגנת הצרכן, התשמ"א-1981, והתקנות לפיו, כולל הזכות לבטל עסקה מרחוק בתוך התקופה הקבועה בחוק ולבטל מנוי מתמשך. לצרכנים במדינות אחרות עומדות הזכויות לפי החוק במדינתם. דבר בתנאים אלה אינו מגביל זכויות אלה.' },
        { p: `לבקשת החזר על רכישה באתר, כתבו לנו לכתובת ${CONTACT}. החזרים על רכישות באפליקציה מטופלים על ידי Google Play או Apple לפי המדיניות שלהן; אם החוק מקנה לכם זכות שהחנות אינה מטפלת בה, פנו אלינו ונעזור.` }
      ]
    },
    {
      id: 'acceptable-use', icon: AlertCircle, color: 'text-green-500', title: 'שימוש מותר',
      blocks: [
        { p: 'אתם מתחייבים להשתמש ב-CalendAI רק כדין ובהתאם לתנאים אלה. אתם מתחייבים שלא:' },
        { ul: [
          'להשתמש בשירות לכל מטרה בלתי חוקית, מזיקה או במרמה.',
          'לנסות להשיג גישה לא מורשית לשירות, לחשבונות של משתמשים אחרים או למערכות שלנו.',
          'להפריע לפעולת השירות או להעמיס עליו (כולל באמצעות סקריפטים אוטומטיים או scraping).',
          'להשתמש בשירות כדי לשלוח דואר זבל, להטריד אחרים או להפיץ תוכן זדוני או בלתי חוקי.',
          'לבצע הנדסה הפוכה, פירוק או הידור לאחור של האפליקציה, אלא במידה שהחוק מתיר.',
          'לעקוף מגבלות שימוש, מגבלות קרדיטים או תשלום.'
        ] }
      ]
    },
    {
      id: 'content', icon: FileText, color: 'text-slate-500', title: 'התוכן שלכם',
      blocks: [
        { p: 'כל הזכויות בתוכן שאתם מכניסים ל-CalendAI, כמו אירועים, הערות ויומן אישי, נשארות שלכם. אתם מעניקים לנו רשות מוגבלת לשמור, לעבד ולהעביר את התוכן רק במידה הדרושה כדי לספק לכם את השירות (למשל, שליחת בקשה לספק ה-AI או הוספת אירוע ליומן). איננו משתמשים בתוכן שלכם כדי לפרסם לכם ואיננו מוכרים אותו.' }
      ]
    },
    {
      id: 'ip', icon: Gavel, color: 'text-purple-500', title: 'קניין רוחני',
      blocks: [
        { p: 'השם CalendAI, הלוגו, העיצוב והתוכנה שייכים לנו או למי שהעניק לנו רישיון. אין להעתיק, לשנות, להפיץ, למכור או להשכיר כל חלק מהשירות ללא הסכמתנו מראש ובכתב.' }
      ]
    },
    {
      id: 'third-parties', icon: ExternalLink, color: 'text-indigo-500', title: 'שירותי צד שלישי',
      blocks: [
        { p: 'CalendAI עובדת עם שירותים של חברות אחרות, כולל Google, Microsoft, OpenRouter וספקי מודלי AI, Lemon Squeezy, RevenueCat, Apple ו-Google Play. השימוש בשירותים אלה כפוף גם לתנאים ולמדיניות הפרטיות שלהם. איננו אחראים לשירותים שאינם בשליטתנו, כולל לזמינותם.' }
      ]
    },
    {
      id: 'liability', icon: Ban, color: 'text-red-500', title: 'הסתייגות והגבלת אחריות',
      blocks: [
        { p: 'CalendAI ניתנת "כמות שהיא" (AS IS) ו"כפי שהיא זמינה". אנחנו פועלים כדי שתהיה מדויקת וזמינה, אבל איננו מבטיחים שתפעל ללא הפרעות, ללא תקלות או שתתאים לכל מטרה. במידה המרבית המותרת לפי החוק:' },
        { ul: [
          'איננו אחראים לפגישות שהוחמצו, להתנגשויות בלו"ז או לתזכורות שלא התקבלו כתוצאה משימוש באפליקציה.',
          'איננו אחראים לאובדן מידע או להפסקות בשירות, מעבר לחובתנו לנקוט זהירות סבירה.',
          'איננו אחראים לנזקים עקיפים, מקריים, מיוחדים או תוצאתיים, או לאובדן רווח או הכנסה.',
          'האחריות הכוללת שלנו לכל תביעה הקשורה לשירות מוגבלת לסכום ששילמתם לנו (אם שילמתם) ב-12 החודשים שלפני התביעה.'
        ] },
        { p: 'דבר בתנאים אלה אינו שולל או מגביל אחריות שהחוק אינו מתיר לשלול או להגביל, כולל אחריות למעשה מכוון או לרשלנות רבתי, ואינו פוגע בזכויותיכם כצרכנים.' }
      ]
    },
    {
      id: 'security', icon: Lock, color: 'text-slate-600', title: 'אבטחת מידע וגישה לא מורשית',
      blocks: [
        { p: 'אנחנו נוקטים אמצעים טכנולוגיים וארגוניים סבירים כדי להגן על השירות ועל המידע שלכם. עם זאת, אף שירות מקוון, רשת או שיטת אחסון או העברת מידע אינם מאובטחים לחלוטין, ואיננו יכולים להבטיח שהשירות יהיה חסין מפריצות, מגישה לא מורשית, מווירוסים או מאירועי אבטחה אחרים.' },
        { p: 'במידה המרבית המותרת לפי החוק, איננו אחראים לנזק שנגרם מגישה לא מורשית לשירות או למידע שלכם, או משימוש בהם, על ידי צדדים שלישיים (כולל פריצה או מתקפת סייבר), אלא אם הנזק נובע מכך שלא נקטנו אמצעי אבטחה סבירים.' },
        { p: 'אם ייוודע לנו על אירוע אבטחה שפוגע במידע האישי שלכם, ננקוט צעדים סבירים לטפל בו, ונודיע לכם ולרשויות הרלוונטיות כאשר החוק מחייב זאת.' }
      ]
    },
    {
      id: 'termination', icon: PauseCircle, color: 'text-orange-500', title: 'השעיה וסיום',
      blocks: [
        { p: 'אנחנו רשאים להשעות או להפסיק את הגישה שלכם ל-CalendAI, כולה או חלקה, בכל עת, כולל אם יש לנו יסוד סביר להניח שהפרתם את התנאים, עשיתם שימוש לרעה בשירות או פעלתם באופן שפוגע בשירות, בנו או במשתמשים אחרים. כשהדבר סביר, ננסה להודיע לכם מראש ולהסביר את הסיבה. במקרים של שימוש לרעה, סיכון אבטחה או דרישה לפי החוק, אנחנו רשאים לפעול מיד וללא הודעה מוקדמת.' },
        { p: 'אם נפסיק מנוי בתשלום שלא בשל הפרה מצדכם, נחזיר לכם את החלק שלא נוצל מתקופה ששילמתם עליה באתר. רכישות דרך חנויות האפליקציות יוחזרו דרך החנות, כשהדבר אפשרי.' },
        { p: 'אתם רשאים להפסיק להשתמש ב-CalendAI בכל עת, ולמחוק את החשבון מתפריט החשבון או כמתואר בדף [מחיקת החשבון](/delete-account).' }
      ]
    },
    {
      id: 'discontinuation', icon: Power, color: 'text-amber-500', title: 'שינוי השירות והפסקתו',
      blocks: [
        { p: 'אנחנו רשאים להשעות, לשנות או להפסיק את השירות או כל חלק ממנו (כולל פיצ\'ר, חיבור או מסלול), באופן זמני או קבוע, בכל עת. כשהדבר סביר, ניתן הודעה מראש לפני הפסקת השירות או פיצ\'ר בתשלום.' },
        { p: 'אם נפסיק את השירות או מסלול בתשלום, המנויים לא יתחדשו, ונחזיר את החלק שלא נוצל מתקופה ששולמה באתר. מעבר לכך, ובמידה המרבית המותרת לפי החוק, איננו אחראים להשעיה, לשינוי או להפסקה של השירות.' }
      ]
    },
    {
      id: 'changes', icon: RefreshCw, color: 'text-slate-500', title: 'שינויים בתנאים',
      blocks: [
        { p: 'אנחנו רשאים לעדכן תנאים אלה מעת לעת. הנוסח העדכני זמין תמיד בדף זה. אם נעשה שינוי מהותי, נודיע לכם מראש באפליקציה או באימייל. אם אינכם מסכימים לשינוי, תוכלו להפסיק להשתמש בשירות ולבטל את המנוי לפני שהשינוי נכנס לתוקף. המשך השימוש ב-CalendAI אחרי כניסת השינוי לתוקף מהווה הסכמה לתנאים המעודכנים.' }
      ]
    },
    {
      id: 'law', icon: Scale, color: 'text-slate-600', title: 'הדין החל ושפה',
      blocks: [
        { p: 'על תנאים אלה חלים דיני מדינת ישראל, ולבתי המשפט המוסמכים בישראל הסמכות לדון בכל מחלוקת הנוגעת להם. אם אתם צרכנים המתגוררים מחוץ לישראל, אין בכך כדי לשלול מכם את ההגנה של דינים מחייבים במדינת מגוריכם או את זכותכם להגיש תביעה שם.' },
        { p: 'תנאים אלה זמינים בעברית ובאנגלית. במקרה של סתירה בין הנוסחים, הנוסח העברי גובר, אלא אם החוק מחייב אחרת.' }
      ]
    },
    {
      id: 'contact', icon: Mail, color: 'text-blue-500', title: 'יצירת קשר',
      blocks: [
        { p: `לכל שאלה על תנאים אלה, אפשר לפנות אלינו בכתובת [${CONTACT}](${MAILTO}).` }
      ]
    }
  ]
};

export default { en, he };
