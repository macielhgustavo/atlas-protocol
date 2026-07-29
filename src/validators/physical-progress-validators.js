const Joi = require('joi');

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({ 'string.pattern.base': 'Informe um ObjectId válido.' });

const preciseNumber = (max) =>
  Joi.number().strict().min(0).max(max).precision(3).allow(null);

const nullableNotes = Joi.string().trim().min(1).max(2000).allow(null).empty('');
const updateNotes = Joi.string().trim().max(2000).allow('', null);

const measurementFields = {
  chestCm: preciseNumber(1000),
  waistCm: preciseNumber(1000),
  armCm: preciseNumber(1000),
  thighCm: preciseNumber(1000),
  calfCm: preciseNumber(1000),
};

const measurementFieldNames = new Set(Object.keys(measurementFields));

function normalizedMeasurements(value, helpers, withDefaults) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return helpers.error('measurements.object');
  }

  const keys = Object.keys(value);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string')
  ) {
    return helpers.error('measurements.object');
  }
  if (!withDefaults && keys.length === 0) {
    return helpers.error('measurements.empty');
  }
  if (keys.some((field) => !measurementFieldNames.has(field))) {
    return helpers.error('measurements.unknown');
  }

  for (const field of keys) {
    const result = measurementFields[field].validate(value[field]);
    if (result.error) return helpers.error('measurements.value');
  }

  const normalized = withDefaults
    ? Object.fromEntries([...measurementFieldNames].map((field) => [field, null]))
    : {};
  for (const field of keys) normalized[field] = value[field];
  return normalized;
}

const createMeasurementsSchema = Joi.any()
  .custom((value, helpers) => normalizedMeasurements(value, helpers, true))
  .messages({
    'measurements.object': 'Measurements deve ser um objeto JSON simples.',
    'measurements.unknown': 'Measurements contém uma propriedade não permitida.',
    'measurements.value': 'Measurements contém um valor inválido.',
  })
  .default(
    Object.fromEntries([...measurementFieldNames].map((field) => [field, null])),
  );

const updateMeasurementsSchema = Joi.any()
  .custom((value, helpers) => normalizedMeasurements(value, helpers, false))
  .messages({
    'measurements.empty': 'Informe ao menos uma medida.',
    'measurements.object': 'Measurements deve ser um objeto JSON simples.',
    'measurements.unknown': 'Measurements contém uma propriedade não permitida.',
    'measurements.value': 'Measurements contém um valor inválido.',
  });

function hasMeaningfulContent(value) {
  return (
    value.weightKg !== null ||
    value.bodyFatPercent !== null ||
    Object.values(value.measurements || {}).some((item) => item !== null) ||
    value.notes !== null
  );
}

const createPhysicalProgressSchema = Joi.object({
  athleteId: objectId,
  referenceDate: Joi.date().iso().required(),
  weightKg: preciseNumber(1000).default(null),
  bodyFatPercent: preciseNumber(100).default(null),
  measurements: createMeasurementsSchema,
  notes: nullableNotes.default(null),
})
  .custom((value, helpers) =>
    hasMeaningfulContent(value)
      ? value
      : helpers.error('progress.meaningfulContent'),
  )
  .messages({
    'progress.meaningfulContent':
      'Informe ao menos um dado de evolução ou observação.',
  })
  .unknown(false);

const updatePhysicalProgressSchema = Joi.object({
  referenceDate: Joi.date().iso(),
  weightKg: preciseNumber(1000),
  bodyFatPercent: preciseNumber(100),
  measurements: updateMeasurementsSchema,
  notes: updateNotes,
})
  .min(1)
  .custom((value) => {
    if (
      Object.prototype.hasOwnProperty.call(value, 'notes') &&
      value.notes === ''
    ) {
      value.notes = null;
    }
    return value;
  })
  .unknown(false);

const archivePhysicalProgressSchema = Joi.object({}).unknown(false);

const physicalProgressIdParamsSchema = Joi.object({
  id: objectId.required(),
}).unknown(false);

const physicalProgressListQuerySchema = Joi.object({
  athleteId: objectId,
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  archived: Joi.boolean().default(false),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid('referenceDate', 'createdAt')
    .default('referenceDate'),
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
  archivePhysicalProgressSchema,
  createPhysicalProgressSchema,
  physicalProgressIdParamsSchema,
  physicalProgressListQuerySchema,
  updatePhysicalProgressSchema,
};
