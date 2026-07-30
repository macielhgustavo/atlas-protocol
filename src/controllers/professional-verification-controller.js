const professionalVerificationService = require('../services/professional-verification-service');
const {
  buildPdfContentDisposition,
  PDF_MIME_TYPE,
} = require('../utils/pdf-file');

async function listProfessionalVerifications(request, response) {
  const { verifications, meta } =
    await professionalVerificationService.listProfessionalVerifications(
      request.query,
    );

  return response.status(200).json({
    success: true,
    data: verifications,
    meta,
  });
}

async function getOwnProfessionalVerification(request, response) {
  const verification =
    await professionalVerificationService.getOwnProfessionalVerification(
      request.user.id,
    );

  return response.status(200).json({
    success: true,
    data: { verification },
    message: 'Verificação profissional obtida com sucesso.',
  });
}

async function getProfessionalVerification(request, response) {
  const verification =
    await professionalVerificationService.getProfessionalVerificationById(
      request.params.id,
    );

  return response.status(200).json({
    success: true,
    data: { verification },
    message: 'Verificação profissional obtida com sucesso.',
  });
}

async function getProfessionalVerificationDocument(request, response) {
  const document =
    await professionalVerificationService.getProfessionalVerificationDocument(
      request.user,
      request.params.id,
    );
  response.setHeader('Content-Type', PDF_MIME_TYPE);
  response.setHeader(
    'Content-Disposition',
    buildPdfContentDisposition(document.originalName),
  );
  response.setHeader('Content-Length', document.buffer.length);
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(200).send(document.buffer);
}

async function approveProfessionalVerification(request, response) {
  const verification =
    await professionalVerificationService.approveProfessionalVerification(
      request.params.id,
      request.user.id,
    );

  return response.status(200).json({
    success: true,
    data: { verification },
    message: 'Profissional aprovado com sucesso.',
  });
}

async function rejectProfessionalVerification(request, response) {
  const verification =
    await professionalVerificationService.rejectProfessionalVerification(
      request.params.id,
      request.user.id,
      request.body.reason,
    );

  return response.status(200).json({
    success: true,
    data: { verification },
    message: 'Profissional rejeitado com sucesso.',
  });
}

module.exports = {
  approveProfessionalVerification,
  getOwnProfessionalVerification,
  getProfessionalVerification,
  getProfessionalVerificationDocument,
  listProfessionalVerifications,
  rejectProfessionalVerification,
};
