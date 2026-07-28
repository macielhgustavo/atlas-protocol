const AUDIT_ACTIONS = require('../constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../constants/audit-entity-types');
const ERROR_CODES = require('../constants/error-codes');
const LINK_STATUSES = require('../constants/link-statuses');
const PROTOCOL_STATUSES = require('../constants/protocol-statuses');
const TRACKING_RECORD_STATUSES = require('../constants/tracking-record-statuses');
const TRACKING_RECORD_TYPES = require('../constants/tracking-record-types');
const USER_ROLES = require('../constants/user-roles');
const ProfessionalAthleteLink = require('../models/professional-athlete-link');
const Protocol = require('../models/protocol');
const TrackingRecord = require('../models/tracking-record');
const User = require('../models/user');
const AppError = require('../utils/app-error');
const {
  toTrackingRecordResponse,
} = require('../utils/tracking-record-response');
const auditService = require('./audit-service');

const FINAL_STATUSES = [
  TRACKING_RECORD_STATUSES.COMPLETED,
  TRACKING_RECORD_STATUSES.MISSED,
  TRACKING_RECORD_STATUSES.CANCELLED,
];

function notFoundError(resource = 'Registro de acompanhamento') {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    `${resource} não encontrado.`,
  );
}

function forbiddenError(message = 'Você não possui permissão para esta operação.') {
  return new AppError(403, ERROR_CODES.FORBIDDEN, message);
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

function sameId(left, right) {
  return Boolean(
    left &&
      right &&
      left.toString() === right.toString(),
  );
}

function hasOwn(value, property) {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function normalizeNullableText(value) {
  if (value === null || value === undefined || value === '') return null;
  return value;
}

async function hasActiveLink(professionalId, athleteId) {
  return ProfessionalAthleteLink.exists({
    professionalId,
    athleteId,
    status: LINK_STATUSES.ACTIVE,
  });
}

async function assertAvailableAthlete(athleteId) {
  const athlete = await User.findById(athleteId);
  if (!athlete) throw notFoundError('Atleta');
  if (athlete.role !== USER_ROLES.ATHLETE) {
    throw validationError(
      'athleteId',
      'O usuário informado deve possuir o perfil athlete.',
    );
  }
  if (!athlete.active || athlete.blockedAt) {
    throw validationError('athleteId', 'O atleta informado está inativo.');
  }
  return athlete;
}

async function resolveProfessionalContext(requester, athlete, protocolId) {
  if (!protocolId) {
    return {
      protocolId: null,
      protocolVersion: null,
    };
  }

  const protocol = await Protocol.findById(protocolId);
  if (
    !protocol ||
    !sameId(protocol.athleteId, athlete.id) ||
    !sameId(protocol.professionalId, requester.id)
  ) {
    throw notFoundError('Protocolo');
  }
  if (protocol.status !== PROTOCOL_STATUSES.ACTIVE) {
    throw invalidTransitionError(
      'Novos registros só podem ser vinculados a protocolos ativos.',
    );
  }

  return {
    protocolId: protocol.id,
    protocolVersion: protocol.currentVersion,
  };
}

async function canAccessRecord(requester, record) {
  if (requester.role === USER_ROLES.ADMIN) return true;
  if (requester.role === USER_ROLES.ATHLETE) {
    return sameId(record.athleteId, requester.id);
  }
  if (requester.role === USER_ROLES.PROFESSIONAL) {
    return Boolean(await hasActiveLink(requester.id, record.athleteId));
  }
  return false;
}

async function getAccessibleRecord(requester, recordId) {
  const record = await TrackingRecord.findById(recordId);
  if (!record || !(await canAccessRecord(requester, record))) {
    throw notFoundError();
  }
  return record;
}

async function createTrackingRecord(requester, input) {
  let athleteId;
  let professionalId;
  let protocolId = null;
  let protocolVersion = null;

  if (requester.role === USER_ROLES.ATHLETE) {
    if (hasOwn(input, 'athleteId')) {
      throw validationError(
        'athleteId',
        'athleteId é derivado do usuário autenticado.',
      );
    }
    if (hasOwn(input, 'protocolId')) {
      throw validationError(
        'protocolId',
        'O tracking manual do atleta não aceita protocolo.',
      );
    }
    if (input.type !== TRACKING_RECORD_TYPES.MANUAL) {
      throw validationError(
        'type',
        'O atleta só pode criar tracking manual.',
      );
    }
    athleteId = requester.id;
    professionalId = null;
  } else {
    if (!input.athleteId) {
      throw validationError('athleteId', 'Informe o atleta.');
    }
    if (!(await hasActiveLink(requester.id, input.athleteId))) {
      throw athleteLinkRequiredError();
    }
    const athlete = await assertAvailableAthlete(input.athleteId);
    const context = await resolveProfessionalContext(
      requester,
      athlete,
      input.protocolId,
    );
    athleteId = athlete.id;
    professionalId = requester.id;
    protocolId = context.protocolId;
    protocolVersion = context.protocolVersion;
  }

  const record = await TrackingRecord.create({
    athleteId,
    professionalId,
    protocolId,
    protocolVersion,
    type: input.type,
    title: input.title,
    scheduledFor: input.scheduledFor,
    status: TRACKING_RECORD_STATUSES.SCHEDULED,
    statusReason: null,
    completedAt: null,
    completedBy: null,
    notes: normalizeNullableText(input.notes),
    createdBy: requester.id,
  });

  await auditService.record({
    actorId: requester.id,
    action: AUDIT_ACTIONS.TRACKING_CREATED,
    entityType: AUDIT_ENTITY_TYPES.TRACKING_RECORD,
    entityId: record.id,
    metadata: {
      status: record.status,
      type: record.type,
    },
  });

  return toTrackingRecordResponse(record);
}

function applyScopedAthleteFilter(filters, requester, requestedAthleteId, ids) {
  if (requester.role === USER_ROLES.ATHLETE) {
    filters.athleteId =
      requestedAthleteId && !sameId(requestedAthleteId, requester.id)
        ? { $in: [] }
        : requester.id;
    return;
  }

  if (requester.role === USER_ROLES.PROFESSIONAL) {
    const linkedAthleteIds = ids || [];
    if (requestedAthleteId) {
      filters.athleteId = linkedAthleteIds.some((id) =>
        sameId(id, requestedAthleteId)
      )
        ? requestedAthleteId
        : { $in: [] };
    } else {
      filters.athleteId = { $in: linkedAthleteIds };
    }
  }
}

async function listTrackingRecords(requester, query) {
  const filters = {};
  if (query.protocolId) filters.protocolId = query.protocolId;
  if (query.status) filters.status = query.status;
  if (query.type) filters.type = query.type;
  if (query.dateFrom || query.dateTo) {
    filters.scheduledFor = {};
    if (query.dateFrom) filters.scheduledFor.$gte = query.dateFrom;
    if (query.dateTo) filters.scheduledFor.$lte = query.dateTo;
  }

  if (requester.role === USER_ROLES.ADMIN && query.athleteId) {
    filters.athleteId = query.athleteId;
  } else if (requester.role === USER_ROLES.PROFESSIONAL) {
    const links = await ProfessionalAthleteLink.find({
      professionalId: requester.id,
      status: LINK_STATUSES.ACTIVE,
    }).select('athleteId');
    applyScopedAthleteFilter(
      filters,
      requester,
      query.athleteId,
      links.map((link) => link.athleteId),
    );
  } else {
    applyScopedAthleteFilter(filters, requester, query.athleteId);
  }

  const skip = (query.page - 1) * query.limit;
  const sortDirection = query.sortOrder === 'asc' ? 1 : -1;
  const sort = { [query.sortBy]: sortDirection, _id: sortDirection };
  const [records, total] = await Promise.all([
    TrackingRecord.find(filters)
      .sort(sort)
      .skip(skip)
      .limit(query.limit),
    TrackingRecord.countDocuments(filters),
  ]);

  return {
    records: records.map(toTrackingRecordResponse),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function getTrackingRecord(requester, recordId) {
  const record = await getAccessibleRecord(requester, recordId);
  return toTrackingRecordResponse(record);
}

function assertStatusPermission(requester, record, nextStatus) {
  if (requester.role === USER_ROLES.PROFESSIONAL) return;
  if (requester.role !== USER_ROLES.ATHLETE) {
    throw forbiddenError();
  }

  if (nextStatus === TRACKING_RECORD_STATUSES.MISSED) {
    throw forbiddenError('O atleta não pode marcar tracking como perdido.');
  }
  if (
    nextStatus === TRACKING_RECORD_STATUSES.CANCELLED &&
    (record.type !== TRACKING_RECORD_TYPES.MANUAL ||
      !sameId(record.createdBy, requester.id))
  ) {
    throw forbiddenError(
      'O atleta só pode cancelar tracking manual criado por ele.',
    );
  }
}

async function transitionTrackingRecord(requester, recordId, input) {
  const record = await getAccessibleRecord(requester, recordId);
  if (record.status !== TRACKING_RECORD_STATUSES.SCHEDULED) {
    throw invalidTransitionError('O tracking já está em um estado final.');
  }
  if (!FINAL_STATUSES.includes(input.status)) {
    throw invalidTransitionError();
  }

  assertStatusPermission(requester, record, input.status);

  const changes = {
    status: input.status,
    statusReason: null,
    completedAt: null,
    completedBy: null,
  };
  if (input.status === TRACKING_RECORD_STATUSES.COMPLETED) {
    changes.completedAt = input.completedAt || new Date();
    changes.completedBy = requester.id;
    if (hasOwn(input, 'notes')) {
      changes.notes = normalizeNullableText(input.notes);
    }
  } else {
    changes.statusReason = input.reason;
  }

  const updatedRecord = await TrackingRecord.findOneAndUpdate(
    {
      _id: record.id,
      status: TRACKING_RECORD_STATUSES.SCHEDULED,
    },
    { $set: changes },
    { new: true, runValidators: true },
  );

  if (!updatedRecord) {
    throw invalidTransitionError(
      'O tracking foi alterado por outra operação.',
    );
  }

  const metadata = {
    from: TRACKING_RECORD_STATUSES.SCHEDULED,
    to: input.status,
  };
  if (input.reason) metadata.reason = input.reason;
  await auditService.record({
    actorId: requester.id,
    action: AUDIT_ACTIONS.TRACKING_STATUS_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.TRACKING_RECORD,
    entityId: updatedRecord.id,
    metadata,
  });

  return toTrackingRecordResponse(updatedRecord);
}

async function correctTrackingRecord(requester, recordId, input) {
  const record = await getAccessibleRecord(requester, recordId);
  if (!FINAL_STATUSES.includes(record.status)) {
    throw invalidTransitionError(
      'Somente tracking finalizado pode ser corrigido.',
    );
  }

  if (requester.role === USER_ROLES.PROFESSIONAL) {
    if (!record.professionalId || !sameId(record.professionalId, requester.id)) {
      throw notFoundError();
    }
  } else if (requester.role !== USER_ROLES.ADMIN) {
    throw forbiddenError();
  }

  const correctedRecord = await TrackingRecord.findOneAndUpdate(
    {
      _id: record.id,
      status: record.status,
      updatedAt: record.updatedAt,
    },
    {
      $set: {
        notes: normalizeNullableText(input.notes),
      },
    },
    { new: true, runValidators: true },
  );

  if (!correctedRecord) {
    throw invalidTransitionError(
      'O tracking foi alterado por outra operação.',
    );
  }

  await auditService.record({
    actorId: requester.id,
    action: AUDIT_ACTIONS.TRACKING_CORRECTED,
    entityType: AUDIT_ENTITY_TYPES.TRACKING_RECORD,
    entityId: correctedRecord.id,
    metadata: {
      field: 'notes',
      reason: input.reason,
    },
  });

  return toTrackingRecordResponse(correctedRecord);
}

module.exports = {
  correctTrackingRecord,
  createTrackingRecord,
  getTrackingRecord,
  listTrackingRecords,
  transitionTrackingRecord,
};
