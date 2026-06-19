function getAllowedEmails() {
  const configuredEmails = process.env.ALLOWED_EMAILS?.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return new Set(configuredEmails || []);
}

function isAllowedEmail(email = '') {
  return getAllowedEmails().has(email.trim().toLowerCase());
}

module.exports = {
  getAllowedEmails,
  isAllowedEmail,
};
