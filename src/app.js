const express = require('express');
const reservationRoutes = require('./routes/reservations');
const waitlistRoutes = require('./routes/waitlist');
const adminRoutes = require('./routes/admin');
const jobRoutes = require('./routes/jobs');
const { authRateLimiter } = require('./middleware/rate-limit');

const app = express();
app.use(express.json());

// Rate limit user-facing auth routes
app.use('/api/reservations', authRateLimiter, reservationRoutes);
app.use('/api/waitlist', authRateLimiter, waitlistRoutes);
app.use('/api/admin', authRateLimiter, adminRoutes);
app.use('/api/jobs', jobRoutes); // internal job endpoints — no rate limit

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = app;
