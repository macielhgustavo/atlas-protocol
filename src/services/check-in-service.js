const AUDIT_ACTIONS = require('../constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../constants/audit-entity-types');
const CHECK_IN_STATUSES = require('../constants/check-in-statuses');
const ERROR_CODES = require('../constants/error-codes');
const LINK_STATUSES = require('../constants/link-statuses');
const NOTIFICATION_ENTITY_TYPES = require(
  '../constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require('../constants/notification-types');
const PROTOCOL_STATUSES = require('../constants/protocol-statuses');
const USER_ROLES = require('../constants/user-roles');
const CheckIn = require('../models/check-in');
const ProfessionalAthleteLink = require('../models/professional-athlete-link');
const Protocol = require('../models/protocol');
const User = require('../models/user');
const AppError = require('../utils/app-error');
const toCheckInResponse = require('../utils/check-in-response');
const {
  cloneResponses,
  validateResponses,
} = require('../utils/check-in-responses');
const { normalizeReferenceWeek } = require('../utils/normalize-reference-week');
const auditService = require('./audit-service');
const notificationService = require('./notification-service');

function notFoundError(resource = 'Check-in') {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    `${resource} não encontrado.`,
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

function athleteLinkRequiredError() {
  return new AppError(
    403,
    ERROR_CODES.ATHLETE_LINK_REQUIRED,
    'É necessário possuir vínculo ativo com um profissional.',
  );
}

function invalidTransitionError(message = 'Transição de estado inválida.') {
  return new AppError(
    422,
    ERROR_CODES.INVALID_STATE_TRANSITION,
    message,
  );
}

function duplicateCheckInError() {
  return new AppError(
    409,
    ERROR_CODES.CHECKIN_ALREADY_EXISTS,
    'Já existe um check-in para o atleta nesta semana.',
  );
}

function alreadySubmittedError() {
  return new AppError(
    422,
    ERROR_CODES.CHECKIN_ALREADY_SUBMITTED,
    'O check-in já foi enviado e não pode mais ser alterado.',
  );
}

function notSubmittedError() {
  return new AppError(
    422,
    ERROR_CODES.CHECKIN_NOT_SUBMITTED,
    'O check-in precisa ser enviado antes da revisão.',
  );
}

function sameId(left, right) {
  return Boolean(
    left && right && left.toString() === right.toString(),
  );
}

async function hasActiveLink(professionalId, athleteId) {
  return ProfessionalAthleteLink.exists({
    professionalId,
    athleteId,
    status: LINK_STATUSES.ACTIVE,
  });
}

async function isProfessional(professionalId) {
  return User.exists({
    _id: professionalId,
    role: USER_ROLES.PROFESSIONAL,
  });
}

async function resolveProtocolContext(
  athleteId,
  protocolId,
  requestedProfessionalId,
) {
  const protocol = await Protocol.findById(protocolId);
  if (!protocol || !sameId(protocol.athleteId, athleteId)) {
    throw notFoundError('Protocolo');
  }
  if (protocol.status !== PROTOCOL_STATUSES.ACTIVE) {
    throw invalidTransitionError(
      'Novos check-ins só podem ser vinculados a protocolos ativos.',
    );
  }
  if (
    requestedProfessionalId &&
    !sameId(requestedProfessionalId, protocol.professionalId)
  ) {
    throw validationError(
      'professionalId',
      'O profissional informado não corresponde ao protocolo.',
    );
  }
  if (!(await hasActiveLink(protocol.professionalId, athleteId))) {
    throw athleteLinkRequiredError();
  }
  if (!(await isProfessional(protocol.professionalId))) {
    throw athleteLinkRequiredError();
  }

  return {
    professionalId: protocol.professionalId,
    protocolId: protocol.id,
  };
}

async function resolveLinkContext(athleteId, requestedProfessionalId) {
  const activeLinks = await ProfessionalAthleteLink.find({
    athleteId,
    status: LINK_STATUSES.ACTIVE,
  }).select('professionalId');

  if (!activeLinks.length) throw athleteLinkRequiredError();

  if (activeLinks.length === 1) {
    if (
      requestedProfessionalId &&
      !sameId(requestedProfessionalId, activeLinks[0].professionalId)
    ) {
      throw athleteLinkRequiredError();
    }
    if (!(await isProfessional(activeLinks[0].professionalId))) {
      throw athleteLinkRequiredError();
    }
    return {
      professionalId: activeLinks[0].professionalId,
      protocolId: null,
    };
  }

  if (!requestedProfessionalId) {
    throw validationError(
      'professionalId',
      'Informe professionalId quando houver múltiplos vínculos ativos.',
    );
  }

  const selectedLink = activeLinks.find((link) =>
    sameId(link.professionalId, requestedProfessionalId),
  );
  if (!selectedLink) throw athleteLinkRequiredError();
  if (!(await isProfessional(selectedLink.professionalId))) {
    throw athleteLinkRequiredError();
  }

  return {
    professionalId: selectedLink.professionalId,
    protocolId: null,
  };
}

function resolveProfessionalContext(athleteId, input) {
  if (input.protocolId) {
    return resolveProtocolContext(
      athleteId,
      input.protocolId,
      input.professionalId,
    );
  }
  return resolveLinkContext(athleteId, input.professionalId);
}

async function createCheckIn(requester, input) {
  const athleteId = requester.id;
  const context = await resolveProfessionalContext(athleteId, input);
  const referenceWeek = normalizeReferenceWeek(input.referenceWeek);

  await CheckIn.init();
  if (await CheckIn.exists({ athleteId, referenceWeek })) {
    throw duplicateCheckInError();
  }

  try {
    const checkIn = await CheckIn.create({
      athleteId,
      professionalId: context.professionalId,
      protocolId: context.protocolId,
      referenceWeek,
      status: CHECK_IN_STATUSES.PENDING,
      responses: cloneResponses(input.responses),
    });
    return toCheckInResponse(checkIn);
  } catch (error) {
    if (error.code === 11000) throw duplicateCheckInError();
    throw error;
  }
}

async function professionalAthleteIds(professionalId) {
  const links = await ProfessionalAthleteLink.find({
    professionalId,
    status: LINK_STATUSES.ACTIVE,
  }).select('athleteId');
  return links.map((link) => link.athleteId);
}

async function listCheckIns(requester, query) {
  const filters = {};
  if (query.protocolId) filters.protocolId = query.protocolId;
  if (query.status) filters.status = query.status;
  if (query.dateFrom || query.dateTo) {
    filters.referenceWeek = {};
    if (query.dateFrom) filters.referenceWeek.$gte = query.dateFrom;
    if (query.dateTo) filters.referenceWeek.$lte = query.dateTo;
  }

  if (requester.role === USER_ROLES.ADMIN) {
    if (query.athleteId) filters.athleteId = query.athleteId;
  } else if (requester.role === USER_ROLES.ATHLETE) {
    filters.athleteId =
      query.athleteId && !sameId(query.athleteId, requester.id)
        ? { $in: [] }
        : requester.id;
  } else {
    const linkedAthleteIds = await professionalAthleteIds(requester.id);
    if (query.athleteId) {
      filters.athleteId = linkedAthleteIds.some((athleteId) =>
        sameId(athleteId, query.athleteId),
      )
        ? query.athleteId
        : { $in: [] };
    } else {
      filters.athleteId = { $in: linkedAthleteIds };
    }
  }

  const skip = (query.page - 1) * query.limit;
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const sort = { [query.sortBy]: direction, _id: direction };
  const [checkIns, total] = await Promise.all([
    CheckIn.find(filters)
      .sort(sort)
      .skip(skip)
      .limit(query.limit),
    CheckIn.countDocuments(filters),
  ]);

  return {
    checkIns: checkIns.map(toCheckInResponse),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function getAccessibleCheckIn(requester, checkInId) {
  const checkIn = await CheckIn.findById(checkInId);
  if (!checkIn) throw notFoundError();

  if (requester.role === USER_ROLES.ADMIN) return checkIn;
  if (
    requester.role === USER_ROLES.ATHLETE &&
    sameId(checkIn.athleteId, requester.id)
  ) {
    return checkIn;
  }
  if (
    requester.role === USER_ROLES.PROFESSIONAL &&
    (await hasActiveLink(requester.id, checkIn.athleteId))
  ) {
    return checkIn;
  }

  throw notFoundError();
}

async function getCheckIn(requester, checkInId) {
  return toCheckInResponse(
    await getAccessibleCheckIn(requester, checkInId),
  );
}

async function updateCheckIn(requester, checkInId, input) {
  const ownedCheckIn = await CheckIn.findOne({
    _id: checkInId,
    athleteId: requester.id,
  }).select('status');
  if (!ownedCheckIn) throw notFoundError();
  if (ownedCheckIn.status !== CHECK_IN_STATUSES.PENDING) {
    throw alreadySubmittedError();
  }

  const updatedCheckIn = await CheckIn.findOneAndUpdate(
    {
      _id: checkInId,
      athleteId: requester.id,
      status: CHECK_IN_STATUSES.PENDING,
    },
    { $set: { responses: cloneResponses(input.responses) } },
    { new: true, runValidators: true },
  );

  if (!updatedCheckIn) throw alreadySubmittedError();
  return toCheckInResponse(updatedCheckIn);
}

async function recordTransitionAudit(requester, action, checkIn, from, to) {
  await auditService.record({
    actorId: requester.id,
    action,
    entityType: AUDIT_ENTITY_TYPES.CHECK_IN,
    entityId: checkIn.id,
    metadata: { from, to },
  });
}

async function submitCheckIn(requester, checkInId) {
  const checkIn = await CheckIn.findOne({
    _id: checkInId,
    athleteId: requester.id,
  });
  if (!checkIn) throw notFoundError();
  if (checkIn.status !== CHECK_IN_STATUSES.PENDING) {
    throw alreadySubmittedError();
  }

  const responsesError = validateResponses(checkIn.responses);
  if (responsesError) throw validationError('responses', responsesError);

  const submittedAt = new Date();
  const submittedCheckIn = await CheckIn.findOneAndUpdate(
    {
      _id: checkIn.id,
      athleteId: requester.id,
      status: CHECK_IN_STATUSES.PENDING,
    },
    {
      $set: {
        status: CHECK_IN_STATUSES.SUBMITTED,
        submittedAt,
      },
    },
    { new: true },
  );
  if (!submittedCheckIn) throw alreadySubmittedError();

  await recordTransitionAudit(
    requester,
    AUDIT_ACTIONS.CHECKIN_SUBMITTED,
    submittedCheckIn,
    CHECK_IN_STATUSES.PENDING,
    CHECK_IN_STATUSES.SUBMITTED,
  );
  await notificationService.createNotificationFromTemplateSafely({
    userId: submittedCheckIn.professionalId,
    type: NOTIFICATION_TYPES.CHECKIN_SUBMITTED,
    entityType: NOTIFICATION_ENTITY_TYPES.CHECK_IN,
    entityId: submittedCheckIn.id,
  });
  return toCheckInResponse(submittedCheckIn);
}

async function reviewCheckIn(requester, checkInId, { reviewComment }) {
  const checkIn = await CheckIn.findOne({
    _id: checkInId,
    professionalId: requester.id,
  });
  if (!checkIn) throw notFoundError();
  if (!(await hasActiveLink(requester.id, checkIn.athleteId))) {
    throw athleteLinkRequiredError();
  }
  if (checkIn.status === CHECK_IN_STATUSES.PENDING) {
    throw notSubmittedError();
  }
  if (checkIn.status !== CHECK_IN_STATUSES.SUBMITTED) {
    throw invalidTransitionError('O check-in já foi revisado.');
  }

  const reviewedAt = new Date();
  const reviewedCheckIn = await CheckIn.findOneAndUpdate(
    {
      _id: checkIn.id,
      professionalId: requester.id,
      status: CHECK_IN_STATUSES.SUBMITTED,
    },
    {
      $set: {
        status: CHECK_IN_STATUSES.REVIEWED,
        reviewedAt,
        reviewedBy: requester.id,
        reviewComment,
      },
    },
    { new: true },
  );
  if (!reviewedCheckIn) {
    throw invalidTransitionError('O check-in já foi revisado.');
  }

  await recordTransitionAudit(
    requester,
    AUDIT_ACTIONS.CHECKIN_REVIEWED,
    reviewedCheckIn,
    CHECK_IN_STATUSES.SUBMITTED,
    CHECK_IN_STATUSES.REVIEWED,
  );
  await notificationService.createNotificationFromTemplateSafely({
    userId: reviewedCheckIn.athleteId,
    type: NOTIFICATION_TYPES.CHECKIN_REVIEWED,
    entityType: NOTIFICATION_ENTITY_TYPES.CHECK_IN,
    entityId: reviewedCheckIn.id,
  });
  return toCheckInResponse(reviewedCheckIn);
}

module.exports = {
  createCheckIn,
  getCheckIn,
  listCheckIns,
  reviewCheckIn,
  submitCheckIn,
  updateCheckIn,
};
