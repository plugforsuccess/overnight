// Notification service stub — replace with Twilio (SMS) and SendGrid (email) in production

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

async function notifyWaitlistExpired(parent, child, date) {
  const msg = `Your waitlist offer for ${child.name} on ${date} has expired.`;
  if (parent.phone) await sendSms(parent.phone, msg);
  if (parent.email) await sendEmail(parent.email, 'Waitlist Offer Expired', msg);
}

async function notifyNightCanceled(parent, child, date, creditAmountCents) {
  const creditDollars = (creditAmountCents / 100).toFixed(0);
  const msg = `The overnight on ${date} for ${child.name} has been canceled due to low enrollment. A $${creditDollars} credit has been applied to your account.`;
  if (parent.phone) await sendSms(parent.phone, msg);
  if (parent.email) await sendEmail(parent.email, 'Night Canceled — Credit Issued', msg);
}

async function notifyPaymentSuccess(parent) {
  const msg = 'Your weekly overnight childcare payment was processed successfully.';
  if (parent.phone) await sendSms(parent.phone, msg);
  if (parent.email) await sendEmail(parent.email, 'Payment Confirmed', msg);
}

async function notifyPaymentFailed(parent) {
  const msg = 'Your payment failed. Please update your payment method to keep your reservations active.';
  if (parent.phone) await sendSms(parent.phone, msg);
  if (parent.email) await sendEmail(parent.email, 'Payment Failed — Action Required', msg);
}

async function notifyReservationConfirmed(parent, child, dates) {
  const dateList = dates.join(', ');
  const msg = `Reservations confirmed for ${child.name}: ${dateList}`;
  if (parent.phone) await sendSms(parent.phone, msg);
  if (parent.email) await sendEmail(parent.email, 'Reservation Confirmed', msg);
}

async function notifyWeeklySchedule(parent, children, dates) {
  const names = children.map(c => c.name).join(', ');
  const dateList = dates.join(', ');
  const msg = `Weekly schedule for ${names}: ${dateList}`;
  if (parent.phone) await sendSms(parent.phone, msg);
  if (parent.email) await sendEmail(parent.email, 'Weekly Schedule Confirmation', msg);
}

module.exports = {
  sendSms,
  sendEmail,
  notifyWaitlistOffer,
  notifyWaitlistExpired,
  notifyNightCanceled,
  notifyPaymentSuccess,
  notifyPaymentFailed,
  notifyReservationConfirmed,
  notifyWeeklySchedule,
};
