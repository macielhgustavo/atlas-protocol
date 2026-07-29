const express = require('express');

const USER_ROLES = require('../constants/user-roles');
const physicalProgressController = require(
  '../controllers/physical-progress-controller',
);
const authMiddleware = require('../middlewares/auth-middleware');
const professionalApprovalMiddleware = require(
  '../middlewares/professional-approval-middleware',
);
const requireJsonContentType = require(
  '../middlewares/require-json-content-type',
);
const allowRoles = require('../middlewares/role-middleware');
const validate = require('../middlewares/validation-middleware');
const asyncHandler = require('../utils/async-handler');
const {
  archivePhysicalProgressSchema,
  createPhysicalProgressSchema,
  physicalProgressIdParamsSchema,
  physicalProgressListQuerySchema,
  updatePhysicalProgressSchema,
} = require('../validators/physical-progress-validators');

const router = express.Router();

router.use(authMiddleware);
router.use(allowRoles(USER_ROLES.PROFESSIONAL, USER_ROLES.ATHLETE));
router.use(professionalApprovalMiddleware);

router.post(
  '/',
  requireJsonContentType,
  validate(createPhysicalProgressSchema),
  asyncHandler(physicalProgressController.createPhysicalProgress),
);
router.get(
  '/',
  validate(physicalProgressListQuerySchema, 'query'),
  asyncHandler(physicalProgressController.listPhysicalProgress),
);
router.patch(
  '/:id/archive',
  requireJsonContentType,
  validate(physicalProgressIdParamsSchema, 'params'),
  validate(archivePhysicalProgressSchema),
  asyncHandler(physicalProgressController.archivePhysicalProgress),
);
router.patch(
  '/:id',
  requireJsonContentType,
  validate(physicalProgressIdParamsSchema, 'params'),
  validate(updatePhysicalProgressSchema),
  asyncHandler(physicalProgressController.updatePhysicalProgress),
);
router.get(
  '/:id',
  validate(physicalProgressIdParamsSchema, 'params'),
  asyncHandler(physicalProgressController.getPhysicalProgress),
);

module.exports = router;
