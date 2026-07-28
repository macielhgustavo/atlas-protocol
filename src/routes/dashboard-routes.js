const express = require('express');

const dashboardController = require('../controllers/dashboard-controller');
const authMiddleware = require('../middlewares/auth-middleware');
const validate = require('../middlewares/validation-middleware');
const asyncHandler = require('../utils/async-handler');
const {
  dashboardQuerySchema,
} = require('../validators/dashboard-validators');

const router = express.Router();

router.get(
  '/',
  authMiddleware,
  validate(dashboardQuerySchema, 'query'),
  asyncHandler(dashboardController.getDashboard),
);

module.exports = router;
