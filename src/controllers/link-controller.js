const linkService = require('../services/link-service');

async function createLink(request, response) {
  const link = await linkService.createLink(request.user, request.body);

  return response.status(201).json({
    success: true,
    data: link,
    message: 'Solicitação de vínculo criada com sucesso.',
  });
}

async function listLinks(request, response) {
  const { links, meta } = await linkService.listLinks(
    request.user,
    request.query,
  );

  return response.status(200).json({
    success: true,
    data: links,
    meta,
  });
}

async function getLink(request, response) {
  const link = await linkService.getLinkById(request.user, request.params.id);

  return response.status(200).json({
    success: true,
    data: link,
    message: 'Vínculo obtido com sucesso.',
  });
}

async function acceptLink(request, response) {
  const link = await linkService.acceptLink(request.user, request.params.id);

  return response.status(200).json({
    success: true,
    data: link,
    message: 'Vínculo aceito com sucesso.',
  });
}

async function rejectLink(request, response) {
  const link = await linkService.rejectLink(
    request.user,
    request.params.id,
    request.body,
  );

  return response.status(200).json({
    success: true,
    data: link,
    message: 'Solicitação de vínculo rejeitada com sucesso.',
  });
}

async function endLink(request, response) {
  const link = await linkService.endLink(
    request.user,
    request.params.id,
    request.body,
  );

  return response.status(200).json({
    success: true,
    data: link,
    message: 'Vínculo encerrado com sucesso.',
  });
}

module.exports = {
  acceptLink,
  createLink,
  endLink,
  getLink,
  listLinks,
  rejectLink,
};
