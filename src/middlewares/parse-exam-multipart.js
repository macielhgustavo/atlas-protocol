const ERROR_CODES = require('../constants/error-codes');
const AppError = require('../utils/app-error');

function validationError(message) {
  return new AppError(
    400,
    ERROR_CODES.VALIDATION_ERROR,
    'Dados inválidos.',
    [{ field: 'results', message }],
  );
}

function parseExamMultipart(request, _response, next) {
  if (!request.is('multipart/form-data')) return next();

  if (request.body.results === undefined) {
    request.body.results = [];
    return next();
  }
  if (typeof request.body.results !== 'string') {
    return next(validationError('Envie results uma única vez como JSON.'));
  }

  try {
    const results = JSON.parse(request.body.results);
    if (!Array.isArray(results)) {
      return next(validationError('results deve ser um array JSON.'));
    }
    request.body.results = results;
    return next();
  } catch {
    return next(validationError('results deve conter JSON válido.'));
  }
}

module.exports = parseExamMultipart;
