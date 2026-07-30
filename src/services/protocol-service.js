const AUDIT_ACTIONS = require('../constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../constants/audit-entity-types');
const ERROR_CODES = require('../constants/error-codes');
const LINK_STATUSES = require('../constants/link-statuses');
const NOTIFICATION_ENTITY_TYPES = require(
  '../constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require('../constants/notification-types');
const PROTOCOL_STATUS_TRANSITIONS = require('../constants/protocol-status-transitions');
const PROTOCOL_STATUSES = require('../constants/protocol-statuses');
const USER_ROLES = require('../constants/user-roles');
const ProfessionalAthleteLink = require('../models/professional-athlete-link');
const Protocol = require('../models/protocol');
const ProtocolVersion = require('../models/protocol-version');
const Substance = require('../models/substance');
const User = require('../models/user');
const AppError = require('../utils/app-error');
const {
  toProtocolResponse,
  toVersionResponse,
} = require('../utils/protocol-response');
const auditService = require('./audit-service');
const notificationService = require('./notification-service');

const protocolMutationLocks = new Map();

async function withProtocolMutationLock(protocolId, operation) {
  const key = protocolId.toString();
  const previousLock = protocolMutationLocks.get(key) || Promise.resolve();
  let releaseLock;
  const currentLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  protocolMutationLocks.set(key, currentLock);
  await previousLock;

  try {
    return await operation();
  } finally {
    releaseLock();
    if (protocolMutationLocks.get(key) === currentLock) {
      protocolMutationLocks.delete(key);
    }
  }
}

function notFoundError(resource = 'Protocolo') {
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

function invalidTransitionError(message = 'Transição de estado inválida.') {
  return new AppError(
    422,
    ERROR_CODES.INVALID_STATE_TRANSITION,
    message,
  );
}

function athleteLinkRequiredError() {
  return new AppError(
    403,
    ERROR_CODES.ATHLETE_LINK_REQUIRED,
    'É necessário possuir vínculo ativo com o atleta.',
  );
}

function protocolReadOnlyError(
  message = 'O protocolo está disponível somente para leitura.',
) {
  return new AppError(422, ERROR_CODES.PROTOCOL_READ_ONLY, message);
}

function assertStatusHistoryIntegrity(protocol) {
  const lastEntry = (protocol.statusHistory || []).at(-1);
  if (!lastEntry || lastEntry.to !== protocol.status) {
    throw protocolReadOnlyError(
      'O histórico de status do protocolo precisa ser migrado antes de novas alterações.',
    );
  }
}

async function hasActiveLink(professionalId, athleteId) {
  return ProfessionalAthleteLink.exists({
    professionalId,
    athleteId,
    status: LINK_STATUSES.ACTIVE,
  });
}

function assertProfessionalOwnership(requester, protocol) {
  if (protocol.professionalId.toString() !== requester.id) {
    throw notFoundError();
  }
}

async function getAccessibleProtocol(requester, protocolId) {
  const protocol = await Protocol.findById(protocolId);
  if (!protocol) throw notFoundError();

  if (requester.role === USER_ROLES.ADMIN) return protocol;
  if (requester.role === USER_ROLES.PROFESSIONAL) {
    assertProfessionalOwnership(requester, protocol);
    if (!(await hasActiveLink(requester.id, protocol.athleteId))) {
      throw notFoundError();
    }
    return protocol;
  }
  if (
    requester.role === USER_ROLES.ATHLETE &&
    protocol.athleteId.toString() === requester.id
  ) {
    return protocol;
  }

  throw notFoundError();
}

async function getOwnedProtocol(requester, protocolId) {
  const protocol = await Protocol.findById(protocolId);
  if (!protocol) throw notFoundError();
  if (requester.role !== USER_ROLES.PROFESSIONAL) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      'Você não possui permissão para alterar este protocolo.',
    );
  }

  assertProfessionalOwnership(requester, protocol);
  if (!(await hasActiveLink(requester.id, protocol.athleteId))) {
    throw athleteLinkRequiredError();
  }
  return protocol;
}

function validateDateRange(startDate, endDate, continuous) {
  if (endDate && new Date(endDate) < new Date(startDate)) {
    throw validationError(
      'endDate',
      'A data final não pode ser anterior à data inicial.',
    );
  }
  if (!continuous && !endDate) {
    throw validationError(
      'endDate',
      'Informe endDate quando o protocolo não for contínuo.',
    );
  }
}

async function buildItems(items) {
  if (!items.length) return [];

  const substanceIds = [...new Set(items.map((item) => item.substanceId))];
  const substances = await Substance.find({ _id: { $in: substanceIds } });
  const substanceMap = new Map(
    substances.map((substance) => [substance.id, substance]),
  );

  return items.map((item, index) => {
    const substance = substanceMap.get(item.substanceId);
    if (!substance) throw notFoundError('Substância');
    if (!substance.active) {
      throw validationError(
        `items.${index}.substanceId`,
        'A substância informada está inativa.',
      );
    }

    return {
      substanceId: item.substanceId,
      substanceSnapshot: {
        name: substance.name,
        category: substance.category,
      },
      instructions: item.instructions || null,
      frequencyType: item.frequencyType,
      weekDays: item.weekDays,
      time: item.time || null,
      startDate: item.startDate || null,
      endDate: item.endDate || null,
      active: item.active,
    };
  });
}

function toTimestamp(value) {
  return value ? new Date(value).getTime() : null;
}

function toComparableItem(item) {
  return {
    substanceId: item.substanceId.toString(),
    substanceSnapshot: {
      name: item.substanceSnapshot.name,
      category: item.substanceSnapshot.category,
    },
    instructions: item.instructions || null,
    frequencyType: item.frequencyType,
    weekDays: [...(item.weekDays || [])].sort((left, right) => left - right),
    time: item.time || null,
    startDate: toTimestamp(item.startDate),
    endDate: toTimestamp(item.endDate),
    active: item.active !== false,
  };
}

function hasMaterialVersionChange(currentVersion, nextValues, items) {
  if (toTimestamp(currentVersion.startDate) !== toTimestamp(nextValues.startDate)) {
    return true;
  }
  if (toTimestamp(currentVersion.endDate) !== toTimestamp(nextValues.endDate)) {
    return true;
  }
  if (currentVersion.continuous !== nextValues.continuous) return true;

  const currentItems = currentVersion.items.map(toComparableItem);
  const nextItems = items.map(toComparableItem);
  return JSON.stringify(currentItems) !== JSON.stringify(nextItems);
}

async function createProtocol(requester, input) {
  const athlete = await User.findById(input.athleteId);
  if (!athlete) throw notFoundError('Atleta');
  if (athlete.role !== USER_ROLES.ATHLETE) {
    throw validationError(
      'athleteId',
      'O usuário informado deve possuir o perfil athlete.',
    );
  }
  if (!(await hasActiveLink(requester.id, athlete.id))) {
    throw athleteLinkRequiredError();
  }

  validateDateRange(input.startDate, input.endDate, input.continuous);
  const items = await buildItems(input.items);
  const now = new Date();
  const protocol = await Protocol.create({
    athleteId: athlete.id,
    professionalId: requester.id,
    title: input.title,
    objective: input.objective || null,
    status: PROTOCOL_STATUSES.DRAFT,
    currentVersion: 1,
    startDate: input.startDate,
    endDate: input.endDate,
    continuous: input.continuous,
    statusHistory: [
      {
        from: null,
        to: PROTOCOL_STATUSES.DRAFT,
        reason: null,
        changedAt: now,
        changedBy: requester.id,
      },
    ],
    createdAt: now,
    updatedAt: now,
  });

  let version;
  try {
    version = await ProtocolVersion.create({
      protocolId: protocol.id,
      version: 1,
      createdBy: requester.id,
      startDate: protocol.startDate,
      endDate: protocol.endDate,
      continuous: protocol.continuous,
      items,
    });
    await auditService.record({
      actorId: requester.id,
      action: AUDIT_ACTIONS.PROTOCOL_CREATED,
      entityType: AUDIT_ENTITY_TYPES.PROTOCOL,
      entityId: protocol.id,
      metadata: {
        status: protocol.status,
        version: protocol.currentVersion,
      },
    });
  } catch (error) {
    const cleanupOperations = [Protocol.deleteOne({ _id: protocol.id })];
    if (version) {
      cleanupOperations.push(ProtocolVersion.deleteOne({ _id: version.id }));
    }
    await Promise.allSettled(cleanupOperations);
    throw error;
  }

  await notificationService.createNotificationFromTemplateSafely({
    userId: protocol.athleteId,
    type: NOTIFICATION_TYPES.PROTOCOL_CREATED,
    entityType: NOTIFICATION_ENTITY_TYPES.PROTOCOL,
    entityId: protocol.id,
  });

  return {
    protocol: toProtocolResponse(protocol),
    currentVersion: toVersionResponse(version),
  };
}

async function listProtocols(requester, query) {
  const filters = {};
  if (query.status) filters.status = query.status;
  if (query.athleteId) filters.athleteId = query.athleteId;
  if (query.professionalId) filters.professionalId = query.professionalId;
  if (query.dateFrom || query.dateTo) {
    filters.startDate = {};
    if (query.dateFrom) filters.startDate.$gte = query.dateFrom;
    if (query.dateTo) filters.startDate.$lte = query.dateTo;
  }

  if (requester.role === USER_ROLES.PROFESSIONAL) {
    const links = await ProfessionalAthleteLink.find({
      professionalId: requester.id,
      status: LINK_STATUSES.ACTIVE,
    }).select('athleteId');
    filters.professionalId = requester.id;
    filters.athleteId = {
      $in: links.map((link) => link.athleteId),
    };
  } else if (requester.role === USER_ROLES.ATHLETE) {
    filters.athleteId = requester.id;
  }

  const skip = (query.page - 1) * query.limit;
  const sort = { [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1 };
  const [protocols, total] = await Promise.all([
    Protocol.find(filters)
      .select('-statusHistory')
      .sort(sort)
      .skip(skip)
      .limit(query.limit),
    Protocol.countDocuments(filters),
  ]);

  return {
    protocols: protocols.map((protocol) =>
      toProtocolResponse(protocol, { includeStatusHistory: false }),
    ),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function getProtocol(requester, protocolId) {
  const protocol = await getAccessibleProtocol(requester, protocolId);
  const currentVersion = await ProtocolVersion.findOne({
    protocolId: protocol.id,
    version: protocol.currentVersion,
  });
  if (!currentVersion) throw notFoundError('Versão');

  return {
    protocol: toProtocolResponse(protocol),
    currentVersion: toVersionResponse(currentVersion),
  };
}

async function updateProtocolWithoutLock(requester, protocolId, input) {
  const protocol = await getOwnedProtocol(requester, protocolId);
  assertStatusHistoryIntegrity(protocol);
  if (protocol.status !== PROTOCOL_STATUSES.DRAFT) {
    throw protocolReadOnlyError(
      'Somente protocolos em rascunho podem ser editados diretamente.',
    );
  }

  const currentVersion = await ProtocolVersion.findOne({
    protocolId: protocol.id,
    version: protocol.currentVersion,
  });
  if (!currentVersion) throw notFoundError('Versão');

  const nextValues = {
    title: input.title ?? protocol.title,
    objective:
      input.objective !== undefined ? input.objective || null : protocol.objective,
    startDate: input.startDate ?? protocol.startDate,
    endDate: input.endDate !== undefined ? input.endDate : protocol.endDate,
    continuous: input.continuous ?? protocol.continuous,
  };
  validateDateRange(
    nextValues.startDate,
    nextValues.endDate,
    nextValues.continuous,
  );

  const items = input.items
    ? await buildItems(input.items)
    : currentVersion.items.map((item) => item.toObject());

  const previousValues = {
    title: protocol.title,
    objective: protocol.objective,
    startDate: protocol.startDate,
    endDate: protocol.endDate,
    continuous: protocol.continuous,
  };
  Object.assign(currentVersion, {
    startDate: nextValues.startDate,
    endDate: nextValues.endDate,
    continuous: nextValues.continuous,
    items,
  });
  await currentVersion.validate();

  const updatedProtocol = await Protocol.findOneAndUpdate(
    {
      _id: protocol.id,
      professionalId: requester.id,
      status: PROTOCOL_STATUSES.DRAFT,
      updatedAt: protocol.updatedAt,
    },
    { $set: nextValues },
    { new: true, runValidators: true },
  );

  if (!updatedProtocol) {
    const latestProtocol = await Protocol.findById(protocol.id);
    if (!latestProtocol) throw notFoundError();
    if (latestProtocol.status !== PROTOCOL_STATUSES.DRAFT) {
      throw protocolReadOnlyError(
        'Somente protocolos em rascunho podem ser editados diretamente.',
      );
    }
    throw new AppError(
      409,
      ERROR_CODES.DUPLICATE_RESOURCE,
      'Conflito ao editar o protocolo. Tente novamente.',
    );
  }

  try {
    await currentVersion.save();
  } catch (error) {
    await Protocol.findOneAndUpdate(
      {
        _id: protocol.id,
        status: PROTOCOL_STATUSES.DRAFT,
        updatedAt: updatedProtocol.updatedAt,
      },
      { $set: previousValues },
      { runValidators: true },
    ).catch(() => null);
    throw error;
  }

  return {
    protocol: toProtocolResponse(updatedProtocol),
    currentVersion: toVersionResponse(currentVersion),
  };
}

async function createProtocolVersionWithoutLock(requester, protocolId, input) {
  const protocol = await getOwnedProtocol(requester, protocolId);
  assertStatusHistoryIntegrity(protocol);
  if (
    [PROTOCOL_STATUSES.CLOSED, PROTOCOL_STATUSES.CANCELLED].includes(
      protocol.status,
    )
  ) {
    throw protocolReadOnlyError();
  }
  if (
    ![PROTOCOL_STATUSES.ACTIVE, PROTOCOL_STATUSES.PAUSED].includes(
      protocol.status,
    )
  ) {
    throw invalidTransitionError(
      'Somente protocolos ativos ou pausados podem receber uma nova versão.',
    );
  }

  const currentVersion = await ProtocolVersion.findOne({
    protocolId: protocol.id,
    version: protocol.currentVersion,
  });
  if (!currentVersion) throw notFoundError('Versão');

  const nextValues = {
    startDate: input.startDate ?? protocol.startDate,
    endDate: input.endDate !== undefined ? input.endDate : protocol.endDate,
    continuous: input.continuous ?? protocol.continuous,
  };
  validateDateRange(
    nextValues.startDate,
    nextValues.endDate,
    nextValues.continuous,
  );

  const items = input.items
    ? await buildItems(input.items)
    : currentVersion.items.map((item) => item.toObject());
  if (!items.length) {
    throw new AppError(
      400,
      ERROR_CODES.PROTOCOL_EMPTY,
      'Uma nova versão de protocolo precisa possuir ao menos um item.',
    );
  }
  if (!hasMaterialVersionChange(currentVersion, nextValues, items)) {
    throw validationError(
      'body',
      'Informe ao menos uma alteração material efetiva.',
    );
  }
  const previousVersionNumber = protocol.currentVersion;
  const nextVersionNumber = previousVersionNumber + 1;
  let nextVersion;

  try {
    nextVersion = await ProtocolVersion.create({
      protocolId: protocol.id,
      version: nextVersionNumber,
      createdBy: requester.id,
      changeReason: input.changeReason || null,
      ...nextValues,
      items,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_RESOURCE,
        'Conflito ao criar a próxima versão do protocolo.',
      );
    }
    throw error;
  }

  let updatedProtocol;
  try {
    updatedProtocol = await Protocol.findOneAndUpdate(
      {
        _id: protocol.id,
        professionalId: requester.id,
        currentVersion: previousVersionNumber,
        updatedAt: protocol.updatedAt,
        status: {
          $in: [PROTOCOL_STATUSES.ACTIVE, PROTOCOL_STATUSES.PAUSED],
        },
      },
      {
        $set: {
          ...nextValues,
          currentVersion: nextVersionNumber,
        },
      },
      { new: true, runValidators: true },
    );
  } catch (error) {
    await ProtocolVersion.deleteOne({ _id: nextVersion.id });
    throw error;
  }

  if (!updatedProtocol) {
    await ProtocolVersion.deleteOne({ _id: nextVersion.id });
    const latestProtocol = await Protocol.findById(protocol.id);
    if (!latestProtocol) throw notFoundError();
    if (
      [PROTOCOL_STATUSES.CLOSED, PROTOCOL_STATUSES.CANCELLED].includes(
        latestProtocol.status,
      )
    ) {
      throw protocolReadOnlyError();
    }
    if (
      ![PROTOCOL_STATUSES.ACTIVE, PROTOCOL_STATUSES.PAUSED].includes(
        latestProtocol.status,
      )
    ) {
      throw invalidTransitionError(
        'O estado atual do protocolo não permite criar uma nova versão.',
      );
    }
    throw new AppError(
      409,
      ERROR_CODES.DUPLICATE_RESOURCE,
      'Conflito ao criar a próxima versão do protocolo.',
    );
  }

  await auditService.record({
    actorId: requester.id,
    action: AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
    entityType: AUDIT_ENTITY_TYPES.PROTOCOL,
    entityId: protocol.id,
    metadata: {
      previousVersion: previousVersionNumber,
      newVersion: nextVersionNumber,
    },
  });

  await notificationService.createNotificationFromTemplateSafely({
    userId: updatedProtocol.athleteId,
    type: NOTIFICATION_TYPES.PROTOCOL_VERSION_CREATED,
    entityType: NOTIFICATION_ENTITY_TYPES.PROTOCOL,
    entityId: updatedProtocol.id,
  });

  return {
    protocol: toProtocolResponse(updatedProtocol),
    currentVersion: toVersionResponse(nextVersion),
  };
}

async function updateProtocolStatusWithoutLock(requester, protocolId, input) {
  const protocol = await getOwnedProtocol(requester, protocolId);
  assertStatusHistoryIntegrity(protocol);
  const previousStatus = protocol.status;
  const nextStatus = input.status;
  const allowedTargets = PROTOCOL_STATUS_TRANSITIONS[previousStatus] || [];

  if (!allowedTargets.includes(nextStatus)) {
    throw invalidTransitionError();
  }

  if (
    previousStatus === PROTOCOL_STATUSES.DRAFT &&
    nextStatus === PROTOCOL_STATUSES.ACTIVE
  ) {
    const version = await ProtocolVersion.findOne({
      protocolId: protocol.id,
      version: protocol.currentVersion,
    });
    if (!version || !version.items.length) {
      throw new AppError(
        400,
        ERROR_CODES.PROTOCOL_EMPTY,
        'O protocolo precisa possuir ao menos um item para ser ativado.',
      );
    }
  }

  const now = new Date();
  const reason =
    input.reason === null || input.reason === undefined
      ? null
      : input.reason.trim();
  const statusChanges = { status: nextStatus };

  if (
    previousStatus === PROTOCOL_STATUSES.DRAFT &&
    nextStatus === PROTOCOL_STATUSES.ACTIVE &&
    !protocol.activatedAt
  ) {
    statusChanges.activatedAt = now;
  }
  if (
    previousStatus === PROTOCOL_STATUSES.ACTIVE &&
    nextStatus === PROTOCOL_STATUSES.PAUSED
  ) {
    statusChanges.pausedAt = now;
  }
  if (nextStatus === PROTOCOL_STATUSES.CLOSED) {
    statusChanges.closedAt = now;
  }
  if (nextStatus === PROTOCOL_STATUSES.CANCELLED) {
    statusChanges.cancelledAt = now;
  }

  const updatedProtocol = await Protocol.findOneAndUpdate(
    {
      _id: protocol.id,
      professionalId: requester.id,
      status: previousStatus,
      updatedAt: protocol.updatedAt,
    },
    {
      $set: statusChanges,
      $push: {
        statusHistory: {
          from: previousStatus,
          to: nextStatus,
          reason,
          changedAt: now,
          changedBy: requester.id,
        },
      },
    },
    { new: true, runValidators: true },
  )
    .allowAtomicStatusTransition();

  if (!updatedProtocol) {
    throw invalidTransitionError(
      'O protocolo foi alterado por outra operação.',
    );
  }

  const auditMetadata = { from: previousStatus, to: nextStatus };
  if (reason !== null) auditMetadata.reason = reason;
  await auditService.record({
    actorId: requester.id,
    action: AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.PROTOCOL,
    entityId: protocol.id,
    metadata: auditMetadata,
  });

  await notificationService.createNotificationFromTemplateSafely({
    userId: updatedProtocol.athleteId,
    type: NOTIFICATION_TYPES.PROTOCOL_STATUS_CHANGED,
    entityType: NOTIFICATION_ENTITY_TYPES.PROTOCOL,
    entityId: updatedProtocol.id,
  });

  return toProtocolResponse(updatedProtocol);
}

async function listVersions(requester, protocolId) {
  const protocol = await getAccessibleProtocol(requester, protocolId);
  const versions = await ProtocolVersion.find({ protocolId: protocol.id }).sort({
    version: 1,
  });
  return versions.map(toVersionResponse);
}

async function getVersion(requester, protocolId, versionNumber) {
  const protocol = await getAccessibleProtocol(requester, protocolId);
  const version = await ProtocolVersion.findOne({
    protocolId: protocol.id,
    version: versionNumber,
  });
  if (!version) throw notFoundError('Versão');
  return toVersionResponse(version);
}

async function updateProtocol(requester, protocolId, input) {
  return withProtocolMutationLock(protocolId, () =>
    updateProtocolWithoutLock(requester, protocolId, input),
  );
}

async function createProtocolVersion(requester, protocolId, input) {
  return withProtocolMutationLock(protocolId, () =>
    createProtocolVersionWithoutLock(requester, protocolId, input),
  );
}

async function updateProtocolStatus(requester, protocolId, input) {
  return withProtocolMutationLock(protocolId, () =>
    updateProtocolStatusWithoutLock(requester, protocolId, input),
  );
}

module.exports = {
  createProtocol,
  createProtocolVersion,
  getProtocol,
  getVersion,
  listProtocols,
  listVersions,
  updateProtocol,
  updateProtocolStatus,
};
