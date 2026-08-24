// ──────────────────────────────────────────────
// Outlook Calendar Service (Microsoft Graph API)
// ──────────────────────────────────────────────
// This service handles syncing CalendAI events to Microsoft Outlook Calendar
// via the Microsoft Graph API (https://graph.microsoft.com/v1.0/me/events).
//
// Currently a scaffold — the actual POST to Graph API will be implemented
// when the full sync flow is built. For now, it logs and returns a fake success.
// ──────────────────────────────────────────────

const MICROSOFT_GRAPH_ENDPOINT = 'https://graph.microsoft.com/v1.0/me/events';

/**
 * Sync an event to the user's Outlook Calendar.
 *
 * @param {Object} user - The user document from MongoDB (must have microsoftAccessToken).
 * @param {Object} eventDetails - The event to sync { title, startTime, endTime, day, recurrence, ... }.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function syncEventToOutlook(user, eventDetails) {
  // ── Guard: user must have a Microsoft access token ──
  if (!user || !user.microsoftAccessToken) {
    console.log('[OutlookService] No Microsoft token available — skipping sync.');
    return { success: false, error: 'No Microsoft token stored for user.' };
  }

  try {
    // ── TODO: Implement actual POST to Microsoft Graph API ──
    // This will be implemented in a future iteration.
    // The request will look like:
    //
    // const response = await fetch(MICROSOFT_GRAPH_ENDPOINT, {
    //   method: 'POST',
    //   headers: {
    //     Authorization: `Bearer ${user.microsoftAccessToken}`,
    //     'Content-Type': 'application/json',
    //     Prefer: 'outlook.timezone="Asia/Jerusalem"'
    //   },
    //   body: JSON.stringify({
    //     subject: eventDetails.title || 'CalendAI Event',
    //     body: { contentType: 'text', content: eventDetails.description || '' },
    //     start: { dateTime: '...', timeZone: 'Asia/Jerusalem' },
    //     end: { dateTime: '...', timeZone: 'Asia/Jerusalem' },
    //     recurrence: eventDetails.recurrence ? { pattern: {...}, range: {...} } : undefined
    //   })
    // });

    console.log('[OutlookService] syncEventToOutlook called with:', {
      userId: user._id?.toString() || user.id,
      eventTitle: eventDetails.title,
      eventDay: eventDetails.day,
      eventStart: eventDetails.startTime,
      eventEnd: eventDetails.endTime,
      recurrence: eventDetails.recurrence || 'once'
    });

    // ── Placeholder: return fake success ──
    return { success: true };
  } catch (error) {
    console.error('[OutlookService] Sync failed:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { syncEventToOutlook };