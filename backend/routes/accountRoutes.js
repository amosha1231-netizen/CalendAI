const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = require('../config/jwtSecret');
const User = require('../models/User');
const Event = require('../models/Event');
const Reminder = require('../models/Reminder');
const DailyLog = require('../models/DailyLog');
const ExpectedExpense = require('../models/ExpectedExpense');
const ActionHistory = require('../models/ActionHistory');
const PushSubscription = require('../models/PushSubscription');
const OAuthHandoff = require('../models/OAuthHandoff');
const Routine = require('../models/Routine');
const RoutineCheckin = require('../models/RoutineCheckin');
const Goal = require('../models/Goal');
const Booking = require('../models/Booking');
const MutualBooking = require('../models/MutualBooking');
const ProviderBooking = require('../models/ProviderBooking');
const { google } = require('googleapis');
// Imported as a namespace (not destructured) so tests can mock
// mutualRoutes.cancelMutualSession / googleCalendarService.createOAuth2ClientWithRefresh
// without needing a live DB or a require-cache reset.
const mutualRoutes = require('./mutualRoutes');
const googleCalendarService = require('../services/googleCalendar');

// Same auth as the other route files: JWT bearer first, then the passport session.
function getAuthenticatedUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded && (decoded.id || decoded._id)) return decoded.id || decoded._id;
    } catch (err) {
      // fall through to the session
    }
  }
  if (req.isAuthenticated && req.isAuthenticated()) {
    const sessionUser = req.session?.passport?.user;
    const id = sessionUser?._id || sessionUser?.id;
    if (id) return id;
  }
  return null;
}

/**
 * DELETE /api/account
 * Body: { confirm: 'DELETE' }
 *
 * Deletes the signed-in user's account and personal data, from inside the app.
 * Required by App Store guideline 5.1.1(v) and Google Play's account deletion
 * policy: an app that lets people create an account must let them delete it
 * in the app, not only by email.
 *
 * Kept: ProcessedPaymentEvent (payment records, needed for accounting and
 * refunds; they hold an id and an order number, no profile data).
 */
router.delete('/', async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ error: 'Sign in required.' });
  }
  if (req.body?.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Missing confirmation.' });
  }

  const id = new mongoose.Types.ObjectId(String(userId));
  try {
    const user = await User.findById(id).select('_id googleRefreshToken googleAccessToken').lean();
    if (!user) return res.status(404).json({ error: 'Account not found.' });

    // All Google Calendar cleanup below must run BEFORE the token revoke
    // further down — it reuses this same user's own Google credentials
    // (directly here, and via cancelMutualSession -> createOAuth2ClientWithRefresh
    // for a session where this user is the host/invitee), so revoking first
    // would make every one of these calls fail with an invalid_grant and
    // leave live events behind on exactly the account being deleted.

    // A mutual session the other party is still part of mirrors a schedule
    // entry (and, once 'completed', a synced Google Calendar event) onto
    // BOTH accounts. Hard-deleting the MutualBooking doc straight away (as
    // the deleteMany below used to) would remove the only record of that
    // session without ever rolling those back — orphaning a live Google
    // Calendar event and schedule entry on the OTHER party's account
    // forever, with no session left for them to even cancel it themselves.
    // Run every non-cancelled session through the same cancelMutualSession
    // used by POST /sessions/:id/cancel first, so both sides are cleaned up
    // before the document itself is removed.
    const mutualSessions = await MutualBooking.find({
      $or: [{ hostId: id }, { inviteeId: id }],
      status: { $ne: 'cancelled' }
    }).select('sessionId').lean();
    await Promise.all(mutualSessions.map(s =>
      mutualRoutes.cancelMutualSession(s.sessionId, req.app).catch(err =>
        console.error(`Failed to roll back mutual session ${s.sessionId} on account deletion:`, err.message)
      )
    ));

    // A confirmed ProviderBooking where the deleting user is the provider
    // can carry a synced Google Calendar event with the guest listed as an
    // attendee (syncEventToGoogleCalendar sets sendUpdates: 'all' whenever
    // the guest gave an email) — Google mirrors that invite onto the
    // guest's own calendar even though they may have no CalendAI account at
    // all. Unlike the provider's own single-booking cancel route, the bulk
    // ProviderBooking.deleteMany below never deleted that event, leaving a
    // permanent dangling invite for a meeting with a now-deleted provider.
    // Clean those up first, the same way that cancel route does.
    const confirmedProviderBookings = await ProviderBooking.find({
      providerId: id,
      status: 'confirmed'
    }).select('googleEventId').lean();
    const eventIds = confirmedProviderBookings.map(b => b.googleEventId).filter(Boolean);
    if (eventIds.length && (user.googleAccessToken || user.googleRefreshToken)) {
      try {
        const oauth = await googleCalendarService.createOAuth2ClientWithRefresh(user);
        const calendar = google.calendar({ version: 'v3', auth: oauth });
        await Promise.all(eventIds.map(eventId =>
          calendar.events.delete({ calendarId: 'primary', eventId }).catch(err =>
            console.error(`Failed to delete provider booking Google event ${eventId} on account deletion:`, err.message)
          )
        ));
      } catch (err) {
        console.error('Failed to clean up provider booking Google events on account deletion:', err.message);
      }
    }

    // Best effort: revoke CalendAI's access to their Google Calendar. Never blocks the deletion.
    const googleToken = user.googleRefreshToken || user.googleAccessToken;
    if (googleToken) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: googleToken }).toString(),
          signal: AbortSignal.timeout(5000)
        });
      } catch (e) {
        console.warn('Google token revoke failed (account still deleted):', e.message);
      }
    }

    await Promise.all([
      Event.deleteMany({ userId: id }),
      Reminder.deleteMany({ userId: id }),
      DailyLog.deleteMany({ userId: id }),
      ExpectedExpense.deleteMany({ userId: id }),
      ActionHistory.deleteMany({ userId: id }),
      PushSubscription.deleteMany({ userId: id }),
      OAuthHandoff.deleteMany({ userId: id }),
      RoutineCheckin.deleteMany({ userId: id }),
      // Routines and goals this user created go away; in others', remove them as a participant.
      Routine.deleteMany({ ownerId: id }),
      Goal.deleteMany({ creatorId: id }),
      // Their booking pages and the bookings made on them.
      Booking.deleteMany({ hostId: id }),
      ProviderBooking.deleteMany({ providerId: id }),
      // Already rolled back above; this just removes the now-cancelled records.
      MutualBooking.deleteMany({ $or: [{ hostId: id }, { inviteeId: id }] })
    ]);

    // Second pass, after the owned documents are gone, so counts stay right.
    const left = await Routine.updateMany(
      { 'participants.userId': id },
      { $pull: { participants: { userId: id } }, $inc: { participantCount: -1 } }
    );
    if (left.modifiedCount) {
      await Routine.updateMany({ participantCount: { $lt: 0 } }, { $set: { participantCount: 0 } });
    }
    await Goal.updateMany(
      { $or: [{ 'participants.userId': id }, { 'messages.userId': id }] },
      { $pull: { participants: { userId: id }, messages: { userId: id } } }
    );
    // Bookings they made with other providers stay with the provider, without the link to this account.
    await ProviderBooking.updateMany({ bookedByUserId: id }, { $unset: { bookedByUserId: 1 } });

    await User.deleteOne({ _id: id });

    if (req.logout) {
      try { req.logout(() => {}); } catch (e) {}
    }
    if (req.session && req.session.destroy) {
      try { req.session.destroy(() => {}); } catch (e) {}
    }

    console.log(`🗑️ Account deleted: ${id}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('Account deletion failed:', err.message);
    return res.status(500).json({ error: 'Could not delete the account. Please try again.' });
  }
});

module.exports = router;
