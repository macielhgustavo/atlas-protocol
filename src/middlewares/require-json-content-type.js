const ERROR_CODES = require('../constants/error-codes');
const AppError = require('../utils/app-error');

function requireJsonContentType(request, _response, next) {
  if (request.is('application/json')) return next();

  return next(
    new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Dados inválidos.',
      [{ field: 'content-type', message: 'Use application/json.' }],
    ),
  );
}

module.exports = requireJsonContentType;
