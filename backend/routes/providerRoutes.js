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
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const ProviderBooking = require('../models/ProviderBooking');
const { createOAuth2ClientWithRefresh } = require('../services/googleCalendar');
// Imported as a namespace (not destructured) so computeAvailableSlots' call
// to getFreeBusyForDay can be stubbed in tests via mock.method on the module
// object — a destructured reference would keep pointing at the original
// function after the module is mocked.
const mutualAvailability = require('../services/mutualAvailability');
const {
  mergeIntervals, sliceIntoSlots, overlapsAny, isValidIsoDate, getLocationTimeZone, todayIsoInTimeZone, FRIDAY_SHABBAT_CUTOFF_MIN
} = mutualAvailability;
const { google } = require('googleapis');

const VALID_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_SERVICES = 20;
const MAX_AVAILABILITY_ROWS = 50;
const DEFAULT_LOCATION_ID = 'jerusalem';

/**
 * Escape regex metacharacters so a search term is matched literally.
 * GET / below passes the trimmed query straight into a Mongo $regex — without
 * this, a guest typing something like "(a+)+$" isn't just searching oddly,
 * they're handing the server's regex engine a classic catastrophic-
 * backtracking pattern to run against every provider's businessName/bio/
 * displayName, unauthenticated and with no rate limit of its own before this.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministic tiebreak for a booking whose time range overlaps one or more
 * other non-cancelled bookings discovered by the post-insert recheck below
 * (the unique index only catches an exact-startTime collision). The earlier
 * createdAt wins; ties (same millisecond) are broken by _id. Pure and
 * symmetric, so whichever of two concurrently-created, mutually-overlapping
 * bookings runs this check, both land on the same single winner — without
 * it, two requests that both insert before either runs its recheck would
 * each see only the other as "the" conflict and both self-delete, leaving
 * the slot with zero bookings instead of one.
 */
function selfLosesOverlapRace(self, overlappingOthers) {
  const selfCreatedAt = self.createdAt.getTime();
  const selfId = self._id.toString();
  return overlappingOthers.some(other => {
    const otherCreatedAt = other.createdAt.getTime();
    if (otherCreatedAt !== selfCreatedAt) return otherCreatedAt < selfCreatedAt;
    return other._id.toString() < selfId;
  });
}

// POST /:id/book is reachable by anonymous guests (no auth required) and
// writes a DB row + optionally a Google Calendar event per call — without a
// limiter it's an open door for booking-spam or for sweeping a provider's
// whole day via repeated 409 probes. Not AI-metered, so server.js's
// aiLimiter doesn't cover it.
const bookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות הזמנה. נסה שוב בעוד דקה.' }
});

// GET /:id/availability is also reachable by anonymous guests, and — now
// that computeAvailableSlots cross-checks a Google-connected provider's own
// freebusy — can trigger a live Google Calendar API call per request. Same
// quota-exhaustion concern mutualRoutes.js' mutualAbuseLimiter documents for
// GET /sessions/:id/availability; a higher ceiling than bookLimiter since a
// single legitimate booking session calls this repeatedly while the guest
// tries different dates/services, not just once.
const availabilityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי בדיקות זמינות. נסה שוב בעוד דקה.' }
});

// GET / (browse) is also fully public and runs an uncached, unindexed
// $regex scan over every enabled provider per request — same "no limiter in
// front of an open, unauthenticated query" shape as the routes above.
const browseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי חיפושים. נסה שוב בעוד דקה.' }
});

function currentMinuteOfDay(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
}

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

/**
 * Map client-submitted services into the shape stored on providerProfile.services.
 * Preserves each existing service's _id when the client sends one back (the
 * editor round-trips the _id it loaded) — without this, replacing the whole
 * array with plain objects makes Mongoose mint a brand new subdocument _id
 * on every single profile save, even one that only edits the bio, which
 * breaks any booking already in flight against the old serviceId
 * (computeAvailableSlots/:book 404 "service not found"). A new service
 * (added client-side, no _id yet) still gets a fresh one as before.
 */
function mapServicesForSave(services) {
  return services.map(s => {
    const svc = {
      name: s.name.trim().slice(0, 100),
      duration: Math.round(Number(s.duration)),
      price: s.price !== undefined ? Number(s.price) : 0,
      color: typeof s.color === 'string' ? s.color : '#6366f1',
      active: s.active !== false
    };
    if (s._id && mongoose.Types.ObjectId.isValid(s._id)) svc._id = s._id;
    return svc;
  });
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

  // Merge overlapping/adjacent availability rows for this day first (a
  // provider can save two rows that overlap, e.g. 9-12 and 11-14) — slicing
  // each raw row independently would offer the same startTime more than once.
  const rawRanges = rows
    .map(row => ({ start: timeToMinutes(row.startTime), end: timeToMinutes(row.endTime) }))
    .filter(r => r.start !== null && r.end !== null && r.end > r.start);
  const mergedRanges = mergeIntervals(rawRanges);

  // Never offer a Friday slot that would run into Shabbat — same
  // FRIDAY_SHABBAT_CUTOFF_MIN hard guard mutualAvailability.js's
  // getMutualFreeSlots/isSlotMutuallyFree enforce for mutual meetings.
  // Without this, a provider whose weekly availability extends into Friday
  // evening (nothing stops them from saving e.g. 09:00-18:00) would have
  // their public booking page keep offering slots through candle-lighting.
  const slotRanges = dayName === 'Friday'
    ? mergedRanges.map(r => ({ start: r.start, end: Math.min(r.end, FRIDAY_SHABBAT_CUTOFF_MIN) })).filter(r => r.end > r.start)
    : mergedRanges;
  if (dayName === 'Friday' && !slotRanges.length) return { dayName, slots: [] };

  let candidates = sliceIntoSlots(slotRanges, service.duration)
    .map(s => ({ startMin: s.start, endMin: s.end }));

  // For today, never offer a slot that has already started (mirrors the
  // "never scan from a past time" guard the legacy /api/schedule/free-slots
  // flow applies, scoped to the provider's own location timezone).
  const timeZone = getLocationTimeZone(provider.providerProfile?.locationId);
  if (dateStr === todayIsoInTimeZone(timeZone)) {
    const nowMin = currentMinuteOfDay(timeZone);
    candidates = candidates.filter(c => c.startMin >= nowMin);
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

  // The provider's local `schedule` only has what CalendAI itself wrote
  // there (ProviderBookings, mutual meetings, manually-added events) — a
  // personal appointment that lives only on the provider's own Google
  // Calendar (never round-tripped into CalendAI) would otherwise still show
  // as bookable here. mutualAvailability.js's isSlotMutuallyFree/
  // getMutualFreeSlots already treat this as load-bearing enough to pull
  // Google freebusy for both parties on every call; a public provider
  // booking page needs the exact same guard for the one person on it who
  // actually has calendar conflicts to avoid.
  let googleBusyRanges = [];
  if (provider.googleAccessToken) {
    const toHHMM = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    const windowStartMin = mergedRanges[0].start;
    const windowEndMin = mergedRanges[mergedRanges.length - 1].end;
    try {
      googleBusyRanges = await mutualAvailability.getFreeBusyForDay(
        provider, dateStr, toHHMM(windowStartMin), toHHMM(windowEndMin), timeZone
      );
    } catch (err) {
      // Fail closed, same as the single-user /api/schedule/free-slots route
      // on a Google fetch failure (server.js) — showing slots as open when
      // we couldn't actually check the provider's calendar risks a real
      // double-booking, which is worse than a temporarily-unavailable page.
      throw Object.assign(
        new Error("לא ניתן לבדוק את יומן Google של נותן השירות כעת. נסה שוב."),
        { status: 502 }
      );
    }
  }

  const occupied = [...bookedRanges, ...scheduleRanges, ...googleBusyRanges];
  const freeSlots = candidates.filter(c => !overlapsAny(c.startMin, c.endMin, occupied));

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
    if (services !== undefined) update['providerProfile.services'] = mapServicesForSave(services);
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

    // "Today" in the provider's own location timezone, not the server's
    // (UTC) clock — same convention as every other date gate in this file
    // (computeAvailableSlots, the availability/book routes' past-date checks).
    const providerUser = await User.findById(userId).select('providerProfile.locationId').lean();
    const today = todayIsoInTimeZone(getLocationTimeZone(providerUser?.providerProfile?.locationId));
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
// POST /api/providers/bookings/:id/cancel
// Cancellable by the provider who owns the booking, or by the signed-in
// guest who made it (bookedByUserId) — an anonymous guest booking has
// neither an account nor a cancel link yet, so it can't self-cancel here.
// Mirrors rollbackCompletedSession's calendar-delete + schedule-pull pattern
// from mutualRoutes.js, scoped to a single provider-side event.
// ──────────────────────────────────────────────
router.post('/bookings/:id/cancel', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'עליך להתחבר.' });
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'מזהה הזמנה לא תקין.' });
    }

    const booking = await ProviderBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'ההזמנה לא נמצאה.' });

    const isProvider = booking.providerId.equals(userId);
    const isGuestOwner = booking.bookedByUserId && booking.bookedByUserId.equals(userId);
    if (!isProvider && !isGuestOwner) {
      return res.status(403).json({ error: 'אין לך הרשאה לבטל הזמנה זו.' });
    }

    if (booking.status === 'cancelled') return res.json({ ok: true, alreadyCancelled: true });

    if (booking.status === 'confirmed') {
      const provider = await User.findById(booking.providerId);
      if (booking.googleEventId && provider?.googleAccessToken) {
        try {
          const oauth = await createOAuth2ClientWithRefresh(provider);
          await google.calendar({ version: 'v3', auth: oauth }).events.delete({ calendarId: 'primary', eventId: booking.googleEventId });
        } catch (err) {
          console.error('Failed to delete provider Google Calendar event on cancel:', err.message);
        }
      }
      if (provider) {
        const pull = { [`schedule.${booking.day}`]: { providerBookingId: booking._id.toString() } };
        const getTodayDayName = req.app.get('getTodayDayName');
        if (getTodayDayName && booking.day === getTodayDayName()) {
          pull['schedule.Today'] = { providerBookingId: booking._id.toString() };
        }
        await User.updateOne({ _id: provider._id }, { $pull: pull }).catch(() => {});
      }
    }

    booking.status = 'cancelled';
    await booking.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('Cancel provider booking error:', err);
    res.status(500).json({ error: 'שגיאה בביטול ההזמנה.' });
  }
});

// ──────────────────────────────────────────────
// GET /api/providers — browse public providers
// Query: ?q=keyword&category=barber
// ──────────────────────────────────────────────
router.get('/', browseLimiter, async (req, res) => {
  try {
    const { q, category } = req.query;
    const filter = { 'providerProfile.enabled': true };
    if (category && category !== 'all') filter['providerProfile.category'] = category;
    if (q && q.trim()) {
      const safe = escapeRegex(q.trim().slice(0, 100));
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
        locationId: provider.providerProfile.locationId || DEFAULT_LOCATION_ID,
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
router.get('/:id/availability', availabilityLimiter, async (req, res) => {
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

    const provider = await User.findOne({ _id: req.params.id, 'providerProfile.enabled': true });
    if (!provider) return res.status(404).json({ error: 'נותן השירות לא נמצא.' });

    // "Past date" relative to the provider's own location timezone, not the
    // server's (UTC) clock — see computeAvailableSlots' same-day cutoff below.
    const today = todayIsoInTimeZone(getLocationTimeZone(provider.providerProfile?.locationId));
    if (date < today) {
      return res.status(400).json({ error: 'לא ניתן לבדוק זמינות בתאריך שעבר.' });
    }

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
    res.status(err.status || 500).json({ error: err.message || 'שגיאה בטעינת הזמינות.' });
  }
});

// ──────────────────────────────────────────────
// POST /api/providers/:id/book
// Body: { serviceId, date, startTime, guestName, guestEmail, guestPhone, guestNotes }
// ──────────────────────────────────────────────
router.post('/:id/book', bookLimiter, async (req, res) => {
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
    // This route is reachable by anonymous guests with no account to rate-limit
    // by, only bookLimiter's per-IP window — cap the free-text fields the same
    // way guestName already is, so a single request can't write an arbitrarily
    // large document (unlike guestName, these are optional, so empty is fine).
    if (guestEmail !== undefined && guestEmail !== null && (typeof guestEmail !== 'string' || guestEmail.length > 200)) {
      return res.status(400).json({ error: 'כתובת אימייל לא תקינה.' });
    }
    if (guestPhone !== undefined && guestPhone !== null && (typeof guestPhone !== 'string' || guestPhone.length > 50)) {
      return res.status(400).json({ error: 'מספר טלפון לא תקין.' });
    }
    if (guestNotes !== undefined && guestNotes !== null && (typeof guestNotes !== 'string' || guestNotes.length > 2000)) {
      return res.status(400).json({ error: 'ההערות ארוכות מהמותר.' });
    }
    if (!isValidIsoDate(date)) {
      return res.status(400).json({ error: 'נדרש תאריך תקין (YYYY-MM-DD).' });
    }
    if (!serviceId || !mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({ error: 'נדרש מזהה שירות תקין.' });
    }

    provider = await User.findOne({ _id: req.params.id, 'providerProfile.enabled': true });
    if (!provider) return res.status(404).json({ error: 'נותן השירות לא נמצא.' });

    // "Past date" relative to the provider's own location timezone, not the
    // server's (UTC) clock — see computeAvailableSlots' same-day cutoff below.
    const today = todayIsoInTimeZone(getLocationTimeZone(provider.providerProfile?.locationId));
    if (date < today) {
      return res.status(400).json({ error: 'לא ניתן להזמין תאריך שעבר.' });
    }

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

    // The unique index above only catches a second booking at the exact same
    // startTime — it does NOT stop a double-booking between two *different*
    // services whose slots are sliced to different durations and so can
    // overlap at different startTimes (e.g. a 30-min and a 45-min service
    // both starting from the same availability window). Re-check for any
    // other non-cancelled booking on this provider+date whose range overlaps
    // the one just claimed, and undo our own insert if one slipped in
    // between the availability read above and this create. Still a
    // (much narrower) check-then-act race, not a transaction — closing it
    // fully would need a per-provider lock, which is a larger change.
    const claimedStartMin = timeToMinutes(matchedSlot.startTime);
    const claimedEndMin = timeToMinutes(matchedSlot.endTime);
    const otherBookings = await ProviderBooking.find({
      providerId: provider._id,
      date,
      status: { $ne: 'cancelled' },
      _id: { $ne: createdBooking._id }
    }).select('startTime endTime createdAt').lean();
    const otherRanges = otherBookings
      .map(b => ({ _id: b._id, createdAt: b.createdAt, start: timeToMinutes(b.startTime), end: timeToMinutes(b.endTime) }))
      .filter(r => r.start !== null && r.end !== null);
    const overlappingOthers = otherRanges.filter(r => overlapsAny(claimedStartMin, claimedEndMin, [r]));
    if (overlappingOthers.length > 0 && selfLosesOverlapRace(createdBooking, overlappingOthers)) {
      await ProviderBooking.deleteOne({ _id: createdBooking._id }).catch(() => {});
      return res.status(409).json({ error: 'השעה שנבחרה הוזמנה הרגע על ידי מישהו אחר. בחר שעה אחרת.' });
    }

    const DEFAULT_LOCATION_ID = req.app.get('DEFAULT_LOCATION_ID');
    const getTodayDayName = req.app.get('getTodayDayName');
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
    if (syncedEventId) createdBooking.googleEventId = syncedEventId;
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
// Exposed for unit testing only — the router itself stays the module's
// default export so `app.use('/api/providers', ...)` is unaffected.
module.exports.mapServicesForSave = mapServicesForSave;
module.exports.computeAvailableSlots = computeAvailableSlots;
module.exports.escapeRegex = escapeRegex;
module.exports.selfLosesOverlapRace = selfLosesOverlapRace;
