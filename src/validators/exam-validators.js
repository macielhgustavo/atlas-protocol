const Joi = require('joi');

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({ 'string.pattern.base': 'Informe um ObjectId válido.' });

const nullableText = (max) =>
  Joi.string().trim().min(1).max(max).allow(null).empty('').default(null);

const resultSchema = Joi.object({
  marker: Joi.string().trim().min(1).max(160).required(),
  value: Joi.string().trim().min(1).max(160).required(),
  unit: nullableText(80),
  referenceRange: nullableText(240),
}).unknown(false);

const fields = {
  title: Joi.string().trim().min(1).max(160),
  examDate: Joi.date().iso(),
  laboratory: nullableText(160),
  notes: nullableText(2000),
  results: Joi.array().items(resultSchema).max(100),
};

const createExamSchema = Joi.object({
  athleteId: objectId,
  ...fields,
  title: fields.title.required(),
  examDate: fields.examDate.required(),
  results: fields.results.default([]),
}).unknown(false);

const updateExamSchema = Joi.object(fields).min(1).unknown(false);

const archiveExamSchema = Joi.object({}).unknown(false);

const examIdParamsSchema = Joi.object({
  id: objectId.required(),
}).unknown(false);

const examListQuerySchema = Joi.object({
  athleteId: objectId,
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  archived: Joi.boolean().default(false),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('examDate', 'createdAt').default('examDate'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
})
  .custom((value, helpers) => {
    if (value.dateFrom && value.dateTo && value.dateTo < value.dateFrom) {
      return helpers.error('query.invalidDateRange');
    }
    return value;
  })
  .messages({
    'query.invalidDateRange': 'dateTo não pode ser anterior a dateFrom.',
  })
  .unknown(false);

module.exports = {
  archiveExamSchema,
  createExamSchema,
  examIdParamsSchema,
  examListQuerySchema,
  updateExamSchema,
};
