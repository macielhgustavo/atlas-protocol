const dotenv = require('dotenv');
const Joi = require('joi');

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
    CORS_ORIGINS: Joi.string()
  .trim()
  .default('http://localhost:4200'),
  PORT: Joi.number().port().default(3000),
  MONGODB_URI: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  PROFESSIONAL_DOCUMENT_MAX_BYTES: Joi.number()
    .integer()
    .min(1024)
    .max(50 * 1024 * 1024)
    .default(5 * 1024 * 1024),
  EXAM_DOCUMENT_MAX_BYTES: Joi.number()
    .integer()
    .min(1024)
    .max(50 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  STORAGE_LOCAL_ROOT: Joi.string().trim().min(1).default('.storage'),
}).unknown(true);

const { error, value } = envSchema.validate(process.env, {
  abortEarly: false,
  convert: true,
});

if (error) {
  const details = error.details.map((detail) => detail.message).join('; ');
  throw new Error(`Variáveis de ambiente inválidas: ${details}`);
}

module.exports = Object.freeze({
  nodeEnv: value.NODE_ENV,
  port: value.PORT,
  mongodbUri: value.MONGODB_URI,
  corsOrigins: value.CORS_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean),
  jwtSecret: value.JWT_SECRET,
  jwtExpiresIn: value.JWT_EXPIRES_IN,
  bcryptSaltRounds: value.BCRYPT_SALT_ROUNDS,
  professionalDocumentMaxBytes: value.PROFESSIONAL_DOCUMENT_MAX_BYTES,
  examDocumentMaxBytes: value.EXAM_DOCUMENT_MAX_BYTES,
  storageLocalRoot: value.STORAGE_LOCAL_ROOT,
});
