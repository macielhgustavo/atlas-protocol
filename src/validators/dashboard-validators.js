const Joi = require('joi');

const dashboardQuerySchema = Joi.object({}).unknown(false);

module.exports = { dashboardQuerySchema };
