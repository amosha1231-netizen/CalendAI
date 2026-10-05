// ──────────────────────────────────────────────
// Provider Routes — Public Provider Directory & Bookings
// Lets any signed-in user opt in to a public, bookable provider profile
// (barbers, consultants, trainers, ...) with multiple services and a
// weekly recurring availability template. Slots are computed on demand;
// nothing is pre-materialized. Reuses the Google Calendar sync / schedule
// conflict-check / auth helpers already used by the legacy dynamic-link
// booking flow in server.js (exposed via app.set so they aren't duplicated).
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const ProviderBooking = require('../models/ProviderBooking');
const { createOAuth2ClientWithRefresh } = require('../services/googleCalendar');
const { google } = require('googleapis');

const VALID_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_SERVICES = 20;
const MAX_AVAILABILITY_ROWS = 50;

/**
 * Extract the authenticated user's id. Delegates to the same
 * getAuthenticatedUserId server.js uses for /api/booking/:id/confirm
 * (exposed via app.set) instead of duplicating the JWT/session logic.
 * Returns null if not authenticated.
 */
function getUserId(req) {
  const authFn = req.app.get('getAuthenticatedUserId');
  return authFn ? authFn(req) : null;
}

/** Weekday name for an ISO 'YYYY-MM-DD' date string, computed in UTC. */
function dayNameFromDateStr(dateStr) {
  return VALID_DAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

function isValidIsoDate(dateStr) {
  return typeof dateStr === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    && !Number.isNaN(Date.parse(`${dateStr}T00:00:00Z`))
    && new Date(`${dateStr}T00:00:00Z`).toISOString().slice(0, 10) === dateStr;
}

function minutesToTime12(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Compute open, service-sized slots for a provider on a given date.
 * Subtracts existing non-cancelled ProviderBookings and conflicts with the
 * provider's own personal schedule. Pure computation — no writes.
 */
async function computeAvailableSlots(req, provider, service, dateStr) {
  const timeToMinutes = req.app.get('timeToMinutes');
  const dayName = dayNameFromDateStr(dateStr);

  if (dayName === 'Saturday') return { dayName, slots: [] }; // Shabbat — no bookable availability

  const rows = (provider.providerProfile?.availability || []).filter(r => r.day === dayName);
  if (!rows.length) return { dayName, slots: [] };

  const candidates = [];
  for (const row of rows) {
    const rowStart = timeToMinutes(row.startTime);
    const rowEnd = timeToMinutes(row.endTime);
    if (rowStart === null || rowEnd === null || rowEnd <= rowStart) continue;
    for (let start = rowStart; start + service.duration <= rowEnd; start += service.duration) {
      candidates.push({ startMin: start, endMin: start + service.duration });
    }
  }
  if (!candidates.length) return { dayName, slots: [] };

  const existingBookings = await ProviderBooking.find({
    providerId: provider._id,
    date: dateStr,
    status: { $ne: 'cancelled' }
  }).select('startTime endTime').lean();

  const bookedRanges = existingBookings
    .map(b => ({ start: timeToMinutes(b.startTime), end: timeToMinutes(b.endTime) }))
    .filter(r => r.start !== null && r.end !== null);

  const scheduleEvents = (provider.schedule?.[dayName] || []).filter(ev => {
    if (ev.targetDate && String(ev.targetDate).slice(0, 10) !== dateStr) return false;
    return true;
  });
  const scheduleRanges = scheduleEvents
    .map(ev => ({ start: timeToMinutes(ev.startTime), end: timeToMinutes(ev.endTime) }))
    .filter(r => r.start !== null && r.end !== null);

  const occupied = [...bookedRanges, ...scheduleRanges];
  const freeSlots = candidates.filter(c =>
    !occupied.some(o => c.startMin < o.end && c.endMin > o.start)
  );

  return {
    dayName,
    slots: freeSlots.map(s => ({
      startTime: minutesToTime12(s.startMin),
      endTime: minutesToTime12(s.endMin)
    }))
  };
}

// ──────────────────────────────────────────────
// GET /api/providers/me — current user's own provider profile
// ──────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'עליך להתחבר.' });

    const user = await User.findById(userId).select('providerProfile displayName photo email').lean();
    if (!user) return res.status(404).json({ error: 'משתמש לא נמצא.' });

    res.json({ ok: true, providerProfile: user.providerProfile || null });
  } catch (err) {
    console.error('Get my provider profile error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת פרופיל הנותן שירות.' });
  }
});

// ──────────────────────────────────────────────
// PUT /api/providers/me — create/update own provider profile
// Body: { enabled, businessName, bio, category, locationId, services[], availability[] }
// ──────────────────────────────────────────────
router.put('/me', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'עליך להתחבר.' });

    const { enabled, businessName, bio, category, locationId, services, availability } = req.body;

    if (services !== undefined) {
      if (!Array.isArray(services) || services.length > MAX_SERVICES) {
        return res.status(400).json({ error: `ניתן להגדיר עד ${MAX_SERVICES} שירותים.` });
      }
      for (const s of services) {
        if (!s || typeof s.name !== 'string' || !s.name.trim()) {
          return res.status(400).json({ error: 'לכל שירות נדרש שם.' });
        }
        if (!Number.isFinite(Number(s.duration)) || Number(s.duration) < 5 || Number(s.duration) > 480) {
          return res.status(400).json({ error: 'משך השירות חייב להיות בין 5 ל-480 דקות.' });
        }
        if (s.price !== undefined && (!Number.isFinite(Number(s.price)) || Number(s.price) < 0)) {
          return res.status(400).json({ error: 'מחיר השירות לא תקין.' });
        }
      }
    }

    if (availability !== undefined) {
      if (!Array.isArray(availability) || availability.length > MAX_AVAILABILITY_ROWS) {
        return res.status(400).json({ error: `ניתן להגדיר עד ${MAX_AVAILABILITY_ROWS} שורות זמינות.` });
      }
      const timeToMinutes = req.app.get('timeToMinutes');
      for (const row of availability) {
        if (!row || !VALID_DAYS.includes(row.day) || row.day === 'Saturday') {
          return res.status(400).json({ error: 'יום זמינות לא תקין (שבת אינה נתמכת).' });
        }
        const startMin = timeToMinutes(row.startTime);
        const endMin = timeToMinutes(row.endTime);
        if (startMin === null || endMin === null || endMin <= startMin) {
          return res.status(400).json({ error: 'טווח שעות זמינות לא תקין.' });
        }
      }
    }

    const update = {};
    if (enabled !== undefined) update['providerProfile.enabled'] = !!enabled;
    if (businessName !== undefined) update['providerProfile.businessName'] = String(businessName).trim().slice(0, 200);
    if (bio !== undefined) update['providerProfile.bio'] = String(bio).trim().slice(0, 2000);
    if (category !== undefined) update['providerProfile.category'] = String(category).trim().slice(0, 50) || 'general';
    if (locationId !== undefined) update['providerProfile.locationId'] = String(locationId).trim() || 'jerusalem';
    if (services !== undefined) {
      update['providerProfile.services'] = services.map(s => ({
        name: s.name.trim().slice(0, 100),
        duration: Math.round(Number(s.duration)),
        price: s.price !== undefined ? Number(s.price) : 0,
        color: typeof s.color === 'string' ? s.color : '#6366f1',
        active: s.active !== false
      }));
    }
    if (availability !== undefined) {
      update['providerProfile.availability'] = availability.map(r => ({
        day: r.day,
        startTime: r.startTime,
        endTime: r.endTime
      }));
    }

    const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true })
      .select('providerProfile')
      .lean();
    if (!user) return res.status(404).json({ error: 'משתמש לא נמצא.' });

    res.json({ ok: true, providerProfile: user.providerProfile });
  } catch (err) {
    console.error('Update provider profile error:', err);
    res.status(500).json({ error: 'שגיאה בשמירת פרופיל הנותן שירות.' });
  }
});

// ──────────────────────────────────────────────
// GET /api/providers/my-bookings — provider's own upcoming bookings
// ──────────────────────────────────────────────
router.get('/my-bookings', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'עליך להתחבר.' });

    const today = new Date().toISOString().slice(0, 10);
    const bookings = await ProviderBooking.find({
      providerId: userId,
      status: { $ne: 'cancelled' },
      date: { $gte: today }
    }).sort({ date: 1, startTime: 1 }).lean();

    res.json({ ok: true, bookings, count: bookings.length });
  } catch (err) {
    console.error('My provider bookings error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת ההזמנות.' });
  }
});

// ──────────────────────────────────────────────
// GET /api/providers — browse public providers
// Query: ?q=keyword&category=barber
// ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { q, category } = req.query;
    const filter = { 'providerProfile.enabled': true };
    if (category && category !== 'all') filter['providerProfile.category'] = category;
    if (q && q.trim()) {
      const safe = q.trim().slice(0, 100);
      filter.$or = [
        { 'providerProfile.businessName': { $regex: safe, $options: 'i' } },
        { 'providerProfile.bio': { $regex: safe, $options: 'i' } },
        { displayName: { $regex: safe, $options: 'i' } }
      ];
    }

    const providers = await User.find(filter)
      .select('displayName photo providerProfile')
      .limit(50)
      .lean();

    const formatted = providers.map(p => ({
      _id: p._id,
      displayName: p.displayName,
      photo: p.photo,
      businessName: p.providerProfile?.businessName || p.displayName || 'Provider',
      bio: p.providerProfile?.bio || '',
      category: p.providerProfile?.category || 'general',
      services: (p.providerProfile?.services || []).filter(s => s.active)
    }));

    res.json({ providers: formatted, count: formatted.length });
  } catch (err) {
    console.error('Browse providers error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת נותני השירות.' });
  }
});

// ──────────────────────────────────────────────
// GET /api/providers/:id — single public provider profile
// ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'מזהה נותן שירות לא תקין.' });
    }
    const provider = await User.findOne({ _id: req.params.id, 'providerProfile.enabled': true })
      .select('displayName photo providerProfile')
      .lean();
    if (!provider) return res.status(404).json({ error: 'נותן השירות לא נמצא.' });

    res.json({
      ok: true,
      provider: {
        _id: provider._id,
        displayName: provider.displayName,
        photo: provider.photo,
        businessName: provider.providerProfile.businessName || provider.displayName || 'Provider',
        bio: provider.providerProfile.bio || '',
        category: provider.providerProfile.category || 'general',
        services: (provider.providerProfile.services || []).filter(s => s.active)
      }
    });
  } catch (err) {
    console.error('Get provider error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת נותן השירות.' });
  }
});

// ──────────────────────────────────────────────
// GET /api/providers/:id/availability?date=YYYY-MM-DD&serviceId=...
// ──────────────────────────────────────────────
router.get('/:id/availability', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'מזהה נותן שירות לא תקין.' });
    }
    const { date, serviceId } = req.query;
    if (!isValidIsoDate(date)) {
      return res.status(400).json({ error: 'נדרש תאריך תקין (YYYY-MM-DD).' });
    }
    if (!serviceId || !mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({ error: 'נדרש מזהה שירות תקין.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
      return res.status(400).json({ error: 'לא ניתן לבדוק זמינות בתאריך שעבר.' });
    }

    const provider = await User.findOne({ _id: req.params.id, 'providerProfile.enabled': true });
    if (!provider) return res.status(404).json({ error: 'נותן השירות לא נמצא.' });

    const service = (provider.providerProfile.services || []).find(
      s => s._id.toString() === serviceId && s.active
    );
    if (!service) return res.status(404).json({ error: 'השירות לא נמצא.' });

    const { dayName, slots } = await computeAvailableSlots(req, provider, service, date);

    res.json({
      ok: true,
      date,
      day: dayName,
      service: { id: service._id, name: service.name, duration: service.duration, price: service.price },
      slots
    });
  } catch (err) {
    console.error('Provider availability error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הזמינות.' });
  }
});

// ──────────────────────────────────────────────
// POST /api/providers/:id/book
// Body: { serviceId, date, startTime, guestName, guestEmail, guestPhone, guestNotes }
// ──────────────────────────────────────────────
router.post('/:id/book', async (req, res) => {
  let createdBooking = null;
  let pushedScheduleEvent = false;
  let syncedEventId = null;
  let provider = null;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'מזהה נותן שירות לא תקין.' });
    }
    const { serviceId, date, startTime, guestName, guestEmail, guestPhone, guestNotes } = req.body;
    if (typeof guestName !== 'string' || !guestName.trim() || guestName.length > 200) {
      return res.status(400).json({ error: 'נדרש שם.' });
    }
    if (!isValidIsoDate(date)) {
      return res.status(400).json({ error: 'נדרש תאריך תקין (YYYY-MM-DD).' });
    }
    if (!serviceId || !mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({ error: 'נדרש מזהה שירות תקין.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
      return res.status(400).json({ error: 'לא ניתן להזמין תאריך שעבר.' });
    }

    provider = await User.findOne({ _id: req.params.id, 'providerProfile.enabled': true });
    if (!provider) return res.status(404).json({ error: 'נותן השירות לא נמצא.' });

    const service = (provider.providerProfile.services || []).find(
      s => s._id.toString() === serviceId && s.active
    );
    if (!service) return res.status(404).json({ error: 'השירות לא נמצא.' });

    const timeToMinutes = req.app.get('timeToMinutes');
    const { dayName, slots } = await computeAvailableSlots(req, provider, service, date);
    const matchedSlot = slots.find(s => s.startTime === startTime);
    if (!matchedSlot) {
      return res.status(409).json({ error: 'השעה שנבחרה אינה פנויה יותר. בחר שעה אחרת.' });
    }

    const userId = getUserId(req);
    const bookedByUserId = (userId && mongoose.Types.ObjectId.isValid(userId)) ? userId : undefined;

    // ── Atomic slot claim: a duplicate-key error means another request
    // just took the same providerId+date+startTime (unique partial index). ──
    try {
      createdBooking = await ProviderBooking.create({
        providerId: provider._id,
        providerName: provider.providerProfile.businessName || provider.displayName || 'Provider',
        serviceId: service._id,
        serviceName: service.name,
        duration: service.duration,
        price: service.price,
        date,
        day: dayName,
        startTime: matchedSlot.startTime,
        endTime: matchedSlot.endTime,
        bookedByUserId,
        guestName: guestName.trim(),
        guestEmail: guestEmail || '',
        guestPhone: guestPhone || '',
        guestNotes: guestNotes || '',
        status: 'processing'
      });
    } catch (createErr) {
      if (createErr && createErr.code === 11000) {
        return res.status(409).json({ error: 'השעה שנבחרה הוזמנה הרגע על ידי מישהו אחר. בחר שעה אחרת.' });
      }
      throw createErr;
    }

    const DEFAULT_LOCATION_ID = req.app.get('DEFAULT_LOCATION_ID');
    const getTodayDayName = req.app.get('getTodayDayName');
    const getDefaultSchedule = req.app.get('getDefaultSchedule');
    const syncEventToGoogleCalendar = req.app.get('syncEventToGoogleCalendar');

    const eventToPersist = {
      title: `${service.name} - ${guestName.trim()}`,
      day: dayName,
      startTime: matchedSlot.startTime,
      endTime: matchedSlot.endTime,
      recurrence: 'once',
      location: provider.providerProfile.locationId || DEFAULT_LOCATION_ID,
      guestName: guestName.trim(),
      guestEmail: guestEmail || '',
      guestPhone: guestPhone || '',
      guestNotes: guestNotes || '',
      providerBookingId: createdBooking._id.toString(),
      targetDate: date
    };

    const schedule = provider.schedule && typeof provider.schedule === 'object' ? provider.schedule : getDefaultSchedule();
    const observedRevision = Number(provider.scheduleRevision || 0);
    const schedulePath = `schedule.${dayName}`;
    const scheduleUpdate = { $push: { [schedulePath]: eventToPersist } };
    if (dayName === getTodayDayName()) scheduleUpdate.$push['schedule.Today'] = eventToPersist;

    const saveResult = await User.updateOne({
      _id: provider._id,
      $or: [
        { scheduleRevision: observedRevision },
        ...(observedRevision === 0 ? [{ scheduleRevision: { $exists: false } }] : [])
      ]
    }, { ...scheduleUpdate, $inc: { scheduleRevision: 1 } });
    if (!saveResult.matchedCount) {
      throw Object.assign(new Error('לוח הזמנים של נותן השירות השתנה. נסה שוב.'), { status: 409 });
    }
    pushedScheduleEvent = true;

    let googleCalendar = { success: false, reason: 'Provider has no connected Google Calendar' };
    if (provider.googleAccessToken && syncEventToGoogleCalendar) {
      const syncResult = await syncEventToGoogleCalendar(provider._id.toString(), eventToPersist, eventToPersist.location);
      if (!syncResult.success) {
        throw Object.assign(new Error(`הוספה ליומן Google נכשלה: ${syncResult.error || 'שגיאה לא ידועה'}`), { status: 502 });
      }
      syncedEventId = syncResult.eventId;
      googleCalendar = { success: true, eventId: syncedEventId };
    }

    createdBooking.status = 'confirmed';
    createdBooking.confirmedAt = new Date();
    await createdBooking.save();

    // Best-effort in-memory schedule cache sync (mirrors legacy booking confirm).
    const getUserSchedule = req.app.get('getUserSchedule');
    const saveSchedulesNow = req.app.get('saveSchedulesNow');
    if (getUserSchedule) {
      const cached = getUserSchedule(provider._id.toString());
      if (cached) {
        if (!cached[dayName]) cached[dayName] = [];
        cached[dayName].push(eventToPersist);
        if (dayName === getTodayDayName()) {
          if (!cached.Today) cached.Today = [];
          cached.Today.push(eventToPersist);
        }
      }
    }
    if (saveSchedulesNow) saveSchedulesNow();

    res.json({
      ok: true,
      message: 'ההזמנה אושרה בהצלחה!',
      booking: createdBooking.toObject(),
      googleCalendar
    });
  } catch (err) {
    console.error('Provider booking error:', err);
    // Rollback: pull the schedule event (if pushed) and delete the booking doc.
    if (pushedScheduleEvent && provider && createdBooking) {
      try {
        const dayName = createdBooking.day;
        const pull = { [`schedule.${dayName}`]: { providerBookingId: createdBooking._id.toString() } };
        const getTodayDayName = req.app.get('getTodayDayName');
        if (getTodayDayName && dayName === getTodayDayName()) pull['schedule.Today'] = { providerBookingId: createdBooking._id.toString() };
        await User.updateOne({ _id: provider._id }, { $pull: pull });
      } catch (rollbackErr) {
        console.error('Failed to roll back provider schedule push:', rollbackErr.message);
      }
    }
    if (syncedEventId && provider) {
      try {
        const oauth = await createOAuth2ClientWithRefresh(provider);
        await google.calendar({ version: 'v3', auth: oauth }).events.delete({ calendarId: 'primary', eventId: syncedEventId });
      } catch (cleanupErr) {
        console.error('Failed to roll back Google Calendar event:', cleanupErr.message);
      }
    }
    if (createdBooking) {
      await ProviderBooking.deleteOne({ _id: createdBooking._id }).catch(() => {});
    }
    res.status(err.status || 500).json({ error: err.message || 'שגיאה ביצירת ההזמנה.' });
  }
});

module.exports = router;
