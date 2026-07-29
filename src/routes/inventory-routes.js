const express = require('express');

const USER_ROLES = require('../constants/user-roles');
const inventoryController = require('../controllers/inventory-controller');
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
  archiveInventoryItemSchema,
  createInventoryItemSchema,
  createInventoryMovementSchema,
  inventoryItemIdParamsSchema,
  inventoryListQuerySchema,
  inventoryMovementListQuerySchema,
  updateInventoryItemSchema,
} = require('../validators/inventory-validators');

const router = express.Router();

router.use(authMiddleware);
router.use(allowRoles(USER_ROLES.PROFESSIONAL, USER_ROLES.ATHLETE));
router.use(professionalApprovalMiddleware);

router.post(
  '/',
  allowRoles(USER_ROLES.ATHLETE),
  requireJsonContentType,
  validate(createInventoryItemSchema),
  asyncHandler(inventoryController.createInventoryItem),
);
router.get(
  '/',
  validate(inventoryListQuerySchema, 'query'),
  asyncHandler(inventoryController.listInventoryItems),
);
router.post(
  '/:id/movements',
  allowRoles(USER_ROLES.ATHLETE),
  requireJsonContentType,
  validate(inventoryItemIdParamsSchema, 'params'),
  validate(createInventoryMovementSchema),
  asyncHandler(inventoryController.createInventoryMovement),
);
router.get(
  '/:id/movements',
  validate(inventoryItemIdParamsSchema, 'params'),
  validate(inventoryMovementListQuerySchema, 'query'),
  asyncHandler(inventoryController.listInventoryMovements),
);
router.patch(
  '/:id/archive',
  allowRoles(USER_ROLES.ATHLETE),
  requireJsonContentType,
  validate(inventoryItemIdParamsSchema, 'params'),
  validate(archiveInventoryItemSchema),
  asyncHandler(inventoryController.archiveInventoryItem),
);
router.patch(
  '/:id',
  allowRoles(USER_ROLES.ATHLETE),
  requireJsonContentType,
  validate(inventoryItemIdParamsSchema, 'params'),
  validate(updateInventoryItemSchema),
  asyncHandler(inventoryController.updateInventoryItem),
);
router.get(
  '/:id',
  validate(inventoryItemIdParamsSchema, 'params'),
  asyncHandler(inventoryController.getInventoryItem),
);

module.exports = router;
