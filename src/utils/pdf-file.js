const path = require('path');

const PDF_MIME_TYPE = 'application/pdf';
const PDF_SIGNATURE = Buffer.from('%PDF-');

function isPdfName(originalName) {
  return path.extname(String(originalName || '')).toLowerCase() === '.pdf';
}

function hasPdfSignature(buffer) {
  return Boolean(
    Buffer.isBuffer(buffer) &&
      buffer.length >= PDF_SIGNATURE.length &&
      buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE),
  );
}

function sanitizeOriginalName(originalName) {
  const baseName = String(originalName || '')
    .replace(/^.*[\\/]/, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

  return (baseName || 'document.pdf').slice(0, 255);
}

function encodeContentDispositionValue(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildPdfContentDisposition(originalName) {
  const safeName = sanitizeOriginalName(originalName);
  const fallbackName =
    safeName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_') || 'document.pdf';
  const encodedName = encodeContentDispositionValue(safeName);

  return `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
}

module.exports = {
  buildPdfContentDisposition,
  hasPdfSignature,
  isPdfName,
  PDF_MIME_TYPE,
  sanitizeOriginalName,
};
