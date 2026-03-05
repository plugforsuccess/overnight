// Notification service stub — replace with real SMS/email providers
async function sendSms(phone, message) {
  console.log(`[SMS → ${phone}] ${message}`);
}

async function sendEmail(email, subject, body) {
  console.log(`[EMAIL → ${email}] ${subject}: ${body}`);
}

async function notifyWaitlistOffer(parent, child, date) {
  const msg = `A spot opened on ${date} for ${child.name}. You have 2 hours to accept.`;
  if (parent.phone) await sendSms(parent.phone, msg);
  if (parent.email) await sendEmail(parent.email, 'Overnight Spot Available', msg);
}

module.exports = { sendSms, sendEmail, notifyWaitlistOffer };
