const AUDIT_ACTIONS = require('../constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../constants/audit-entity-types');
const ERROR_CODES = require('../constants/error-codes');
const LINK_STATUSES = require('../constants/link-statuses');
const NOTIFICATION_ENTITY_TYPES = require(
  '../constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require('../constants/notification-types');
const USER_ROLES = require('../constants/user-roles');
const ProfessionalAthleteLink = require('../models/professional-athlete-link');
const User = require('../models/user');
const AppError = require('../utils/app-error');
const toLinkResponse = require('../utils/link-response');
const auditService = require('./audit-service');
const notificationService = require('./notification-service');

const OPEN_LINK_STATUSES = [LINK_STATUSES.PENDING, LINK_STATUSES.ACTIVE];
const MAX_CREATE_ATTEMPTS = 2;

function resourceNotFoundError() {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    'Vínculo não encontrado.',
  );
}

function athleteNotAvailableError() {
  return new AppError(
    404,
    ERROR_CODES.ATHLETE_NOT_AVAILABLE_FOR_LINK,
    'Atleta não disponível para vínculo.',
  );
}

function forbiddenFilterError(field) {
  return new AppError(
    403,
    ERROR_CODES.FORBIDDEN,
    'Você não possui permissão para utilizar este filtro.',
    [{ field, message: 'Este filtro não está disponível para o seu perfil.' }],
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

function duplicateLinkError(status) {
  if (status === LINK_STATUSES.PENDING) {
    return new AppError(
      409,
      ERROR_CODES.PENDING_LINK_ALREADY_EXISTS,
      'Já existe uma solicitação de vínculo pendente para este atleta.',
    );
  }

  if (status === LINK_STATUSES.ACTIVE) {
    return new AppError(
      409,
      ERROR_CODES.ACTIVE_LINK_ALREADY_EXISTS,
      'Já existe um vínculo ativo entre o profissional e o atleta.',
    );
  }

  return new AppError(
    409,
    ERROR_CODES.DUPLICATE_RESOURCE,
    'Conflito ao criar a solicitação de vínculo.',
  );
}

function linkNotPendingError() {
  return new AppError(
    422,
    ERROR_CODES.LINK_NOT_PENDING,
    'A solicitação de vínculo não está pendente.',
  );
}

function linkNotActiveError() {
  return new AppError(
    422,
    ERROR_CODES.LINK_NOT_ACTIVE,
    'O vínculo não está ativo.',
  );
}

function normalizeReason(reason) {
  if (reason === undefined || reason === null) return null;
  const normalized = reason.trim();
  return normalized || null;
}

function transitionMetadata(from, to, reason = null) {
  const metadata = { from, to };
  if (reason !== null) metadata.reason = reason;
  return metadata;
}

function hasLinkAccess(requester, link) {
  if (requester.role === USER_ROLES.ADMIN) return true;
  if (requester.role === USER_ROLES.PROFESSIONAL) {
    return link.professionalId.toString() === requester.id;
  }
  if (requester.role === USER_ROLES.ATHLETE) {
    return link.athleteId.toString() === requester.id;
  }
  return false;
}

function scopedLinkFilter(requester, linkId) {
  const filters = { _id: linkId };
  if (requester.role === USER_ROLES.PROFESSIONAL) {
    filters.professionalId = requester.id;
  } else if (requester.role === USER_ROLES.ATHLETE) {
    filters.athleteId = requester.id;
  }
  return filters;
}

async function findOpenLink(professionalId, athleteId) {
  return ProfessionalAthleteLink.findOne({
    professionalId,
    athleteId,
    status: { $in: OPEN_LINK_STATUSES },
  }).select('status');
}

async function assertNoOpenLink(professionalId, athleteId) {
  const existingLink = await findOpenLink(professionalId, athleteId);
  if (existingLink) throw duplicateLinkError(existingLink.status);
}

async function recordLinkAudit(requester, action, link, metadata) {
  await auditService.record({
    actorId: requester.id,
    action,
    entityType: AUDIT_ENTITY_TYPES.PROFESSIONAL_ATHLETE_LINK,
    entityId: link.id,
    metadata,
  });
}

function notifyLink(userId, type, link) {
  return notificationService.createNotificationFromTemplateSafely({
    userId,
    type,
    entityType: NOTIFICATION_ENTITY_TYPES.PROFESSIONAL_ATHLETE_LINK,
    entityId: link.id,
  });
}

function endedLinkRecipients(requester, link) {
  if (requester.role === USER_ROLES.ADMIN) {
    return [link.professionalId, link.athleteId];
  }
  if (requester.role === USER_ROLES.PROFESSIONAL) {
    return [link.athleteId];
  }
  return [link.professionalId];
}

async function createPendingLink(professionalId, athleteId) {
  await ProfessionalAthleteLink.init();

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    await assertNoOpenLink(professionalId, athleteId);

    try {
      return await ProfessionalAthleteLink.create({
        professionalId,
        athleteId,
        status: LINK_STATUSES.PENDING,
        requestedAt: new Date(),
      });
    } catch (error) {
      if (error.code !== 11000) throw error;

      const concurrentLink = await findOpenLink(professionalId, athleteId);
      if (concurrentLink) throw duplicateLinkError(concurrentLink.status);
      if (attempt === MAX_CREATE_ATTEMPTS - 1) {
        throw duplicateLinkError();
      }
    }
  }

  throw duplicateLinkError();
}

async function createLink(requester, { athleteEmail }) {
  const normalizedEmail = athleteEmail.trim().toLowerCase();
  const athlete = await User.findOne({
    email: normalizedEmail,
    role: USER_ROLES.ATHLETE,
    active: true,
    blockedAt: null,
  }).select('_id');

  if (!athlete) throw athleteNotAvailableError();

  const link = await createPendingLink(requester.id, athlete.id);

  await recordLinkAudit(
    requester,
    AUDIT_ACTIONS.LINK_REQUESTED,
    link,
    transitionMetadata(null, LINK_STATUSES.PENDING),
  );
  await notifyLink(
    link.athleteId,
    NOTIFICATION_TYPES.LINK_REQUESTED,
    link,
  );

  return toLinkResponse(link);
}

function assertListFilterPermissions(requester, query) {
  if (
    requester.role !== USER_ROLES.ADMIN &&
    query.professionalId !== undefined
  ) {
    throw forbiddenFilterError('professionalId');
  }

  if (
    requester.role === USER_ROLES.ATHLETE &&
    query.athleteId !== undefined
  ) {
    throw forbiddenFilterError('athleteId');
  }
}

async function listLinks(requester, query) {
  assertListFilterPermissions(requester, query);

  const filters = {};
  if (query.status) filters.status = query.status;
  if (query.professionalId) filters.professionalId = query.professionalId;
  if (query.athleteId) filters.athleteId = query.athleteId;

  if (requester.role === USER_ROLES.PROFESSIONAL) {
    filters.professionalId = requester.id;
  } else if (requester.role === USER_ROLES.ATHLETE) {
    filters.athleteId = requester.id;
  }

  const skip = (query.page - 1) * query.limit;
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const sort = { [query.sortBy]: direction, _id: direction };
  const [links, total] = await Promise.all([
    ProfessionalAthleteLink.find(filters)
      .sort(sort)
      .skip(skip)
      .limit(query.limit),
    ProfessionalAthleteLink.countDocuments(filters),
  ]);
const athleteIds = [
  ...new Set(
    links.map((link) => link.athleteId.toString()),
  ),
];
const professionalIds = [
  ...new Set(
    links.map((link) => link.professionalId.toString()),
  ),
];

const [athletes, professionals] = await Promise.all([
  User.find({
    _id: { $in: athleteIds },
    role: USER_ROLES.ATHLETE,
  })
    .select('_id name email')
    .lean(),
  User.find({
    _id: { $in: professionalIds },
    role: USER_ROLES.PROFESSIONAL,
  })
    .select('_id name email')
    .lean(),
]);

const athleteMap = new Map(
  athletes.map((athlete) => [
    athlete._id.toString(),
    athlete,
  ]),
);
const professionalMap = new Map(
  professionals.map((professional) => [
    professional._id.toString(),
    professional,
  ]),
);

  return {
   links: links.map((link) =>
  toLinkResponse(
    link,
    athleteMap.get(link.athleteId.toString()) || null,
    professionalMap.get(link.professionalId.toString()) || null,
  ),
),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function getLinkById(requester, linkId) {
  const link = await ProfessionalAthleteLink.findById(linkId);

  if (!link || !hasLinkAccess(requester, link)) {
    throw resourceNotFoundError();
  }

  return toLinkResponse(link);
}

async function acceptLink(requester, linkId) {
  const ownershipFilter = { _id: linkId, athleteId: requester.id };
  const link = await ProfessionalAthleteLink.findOne(ownershipFilter);
  if (!link) throw resourceNotFoundError();
  if (link.status !== LINK_STATUSES.PENDING) throw linkNotPendingError();

  const acceptedAt = new Date();
  const updatedLink = await ProfessionalAthleteLink.findOneAndUpdate(
    { ...ownershipFilter, status: LINK_STATUSES.PENDING },
    {
      $set: {
        status: LINK_STATUSES.ACTIVE,
        acceptedAt,
      },
    },
    { new: true, runValidators: true },
  );

  if (!updatedLink) throw linkNotPendingError();

  await recordLinkAudit(
    requester,
    AUDIT_ACTIONS.LINK_ACCEPTED,
    updatedLink,
    transitionMetadata(LINK_STATUSES.PENDING, LINK_STATUSES.ACTIVE),
  );
  await notifyLink(
    updatedLink.professionalId,
    NOTIFICATION_TYPES.LINK_ACCEPTED,
    updatedLink,
  );

  return toLinkResponse(updatedLink);
}

async function rejectLink(requester, linkId, { reason } = {}) {
  const ownershipFilter = { _id: linkId, athleteId: requester.id };
  const link = await ProfessionalAthleteLink.findOne(ownershipFilter);
  if (!link) throw resourceNotFoundError();
  if (link.status !== LINK_STATUSES.PENDING) throw linkNotPendingError();

  const rejectedAt = new Date();
  const updatedLink = await ProfessionalAthleteLink.findOneAndUpdate(
    { ...ownershipFilter, status: LINK_STATUSES.PENDING },
    {
      $set: {
        status: LINK_STATUSES.REJECTED,
        rejectedAt,
      },
    },
    { new: true, runValidators: true },
  );

  if (!updatedLink) throw linkNotPendingError();

  const normalizedReason = normalizeReason(reason);
  await recordLinkAudit(
    requester,
    AUDIT_ACTIONS.LINK_REJECTED,
    updatedLink,
    transitionMetadata(
      LINK_STATUSES.PENDING,
      LINK_STATUSES.REJECTED,
      normalizedReason,
    ),
  );
  await notifyLink(
    updatedLink.professionalId,
    NOTIFICATION_TYPES.LINK_REJECTED,
    updatedLink,
  );

  return toLinkResponse(updatedLink);
}

async function endLink(requester, linkId, { reason } = {}) {
  const normalizedReason = normalizeReason(reason);
  if (requester.role === USER_ROLES.ADMIN && normalizedReason === null) {
    throw validationError(
      'reason',
      'Informe o motivo do encerramento administrativo.',
    );
  }

  const ownershipFilter = scopedLinkFilter(requester, linkId);
  const link = await ProfessionalAthleteLink.findOne(ownershipFilter);
  if (!link) throw resourceNotFoundError();
  if (link.status !== LINK_STATUSES.ACTIVE) throw linkNotActiveError();

  const endedAt = new Date();
  const updatedLink = await ProfessionalAthleteLink.findOneAndUpdate(
    { ...ownershipFilter, status: LINK_STATUSES.ACTIVE },
    {
      $set: {
        status: LINK_STATUSES.ENDED,
        endedAt,
        endedBy: requester.id,
      },
    },
    { new: true, runValidators: true },
  );

  if (!updatedLink) throw linkNotActiveError();

  await recordLinkAudit(
    requester,
    AUDIT_ACTIONS.LINK_ENDED,
    updatedLink,
    transitionMetadata(
      LINK_STATUSES.ACTIVE,
      LINK_STATUSES.ENDED,
      normalizedReason,
    ),
  );
  await Promise.all(
    endedLinkRecipients(requester, updatedLink).map((recipientId) =>
      notifyLink(
        recipientId,
        NOTIFICATION_TYPES.LINK_ENDED,
        updatedLink,
      ),
    ),
  );

  return toLinkResponse(updatedLink);
}

module.exports = {
  acceptLink,
  createLink,
  endLink,
  getLinkById,
  listLinks,
  rejectLink,
};
