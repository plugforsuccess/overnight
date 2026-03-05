const express = require('express');
const reservationRoutes = require('./routes/reservations');
const waitlistRoutes = require('./routes/waitlist');
const adminRoutes = require('./routes/admin');
const jobRoutes = require('./routes/jobs');

const app = express();
app.use(express.json());

app.use('/api/reservations', reservationRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobRoutes); // admin-only job endpoints

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = app;
