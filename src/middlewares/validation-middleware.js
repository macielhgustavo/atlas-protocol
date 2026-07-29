const ERROR_CODES = require('../constants/error-codes');
const AppError = require('../utils/app-error');

const DANGEROUS_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

function findDangerousKey(value, path = []) {
  if (
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  ) {
    return null;
  }

  for (const key of Object.keys(value)) {
    const fieldPath = [...path, key];
    if (
      DANGEROUS_KEYS.has(key) ||
      key.startsWith('$') ||
      key.includes('.') ||
      key.includes('\0')
    ) {
      return fieldPath.join('.');
    }
    const nested = findDangerousKey(value[key], fieldPath);
    if (nested) return nested;
  }
  return null;
}

function validate(schema, property = 'body') {
  return (request, _response, next) => {
    const dangerousField = findDangerousKey(request[property]);
    if (dangerousField) {
      return next(
        new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Dados inválidos.',
          [{
            field: dangerousField,
            message: `O campo ${dangerousField} não é permitido.`,
          }],
        ),
      );
    }

    const { error, value } = schema.validate(request[property], {
      abortEarly: false,
      stripUnknown: false,
    });

    if (error) {
      const fields = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message:
          detail.type === 'object.unknown'
            ? `O campo ${detail.path.join('.')} não é permitido.`
            : detail.message,
      }));
      const invalidObjectId = error.details.some(
        (detail) =>
          detail.type === 'string.pattern.base' &&
          /(^id$|Id$)/.test(String(detail.path.at(-1))),
      );

      return next(
        new AppError(
          400,
          invalidObjectId
            ? ERROR_CODES.INVALID_OBJECT_ID
            : ERROR_CODES.VALIDATION_ERROR,
          invalidObjectId ? 'Identificador inválido.' : 'Dados inválidos.',
          fields,
        ),
      );
    }

    request[property] = value;
    return next();
  };
}

module.exports = validate;
module.exports.findDangerousKey = findDangerousKey;
