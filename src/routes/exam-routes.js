const express = require('express');

const USER_ROLES = require('../constants/user-roles');
const examController = require('../controllers/exam-controller');
const authMiddleware = require('../middlewares/auth-middleware');
const examDocumentUpload = require('../middlewares/exam-document-upload');
const parseExamMultipart = require('../middlewares/parse-exam-multipart');
const professionalApprovalMiddleware = require('../middlewares/professional-approval-middleware');
const requireJsonContentType = require('../middlewares/require-json-content-type');
const allowRoles = require('../middlewares/role-middleware');
const validate = require('../middlewares/validation-middleware');
const asyncHandler = require('../utils/async-handler');
const {
  archiveExamSchema,
  createExamSchema,
  examIdParamsSchema,
  examListQuerySchema,
  updateExamSchema,
} = require('../validators/exam-validators');

const router = express.Router();

router.use(authMiddleware);
router.use(allowRoles(USER_ROLES.PROFESSIONAL, USER_ROLES.ATHLETE));
router.use(professionalApprovalMiddleware);

router.post(
  '/',
  examDocumentUpload,
  parseExamMultipart,
  validate(createExamSchema),
  asyncHandler(examController.createExam),
);
router.get(
  '/',
  validate(examListQuerySchema, 'query'),
  asyncHandler(examController.listExams),
);
router.patch(
  '/:id/archive',
  requireJsonContentType,
  validate(examIdParamsSchema, 'params'),
  validate(archiveExamSchema),
  asyncHandler(examController.archiveExam),
);
router.patch(
  '/:id',
  requireJsonContentType,
  validate(examIdParamsSchema, 'params'),
  validate(updateExamSchema),
  asyncHandler(examController.updateExam),
);
router.get(
  '/:id',
  validate(examIdParamsSchema, 'params'),
  asyncHandler(examController.getExam),
);

module.exports = router;
