const express = require('express');

const USER_ROLES = require('../constants/user-roles');
const checkInController = require('../controllers/check-in-controller');
const authMiddleware = require('../middlewares/auth-middleware');
const professionalApprovalMiddleware = require('../middlewares/professional-approval-middleware');
const allowRoles = require('../middlewares/role-middleware');
const validate = require('../middlewares/validation-middleware');
const asyncHandler = require('../utils/async-handler');
const {
  checkInIdParamsSchema,
  checkInListQuerySchema,
  createCheckInSchema,
  reviewCheckInSchema,
  submitCheckInSchema,
  updateCheckInSchema,
} = require('../validators/check-in-validators');

const router = express.Router();
const allRoles = Object.values(USER_ROLES);

router.use(authMiddleware);

router.post(
  '/',
  allowRoles(USER_ROLES.ATHLETE),
  validate(createCheckInSchema),
  asyncHandler(checkInController.createCheckIn),
);
router.get(
  '/',
  allowRoles(...allRoles),
  professionalApprovalMiddleware,
  validate(checkInListQuerySchema, 'query'),
  asyncHandler(checkInController.listCheckIns),
);
router.patch(
  '/:id/submit',
  allowRoles(USER_ROLES.ATHLETE),
  validate(checkInIdParamsSchema, 'params'),
  validate(submitCheckInSchema),
  asyncHandler(checkInController.submitCheckIn),
);
router.patch(
  '/:id/review',
  allowRoles(USER_ROLES.PROFESSIONAL),
  professionalApprovalMiddleware,
  validate(checkInIdParamsSchema, 'params'),
  validate(reviewCheckInSchema),
  asyncHandler(checkInController.reviewCheckIn),
);
router.patch(
  '/:id',
  allowRoles(USER_ROLES.ATHLETE),
  validate(checkInIdParamsSchema, 'params'),
  validate(updateCheckInSchema),
  asyncHandler(checkInController.updateCheckIn),
);
router.get(
  '/:id',
  allowRoles(...allRoles),
  professionalApprovalMiddleware,
  validate(checkInIdParamsSchema, 'params'),
  asyncHandler(checkInController.getCheckIn),
);

module.exports = router;
