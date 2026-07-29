const physicalProgressService = require(
  '../services/physical-progress-service',
);

async function createPhysicalProgress(request, response) {
  const progress = await physicalProgressService.createPhysicalProgress(
    request.user,
    request.body,
  );
  return response.status(201).json({
    success: true,
    data: progress,
    message: 'Registro de evolução cadastrado com sucesso.',
  });
}

async function listPhysicalProgress(request, response) {
  const { progressRecords, meta } =
    await physicalProgressService.listPhysicalProgress(
      request.user,
      request.query,
    );
  return response.status(200).json({
    success: true,
    data: progressRecords,
    meta,
  });
}

async function getPhysicalProgress(request, response) {
  const progress = await physicalProgressService.getPhysicalProgress(
    request.user,
    request.params.id,
  );
  return response.status(200).json({
    success: true,
    data: progress,
    message: 'Registro de evolução obtido com sucesso.',
  });
}

async function updatePhysicalProgress(request, response) {
  const progress = await physicalProgressService.updatePhysicalProgress(
    request.user,
    request.params.id,
    request.body,
  );
  return response.status(200).json({
    success: true,
    data: progress,
    message: 'Registro de evolução atualizado com sucesso.',
  });
}

async function archivePhysicalProgress(request, response) {
  const progress = await physicalProgressService.archivePhysicalProgress(
    request.user,
    request.params.id,
  );
  return response.status(200).json({
    success: true,
    data: progress,
    message: 'Registro de evolução arquivado com sucesso.',
  });
}

module.exports = {
  archivePhysicalProgress,
  createPhysicalProgress,
  getPhysicalProgress,
  listPhysicalProgress,
  updatePhysicalProgress,
};
