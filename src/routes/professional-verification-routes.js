const express = require('express');

const USER_ROLES = require('../constants/user-roles');
const professionalVerificationController = require('../controllers/professional-verification-controller');
const authMiddleware = require('../middlewares/auth-middleware');
const allowRoles = require('../middlewares/role-middleware');
const validate = require('../middlewares/validation-middleware');
const asyncHandler = require('../utils/async-handler');
const {
  approveProfessionalVerificationSchema,
  professionalVerificationIdParamsSchema,
  professionalVerificationListQuerySchema,
  rejectProfessionalVerificationSchema,
} = require('../validators/professional-verification-validators');

const router = express.Router();

router.use(authMiddleware);

router.get(
  '/me',
  allowRoles(USER_ROLES.PROFESSIONAL),
  asyncHandler(
    professionalVerificationController.getOwnProfessionalVerification,
  ),
);
router.get(
  '/',
  allowRoles(USER_ROLES.ADMIN),
  validate(professionalVerificationListQuerySchema, 'query'),
  asyncHandler(professionalVerificationController.listProfessionalVerifications),
);
router.get(
  '/:id/document',
  allowRoles(USER_ROLES.ADMIN, USER_ROLES.PROFESSIONAL),
  validate(professionalVerificationIdParamsSchema, 'params'),
  asyncHandler(
    professionalVerificationController.getProfessionalVerificationDocument,
  ),
);
router.get(
  '/:id',
  allowRoles(USER_ROLES.ADMIN),
  validate(professionalVerificationIdParamsSchema, 'params'),
  asyncHandler(professionalVerificationController.getProfessionalVerification),
);
router.patch(
  '/:id/approve',
  allowRoles(USER_ROLES.ADMIN),
  validate(professionalVerificationIdParamsSchema, 'params'),
  validate(approveProfessionalVerificationSchema),
  asyncHandler(
    professionalVerificationController.approveProfessionalVerification,
  ),
);
router.patch(
  '/:id/reject',
  allowRoles(USER_ROLES.ADMIN),
  validate(professionalVerificationIdParamsSchema, 'params'),
  validate(rejectProfessionalVerificationSchema),
  asyncHandler(
    professionalVerificationController.rejectProfessionalVerification,
  ),
);

module.exports = router;
