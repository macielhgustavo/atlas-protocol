const AUDIT_ACTIONS = require('../constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../constants/audit-entity-types');
const ERROR_CODES = require('../constants/error-codes');
const LINK_STATUSES = require('../constants/link-statuses');
const NOTIFICATION_ENTITY_TYPES = require(
  '../constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require('../constants/notification-types');
const USER_ROLES = require('../constants/user-roles');
const Exam = require('../models/exam');
const ProfessionalAthleteLink = require('../models/professional-athlete-link');
const storage = require('../storage');
const AppError = require('../utils/app-error');
const { toExamResponse } = require('../utils/exam-response');
const { sanitizeOriginalName } = require('../utils/pdf-file');
const auditService = require('./audit-service');
const notificationService = require('./notification-service');

function notFoundError() {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    'Exame não encontrado.',
  );
}

function documentNotFoundError() {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    'Documento do exame não encontrado.',
  );
}

function validationError(field, message) {
  return new AppError(
    400,
    ERROR_CODES.VALIDATION_ERROR,
    'Dados inválidos.',
    [{ field, message }],
  );
}

function linkRequiredError() {
  return new AppError(
    403,
    ERROR_CODES.ATHLETE_LINK_REQUIRED,
    'É necessário possuir vínculo ativo com o atleta.',
  );
}

function archivedError() {
  return new AppError(
    422,
    ERROR_CODES.INVALID_STATE_TRANSITION,
    'Exame arquivado não pode ser alterado.',
  );
}

function sameId(left, right) {
  return Boolean(left && right && left.toString() === right.toString());
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

async function hasActiveLink(professionalId, athleteId) {
  return ProfessionalAthleteLink.exists({
    professionalId,
    athleteId,
    status: LINK_STATUSES.ACTIVE,
  });
}

async function resolveCreationScope(requester, input) {
  if (requester.role === USER_ROLES.ATHLETE) {
    if (hasOwn(input, 'athleteId')) {
      throw validationError(
        'athleteId',
        'athleteId é derivado do usuário autenticado.',
      );
    }
    return { athleteId: requester.id, professionalId: null };
  }

  if (!input.athleteId) {
    throw validationError('athleteId', 'Informe o atleta.');
  }
  if (!(await hasActiveLink(requester.id, input.athleteId))) {
    throw linkRequiredError();
  }
  return { athleteId: input.athleteId, professionalId: requester.id };
}

async function createExam(requester, input, file) {
  const scope = await resolveCreationScope(requester, input);
  let exam;
  let storedDocument;

  try {
    if (file) storedDocument = await storage.store(file);

    exam = await Exam.create({
      ...scope,
      title: input.title,
      examDate: input.examDate,
      laboratory: input.laboratory,
      results: input.results,
      document: file
        ? {
            ...storedDocument,
            originalName: sanitizeOriginalName(file.originalname),
            mimeType: file.mimetype,
            sizeBytes: file.size,
          }
        : null,
      notes: input.notes,
      createdBy: requester.id,
    });

    await auditService.record({
      actorId: requester.id,
      action: AUDIT_ACTIONS.EXAM_CREATED,
      entityType: AUDIT_ENTITY_TYPES.EXAM,
      entityId: exam.id,
      metadata: {
        athleteId: exam.athleteId.toString(),
        createdWithDocument: Boolean(file),
        createdByRole: requester.role,
      },
    });
  } catch (error) {
    const cleanup = [];
    if (exam) cleanup.push(Exam.deleteOne({ _id: exam.id }));
    if (storedDocument) cleanup.push(storage.remove(storedDocument.storageKey));
    await Promise.allSettled(cleanup);
    throw error;
  }

  if (requester.role === USER_ROLES.PROFESSIONAL) {
    await notificationService.createNotificationFromTemplateSafely({
      userId: exam.athleteId,
      type: NOTIFICATION_TYPES.EXAM_CREATED,
      entityType: NOTIFICATION_ENTITY_TYPES.EXAM,
      entityId: exam.id,
    });
  }

  return toExamResponse(exam);
}

async function linkedAthleteIds(professionalId) {
  const links = await ProfessionalAthleteLink.find({
    professionalId,
    status: LINK_STATUSES.ACTIVE,
  }).select('athleteId');
  return links.map((link) => link.athleteId);
}

async function listExams(requester, query) {
  const filters = {
    archivedAt: query.archived ? { $ne: null } : null,
  };
  if (query.dateFrom || query.dateTo) {
    filters.examDate = {};
    if (query.dateFrom) filters.examDate.$gte = query.dateFrom;
    if (query.dateTo) filters.examDate.$lte = query.dateTo;
  }

  if (requester.role === USER_ROLES.ATHLETE) {
    filters.athleteId =
      query.athleteId && !sameId(query.athleteId, requester.id)
        ? { $in: [] }
        : requester.id;
  } else {
    const athleteIds = await linkedAthleteIds(requester.id);
    filters.athleteId = query.athleteId &&
      athleteIds.some((id) => sameId(id, query.athleteId))
      ? query.athleteId
      : query.athleteId
        ? { $in: [] }
        : { $in: athleteIds };
  }

  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.limit;
  const [exams, total] = await Promise.all([
    Exam.find(filters)
      .sort({ [query.sortBy]: direction, _id: direction })
      .skip(skip)
      .limit(query.limit),
    Exam.countDocuments(filters),
  ]);

  return {
    exams: exams.map(toExamResponse),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function getAccessibleExam(
  requester,
  examId,
  { includeStorageKey = false } = {},
) {
  let query = Exam.findById(examId);
  if (includeStorageKey) {
    query = query.select('+document.storageKey');
  }

  const exam = await query;
  if (!exam) throw notFoundError();

  if (requester.role === USER_ROLES.ATHLETE) {
    if (!sameId(exam.athleteId, requester.id)) throw notFoundError();
  } else if (!(await hasActiveLink(requester.id, exam.athleteId))) {
    throw notFoundError();
  }
  return exam;
}

async function getExam(requester, examId) {
  return toExamResponse(await getAccessibleExam(requester, examId));
}

async function getExamDocument(requester, examId) {
  const exam = await getAccessibleExam(requester, examId, {
    includeStorageKey: true,
  });
  if (!exam.document?.storageKey) throw documentNotFoundError();

  let buffer;
  try {
    buffer = await storage.read(exam.document.storageKey);
  } catch (error) {
    if (error instanceof TypeError) throw documentNotFoundError();
    throw error;
  }
  if (!buffer) throw documentNotFoundError();

  return {
    buffer,
    originalName: sanitizeOriginalName(exam.document.originalName),
  };
}

async function getMutableExam(requester, examId) {
  const exam = await getAccessibleExam(requester, examId);
  if (requester.role === USER_ROLES.PROFESSIONAL) {
    if (!exam.professionalId || !sameId(exam.professionalId, requester.id)) {
      throw notFoundError();
    }
  }
  return exam;
}

async function updateExam(requester, examId, input) {
  const exam = await getMutableExam(requester, examId);
  if (exam.archivedAt) throw archivedError();

  const updatedExam = await Exam.findOneAndUpdate(
    { _id: exam.id, archivedAt: null },
    { $set: input },
    { new: true, runValidators: true },
  );
  if (!updatedExam) throw archivedError();
  return toExamResponse(updatedExam);
}

async function archiveExam(requester, examId) {
  const exam = await getMutableExam(requester, examId);
  if (exam.archivedAt) return toExamResponse(exam);

  const archivedAt = new Date();
  const archivedExam = await Exam.findOneAndUpdate(
    { _id: exam.id, archivedAt: null },
    { $set: { archivedAt } },
    { new: true, runValidators: true },
  );

  if (!archivedExam) {
    const concurrentExam = await Exam.findById(exam.id);
    if (!concurrentExam) throw notFoundError();
    return toExamResponse(concurrentExam);
  }

  await auditService.record({
    actorId: requester.id,
    action: AUDIT_ACTIONS.EXAM_ARCHIVED,
    entityType: AUDIT_ENTITY_TYPES.EXAM,
    entityId: archivedExam.id,
    metadata: { athleteId: archivedExam.athleteId.toString() },
  });
  return toExamResponse(archivedExam);
}

module.exports = {
  archiveExam,
  createExam,
  getExam,
  getExamDocument,
  listExams,
  updateExam,
};
