/**
 * Fallback parsing functions for when the Gemini AI model is unavailable.
 * These are deterministic parser functions that handle Hebrew/English text.
 */

const hebrewNumbers = {
  'שש': 6, 'ששה': 6, 'ושישה': 6,
  'שבע': 7, 'שבעה': 7, 'ושבעה': 7,
  'שמונה': 8, 'ושמונה': 8,
  'תשע': 9, 'תשעה': 9, 'ותשעה': 9,
  'עשר': 10, 'עשרה': 10, 'ועשרה': 10,
  'אחת': 1, 'אחד': 1, 'ואחת': 1, 'ואחד': 1,
  'שתים': 2, 'שתיים': 2, 'שנים': 2, 'ושנים': 2,
  'שלוש': 3, 'שלושה': 3, 'ושלוש': 3, 'ושלושה': 3,
  'ארבע': 4, 'ארבעה': 4, 'וארבע': 4, 'וארבעה': 4,
  'חמש': 5, 'חמישה': 5, 'וחמש': 5, 'וחמישה': 5
};

const hebrewDurationNumbers = {
  'עשר': 10, 'עשרה': 10, 'ועשר': 10, 'ועשרה': 10,
  'עשרים': 20, 'ועשרים': 20,
  'שלושים': 30, 'ושלושים': 30,
  'ארבעים': 40, 'וארבעים': 40,
  'חמישים': 50, 'וחמישים': 50,
  'ששים': 60, 'וששים': 60,
  'שבעים': 70, 'ושבעים': 70,
  'שמונים': 80, 'ושמונים': 80,
  'תשעים': 90, 'ותשעים': 90,
  'מאה': 100, 'ומאה': 100
};

function formatTime(hour, minute = '00', meridiem) {
  const h = Number(hour);
  const m = Number(minute || 0);

  if (meridiem) {
    let hh = h % 12;
    if (hh === 0) hh = 12;
    const suffix = meridiem.toUpperCase();
    return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  let displayHour;
  let suffix;

  if (h >= 12) {
    displayHour = h === 12 ? 12 : h - 12;
    suffix = 'PM';
  } else {
    displayHour = h === 0 ? 12 : h;
    suffix = 'AM';
  }

  return `${String(displayHour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

function parseHebrewSingleTime(text) {
  const quarterToMatch = text.match(/רבע\s+ל(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה)/);
  if (quarterToMatch) {
    const hourWord = quarterToMatch[1];
    const hour = hebrewNumbers[hourWord];
    if (hour) {
      let quarterHour = hour - 1;
      if (quarterHour === 0) quarterHour = 12;
      return {
        hour: quarterHour,
        minute: 45
      };
    }
  }

  const singlePatterns = [
    /ב(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה)/,
    /\b(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|תשעה|עשרה)\b/
  ];

  const hasHalf = text.includes('וחצי');
  const hasQuarter = text.includes('ורבע');

  for (const pattern of singlePatterns) {
    const match = text.match(pattern);
    if (match) {
      const hourWord = match[1] || match[0];
      const hour = hebrewNumbers[hourWord];
      if (hour) {
        let minute = 0;
        if (hasQuarter) minute = 15;
        else if (hasHalf) minute = 30;
        return {
          hour,
          minute
        };
      }
    }
  }
  return null;
}

function parseHebrewTime(text) {
  const rangePatterns = [
    /משעה\s+(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה|ושישה|ושבעה|ושמונה|ותשע|ועשרה|ואחת|ואחד|ושתיים|ושלוש|ושלושה|וארבע|וארבעה|וחמש|וחמישה)\s*(?:וחצי)?\s*(?:ועד|ו?עד|עד)\s*(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה|ושישה|ושבעה|ושמונה|ותשע|ועשרה|ואחת|ואחד|ושתיים|ושלוש|ושלושה|וארבע|וארבעה|וחמש|וחמישה)\s*(?:וחצי)?/g,
    /משעה\s+(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה|ושישה|ושבעה|ושמונה|ותשע|ועשרה|ואחת|ואחד|ושתיים|ושלוש|ושלושה|וארבע|וארבעה|וחמש|וחמישה)\s+(?:ועד|עד)\s+(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה|ושישה|ושבעה|ושמונה|ותשע|ועשרה|ואחת|ואחד|ושתיים|ושלוש|ושלושה|וארבע|וארבעה|וחמש|וחמישה)/g
  ];

  for (const pattern of rangePatterns) {
    const match = pattern.exec(text);
    if (match) {
      const startWord = match[1];
      const endWord = match[2];
      const startHasHalf = text.includes('וחצי') && text.indexOf('וחצי') < text.indexOf(endWord);
      const endHasHalf = text.lastIndexOf('וחצי') > text.indexOf(endWord) || text.match(new RegExp(endWord + '\\s+וחצי'));

      return {
        startHour: hebrewNumbers[startWord] || 6,
        startMinute: startHasHalf ? 30 : 0,
        endHour: hebrewNumbers[endWord] || 8,
        endMinute: endHasHalf ? 30 : 0,
        isRange: true
      };
    }
  }

  const single = parseHebrewSingleTime(text);
  if (single) {
    return {
      startHour: single.hour,
      startMinute: single.minute,
      endHour: single.hour + 1,
      endMinute: single.minute,
      isRange: false
    };
  }

  return null;
}

function cleanTitle(title) {
  if (!title || typeof title !== 'string') return 'פגישה / אירוע';
  
  let t = title.trim();
  
  t = t.replace(/^(ל|ב|כ|מ|ש|ה|ו|לה|לכ|למ|לש)(?:ה|ו)?\s+/, '').trim();
  t = t.replace(/^את\s+/, '').trim();
  
  t = t.replace(/\sב(יום\s+)?(שני|שלישי|רביעי|חמישי|שישי|שבת|ראשון|א|ב|ג|ד|ה|ו|ש)\s*/g, ' ').trim();
  t = t.replace(/\sביום\s+\S+/g, ' ').trim();
  
  t = t.replace(/\s(בעוד|עוד|in|after|לפני|בערך|כ|כמו)\s+\S+(\s+\S+)?/g, ' ').trim();
  
  t = t.replace(/\s+(עשרים|שלושים|ארבעים|חמישים|ששים|עשר|עשרה)\s*(דקות|דקה|שעות|שעה)\s*/g, ' ').trim();
  t = t.replace(/\s+\d+\s*(דקות|דקה|שעות|שעה|minutes?|min|hours?|hrs?)\s*/gi, ' ').trim();
  t = t.replace(/\s*(חצי\s*שעה|רבע\s*שעה|half\s*hour|quarter\s*hour)\s*/gi, ' ').trim();
  
  t = t.replace(/\bל(?:\s|$)/g, ' ').trim();
  
  t = t.replace(/\s+/g, ' ').trim();
  
  t = t.replace(/^[,!?;:.\s]+|[,!?;:.\s]+$/g, '').trim();
  
  if (!t || t.length < 2) {
    return 'פגישה / אירוע';
  }
  
  return t;
}

function fallbackParse(text) {
  const hebrewDays = {
    'א': 'Sunday', 'ראשון': 'Sunday', 'א׳': 'Sunday',
    'ב': 'Monday', 'שני': 'Monday', 'ב׳': 'Monday',
    'ג': 'Tuesday', 'שלישי': 'Tuesday', 'ג׳': 'Tuesday',
    'ד': 'Wednesday', 'רביעי': 'Wednesday', 'ד׳': 'Wednesday',
    'ה': 'Thursday', 'חמישי': 'Thursday', 'ה׳': 'Thursday',
    'ו': 'Friday', 'שישי': 'Friday', 'ו׳': 'Friday',
    'ש': 'Saturday', 'שבת': 'Saturday', 'ש׳': 'Saturday'
  };

  const clean = text.replace(/[.,!?;:()"']/g, ' ');
  const words = clean.split(/\s+/).filter(w => w.length > 0);

  let foundDays = [];

  words.forEach(word => {
    if (hebrewDays[word]) {
      foundDays.push(hebrewDays[word]);
    } else {
      const noPrefix = word.replace(/^[בוכפלמש]/, '');
      if (noPrefix !== word && hebrewDays[noPrefix]) {
        foundDays.push(hebrewDays[noPrefix]);
      }
    }
  });

  let days = [...new Set(foundDays)];

  if (text.includes('מחר')) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    days = [dayNames[tomorrow.getDay()]];
  }

  if (text.includes('היום')) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    days = [dayNames[new Date().getDay()]];
  }

  if (days.length === 0) {
    const standaloneDayMatch = text.match(/\b(שני|ב|ב׳)\b/);
    if (standaloneDayMatch) {
      days = ['Monday'];
    }
  }

  if (days.length === 0) {
    days = ['Today'];
  }

  let startHour = 9, startMinute = 0, endHour = 10, endMinute = 0;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  function getHebrewWordDuration(txt) {
    const wordMatch = txt.match(/(עשרים|שלושים|ארבעים|חמישים|ששים|עשר|עשרה|עשרים|ועשרים|שלושים|ושלושים|ארבעים|וארבעים|חמישים|וחמישים)\s*(דקות|דקה)/i);
    if (wordMatch) {
      const word = wordMatch[1].toLowerCase();
      if (hebrewDurationNumbers[word]) {
        return hebrewDurationNumbers[word];
      }
    }
    return null;
  }

  const relativeTimeMatch = text.match(/(?:בעוד|עוד|in|after)\s*(?:(\d+)\s*דקות?|(\d+)\s*minutes?|שעה|an?\s*hour)/i);
  const relativeWordMatch = !relativeTimeMatch && text.match(/(?:בעוד|עוד|in|after)\s+(עשרים|שלושים|ארבעים|חמישים|ששים|עשר|עשרה|עשרים|ועשרים|שלושים|ושלושים|ארבעים|וארבעים|חמישים|וחמישים)\s*(דקות|דקה)/i);
  const durationOnlyMatch = !relativeTimeMatch && !relativeWordMatch && text.match(/^(חצי\s*שעה|half\s* hour|רבע\s*שעה|quarter\s* hour|(\d+)\s*דקות|(\d+)\s*minutes?)/i);
  const durationWordOnlyMatch = !relativeTimeMatch && !relativeWordMatch && !durationOnlyMatch && getHebrewWordDuration(text) !== null;
  const halfHourMatch = !relativeTimeMatch && !relativeWordMatch && !durationOnlyMatch && !durationWordOnlyMatch && text.match(/חצי\s*שעה|half\s*(\w*)?hour/i);
  const quarterHourMatch = !relativeTimeMatch && !relativeWordMatch && !durationOnlyMatch && !durationWordOnlyMatch && text.match(/רבע\s*שעה|quarter\s*(\w*)?hour/i);
  const explicitMinutesMatch = !relativeTimeMatch && !relativeWordMatch && !durationOnlyMatch && !durationWordOnlyMatch && text.match(/^(\d+)\s*(דקות|דקה|minutes?|min)/i);

  if (relativeTimeMatch) {
    let delayMinutes = 0;
    if (relativeTimeMatch[1]) {
      delayMinutes = parseInt(relativeTimeMatch[1], 10);
    } else if (relativeTimeMatch[2]) {
      delayMinutes = parseInt(relativeTimeMatch[2], 10);
    } else {
      delayMinutes = 60;
    }

    const startTotalMinutes = currentMinutes + delayMinutes;
    const endTotalMinutes = startTotalMinutes + 60;

    startHour = Math.floor((startTotalMinutes % 1440) / 60);
    startMinute = startTotalMinutes % 60;
    endHour = Math.floor((endTotalMinutes % 1440) / 60);
    endMinute = endTotalMinutes % 60;
  } else if (relativeWordMatch) {
    const word = relativeWordMatch[1].toLowerCase();
    let delayMinutes = hebrewDurationNumbers[word] || 20;
    const startTotalMinutes = currentMinutes + delayMinutes;
    const endTotalMinutes = startTotalMinutes + 60;
    startHour = Math.floor((startTotalMinutes % 1440) / 60);
    startMinute = startTotalMinutes % 60;
    endHour = Math.floor((endTotalMinutes % 1440) / 60);
    endMinute = endTotalMinutes % 60;
  } else if (durationOnlyMatch || halfHourMatch || quarterHourMatch || explicitMinutesMatch || durationWordOnlyMatch) {
    let durationMinutes = 60;
    if (durationWordOnlyMatch) {
      durationMinutes = getHebrewWordDuration(text);
    } else if (halfHourMatch || (durationOnlyMatch && durationOnlyMatch[0] && durationOnlyMatch[0].includes('חצי'))) {
      durationMinutes = 30;
    } else if (quarterHourMatch || (durationOnlyMatch && durationOnlyMatch[0] && durationOnlyMatch[0].includes('רבע'))) {
      durationMinutes = 15;
    } else if (durationOnlyMatch && durationOnlyMatch[2]) {
      durationMinutes = parseInt(durationOnlyMatch[2], 10);
    } else if (explicitMinutesMatch && explicitMinutesMatch[1]) {
      durationMinutes = parseInt(explicitMinutesMatch[1], 10);
    } else if (durationOnlyMatch && durationOnlyMatch[1]) {
      durationMinutes = parseInt(durationOnlyMatch[1], 10);
    }

    const startTotalMinutes = currentMinutes;
    const endTotalMinutes = startTotalMinutes + durationMinutes;

    startHour = Math.floor((startTotalMinutes % 1440) / 60);
    startMinute = startTotalMinutes % 60;
    endHour = Math.floor((endTotalMinutes % 1440) / 60);
    endMinute = endTotalMinutes % 60;
  } else {
    const hebrewTime = parseHebrewTime(text);
    if (hebrewTime) {
      startHour = hebrewTime.startHour;
      startMinute = hebrewTime.startMinute;
      endHour = hebrewTime.endHour;
      endMinute = hebrewTime.endMinute;
    } else {
      const timeMatches = [...text.matchAll(/(\d{1,2})(?::(\d{2}))?/g)];
      if (timeMatches.length >= 2) {
        startHour = Number(timeMatches[0][1]);
        startMinute = Number(timeMatches[0][2] || 0);
        endHour = Number(timeMatches[1][1]);
        endMinute = Number(timeMatches[1][2] || 0);
      } else if (timeMatches.length === 1) {
        startHour = Number(timeMatches[0][1]);
        startMinute = Number(timeMatches[0][2] || 0);
        endHour = startHour + 1;
        endMinute = startMinute;
      }
    }
  }

  // ── EVENING / NIGHT DETECTION (CRITICAL): If the text contains evening/night keywords
  // and the extracted hour is less than 12, add 12 to convert to PM.
  if (text.includes('בערב') || text.includes('בלילה') || text.includes('באחה"צ') || text.includes('אחר הצהריים') || text.includes('אחהצ')) {
    if (startHour > 0 && startHour < 12) startHour += 12;
    if (endHour > 0 && endHour < 12) endHour += 12;
  } else if (text.includes('בבוקר') || text.includes('בבקר')) {
    // Morning → keep as AM
  } else {
    // Low hours (1-7) without explicit marker → default to PM (afternoon/evening)
    if (startHour >= 1 && startHour <= 7) {
      startHour += 12;
      endHour += 12;
    }
  }

  const startTime = formatTime(startHour, startMinute);
  const endTime = formatTime(endHour, endMinute);

  let title = text
    .replace(/^(מחר\s*)?/, '')
    .replace(/משעה\s+[א-ת]+\s*(?:וחצי|ורבע)?\s*(?:ועד|עד)\s*[א-ת]+\s*(?:וחצי|ורבע)?\s*/, '')
    .replace(/ב(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת)\s*(?:וחצי|ורבע)?\s*(?:בבוקר|בערב|בלילה)?\s*/, '')
    .replace(/^\d{1,2}:\d{2}\s*/, '')
    .replace(/\b(עשרים|שלושים|ארבעים|חמישים|ששים|שבעים|שמונים|תשעים|מאה|עשר|עשרה|ועשרים|ושלושים|וארבעים|וחמישים|וששים|ושבעים|ושמונים|ותשעים|ומאה|ועשר|ועשרה)\s*(דקות|דקה)\s*/gi, '')
    .replace(/\b(\d+)\s*(דקות|דקה|minutes?|min)\s*/gi, '')
    .replace(/\b(חצי\s*שעה|רבע\s*שעה|half\s*hour|quarter\s*hour)\s*/gi, '')
    .replace(/\b(שעה|שעתיים)\s*/gi, '')
    .replace(/\b(בעוד|עוד|in|after)\s+(עשרים|שלושים|ארבעים|חמישים|ששים|עשר|עשרה|ועשרים|ושלושים|וארבעים|וחמישים)\s*(דקות|דקה)\s*/gi, '')
    .replace(/\b(בעוד|עוד|in|after)\s+(\d+)\s*(דקות|דקה|minutes?|min)\s*/gi, '')
    .replace(/\b(בעוד|עוד|in|after)\s+(שעה|an?\s*hour)\s*/gi, '')
    .replace(/[,!?;:]/g, '')
    .trim();

  // NOTE: Do NOT truncate the title. The full title as entered by the user
  // (or as extracted by the AI) should be preserved.
  // Previously, this code used slice(-4) which incorrectly kept only the LAST
  // 4 words, stripping the beginning of the title (e.g., "Quality time with family at 6 pm"
  // became "family at 6 pm"). This was the critical bug.
  // Titles are now kept as-is up to a reasonable length.
  if (title.length > 80) {
    const titleWords = title.split(/\s+/);
    if (titleWords.length > 12) {
      title = titleWords.slice(0, 12).join(' ');
    }
  }

  title = cleanTitle(title);

  if (!title || title.length < 2) {
    title = 'פגישה / אירוע';
  }

  return days.map(day => ({
    title,
    day,
    startTime,
    endTime,
    isRecurring: days.length > 1 || days[0] !== 'Today' ? true : false
  }));
}

function fallbackParseAdvice(text) {
  const isEnglish = /^[a-zA-Z0-9\s.,!?;:'"()-]+$/.test(text.trim()) && /[a-zA-Z]/.test(text.trim());

  const adviceKeywordsHe = ['תן לי','תמצא','תציע','המלץ','עזור','עזרי','רעיון','איך','מה להכין','מה לעשות','תעזור לי'];
  const adviceKeywordsEn = ['suggest', 'recommend', 'help', 'idea', 'how', 'what', 'find me', 'advice'];
  const hasAdvice = adviceKeywordsHe.some(kw => text.includes(kw)) || adviceKeywordsEn.some(kw => text.toLowerCase().includes(kw));

  let events;
  try {
    events = fallbackParse(text);
  } catch (e) {
    events = [{
        title: isEnglish ? 'Meeting / Event' : 'פגישה / אירוע',
        day: 'Today',
        startTime: '06:00 PM',
        endTime: '07:00 PM',
        isRecurring: false
    }];
  }

  const eventsWithAdvice = events.map(ev => ({
      ...ev,
      hasAdvice: hasAdvice,
      aiAdvice: hasAdvice 
        ? (isEnglish ? 'It is recommended to break the task into small steps and start early.' : 'מומלץ לפצל את המשימה לשלבים קטנים ולהתחיל מוקדם.')
        : ''
  }));

  return {
    replyMessage: isEnglish 
      ? `Successfully added ${events.length} event(s) from your text.`
      : `הצלחתי להוסיף ${events.length} אירועים מהטקסט שלך.`,
    events: eventsWithAdvice
  };
}

module.exports = { fallbackParseAdvice, fallbackParse, cleanTitle };