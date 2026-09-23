// Outlook event synchronization is intentionally unavailable until a real
// Microsoft Graph integration is implemented.
async function syncEventToOutlook(user) {
  return {
    success: false,
    error: !user || !user.microsoftAccessToken
      ? 'No Microsoft token stored for user.'
      : 'Outlook calendar sync is not implemented yet.'
  };
}

module.exports = { syncEventToOutlook };
