const MAX_ARRAY_LENGTH = 20;
const MAX_KEY_LENGTH = 50;
const MAX_PROPERTIES = 20;
const MAX_SERIALIZED_BYTES = 16 * 1024;
const MAX_STRING_LENGTH = 1000;

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateKey(key) {
  if (!key || key.length > MAX_KEY_LENGTH) {
    return `As chaves devem possuir entre 1 e ${MAX_KEY_LENGTH} caracteres.`;
  }
  if (
    key.startsWith('$') ||
    key.includes('.') ||
    key.includes('\0') ||
    FORBIDDEN_KEYS.has(key)
  ) {
    return `A chave "${key}" não é permitida.`;
  }
  return null;
}

function validateScalar(value) {
  if (value === null || typeof value === 'boolean') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? null
      : 'As respostas numéricas devem ser finitas.';
  }
  if (typeof value === 'string') {
    return value.length <= MAX_STRING_LENGTH
      ? null
      : `As respostas textuais devem possuir no máximo ${MAX_STRING_LENGTH} caracteres.`;
  }
  return 'Cada resposta deve ser um valor escalar ou um array de valores escalares.';
}

function validateValue(value) {
  if (!Array.isArray(value)) return validateScalar(value);
  if (value.length > MAX_ARRAY_LENGTH) {
    return `Os arrays de respostas devem possuir no máximo ${MAX_ARRAY_LENGTH} itens.`;
  }

  for (const item of value) {
    if (Array.isArray(item) || validateScalar(item)) {
      return 'Arrays de respostas devem conter somente valores escalares.';
    }
  }
  return null;
}

function validateResponses(responses) {
  if (!isPlainObject(responses)) {
    return 'responses deve ser um objeto JSON simples.';
  }

  const entries = Object.entries(responses);
  const ownKeys = Reflect.ownKeys(responses);
  if (
    ownKeys.length !== entries.length ||
    ownKeys.some((key) => typeof key !== 'string')
  ) {
    return 'responses deve possuir somente propriedades JSON enumeráveis.';
  }
  if (entries.length < 1 || entries.length > MAX_PROPERTIES) {
    return `responses deve possuir entre 1 e ${MAX_PROPERTIES} propriedades.`;
  }

  for (const [key, value] of entries) {
    const keyError = validateKey(key);
    if (keyError) return keyError;

    const valueError = validateValue(value);
    if (valueError) return valueError;
  }

  let serialized;
  try {
    serialized = JSON.stringify(responses);
  } catch {
    return 'responses deve ser serializável como JSON.';
  }

  if (
    serialized === undefined ||
    Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_BYTES
  ) {
    return `responses deve possuir no máximo ${MAX_SERIALIZED_BYTES} bytes.`;
  }

  return null;
}

function cloneResponses(responses) {
  const cloned = {};
  for (const [key, value] of Object.entries(responses || {})) {
    cloned[key] = Array.isArray(value) ? [...value] : value;
  }
  return cloned;
}

module.exports = {
  cloneResponses,
  MAX_ARRAY_LENGTH,
  MAX_KEY_LENGTH,
  MAX_PROPERTIES,
  MAX_SERIALIZED_BYTES,
  MAX_STRING_LENGTH,
  validateResponses,
};
