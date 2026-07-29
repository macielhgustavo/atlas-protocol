const Joi = require('joi');

const HISTORY_EVENT_TYPES = require('../constants/history-event-types');

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({ 'string.pattern.base': 'Informe um ObjectId válido.' });

const historyQuerySchema = Joi.object({
  athleteId: objectId,
  type: Joi.string().valid(...Object.values(HISTORY_EVENT_TYPES)),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
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

module.exports = { historyQuerySchema };
