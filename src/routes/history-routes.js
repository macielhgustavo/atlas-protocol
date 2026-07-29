const express = require('express');

const USER_ROLES = require('../constants/user-roles');
const historyController = require('../controllers/history-controller');
const authMiddleware = require('../middlewares/auth-middleware');
const professionalApprovalMiddleware = require(
  '../middlewares/professional-approval-middleware',
);
const allowRoles = require('../middlewares/role-middleware');
const validate = require('../middlewares/validation-middleware');
const asyncHandler = require('../utils/async-handler');
const { historyQuerySchema } = require('../validators/history-validators');

const router = express.Router();

router.use(authMiddleware);
router.use(allowRoles(USER_ROLES.PROFESSIONAL, USER_ROLES.ATHLETE));
router.use(professionalApprovalMiddleware);

router.get(
  '/',
  validate(historyQuerySchema, 'query'),
  asyncHandler(historyController.listHistory),
);

module.exports = router;
