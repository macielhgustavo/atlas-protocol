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

module.exports = {
  hasPdfSignature,
  isPdfName,
  PDF_MIME_TYPE,
  sanitizeOriginalName,
};
