const express = require('express');

const notificationController = require(
  '../controllers/notification-controller',
);
const authMiddleware = require('../middlewares/auth-middleware');
const requireJsonContentType = require(
  '../middlewares/require-json-content-type',
);
const validate = require('../middlewares/validation-middleware');
const asyncHandler = require('../utils/async-handler');
const {
  emptyNotificationBodySchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
} = require('../validators/notification-validators');

const router = express.Router();

router.use(authMiddleware);

router.get(
  '/',
  validate(notificationListQuerySchema, 'query'),
  asyncHandler(notificationController.listNotifications),
);
router.patch(
  '/read-all',
  requireJsonContentType,
  validate(emptyNotificationBodySchema),
  asyncHandler(notificationController.markAllNotificationsAsRead),
);
router.patch(
  '/:id/read',
  requireJsonContentType,
  validate(notificationIdParamsSchema, 'params'),
  validate(emptyNotificationBodySchema),
  asyncHandler(notificationController.markNotificationAsRead),
);
router.patch(
  '/:id/archive',
  requireJsonContentType,
  validate(notificationIdParamsSchema, 'params'),
  validate(emptyNotificationBodySchema),
  asyncHandler(notificationController.archiveNotification),
);

module.exports = router;
