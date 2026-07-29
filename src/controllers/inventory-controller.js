const inventoryService = require('../services/inventory-service');

async function createInventoryItem(request, response) {
  const item = await inventoryService.createInventoryItem(
    request.user,
    request.body,
  );
  return response.status(201).json({
    success: true,
    data: item,
    message: 'Item de estoque cadastrado com sucesso.',
  });
}

async function listInventoryItems(request, response) {
  const { items, meta } = await inventoryService.listInventoryItems(
    request.user,
    request.query,
  );
  return response.status(200).json({
    success: true,
    data: items,
    meta,
  });
}

async function getInventoryItem(request, response) {
  const item = await inventoryService.getInventoryItem(
    request.user,
    request.params.id,
  );
  return response.status(200).json({
    success: true,
    data: item,
    message: 'Item de estoque obtido com sucesso.',
  });
}

async function updateInventoryItem(request, response) {
  const item = await inventoryService.updateInventoryItem(
    request.user,
    request.params.id,
    request.body,
  );
  return response.status(200).json({
    success: true,
    data: item,
    message: 'Item de estoque atualizado com sucesso.',
  });
}

async function archiveInventoryItem(request, response) {
  const item = await inventoryService.archiveInventoryItem(
    request.user,
    request.params.id,
  );
  return response.status(200).json({
    success: true,
    data: item,
    message: 'Item de estoque arquivado com sucesso.',
  });
}

async function createInventoryMovement(request, response) {
  const movement = await inventoryService.createInventoryMovement(
    request.user,
    request.params.id,
    request.body,
  );
  return response.status(201).json({
    success: true,
    data: movement,
    message: 'Movimentação de estoque registrada com sucesso.',
  });
}

async function listInventoryMovements(request, response) {
  const { movements, meta } = await inventoryService.listInventoryMovements(
    request.user,
    request.params.id,
    request.query,
  );
  return response.status(200).json({
    success: true,
    data: movements,
    meta,
  });
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
