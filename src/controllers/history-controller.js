const historyService = require('../services/history-service');

async function listHistory(request, response) {
  const { events, meta } = await historyService.listHistory(
    request.user,
    request.query,
  );
  return response.status(200).json({
    success: true,
    data: events,
    meta,
  });
}

module.exports = { listHistory };
