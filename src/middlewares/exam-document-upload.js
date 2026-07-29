const env = require('../config/env');
const createPdfUpload = require('./create-pdf-upload');

module.exports = createPdfUpload({
  fieldName: 'document',
  maxBytes: env.examDocumentMaxBytes,
  label: 'documento do exame',
});
