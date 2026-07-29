const multer = require('multer');

const ERROR_CODES = require('../constants/error-codes');
const AppError = require('../utils/app-error');
const {
  hasPdfSignature,
  isPdfName,
  PDF_MIME_TYPE,
} = require('../utils/pdf-file');

function uploadError(code, message) {
  return new AppError(400, code, message);
}

function createPdfUpload({
  fieldName,
  maxBytes,
  required = false,
  requiredCode = ERROR_CODES.INVALID_UPLOAD_TYPE,
  label = 'documento',
}) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (file.mimetype !== PDF_MIME_TYPE || !isPdfName(file.originalname)) {
        return callback(
          uploadError(
            ERROR_CODES.INVALID_UPLOAD_TYPE,
            `O ${label} deve ser um arquivo PDF.`,
          ),
        );
      }
      return callback(null, true);
    },
  });

  return (request, response, next) => {
    upload.single(fieldName)(request, response, (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return next(
            uploadError(
              ERROR_CODES.UPLOAD_TOO_LARGE,
              `O ${label} excede o tamanho máximo permitido.`,
            ),
          );
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(
            uploadError(
              requiredCode,
              required
                ? `O ${label} é obrigatório.`
                : `Envie somente um PDF no campo ${fieldName}.`,
            ),
          );
        }
      }
      if (error) return next(error);
      if (!request.file && required) {
        return next(
          uploadError(requiredCode, `O ${label} é obrigatório.`),
        );
      }
      if (request.file && !hasPdfSignature(request.file.buffer)) {
        request.file = undefined;
        return next(
          uploadError(
            ERROR_CODES.INVALID_UPLOAD_TYPE,
            `O conteúdo do ${label} não corresponde a um PDF válido.`,
          ),
        );
      }
      return next();
    });
  };
}

module.exports = createPdfUpload;
