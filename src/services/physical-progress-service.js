const AUDIT_ACTIONS = require('../constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../constants/audit-entity-types');
const ERROR_CODES = require('../constants/error-codes');
const LINK_STATUSES = require('../constants/link-statuses');
const USER_ROLES = require('../constants/user-roles');
const PhysicalProgress = require('../models/physical-progress');
const ProfessionalAthleteLink = require('../models/professional-athlete-link');
const AppError = require('../utils/app-error');
const {
  MEASUREMENT_FIELDS,
  toMeasurementsResponse,
  toPhysicalProgressResponse,
} = require('../utils/physical-progress-response');
const auditService = require('./audit-service');

function notFoundError() {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    'Registro de evolução não encontrado.',
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
    'Registro de evolução arquivado não pode ser alterado.',
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

async function resolveCreationAthleteId(requester, input) {
  if (requester.role === USER_ROLES.ATHLETE) {
    if (hasOwn(input, 'athleteId')) {
      throw validationError(
        'athleteId',
        'athleteId é derivado do usuário autenticado.',
      );
    }
    return requester.id;
  }

  if (!input.athleteId) {
    throw validationError('athleteId', 'Informe o atleta.');
  }
  if (!(await hasActiveLink(requester.id, input.athleteId))) {
    throw linkRequiredError();
  }
  return input.athleteId;
}

function presentFieldGroups(input) {
  const fields = [];
  if (input.weightKg !== null) fields.push('weightKg');
  if (input.bodyFatPercent !== null) fields.push('bodyFatPercent');
  if (Object.values(input.measurements).some((value) => value !== null)) {
    fields.push('measurements');
  }
  if (input.notes !== null) fields.push('notes');
  return fields;
}

async function createPhysicalProgress(requester, input) {
  const athleteId = await resolveCreationAthleteId(requester, input);
  let progress;

  try {
    progress = await PhysicalProgress.create({
      athleteId,
      recordedBy: requester.id,
      referenceDate: input.referenceDate,
      weightKg: input.weightKg,
      bodyFatPercent: input.bodyFatPercent,
      measurements: input.measurements,
      notes: input.notes,
    });

    await auditService.record({
      actorId: requester.id,
      action: AUDIT_ACTIONS.PROGRESS_CREATED,
      entityType: AUDIT_ENTITY_TYPES.PHYSICAL_PROGRESS,
      entityId: progress.id,
      metadata: {
        athleteId: progress.athleteId.toString(),
        recordedByRole: requester.role,
        fieldsPresent: presentFieldGroups(input),
      },
    });
  } catch (error) {
    if (progress) await PhysicalProgress.deleteOne({ _id: progress.id });
    throw error;
  }

  return toPhysicalProgressResponse(progress);
}

async function linkedAthleteIds(professionalId) {
  const links = await ProfessionalAthleteLink.find({
    professionalId,
    status: LINK_STATUSES.ACTIVE,
  }).select('athleteId');
  return links.map((link) => link.athleteId);
}

async function listPhysicalProgress(requester, query) {
  const filters = {
    archivedAt: query.archived ? { $ne: null } : null,
  };
  if (query.dateFrom || query.dateTo) {
    filters.referenceDate = {};
    if (query.dateFrom) filters.referenceDate.$gte = query.dateFrom;
    if (query.dateTo) filters.referenceDate.$lte = query.dateTo;
  }

  if (requester.role === USER_ROLES.ATHLETE) {
    filters.athleteId =
      query.athleteId && !sameId(query.athleteId, requester.id)
        ? { $in: [] }
        : requester.id;
  } else {
    const athleteIds = await linkedAthleteIds(requester.id);
    filters.athleteId =
      query.athleteId &&
      athleteIds.some((athleteId) => sameId(athleteId, query.athleteId))
        ? query.athleteId
        : query.athleteId
          ? { $in: [] }
          : { $in: athleteIds };
  }

  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.limit;
  const [progressRecords, total] = await Promise.all([
    PhysicalProgress.find(filters)
      .sort({ [query.sortBy]: direction, _id: direction })
      .skip(skip)
      .limit(query.limit),
    PhysicalProgress.countDocuments(filters),
  ]);

  return {
    progressRecords: progressRecords.map(toPhysicalProgressResponse),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function getAccessiblePhysicalProgress(requester, progressId) {
  const progress = await PhysicalProgress.findById(progressId);
  if (!progress) throw notFoundError();

  if (requester.role === USER_ROLES.ATHLETE) {
    if (!sameId(progress.athleteId, requester.id)) throw notFoundError();
  } else if (!(await hasActiveLink(requester.id, progress.athleteId))) {
    throw notFoundError();
  }
  return progress;
}

async function getPhysicalProgress(requester, progressId) {
  const progress = await getAccessiblePhysicalProgress(requester, progressId);
  return toPhysicalProgressResponse(progress);
}

async function getMutablePhysicalProgress(requester, progressId) {
  const progress = await getAccessiblePhysicalProgress(requester, progressId);
  if (
    requester.role === USER_ROLES.PROFESSIONAL &&
    !sameId(progress.recordedBy, requester.id)
  ) {
    throw notFoundError();
  }
  return progress;
}

function mergeMeasurements(current, patch) {
  const merged = toMeasurementsResponse(current);
  for (const field of MEASUREMENT_FIELDS) {
    if (hasOwn(patch, field)) merged[field] = patch[field];
  }
  return merged;
}

function hasMeaningfulContent(progress) {
  return (
    progress.weightKg !== null ||
    progress.bodyFatPercent !== null ||
    Object.values(progress.measurements).some((value) => value !== null) ||
    progress.notes !== null
  );
}

async function updatePhysicalProgress(requester, progressId, input) {
  const progress = await getMutablePhysicalProgress(requester, progressId);
  if (progress.archivedAt) throw archivedError();

  const updates = { ...input };
  if (input.measurements) {
    updates.measurements = mergeMeasurements(
      progress.measurements,
      input.measurements,
    );
  }

  const finalState = {
    weightKg: hasOwn(updates, 'weightKg') ? updates.weightKg : progress.weightKg,
    bodyFatPercent: hasOwn(updates, 'bodyFatPercent')
      ? updates.bodyFatPercent
      : progress.bodyFatPercent,
    measurements: updates.measurements ||
      toMeasurementsResponse(progress.measurements),
    notes: hasOwn(updates, 'notes') ? updates.notes : progress.notes,
  };
  if (!hasMeaningfulContent(finalState)) {
    throw validationError(
      'body',
      'Informe ao menos um dado de evolução ou observação.',
    );
  }

  const updatedProgress = await PhysicalProgress.findOneAndUpdate(
    { _id: progress.id, archivedAt: null },
    { $set: updates },
    { new: true, runValidators: true },
  );
  if (!updatedProgress) throw archivedError();
  return toPhysicalProgressResponse(updatedProgress);
}

async function archivePhysicalProgress(requester, progressId) {
  const progress = await getMutablePhysicalProgress(requester, progressId);
  if (progress.archivedAt) return toPhysicalProgressResponse(progress);

  const archivedProgress = await PhysicalProgress.findOneAndUpdate(
    { _id: progress.id, archivedAt: null },
    { $set: { archivedAt: new Date() } },
    { new: true, runValidators: true },
  );

  if (!archivedProgress) {
    const concurrentProgress = await PhysicalProgress.findById(progress.id);
    if (!concurrentProgress) throw notFoundError();
    return toPhysicalProgressResponse(concurrentProgress);
  }

  await auditService.record({
    actorId: requester.id,
    action: AUDIT_ACTIONS.PROGRESS_ARCHIVED,
    entityType: AUDIT_ENTITY_TYPES.PHYSICAL_PROGRESS,
    entityId: archivedProgress.id,
    metadata: { athleteId: archivedProgress.athleteId.toString() },
  });
  return toPhysicalProgressResponse(archivedProgress);
}

module.exports = {
  archivePhysicalProgress,
  createPhysicalProgress,
  getPhysicalProgress,
  listPhysicalProgress,
  updatePhysicalProgress,
};
