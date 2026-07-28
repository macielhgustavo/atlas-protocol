const checkInService = require('../services/check-in-service');

async function createCheckIn(request, response) {
  const checkIn = await checkInService.createCheckIn(request.user, request.body);

  return response.status(201).json({
    success: true,
    data: checkIn,
    message: 'Check-in criado com sucesso.',
  });
}

async function listCheckIns(request, response) {
  const { checkIns, meta } = await checkInService.listCheckIns(
    request.user,
    request.query,
  );

  return response.status(200).json({
    success: true,
    data: checkIns,
    meta,
  });
}

async function getCheckIn(request, response) {
  const checkIn = await checkInService.getCheckIn(
    request.user,
    request.params.id,
  );

  return response.status(200).json({
    success: true,
    data: checkIn,
    message: 'Check-in obtido com sucesso.',
  });
}

async function updateCheckIn(request, response) {
  const checkIn = await checkInService.updateCheckIn(
    request.user,
    request.params.id,
    request.body,
  );

  return response.status(200).json({
    success: true,
    data: checkIn,
    message: 'Check-in atualizado com sucesso.',
  });
}

async function submitCheckIn(request, response) {
  const checkIn = await checkInService.submitCheckIn(
    request.user,
    request.params.id,
  );

  return response.status(200).json({
    success: true,
    data: checkIn,
    message: 'Check-in enviado com sucesso.',
  });
}

async function reviewCheckIn(request, response) {
  const checkIn = await checkInService.reviewCheckIn(
    request.user,
    request.params.id,
    request.body,
  );

  return response.status(200).json({
    success: true,
    data: checkIn,
    message: 'Check-in revisado com sucesso.',
  });
}

module.exports = {
  createCheckIn,
  getCheckIn,
  listCheckIns,
  reviewCheckIn,
  submitCheckIn,
  updateCheckIn,
};
