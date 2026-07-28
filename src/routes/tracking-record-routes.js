const express = require('express');

const USER_ROLES = require('../constants/user-roles');
const trackingRecordController = require('../controllers/tracking-record-controller');
const authMiddleware = require('../middlewares/auth-middleware');
const professionalApprovalMiddleware = require('../middlewares/professional-approval-middleware');
const allowRoles = require('../middlewares/role-middleware');
const validate = require('../middlewares/validation-middleware');
const asyncHandler = require('../utils/async-handler');
const {
  correctTrackingRecordSchema,
  createTrackingRecordSchema,
  trackingRecordIdParamsSchema,
  trackingRecordListQuerySchema,
  transitionTrackingRecordSchema,
} = require('../validators/tracking-record-validators');

const router = express.Router();
const allRoles = Object.values(USER_ROLES);

router.use(authMiddleware);

router.post(
  '/',
  allowRoles(USER_ROLES.PROFESSIONAL, USER_ROLES.ATHLETE),
  professionalApprovalMiddleware,
  validate(createTrackingRecordSchema),
  asyncHandler(trackingRecordController.createTrackingRecord),
);
router.get(
  '/',
  allowRoles(...allRoles),
  professionalApprovalMiddleware,
  validate(trackingRecordListQuerySchema, 'query'),
  asyncHandler(trackingRecordController.listTrackingRecords),
);
router.patch(
  '/:id/status',
  allowRoles(USER_ROLES.PROFESSIONAL, USER_ROLES.ATHLETE),
  professionalApprovalMiddleware,
  validate(trackingRecordIdParamsSchema, 'params'),
  validate(transitionTrackingRecordSchema),
  asyncHandler(trackingRecordController.transitionTrackingRecord),
);
router.patch(
  '/:id/correction',
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.PROFESSIONAL),
  professionalApprovalMiddleware,
  validate(trackingRecordIdParamsSchema, 'params'),
  validate(correctTrackingRecordSchema),
  asyncHandler(trackingRecordController.correctTrackingRecord),
);
router.get(
  '/:id',
  allowRoles(...allRoles),
  professionalApprovalMiddleware,
  validate(trackingRecordIdParamsSchema, 'params'),
  asyncHandler(trackingRecordController.getTrackingRecord),
);

module.exports = router;
