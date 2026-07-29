const AUDIT_ACTIONS = require('../constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../constants/audit-entity-types');
const ERROR_CODES = require('../constants/error-codes');
const INVENTORY_MOVEMENT_TYPES = require(
  '../constants/inventory-movement-types',
);
const LINK_STATUSES = require('../constants/link-statuses');
const USER_ROLES = require('../constants/user-roles');
const AuditLog = require('../models/audit-log');
const InventoryItem = require('../models/inventory-item');
const InventoryMovement = require('../models/inventory-movement');
const ProfessionalAthleteLink = require('../models/professional-athlete-link');
const Substance = require('../models/substance');
const AppError = require('../utils/app-error');
const {
  toInventoryItemResponse,
  toInventoryMovementResponse,
} = require('../utils/inventory-response');
const auditService = require('./audit-service');

const MAX_QUANTITY = 1_000_000_000;
const INITIAL_REASON = 'Estoque inicial.';

function notFoundError() {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    'Item de estoque não encontrado.',
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

function archivedError() {
  return new AppError(
    422,
    ERROR_CODES.INVENTORY_ITEM_ARCHIVED,
    'O item de estoque está arquivado.',
  );
}

function expiredError() {
  return new AppError(
    422,
    ERROR_CODES.INVENTORY_ITEM_EXPIRED,
    'O item de estoque está vencido para esta operação.',
  );
}

function insufficientError() {
  return new AppError(
    409,
    ERROR_CODES.INVENTORY_INSUFFICIENT,
    'A quantidade disponível é insuficiente.',
  );
}

function internalError() {
  return new AppError(
    500,
    ERROR_CODES.INTERNAL_ERROR,
    'Ocorreu um erro interno.',
  );
}

function sameId(left, right) {
  return Boolean(left && right && left.toString() === right.toString());
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isExpired(item, now) {
  return Boolean(item.expirationDate && item.expirationDate < now);
}

async function hasActiveLink(professionalId, athleteId) {
  return ProfessionalAthleteLink.exists({
    professionalId,
    athleteId,
    status: LINK_STATUSES.ACTIVE,
  });
}

async function ensureActiveSubstance(substanceId) {
  if (substanceId === null || substanceId === undefined) return;
  if (!(await Substance.exists({ _id: substanceId, active: true }))) {
    throw validationError(
      'substanceId',
      'Informe uma substância ativa e disponível.',
    );
  }
}

async function recordInventoryAudit(requester, item, operation, extra = {}) {
  return auditService.record({
    actorId: requester.id,
    action: AUDIT_ACTIONS.INVENTORY_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.INVENTORY_ITEM,
    entityId: item.id,
    metadata: {
      athleteId: item.athleteId.toString(),
      operation,
      ...extra,
    },
  });
}

async function recordMovementAudit(requester, movement) {
  return auditService.record({
    actorId: requester.id,
    action: AUDIT_ACTIONS.INVENTORY_MOVEMENT_CREATED,
    entityType: AUDIT_ENTITY_TYPES.INVENTORY_MOVEMENT,
    entityId: movement.id,
    metadata: {
      athleteId: movement.athleteId.toString(),
      inventoryItemId: movement.inventoryItemId.toString(),
      movementType: movement.type,
    },
  });
}

async function rollbackCreation(item, movement, auditIds) {
  const cleanup = [];
  if (auditIds.length) {
    cleanup.push(AuditLog.deleteMany({ _id: { $in: auditIds } }));
  }
  if (movement) cleanup.push(InventoryMovement.deleteOne({ _id: movement.id }));
  if (item) cleanup.push(InventoryItem.deleteOne({ _id: item.id }));
  await Promise.allSettled(cleanup);
}

async function createInventoryItem(requester, input) {
  await ensureActiveSubstance(input.substanceId);

  let item;
  let movement;
  const auditIds = [];
  try {
    item = await InventoryItem.create({
      athleteId: requester.id,
      substanceId: input.substanceId,
      name: input.name,
      unit: input.unit,
      quantity: input.quantity,
      lowStockThreshold: input.lowStockThreshold,
      expirationDate: input.expirationDate,
    });

    if (input.quantity > 0) {
      movement = await InventoryMovement.create({
        inventoryItemId: item.id,
        athleteId: requester.id,
        type: INVENTORY_MOVEMENT_TYPES.ADJUSTMENT,
        quantity: input.quantity,
        previousQuantity: 0,
        resultingQuantity: input.quantity,
        reason: INITIAL_REASON,
        createdBy: requester.id,
      });
    }

    const itemAudit = await recordInventoryAudit(requester, item, 'created', {
      initialQuantityPresent: input.quantity > 0,
    });
    auditIds.push(itemAudit.id);

    if (movement) {
      const movementAudit = await recordMovementAudit(requester, movement);
      auditIds.push(movementAudit.id);
    }
  } catch (error) {
    await rollbackCreation(item, movement, auditIds);
    throw error;
  }

  const now = new Date();
  return toInventoryItemResponse(item, now);
}

async function resolveListAthleteId(requester, query) {
  if (requester.role === USER_ROLES.ATHLETE) {
    if (query.athleteId !== undefined) {
      throw validationError(
        'athleteId',
        'athleteId é derivado do usuário autenticado.',
      );
    }
    return requester.id;
  }

  if (!query.athleteId) {
    throw validationError('athleteId', 'Informe o atleta.');
  }
  if (!(await hasActiveLink(requester.id, query.athleteId))) {
    throw notFoundError();
  }
  return query.athleteId;
}

function addDerivedFilters(filters, query, now) {
  const derivedFilters = [];
  if (query.expired === true) {
    derivedFilters.push({
      expirationDate: { $ne: null, $lt: now },
    });
  } else if (query.expired === false) {
    derivedFilters.push({
      $or: [
        { expirationDate: null },
        { expirationDate: { $gte: now } },
      ],
    });
  }

  if (query.lowStock === true) {
    derivedFilters.push({
      $expr: {
        $and: [
          { $ne: ['$lowStockThreshold', null] },
          { $lte: ['$quantity', '$lowStockThreshold'] },
        ],
      },
    });
  } else if (query.lowStock === false) {
    derivedFilters.push({
      $expr: {
        $or: [
          { $eq: ['$lowStockThreshold', null] },
          { $gt: ['$quantity', '$lowStockThreshold'] },
        ],
      },
    });
  }

  if (derivedFilters.length) filters.$and = derivedFilters;
}

async function listInventoryItems(requester, query) {
  const now = new Date();
  const athleteId = await resolveListAthleteId(requester, query);
  const filters = {
    athleteId,
    archivedAt: query.archived ? { $ne: null } : null,
  };
  if (query.search) {
    filters.name = new RegExp(escapeRegExp(query.search), 'i');
  }
  addDerivedFilters(filters, query, now);

  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    InventoryItem.find(filters)
      .sort({ [query.sortBy]: direction, _id: direction })
      .skip(skip)
      .limit(query.limit),
    InventoryItem.countDocuments(filters),
  ]);

  return {
    items: items.map((item) => toInventoryItemResponse(item, now)),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function getAccessibleInventoryItem(requester, itemId) {
  const item = await InventoryItem.findById(itemId);
  if (!item) throw notFoundError();

  if (requester.role === USER_ROLES.ATHLETE) {
    if (!sameId(item.athleteId, requester.id)) throw notFoundError();
  } else if (!(await hasActiveLink(requester.id, item.athleteId))) {
    throw notFoundError();
  }
  return item;
}

async function getInventoryItem(requester, itemId) {
  const now = new Date();
  const item = await getAccessibleInventoryItem(requester, itemId);
  return toInventoryItemResponse(item, now);
}

async function getOwnedInventoryItem(requester, itemId) {
  const item = await InventoryItem.findOne({
    _id: itemId,
    athleteId: requester.id,
  });
  if (!item) throw notFoundError();
  return item;
}

async function updateInventoryItem(requester, itemId, input) {
  const now = new Date();
  const item = await getOwnedInventoryItem(requester, itemId);
  if (item.archivedAt) throw archivedError();

  if (
    hasOwn(input, 'substanceId') &&
    !sameId(input.substanceId, item.substanceId)
  ) {
    await ensureActiveSubstance(input.substanceId);
  }

  const updatedItem = await InventoryItem.findOneAndUpdate(
    { _id: item.id, athleteId: requester.id, archivedAt: null },
    { $set: input },
    { new: true, runValidators: true },
  );
  if (!updatedItem) throw archivedError();

  await recordInventoryAudit(requester, updatedItem, 'metadata_updated', {
    fieldsChanged: Object.keys(input).sort(),
  });
  return toInventoryItemResponse(updatedItem, now);
}

async function archiveInventoryItem(requester, itemId) {
  const now = new Date();
  const item = await getOwnedInventoryItem(requester, itemId);
  if (item.archivedAt) return toInventoryItemResponse(item, now);

  const archivedItem = await InventoryItem.findOneAndUpdate(
    { _id: item.id, athleteId: requester.id, archivedAt: null },
    { $set: { archivedAt: now } },
    { new: true, runValidators: true },
  );
  if (!archivedItem) {
    const concurrentItem = await getOwnedInventoryItem(requester, itemId);
    return toInventoryItemResponse(concurrentItem, now);
  }

  await recordInventoryAudit(requester, archivedItem, 'archived');
  return toInventoryItemResponse(archivedItem, now);
}

function atomicMovementUpdate(item, input, now) {
  const filters = {
    _id: item.id,
    athleteId: item.athleteId,
    archivedAt: null,
  };
  let quantityExpression;

  if (input.type === INVENTORY_MOVEMENT_TYPES.IN) {
    filters.quantity = { $lte: MAX_QUANTITY - input.quantity };
    quantityExpression = {
      $round: [{ $add: ['$quantity', input.quantity] }, 3],
    };
  } else if (input.type === INVENTORY_MOVEMENT_TYPES.OUT) {
    filters.quantity = { $gte: input.quantity };
    filters.$or = [
      { expirationDate: null },
      { expirationDate: { $gte: now } },
    ];
    quantityExpression = {
      $round: [{ $subtract: ['$quantity', input.quantity] }, 3],
    };
  } else {
    quantityExpression = input.quantity;
  }

  return InventoryItem.findOneAndUpdate(
    filters,
    [{ $set: { quantity: quantityExpression } }],
    { new: false },
  );
}

async function explainFailedAtomicMovement(itemId, requesterId, input, now) {
  const currentItem = await InventoryItem.findOne({
    _id: itemId,
    athleteId: requesterId,
  });
  if (!currentItem) throw notFoundError();
  if (currentItem.archivedAt) throw archivedError();
  if (
    input.type === INVENTORY_MOVEMENT_TYPES.OUT &&
    isExpired(currentItem, now)
  ) {
    throw expiredError();
  }
  if (
    input.type === INVENTORY_MOVEMENT_TYPES.OUT &&
    currentItem.quantity < input.quantity
  ) {
    throw insufficientError();
  }
  if (
    input.type === INVENTORY_MOVEMENT_TYPES.IN &&
    currentItem.quantity + input.quantity > MAX_QUANTITY
  ) {
    throw validationError(
      'quantity',
      `A quantidade resultante deve ser menor ou igual a ${MAX_QUANTITY}.`,
    );
  }
  throw internalError();
}

async function compensateMovement(itemId, resultingQuantity, previousQuantity) {
  const compensatedItem = await InventoryItem.findOneAndUpdate(
    { _id: itemId, quantity: resultingQuantity },
    { $set: { quantity: previousQuantity } },
    { new: true, runValidators: true },
  );
  return Boolean(compensatedItem);
}

async function createInventoryMovement(requester, itemId, input) {
  const now = new Date();
  const item = await getOwnedInventoryItem(requester, itemId);
  if (item.archivedAt) throw archivedError();
  if (
    input.type === INVENTORY_MOVEMENT_TYPES.OUT &&
    isExpired(item, now)
  ) {
    throw expiredError();
  }

  const previousItem = await atomicMovementUpdate(item, input, now);
  if (!previousItem) {
    await explainFailedAtomicMovement(itemId, requester.id, input, now);
  }

  const previousQuantity = previousItem.quantity;
  const resultingQuantity =
    input.type === INVENTORY_MOVEMENT_TYPES.IN
      ? Math.round((previousQuantity + input.quantity) * 1000) / 1000
      : input.type === INVENTORY_MOVEMENT_TYPES.OUT
        ? Math.round((previousQuantity - input.quantity) * 1000) / 1000
        : input.quantity;

  let movement;
  try {
    movement = await InventoryMovement.create({
      inventoryItemId: item.id,
      athleteId: requester.id,
      type: input.type,
      quantity: input.quantity,
      previousQuantity,
      resultingQuantity,
      reason: input.reason,
      createdBy: requester.id,
    });
  } catch {
    const compensated = await compensateMovement(
      item.id,
      resultingQuantity,
      previousQuantity,
    );
    if (!compensated) throw internalError();
    throw internalError();
  }

  await recordMovementAudit(requester, movement);
  return toInventoryMovementResponse(movement);
}

async function listInventoryMovements(requester, itemId, query) {
  const item = await getAccessibleInventoryItem(requester, itemId);
  const filters = { inventoryItemId: item.id };
  if (query.type) filters.type = query.type;
  if (query.dateFrom || query.dateTo) {
    filters.createdAt = {};
    if (query.dateFrom) filters.createdAt.$gte = query.dateFrom;
    if (query.dateTo) filters.createdAt.$lte = query.dateTo;
  }

  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.limit;
  const [movements, total] = await Promise.all([
    InventoryMovement.find(filters)
      .sort({ createdAt: direction, _id: direction })
      .skip(skip)
      .limit(query.limit),
    InventoryMovement.countDocuments(filters),
  ]);

  return {
    movements: movements.map(toInventoryMovementResponse),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

module.exports = {
  archiveInventoryItem,
  createInventoryItem,
  createInventoryMovement,
  getInventoryItem,
  listInventoryItems,
  listInventoryMovements,
  updateInventoryItem,
};
