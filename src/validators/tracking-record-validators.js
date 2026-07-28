const Joi = require('joi');

const TRACKING_RECORD_STATUSES = require('../constants/tracking-record-statuses');
const TRACKING_RECORD_TYPES = require('../constants/tracking-record-types');

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({ 'string.pattern.base': 'Informe um ObjectId válido.' });

const nullableNotes = Joi.string().trim().max(2000).allow(null, '');

const createTrackingRecordSchema = Joi.object({
  athleteId: objectId,
  protocolId: objectId.allow(null),
  type: Joi.string()
    .valid(...Object.values(TRACKING_RECORD_TYPES))
    .required()
    .messages({
      'any.required': 'Informe o tipo.',
      'any.only': 'Informe um tipo válido.',
    }),
  title: Joi.string().trim().min(3).max(160).required().messages({
    'any.required': 'Informe o título.',
    'string.empty': 'Informe o título.',
  }),
  scheduledFor: Joi.date().iso().required().messages({
    'any.required': 'Informe a data agendada.',
  }),
  notes: nullableNotes,
}).unknown(false);

const trackingRecordListQuerySchema = Joi.object({
  athleteId: objectId,
  protocolId: objectId,
  status: Joi.string().valid(...Object.values(TRACKING_RECORD_STATUSES)),
  type: Joi.string().valid(...Object.values(TRACKING_RECORD_TYPES)),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid('scheduledFor', 'createdAt')
    .default('scheduledFor'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
})
  .custom((value, helpers) => {
    if (
      value.dateFrom &&
      value.dateTo &&
      value.dateTo < value.dateFrom
    ) {
      return helpers.error('query.invalidDateRange');
    }
    return value;
  })
  .messages({
    'query.invalidDateRange': 'dateTo não pode ser anterior a dateFrom.',
  })
  .unknown(false);

const trackingRecordIdParamsSchema = Joi.object({
  id: objectId.required().messages({
    'any.required': 'Informe o registro de acompanhamento.',
  }),
}).unknown(false);

const transitionTrackingRecordSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(TRACKING_RECORD_STATUSES))
    .required()
    .messages({
      'any.required': 'Informe o status.',
      'any.only': 'Informe um status válido.',
    }),
  completedAt: Joi.when('status', {
    is: TRACKING_RECORD_STATUSES.COMPLETED,
    then: Joi.date().iso(),
    otherwise: Joi.forbidden(),
  }),
  notes: Joi.when('status', {
    is: TRACKING_RECORD_STATUSES.COMPLETED,
    then: nullableNotes,
    otherwise: Joi.forbidden(),
  }),
  reason: Joi.when('status', {
    is: Joi.valid(
      TRACKING_RECORD_STATUSES.MISSED,
      TRACKING_RECORD_STATUSES.CANCELLED,
    ),
    then: Joi.string().trim().min(1).max(500).required().messages({
      'any.required': 'Informe o motivo.',
      'string.empty': 'Informe o motivo.',
    }),
    otherwise: Joi.forbidden(),
  }),
}).unknown(false);

const correctTrackingRecordSchema = Joi.object({
  notes: nullableNotes.required().messages({
    'any.required': 'Informe as observações corrigidas.',
  }),
  reason: Joi.string().trim().min(1).max(500).required().messages({
    'any.required': 'Informe o motivo da correção.',
    'string.empty': 'Informe o motivo da correção.',
  }),
}).unknown(false);

module.exports = {
  correctTrackingRecordSchema,
  createTrackingRecordSchema,
  trackingRecordIdParamsSchema,
  trackingRecordListQuerySchema,
  transitionTrackingRecordSchema,
};
