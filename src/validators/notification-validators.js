const Joi = require('joi');

const NOTIFICATION_ENTITY_TYPES = require(
  '../constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require('../constants/notification-types');

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({ 'string.pattern.base': 'Informe um ObjectId válido.' });

function queryBoolean(defaultValue) {
  const schema = Joi.any().custom((value, helpers) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return helpers.error('boolean.base');
  });
  return defaultValue === undefined ? schema : schema.default(defaultValue);
}

function noHtml(value, helpers) {
  if (/<[^>]*>/u.test(value)) return helpers.error('string.html');
  return value;
}

const notificationListQuerySchema = Joi.object({
  read: queryBoolean(),
  archived: queryBoolean(false),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
}).unknown(false);

const notificationIdParamsSchema = Joi.object({
  id: objectId.required(),
}).unknown(false);

const emptyNotificationBodySchema = Joi.object({}).unknown(false);

const internalNotificationSchema = Joi.object({
  userId: objectId.required(),
  type: Joi.string()
    .valid(...Object.values(NOTIFICATION_TYPES))
    .required(),
  title: Joi.string()
    .trim()
    .min(1)
    .max(160)
    .custom(noHtml)
    .messages({ 'string.html': 'O título não pode conter HTML.' })
    .required(),
  message: Joi.string()
    .trim()
    .min(1)
    .max(500)
    .custom(noHtml)
    .messages({ 'string.html': 'A mensagem não pode conter HTML.' })
    .required(),
  entityType: Joi.string()
    .valid(...Object.values(NOTIFICATION_ENTITY_TYPES))
    .allow(null)
    .default(null),
  entityId: objectId.allow(null).default(null),
})
  .custom((value, helpers) => {
    const hasEntityType = value.entityType !== null;
    const hasEntityId = value.entityId !== null;
    if (hasEntityType !== hasEntityId) {
      return helpers.error('notification.entityPair');
    }
    return value;
  })
  .messages({
    'notification.entityPair':
      'entityType e entityId devem ser informados em conjunto.',
  })
  .unknown(false);

module.exports = {
  emptyNotificationBodySchema,
  internalNotificationSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
};
