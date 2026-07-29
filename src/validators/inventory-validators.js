const Joi = require('joi');

const INVENTORY_MOVEMENT_TYPES = require(
  '../constants/inventory-movement-types',
);
const INVENTORY_UNITS = require('../constants/inventory-units');

const MAX_QUANTITY = 1_000_000_000;

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({ 'string.pattern.base': 'Informe um ObjectId válido.' });

const quantity = Joi.number()
  .strict()
  .min(0)
  .max(MAX_QUANTITY)
  .precision(3);

function queryBoolean(defaultValue) {
  const schema = Joi.any().custom((value, helpers) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return helpers.error('boolean.base');
  });
  return defaultValue === undefined ? schema : schema.default(defaultValue);
}

const createInventoryItemSchema = Joi.object({
  substanceId: objectId.allow(null).default(null),
  name: Joi.string().trim().min(1).max(160).required(),
  unit: Joi.string()
    .valid(...Object.values(INVENTORY_UNITS))
    .required(),
  quantity: quantity.required(),
  lowStockThreshold: quantity.allow(null).default(null),
  expirationDate: Joi.date().iso().allow(null).default(null),
}).unknown(false);

const updateInventoryItemSchema = Joi.object({
  substanceId: objectId.allow(null),
  name: Joi.string().trim().min(1).max(160),
  unit: Joi.string().valid(...Object.values(INVENTORY_UNITS)),
  lowStockThreshold: quantity.allow(null),
  expirationDate: Joi.date().iso().allow(null),
})
  .min(1)
  .unknown(false);

const archiveInventoryItemSchema = Joi.object({}).unknown(false);

const inventoryItemIdParamsSchema = Joi.object({
  id: objectId.required(),
}).unknown(false);

const inventoryListQuerySchema = Joi.object({
  athleteId: objectId,
  search: Joi.string().trim().min(1).max(160),
  expired: queryBoolean(),
  lowStock: queryBoolean(),
  archived: queryBoolean(false),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid('name', 'quantity', 'expirationDate', 'createdAt', 'updatedAt')
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
}).unknown(false);

const createInventoryMovementSchema = Joi.object({
  type: Joi.string()
    .valid(...Object.values(INVENTORY_MOVEMENT_TYPES))
    .required(),
  quantity: quantity.required(),
  reason: Joi.string().trim().min(3).max(500).required(),
})
  .custom((value, helpers) => {
    if (
      value.type !== INVENTORY_MOVEMENT_TYPES.ADJUSTMENT &&
      value.quantity === 0
    ) {
      return helpers.error('movement.positiveQuantity');
    }
    return value;
  })
  .messages({
    'movement.positiveQuantity':
      'Entradas e saídas exigem quantidade positiva.',
  })
  .unknown(false);

const inventoryMovementListQuerySchema = Joi.object({
  type: Joi.string().valid(...Object.values(INVENTORY_MOVEMENT_TYPES)),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
})
  .custom((value, helpers) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      return helpers.error('query.invalidDateRange');
    }
    return value;
  })
  .messages({
    'query.invalidDateRange': 'dateFrom não pode ser posterior a dateTo.',
  })
  .unknown(false);

module.exports = {
  archiveInventoryItemSchema,
  createInventoryItemSchema,
  createInventoryMovementSchema,
  inventoryItemIdParamsSchema,
  inventoryListQuerySchema,
  inventoryMovementListQuerySchema,
  updateInventoryItemSchema,
};
