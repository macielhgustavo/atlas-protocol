const Joi = require('joi');

const PROTOCOL_FREQUENCY_TYPES = require('../constants/protocol-frequency-types');
const PROTOCOL_STATUSES = require('../constants/protocol-statuses');

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({ 'string.pattern.base': 'Informe um ObjectId válido.' });

const nullableDate = Joi.date().iso().allow(null);

const protocolItemSchema = Joi.object({
  substanceId: objectId.required().messages({
    'any.required': 'Informe a substância.',
  }),
  instructions: Joi.string().trim().max(1000).allow(null, ''),
  frequencyType: Joi.string()
    .valid(...Object.values(PROTOCOL_FREQUENCY_TYPES))
    .required(),
  weekDays: Joi.array()
    .items(Joi.number().integer().min(1).max(7))
    .unique()
    .default([]),
  time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .allow(null),
  startDate: nullableDate,
  endDate: nullableDate,
  active: Joi.boolean().default(true),
})
  .custom((value, helpers) => {
    if (
      value.frequencyType === PROTOCOL_FREQUENCY_TYPES.WEEKLY &&
      value.weekDays.length === 0
    ) {
      return helpers.error('item.weekDaysRequired');
    }
    if (
      value.frequencyType !== PROTOCOL_FREQUENCY_TYPES.WEEKLY &&
      value.weekDays.length > 0
    ) {
      return helpers.error('item.weekDaysNotAllowed');
    }
    if (
      value.startDate &&
      value.endDate &&
      new Date(value.endDate) < new Date(value.startDate)
    ) {
      return helpers.error('item.invalidDateRange');
    }
    return value;
  })
  .messages({
    'item.weekDaysRequired':
      'Informe ao menos um dia da semana para frequência semanal.',
    'item.weekDaysNotAllowed':
      'weekDays deve estar vazio para frequências não semanais.',
    'item.invalidDateRange':
      'A data final do item não pode ser anterior à data inicial.',
  })
  .unknown(false);

function validateProtocolDates(value, helpers) {
  if (
    value.startDate &&
    value.endDate &&
    new Date(value.endDate) < new Date(value.startDate)
  ) {
    return helpers.error('protocol.invalidDateRange');
  }
  if (value.continuous === false && value.endDate === null) {
    return helpers.error('protocol.endDateRequired');
  }
  return value;
}

const versionFields = {
  startDate: Joi.date().iso(),
  endDate: nullableDate,
  continuous: Joi.boolean(),
  items: Joi.array().items(protocolItemSchema).max(100),
};

const protocolFields = {
  title: Joi.string().trim().min(3).max(160),
  objective: Joi.string().trim().max(1000).allow(null, ''),
  ...versionFields,
};

const protocolDateMessages = {
  'protocol.endDateRequired':
    'Informe endDate quando o protocolo não for contínuo.',
  'protocol.invalidDateRange':
    'A data final não pode ser anterior à data inicial.',
};

const createProtocolSchema = Joi.object({
  athleteId: objectId.required().messages({
    'any.required': 'Informe o atleta.',
  }),
  title: protocolFields.title.required(),
  objective: protocolFields.objective,
  startDate: protocolFields.startDate.required(),
  endDate: protocolFields.endDate.default(null),
  continuous: protocolFields.continuous.default(false),
  items: protocolFields.items.default([]),
})
  .custom(validateProtocolDates)
  .messages(protocolDateMessages)
  .unknown(false);

const updateProtocolSchema = Joi.object({
  ...protocolFields,
})
  .min(1)
  .custom(validateProtocolDates)
  .messages({
    ...protocolDateMessages,
    'object.min': 'Informe ao menos um campo para atualização.',
  })
  .unknown(false);

const createProtocolVersionSchema = Joi.object({
  ...versionFields,
  changeReason: Joi.string().trim().max(500).allow(null),
})
  .or('startDate', 'endDate', 'continuous', 'items')
  .custom(validateProtocolDates)
  .messages({
    ...protocolDateMessages,
    'object.missing': 'Informe ao menos uma alteração material.',
  })
  .unknown(false);

const protocolStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(PROTOCOL_STATUSES))
    .required()
    .messages({ 'any.required': 'Informe o novo status.' }),
  reason: Joi.string().trim().max(500).allow(null),
}).unknown(false);

const protocolIdParamsSchema = Joi.object({
  id: objectId.required().messages({ 'any.required': 'Informe o protocolo.' }),
}).unknown(false);

const protocolVersionParamsSchema = Joi.object({
  id: objectId.required().messages({ 'any.required': 'Informe o protocolo.' }),
  version: Joi.number().integer().min(1).required().messages({
    'any.required': 'Informe o número da versão.',
    'number.base': 'Informe um número de versão válido.',
  }),
}).unknown(false);

const protocolListQuerySchema = Joi.object({
  status: Joi.string().valid(...Object.values(PROTOCOL_STATUSES)),
  athleteId: objectId,
  professionalId: objectId,
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid('createdAt', 'updatedAt', 'startDate', 'status')
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
})
  .custom((value, helpers) => {
    if (
      value.dateFrom &&
      value.dateTo &&
      new Date(value.dateTo) < new Date(value.dateFrom)
    ) {
      return helpers.error('query.invalidDateRange');
    }
    return value;
  })
  .messages({
    'query.invalidDateRange': 'dateTo não pode ser anterior a dateFrom.',
  })
  .unknown(false);

module.exports = {
  createProtocolVersionSchema,
  createProtocolSchema,
  protocolIdParamsSchema,
  protocolListQuerySchema,
  protocolStatusSchema,
  protocolVersionParamsSchema,
  updateProtocolSchema,
};
