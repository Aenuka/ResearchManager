const allowedUserNames = new Map(
  [
    ['aenuin@gmail.com', 'Aenuka Buddhakorala'],
    ['chamithu@gmail.com', 'Chamithu Edirimanna'],
    ['yohan@gmail.com', 'Yohan Kodagoda'],
    ['sajith@gmail.com', 'Sajith Tharaka'],
    ['anuradha.j@sliit.lk', 'Prof. Anuradha Jayakody'],
  ].map(([email, name]) => [email.toLowerCase(), name])
);

function getAllowedEmails() {
  const configuredEmails = process.env.ALLOWED_EMAILS?.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...(configuredEmails || []), ...allowedUserNames.keys()]);
}

function getAllowedUserName(email = '') {
  return allowedUserNames.get(email.trim().toLowerCase()) || '';
}

function isAllowedEmail(email = '') {
  return getAllowedEmails().has(email.trim().toLowerCase());
}

module.exports = {
  getAllowedEmails,
  getAllowedUserName,
  isAllowedEmail,
};
