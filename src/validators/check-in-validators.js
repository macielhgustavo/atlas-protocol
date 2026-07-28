const Joi = require('joi');

const CHECK_IN_STATUSES = require('../constants/check-in-statuses');
const { validateResponses } = require('../utils/check-in-responses');

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({
    'string.pattern.base': 'Informe um ObjectId válido.',
  });

const responsesSchema = Joi.object()
  .unknown(true)
  .custom((value, helpers) => {
    const validationMessage = validateResponses(value);
    if (validationMessage) {
      return helpers.message({ custom: validationMessage });
    }
    return value;
  }, 'contrato de responses')
  .required()
  .messages({
    'any.required': 'Informe responses.',
    'object.base': 'responses deve ser um objeto JSON simples.',
  });

const createCheckInSchema = Joi.object({
  protocolId: objectId.allow(null),
  professionalId: objectId,
  referenceWeek: Joi.date().iso().raw().required().messages({
    'any.required': 'Informe a semana de referência.',
  }),
  responses: responsesSchema,
}).unknown(false);

const updateCheckInSchema = Joi.object({
  responses: responsesSchema,
}).unknown(false);

const submitCheckInSchema = Joi.object({}).unknown(false);

const reviewCheckInSchema = Joi.object({
  reviewComment: Joi.string().trim().min(1).max(2000).required().messages({
    'any.required': 'Informe o comentário da revisão.',
    'string.empty': 'Informe o comentário da revisão.',
    'string.max':
      'O comentário da revisão deve possuir no máximo 2000 caracteres.',
    'string.min': 'Informe o comentário da revisão.',
  }),
}).unknown(false);

const checkInIdParamsSchema = Joi.object({
  id: objectId.required().messages({
    'any.required': 'Informe o check-in.',
    'string.pattern.base': 'Informe um identificador de check-in válido.',
  }),
}).unknown(false);

const checkInListQuerySchema = Joi.object({
  athleteId: objectId,
  protocolId: objectId,
  status: Joi.string().valid(...Object.values(CHECK_IN_STATUSES)),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid('referenceWeek', 'createdAt', 'submittedAt')
    .default('referenceWeek'),
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
  checkInIdParamsSchema,
  checkInListQuerySchema,
  createCheckInSchema,
  responsesSchema,
  reviewCheckInSchema,
  submitCheckInSchema,
  updateCheckInSchema,
};
