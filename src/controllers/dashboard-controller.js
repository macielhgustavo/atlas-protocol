const dashboardService = require('../services/dashboard-service');

async function getDashboard(request, response) {
  const dashboard = await dashboardService.getDashboard(request.user);

  return response.status(200).json({
    success: true,
    data: dashboard,
  });
}

module.exports = { getDashboard };
