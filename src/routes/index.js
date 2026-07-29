const express = require('express');

const auditLogRoutes = require('./audit-log-routes');
const checkInRoutes = require('./check-in-routes');
const dashboardRoutes = require('./dashboard-routes');
const examRoutes = require('./exam-routes');
const healthRoutes = require('./health-routes');
const linkRoutes = require('./link-routes');
const protocolRoutes = require('./protocol-routes');
const professionalVerificationRoutes = require('./professional-verification-routes');
const substanceRoutes = require('./substance-routes');
const trackingRecordRoutes = require('./tracking-record-routes');
const userRoutes = require('./user-routes');
const authRoutes = require('./auth-routes');

const router = express.Router();

router.use('/audit-logs', auditLogRoutes);
router.use('/check-ins', checkInRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/exams', examRoutes);
router.use('/health', healthRoutes);
router.use('/links', linkRoutes);
router.use('/protocols', protocolRoutes);
router.use('/professional-verifications', professionalVerificationRoutes);
router.use('/substances', substanceRoutes);
router.use('/tracking-records', trackingRecordRoutes);
router.use('/users', userRoutes);
router.use('/auth', authRoutes);

module.exports = router;
