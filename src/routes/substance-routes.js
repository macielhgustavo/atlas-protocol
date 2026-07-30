const express = require('express');

const USER_ROLES = require('../constants/user-roles');
const substanceController = require('../controllers/substance-controller');
const authMiddleware = require('../middlewares/auth-middleware');
const professionalApprovalMiddleware = require(
  '../middlewares/professional-approval-middleware',
);
const allowRoles = require('../middlewares/role-middleware');
const validate = require('../middlewares/validation-middleware');
const asyncHandler = require('../utils/async-handler');
const {
  createSubstanceSchema,
  substanceIdParamsSchema,
  substanceListQuerySchema,
  updateSubstanceSchema,
  updateSubstanceStatusSchema,
} = require('../validators/substance-validators');

const router = express.Router();
const allRoles = Object.values(USER_ROLES);

router.use(authMiddleware);

router.post(
  '/',
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.PROFESSIONAL),
  professionalApprovalMiddleware,
  validate(createSubstanceSchema),
  asyncHandler(substanceController.createSubstance),
);
router.get(
  '/',
  allowRoles(...allRoles),
  validate(substanceListQuerySchema, 'query'),
  asyncHandler(substanceController.listSubstances),
);
router.get(
  '/:id',
  allowRoles(...allRoles),
  validate(substanceIdParamsSchema, 'params'),
  asyncHandler(substanceController.getSubstance),
);
router.patch(
  '/:id/status',
  allowRoles(USER_ROLES.ADMIN),
  validate(substanceIdParamsSchema, 'params'),
  validate(updateSubstanceStatusSchema),
  asyncHandler(substanceController.updateSubstanceStatus),
);
router.patch(
  '/:id',
  allowRoles(USER_ROLES.ADMIN),
  validate(substanceIdParamsSchema, 'params'),
  validate(updateSubstanceSchema),
  asyncHandler(substanceController.updateSubstance),
);

module.exports = router;
