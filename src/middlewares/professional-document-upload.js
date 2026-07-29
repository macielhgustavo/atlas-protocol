const env = require('../config/env');
const ERROR_CODES = require('../constants/error-codes');
const createPdfUpload = require('./create-pdf-upload');

module.exports = createPdfUpload({
  fieldName: 'document',
  maxBytes: env.professionalDocumentMaxBytes,
  required: true,
  requiredCode: ERROR_CODES.PROFESSIONAL_VERIFICATION_REQUIRED,
  label: 'documento de comprovação',
});
