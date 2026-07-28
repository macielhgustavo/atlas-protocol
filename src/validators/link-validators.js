const Joi = require('joi');

const LINK_STATUSES = require('../constants/link-statuses');

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({
    'string.pattern.base': 'Informe um ObjectId válido.',
  });

const reason = Joi.string().trim().min(1).max(500).messages({
  'string.empty': 'Informe um motivo válido.',
  'string.max': 'O motivo deve possuir no máximo 500 caracteres.',
  'string.min': 'Informe um motivo válido.',
});

const createLinkSchema = Joi.object({
  athleteEmail: Joi.string()
    .trim()
    .lowercase()
    .email()
    .max(254)
    .required()
    .messages({
      'any.required': 'Informe o e-mail do atleta.',
      'string.email': 'Informe um e-mail válido.',
      'string.empty': 'Informe o e-mail do atleta.',
      'string.max': 'O e-mail deve possuir no máximo 254 caracteres.',
    }),
}).unknown(false);

const linkIdParamsSchema = Joi.object({
  id: objectId.required().messages({
    'any.required': 'Informe o vínculo.',
    'string.pattern.base': 'Informe um identificador de vínculo válido.',
  }),
}).unknown(false);

const linkListQuerySchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(LINK_STATUSES))
    .messages({
      'any.only': 'Informe um status válido.',
    }),
  professionalId: objectId,
  athleteId: objectId,
  page: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'A página deve ser um número.',
    'number.integer': 'A página deve ser um número inteiro.',
    'number.min': 'A página deve ser maior ou igual a 1.',
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    'number.base': 'O limite deve ser um número.',
    'number.integer': 'O limite deve ser um número inteiro.',
    'number.max': 'O limite deve ser menor ou igual a 100.',
    'number.min': 'O limite deve ser maior ou igual a 1.',
  }),
  sortBy: Joi.string()
    .valid('createdAt', 'requestedAt')
    .default('createdAt')
    .messages({
      'any.only': 'A ordenação deve usar createdAt ou requestedAt.',
    }),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc').messages({
    'any.only': 'A direção da ordenação deve ser asc ou desc.',
  }),
}).unknown(false);

const emptyLinkActionSchema = Joi.object({}).unknown(false);

const rejectLinkSchema = Joi.object({
  reason,
}).unknown(false);

const endLinkSchema = Joi.object({
  reason,
}).unknown(false);

module.exports = {
  createLinkSchema,
  emptyLinkActionSchema,
  endLinkSchema,
  linkIdParamsSchema,
  linkListQuerySchema,
  rejectLinkSchema,
};
