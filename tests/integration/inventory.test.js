const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const AUDIT_ACTIONS = require('../../src/constants/audit-actions');
const AuditLog = require('../../src/models/audit-log');
const InventoryItem = require('../../src/models/inventory-item');
const InventoryMovement = require('../../src/models/inventory-movement');
const ProfessionalAthleteLink = require(
  '../../src/models/professional-athlete-link',
);
const ProfessionalProfile = require('../../src/models/professional-profile');
const Substance = require('../../src/models/substance');
const User = require('../../src/models/user');
const auditService = require('../../src/services/audit-service');
const { generateToken } = require('../../src/utils/jwt');

let mongoServer;
let passwordHash;

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

async function createUser(role, verificationStatus = 'approved') {
  const user = await User.create({
    name: `Usuário ${role}`,
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    passwordHash,
    role,
  });
  if (role === 'professional') {
    const reviewed = verificationStatus !== 'pending';
    await ProfessionalProfile.create({
      userId: user.id,
      verificationStatus,
      verificationDocument: {
        storageKey: `${user.id}.pdf`,
        url: `/private-files/${user.id}.pdf`,
        originalName: 'documento.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20,
      },
      reviewedAt: reviewed ? new Date() : null,
      reviewedBy: reviewed ? user.id : null,
      rejectionReason:
        verificationStatus === 'rejected' ? 'Rejeitado.' : null,
    });
  }
  return user;
}

function createLink(professional, athlete, status = 'active') {
  const now = new Date();
  return ProfessionalAthleteLink.create({
    professionalId: professional.id,
    athleteId: athlete.id,
    status,
    requestedAt: now,
    acceptedAt: ['active', 'ended'].includes(status) ? now : null,
    rejectedAt: status === 'rejected' ? now : null,
    endedAt: status === 'ended' ? now : null,
    endedBy: status === 'ended' ? professional.id : null,
  });
}

function itemPayload(overrides = {}) {
  return {
    name: 'Item de teste',
    unit: 'unit',
    quantity: 3,
    lowStockThreshold: 1,
    expirationDate: null,
    ...overrides,
  };
}

function createItem(athlete, overrides = {}) {
  return InventoryItem.create({
    athleteId: athlete.id,
    name: 'Item',
    unit: 'unit',
    quantity: 3,
    ...overrides,
  });
}

function createSubstance(admin, active = true) {
  return Substance.create({
    name: `Substância ${new mongoose.Types.ObjectId()}`,
    category: 'other',
    defaultUnit: 'mg',
    active,
    createdBy: admin.id,
  });
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash('SenhaForte123!', 10);
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterEach(async () => {
  jest.restoreAllMocks();
  if (mongoose.connection.readyState !== 1) return;
  await Promise.all([
    AuditLog.deleteMany({}),
    InventoryMovement.deleteMany({}),
    InventoryItem.deleteMany({}),
    Substance.deleteMany({}),
    ProfessionalAthleteLink.deleteMany({}),
    ProfessionalProfile.deleteMany({}),
    User.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe('Inventory API V1', () => {
  it('exige autenticação em todos os endpoints', async () => {
    const id = new mongoose.Types.ObjectId();
    const responses = await Promise.all([
      request(app).post('/api/v1/inventory').send(itemPayload()),
      request(app).get('/api/v1/inventory'),
      request(app).get(`/api/v1/inventory/${id}`),
      request(app).patch(`/api/v1/inventory/${id}`).send({ name: 'Novo' }),
      request(app).patch(`/api/v1/inventory/${id}/archive`).send({}),
      request(app)
        .post(`/api/v1/inventory/${id}/movements`)
        .send({ type: 'in', quantity: 1, reason: 'Entrada manual.' }),
      request(app).get(`/api/v1/inventory/${id}/movements`),
    ]);
    expect(responses.map((response) => response.status)).toEqual(
      [401, 401, 401, 401, 401, 401, 401],
    );
  });

  it('admin recebe FORBIDDEN em todas as rotas', async () => {
    const admin = await createUser('admin');
    const id = new mongoose.Types.ObjectId();
    const calls = [
      request(app).post('/api/v1/inventory').send(itemPayload()),
      request(app).get('/api/v1/inventory'),
      request(app).get(`/api/v1/inventory/${id}`),
      request(app).patch(`/api/v1/inventory/${id}`).send({ name: 'Novo' }),
      request(app).patch(`/api/v1/inventory/${id}/archive`).send({}),
      request(app)
        .post(`/api/v1/inventory/${id}/movements`)
        .send({ type: 'in', quantity: 1, reason: 'Entrada manual.' }),
      request(app).get(`/api/v1/inventory/${id}/movements`),
    ];
    const responses = await Promise.all(
      calls.map((call) => call.set('Authorization', authorization(admin))),
    );
    expect(responses.map((response) => response.status)).toEqual(
      [403, 403, 403, 403, 403, 403, 403],
    );
    responses.forEach((response) => {
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  it.each(['pending', 'rejected'])(
    'profissional %s não exerce leitura profissional',
    async (status) => {
      const professional = await createUser('professional', status);
      const response = await request(app)
        .get(`/api/v1/inventory?athleteId=${new mongoose.Types.ObjectId()}`)
        .set('Authorization', authorization(professional));
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(
        status === 'pending'
          ? 'PROFESSIONAL_PENDING_APPROVAL'
          : 'PROFESSIONAL_REJECTED',
      );
    },
  );

  it('atleta cria item próprio com movimento inicial e auditoria segura', async () => {
    const athlete = await createUser('athlete');
    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', authorization(athlete))
      .send(itemPayload({ name: '  Item cadastrado  ', quantity: 3.125 }));

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(expect.objectContaining({
      athleteId: athlete.id,
      name: 'Item cadastrado',
      quantity: 3.125,
      lowStock: false,
      expired: false,
    }));
    expect(response.body.data).not.toHaveProperty('__v');
    expect(response.body.data).not.toHaveProperty('ownerId');

    const movement = await InventoryMovement.findOne();
    expect(movement).toMatchObject({
      type: 'adjustment',
      quantity: 3.125,
      previousQuantity: 0,
      resultingQuantity: 3.125,
      reason: 'Estoque inicial.',
    });

    const logs = await AuditLog.find({}).sort({ createdAt: 1 });
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.action).sort()).toEqual(
      [
        AUDIT_ACTIONS.INVENTORY_MOVEMENT_CREATED,
        AUDIT_ACTIONS.INVENTORY_UPDATED,
      ].sort(),
    );
    const itemLog = logs.find(
      (log) => log.action === AUDIT_ACTIONS.INVENTORY_UPDATED,
    );
    expect(itemLog.metadata).toEqual({
      athleteId: athlete.id,
      operation: 'created',
      initialQuantityPresent: true,
    });
    const movementLog = logs.find(
      (log) => log.action === AUDIT_ACTIONS.INVENTORY_MOVEMENT_CREATED,
    );
    expect(movementLog.metadata).toEqual({
      athleteId: athlete.id,
      inventoryItemId: response.body.data.id,
      movementType: 'adjustment',
    });
    expect(JSON.stringify(logs)).not.toContain('Estoque inicial.');
    expect(JSON.stringify(logs)).not.toContain('3.125');
  });

  it('quantidade inicial zero não cria movimento vazio', async () => {
    const athlete = await createUser('athlete');
    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', authorization(athlete))
      .send(itemPayload({ quantity: 0 }));

    expect(response.status).toBe(201);
    expect(await InventoryMovement.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(1);
    expect((await AuditLog.findOne()).metadata.initialQuantityPresent).toBe(
      false,
    );
  });

  it('athleteId e campos controlados são rejeitados na criação', async () => {
    const athlete = await createUser('athlete');
    for (const body of [
      itemPayload({ athleteId: new mongoose.Types.ObjectId() }),
      itemPayload({ ownerId: athlete.id }),
      itemPayload({ archivedAt: new Date() }),
      itemPayload({ expired: false }),
      itemPayload({ quantity: '3' }),
      itemPayload({ quantity: 1.1234 }),
      itemPayload({ unit: 'units' }),
    ]) {
      const response = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', authorization(athlete))
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await InventoryItem.countDocuments()).toBe(0);
  });

  it('rejeita chaves perigosas antes da validação Joi', async () => {
    const athlete = await createUser('athlete');
    for (const field of ['__proto__', 'prototype', 'constructor', '$set']) {
      const body =
        '{"name":"Item","unit":"unit","quantity":1,' +
        `"${field}":"value"}`;
      const response = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', authorization(athlete))
        .set('Content-Type', 'application/json')
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('aceita Substance ativa/null e rejeita inativa ou inexistente', async () => {
    const [athlete, admin] = await Promise.all([
      createUser('athlete'),
      createUser('admin'),
    ]);
    const [active, inactive] = await Promise.all([
      createSubstance(admin, true),
      createSubstance(admin, false),
    ]);
    const activeResponse = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', authorization(athlete))
      .send(itemPayload({ substanceId: active.id, quantity: 0 }));
    const nullResponse = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', authorization(athlete))
      .send(itemPayload({
        name: 'Sem substância',
        substanceId: null,
        quantity: 0,
      }));
    expect(activeResponse.status).toBe(201);
    expect(activeResponse.body.data.substanceId).toBe(active.id);
    expect(nullResponse.status).toBe(201);
    expect(nullResponse.body.data.substanceId).toBeNull();

    for (const substanceId of [
      inactive.id,
      new mongoose.Types.ObjectId().toString(),
    ]) {
      const response = await request(app)
        .post('/api/v1/inventory')
        .set('Authorization', authorization(athlete))
        .send(itemPayload({ substanceId }));
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('faz rollback da criação se movimento inicial ou auditoria falhar', async () => {
    const athlete = await createUser('athlete');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(InventoryMovement, 'create')
      .mockRejectedValueOnce(new Error('movement failed'));
    const movementFailure = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', authorization(athlete))
      .send(itemPayload());
    expect(movementFailure.status).toBe(500);
    expect(await InventoryItem.countDocuments()).toBe(0);
    expect(await InventoryMovement.countDocuments()).toBe(0);

    jest.restoreAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const originalRecord = auditService.record;
    jest
      .spyOn(auditService, 'record')
      .mockImplementationOnce((event) => originalRecord(event))
      .mockRejectedValueOnce(new Error('audit failed'));
    const auditFailure = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', authorization(athlete))
      .send(itemPayload());
    expect(auditFailure.status).toBe(500);
    expect(await InventoryItem.countDocuments()).toBe(0);
    expect(await InventoryMovement.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('lista somente itens próprios com busca escapada e estados derivados', async () => {
    const athlete = await createUser('athlete');
    const outsider = await createUser('athlete');
    await Promise.all([
      createItem(athlete, {
        name: 'Item [especial]',
        quantity: 1,
        lowStockThreshold: 1,
        expirationDate: new Date('2020-01-01T00:00:00.000Z'),
      }),
      createItem(athlete, {
        name: 'Item normal',
        quantity: 5,
        lowStockThreshold: null,
        expirationDate: null,
      }),
      createItem(athlete, {
        name: 'Arquivado',
        archivedAt: new Date(),
      }),
      createItem(outsider, { name: 'Item [especial]' }),
    ]);

    const filtered = await request(app)
      .get('/api/v1/inventory?search=%5Bespecial%5D&expired=true&lowStock=true')
      .set('Authorization', authorization(athlete));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({
      name: 'Item [especial]',
      expired: true,
      lowStock: true,
    });

    const inverse = await request(app)
      .get('/api/v1/inventory?expired=false&lowStock=false')
      .set('Authorization', authorization(athlete));
    expect(inverse.body.data).toHaveLength(1);
    expect(inverse.body.data[0].name).toBe('Item normal');

    const archived = await request(app)
      .get('/api/v1/inventory?archived=true')
      .set('Authorization', authorization(athlete));
    expect(archived.body.data).toHaveLength(1);
    expect(archived.body.data[0].name).toBe('Arquivado');
  });

  it('lista com paginação, sort whitelist e desempate estável', async () => {
    const athlete = await createUser('athlete');
    await Promise.all([
      createItem(athlete, { name: 'B', quantity: 2 }),
      createItem(athlete, { name: 'A', quantity: 2 }),
      createItem(athlete, { name: 'C', quantity: 1 }),
    ]);
    const response = await request(app)
      .get('/api/v1/inventory?page=1&limit=2&sortBy=name&sortOrder=asc')
      .set('Authorization', authorization(athlete));
    expect(response.status).toBe(200);
    expect(response.body.data.map((item) => item.name)).toEqual(['A', 'B']);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    for (const query of [
      'sortBy=athleteId',
      'sortOrder=random',
      'archived=all',
      'expired=1',
      'unknown=true',
    ]) {
      const invalid = await request(app)
        .get(`/api/v1/inventory?${query}`)
        .set('Authorization', authorization(athlete));
      expect(invalid.status).toBe(400);
    }
  });

  it('profissional exige athleteId e vínculo active; fora do escopo é 404', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const outsider = await createUser('athlete');
    await createLink(professional, athlete);
    await Promise.all([createItem(athlete), createItem(outsider)]);

    const missing = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', authorization(professional));
    expect(missing.status).toBe(400);

    const linked = await request(app)
      .get(`/api/v1/inventory?athleteId=${athlete.id}`)
      .set('Authorization', authorization(professional));
    expect(linked.status).toBe(200);
    expect(linked.body.data).toHaveLength(1);

    const hidden = await request(app)
      .get(`/api/v1/inventory?athleteId=${outsider.id}`)
      .set('Authorization', authorization(professional));
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it.each(['pending', 'rejected', 'ended'])(
    'vínculo %s não concede leitura profissional',
    async (status) => {
      const [professional, athlete] = await Promise.all([
        createUser('professional'),
        createUser('athlete'),
      ]);
      await createLink(professional, athlete, status);
      const item = await createItem(athlete);
      const list = await request(app)
        .get(`/api/v1/inventory?athleteId=${athlete.id}`)
        .set('Authorization', authorization(professional));
      const detail = await request(app)
        .get(`/api/v1/inventory/${item.id}`)
        .set('Authorization', authorization(professional));
      const movements = await request(app)
        .get(`/api/v1/inventory/${item.id}/movements`)
        .set('Authorization', authorization(professional));
      expect([list.status, detail.status, movements.status]).toEqual([
        404,
        404,
        404,
      ]);
    },
  );

  it('atleta não informa athleteId na listagem', async () => {
    const athlete = await createUser('athlete');
    const response = await request(app)
      .get(`/api/v1/inventory?athleteId=${athlete.id}`)
      .set('Authorization', authorization(athlete));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('detalhe respeita ownership, vínculo e ObjectId válido', async () => {
    const athlete = await createUser('athlete');
    const outsider = await createUser('athlete');
    const item = await createItem(outsider);

    const hidden = await request(app)
      .get(`/api/v1/inventory/${item.id}`)
      .set('Authorization', authorization(athlete));
    const invalid = await request(app)
      .get('/api/v1/inventory/id-invalido')
      .set('Authorization', authorization(athlete));
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_OBJECT_ID');
  });

  it('PATCH altera somente metadados, valida Substance e audita nomes', async () => {
    const [athlete, admin] = await Promise.all([
      createUser('athlete'),
      createUser('admin'),
    ]);
    const [active, inactive] = await Promise.all([
      createSubstance(admin, true),
      createSubstance(admin, false),
    ]);
    const item = await createItem(athlete, { quantity: 7 });
    const response = await request(app)
      .patch(`/api/v1/inventory/${item.id}`)
      .set('Authorization', authorization(athlete))
      .send({
        name: '  Novo nome  ',
        substanceId: active.id,
        lowStockThreshold: 2,
      });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      name: 'Novo nome',
      substanceId: active.id,
      quantity: 7,
      lowStockThreshold: 2,
    });
    expect(await InventoryMovement.countDocuments()).toBe(0);
    const log = await AuditLog.findOne({
      action: AUDIT_ACTIONS.INVENTORY_UPDATED,
    });
    expect(log.metadata).toEqual({
      athleteId: athlete.id,
      operation: 'metadata_updated',
      fieldsChanged: ['lowStockThreshold', 'name', 'substanceId'],
    });
    expect(JSON.stringify(log.metadata)).not.toContain('Novo nome');

    const remove = await request(app)
      .patch(`/api/v1/inventory/${item.id}`)
      .set('Authorization', authorization(athlete))
      .send({ substanceId: null });
    expect(remove.status).toBe(200);
    expect(remove.body.data.substanceId).toBeNull();

    const inactiveResponse = await request(app)
      .patch(`/api/v1/inventory/${item.id}`)
      .set('Authorization', authorization(athlete))
      .send({ substanceId: inactive.id });
    expect(inactiveResponse.status).toBe(400);
  });

  it('PATCH rejeita body vazio, quantity, ownership e item arquivado', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete);
    for (const body of [
      {},
      { quantity: 10 },
      { athleteId: athlete.id },
      { archivedAt: new Date() },
    ]) {
      const response = await request(app)
        .patch(`/api/v1/inventory/${item.id}`)
        .set('Authorization', authorization(athlete))
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }

    item.archivedAt = new Date();
    await item.save();
    const archived = await request(app)
      .patch(`/api/v1/inventory/${item.id}`)
      .set('Authorization', authorization(athlete))
      .send({ name: 'Novo' });
    expect(archived.status).toBe(422);
    expect(archived.body.error.code).toBe('INVENTORY_ITEM_ARCHIVED');
  });

  it('profissional possui somente leitura e não cria, atualiza ou arquiva', async () => {
    const [professional, athlete] = await Promise.all([
      createUser('professional'),
      createUser('athlete'),
    ]);
    await createLink(professional, athlete);
    const item = await createItem(athlete);
    const calls = [
      request(app).post('/api/v1/inventory').send(itemPayload()),
      request(app).patch(`/api/v1/inventory/${item.id}`).send({
        name: 'Novo',
      }),
      request(app).patch(`/api/v1/inventory/${item.id}/archive`).send({}),
    ];
    const responses = await Promise.all(
      calls.map((call) =>
        call.set('Authorization', authorization(professional))),
    );
    expect(responses.map((response) => response.status)).toEqual([
      403,
      403,
      403,
    ]);
  });

  it('archive é idempotente, concorrente e preserva movimentos', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete);
    await InventoryMovement.create({
      inventoryItemId: item.id,
      athleteId: athlete.id,
      type: 'adjustment',
      quantity: 3,
      previousQuantity: 0,
      resultingQuantity: 3,
      reason: 'Estoque inicial.',
      createdBy: athlete.id,
    });
    const call = () =>
      request(app)
        .patch(`/api/v1/inventory/${item.id}/archive`)
        .set('Authorization', authorization(athlete))
        .send({});
    const [first, second] = await Promise.all([call(), call()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.archivedAt).toBe(second.body.data.archivedAt);
    expect(
      await AuditLog.countDocuments({
        action: AUDIT_ACTIONS.INVENTORY_UPDATED,
        entityId: item._id,
        'metadata.operation': 'archived',
      }),
    ).toBe(1);
    expect(await InventoryMovement.countDocuments()).toBe(1);
  });

  it('registra in, out e adjustment absoluto com saldos coerentes', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete, { quantity: 10 });
    const move = async (body) =>
      request(app)
        .post(`/api/v1/inventory/${item.id}/movements`)
        .set('Authorization', authorization(athlete))
        .send(body);

    const input = await move({
      type: 'in',
      quantity: 2,
      reason: 'Entrada manual.',
    });
    const output = await move({
      type: 'out',
      quantity: 3,
      reason: 'Baixa manual.',
    });
    const adjustment = await move({
      type: 'adjustment',
      quantity: 7,
      reason: 'Contagem manual.',
    });
    const zero = await move({
      type: 'adjustment',
      quantity: 0,
      reason: 'Contagem zerada.',
    });

    expect(input.status).toBe(201);
    expect(input.body.data).toMatchObject({
      previousQuantity: 10,
      resultingQuantity: 12,
    });
    expect(output.body.data).toMatchObject({
      previousQuantity: 12,
      resultingQuantity: 9,
    });
    expect(adjustment.body.data).toMatchObject({
      quantity: 7,
      previousQuantity: 9,
      resultingQuantity: 7,
    });
    expect(zero.body.data).toMatchObject({
      previousQuantity: 7,
      resultingQuantity: 0,
    });
    expect((await InventoryItem.findById(item.id)).quantity).toBe(0);
  });

  it('item vencido bloqueia out, mas permite in e adjustment', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete, {
      quantity: 5,
      expirationDate: new Date('2020-01-01T00:00:00.000Z'),
    });
    const move = (body) =>
      request(app)
        .post(`/api/v1/inventory/${item.id}/movements`)
        .set('Authorization', authorization(athlete))
        .send(body);
    const output = await move({
      type: 'out',
      quantity: 1,
      reason: 'Baixa manual.',
    });
    expect(output.status).toBe(422);
    expect(output.body.error.code).toBe('INVENTORY_ITEM_EXPIRED');
    expect(await InventoryMovement.countDocuments()).toBe(0);

    expect((await move({
      type: 'in',
      quantity: 1,
      reason: 'Entrada manual.',
    })).status).toBe(201);
    expect((await move({
      type: 'adjustment',
      quantity: 2,
      reason: 'Contagem manual.',
    })).status).toBe(201);
  });

  it('estoque insuficiente não altera item, movimento ou auditoria', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete, { quantity: 2 });
    const response = await request(app)
      .post(`/api/v1/inventory/${item.id}/movements`)
      .set('Authorization', authorization(athlete))
      .send({ type: 'out', quantity: 3, reason: 'Baixa manual.' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVENTORY_INSUFFICIENT');
    expect((await InventoryItem.findById(item.id)).quantity).toBe(2);
    expect(await InventoryMovement.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('out exato resulta em zero e item arquivado bloqueia qualquer movimento', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete, { quantity: 2 });
    const exact = await request(app)
      .post(`/api/v1/inventory/${item.id}/movements`)
      .set('Authorization', authorization(athlete))
      .send({ type: 'out', quantity: 2, reason: 'Baixa total.' });
    expect(exact.status).toBe(201);
    expect(exact.body.data.resultingQuantity).toBe(0);

    await InventoryItem.updateOne(
      { _id: item.id },
      { $set: { archivedAt: new Date() } },
    );
    for (const type of ['in', 'out', 'adjustment']) {
      const blocked = await request(app)
        .post(`/api/v1/inventory/${item.id}/movements`)
        .set('Authorization', authorization(athlete))
        .send({
          type,
          quantity: type === 'adjustment' ? 0 : 1,
          reason: 'Movimento manual.',
        });
      expect(blocked.status).toBe(422);
      expect(blocked.body.error.code).toBe('INVENTORY_ITEM_ARCHIVED');
    }
  });

  it('profissional não movimenta, mas lê movimentos com vínculo active', async () => {
    const [professional, athlete] = await Promise.all([
      createUser('professional'),
      createUser('athlete'),
    ]);
    const link = await createLink(professional, athlete);
    const item = await createItem(athlete);
    await InventoryMovement.create({
      inventoryItemId: item.id,
      athleteId: athlete.id,
      type: 'out',
      quantity: 1,
      previousQuantity: 3,
      resultingQuantity: 2,
      reason: 'Baixa manual.',
      createdBy: athlete.id,
    });

    const forbidden = await request(app)
      .post(`/api/v1/inventory/${item.id}/movements`)
      .set('Authorization', authorization(professional))
      .send({ type: 'in', quantity: 1, reason: 'Entrada manual.' });
    expect(forbidden.status).toBe(403);

    const readable = await request(app)
      .get(`/api/v1/inventory/${item.id}/movements`)
      .set('Authorization', authorization(professional));
    expect(readable.status).toBe(200);
    expect(readable.body.data).toHaveLength(1);

    link.status = 'ended';
    link.endedAt = new Date();
    link.endedBy = professional.id;
    await link.save();
    const ended = await request(app)
      .get(`/api/v1/inventory/${item.id}/movements`)
      .set('Authorization', authorization(professional));
    expect(ended.status).toBe(404);
  });

  it('lista movimentos por tipo/período com paginação e ordem fixa', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete);
    const base = {
      inventoryItemId: item.id,
      athleteId: athlete.id,
      quantity: 1,
      previousQuantity: 3,
      resultingQuantity: 2,
      reason: 'Movimento manual.',
      createdBy: athlete.id,
    };
    const [first, second] = await Promise.all([
      InventoryMovement.create({ ...base, type: 'out' }),
      InventoryMovement.create({
        ...base,
        type: 'in',
        previousQuantity: 2,
        resultingQuantity: 3,
      }),
    ]);
    await InventoryMovement.collection.updateOne(
      { _id: first._id },
      { $set: { createdAt: new Date('2026-08-01T00:00:00.000Z') } },
    );
    await InventoryMovement.collection.updateOne(
      { _id: second._id },
      { $set: { createdAt: new Date('2026-08-02T00:00:00.000Z') } },
    );

    const response = await request(app)
      .get(
        `/api/v1/inventory/${item.id}/movements?type=in` +
        '&dateFrom=2026-08-02&dateTo=2026-08-03&page=1&limit=1&sortOrder=asc',
      )
      .set('Authorization', authorization(athlete));
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].type).toBe('in');
    expect(response.body.meta).toMatchObject({ total: 1, totalPages: 1 });

    for (const query of [
      'sortBy=createdAt',
      'type=invalid',
      'dateFrom=2026-08-03&dateTo=2026-08-01',
    ]) {
      const invalid = await request(app)
        .get(`/api/v1/inventory/${item.id}/movements?${query}`)
        .set('Authorization', authorization(athlete));
      expect(invalid.status).toBe(400);
    }
  });

  it('duas saídas concorrentes não deixam saldo negativo', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete, { quantity: 5 });
    const call = () =>
      request(app)
        .post(`/api/v1/inventory/${item.id}/movements`)
        .set('Authorization', authorization(athlete))
        .send({ type: 'out', quantity: 4, reason: 'Baixa concorrente.' });
    const responses = await Promise.all([call(), call()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201,
      409,
    ]);
    expect((await InventoryItem.findById(item.id)).quantity).toBe(1);
    expect(await InventoryMovement.countDocuments()).toBe(1);
  });

  it('entradas concorrentes são somadas sem perda de atualização', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete, { quantity: 0 });
    const call = (quantity) =>
      request(app)
        .post(`/api/v1/inventory/${item.id}/movements`)
        .set('Authorization', authorization(athlete))
        .send({ type: 'in', quantity, reason: 'Entrada concorrente.' });
    const responses = await Promise.all([call(2), call(3)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect((await InventoryItem.findById(item.id)).quantity).toBe(5);
    expect(await InventoryMovement.countDocuments()).toBe(2);
  });

  it('falha ao criar movimento compensa quantidade por CAS', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete, { quantity: 5 });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(InventoryMovement, 'create')
      .mockRejectedValueOnce(new Error('movement failed'));
    const response = await request(app)
      .post(`/api/v1/inventory/${item.id}/movements`)
      .set('Authorization', authorization(athlete))
      .send({ type: 'in', quantity: 2, reason: 'Entrada manual.' });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect((await InventoryItem.findById(item.id)).quantity).toBe(5);
    expect(await InventoryMovement.countDocuments()).toBe(0);
  });

  it('compensação CAS não sobrescreve movimentação concorrente posterior', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete, { quantity: 5 });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(InventoryMovement, 'create')
      .mockImplementationOnce(async () => {
        await InventoryItem.updateOne(
          { _id: item.id },
          { $inc: { quantity: 1 } },
        );
        throw new Error('movement failed after concurrent update');
      });
    const response = await request(app)
      .post(`/api/v1/inventory/${item.id}/movements`)
      .set('Authorization', authorization(athlete))
      .send({ type: 'in', quantity: 2, reason: 'Entrada manual.' });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect((await InventoryItem.findById(item.id)).quantity).toBe(8);
  });

  it('falha de auditoria comum expõe a atomicidade limitada documentada', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete, { quantity: 5 });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(auditService, 'record')
      .mockRejectedValueOnce(new Error('audit failed'));
    const response = await request(app)
      .post(`/api/v1/inventory/${item.id}/movements`)
      .set('Authorization', authorization(athlete))
      .send({ type: 'in', quantity: 2, reason: 'Entrada manual.' });
    expect(response.status).toBe(500);
    expect((await InventoryItem.findById(item.id)).quantity).toBe(7);
    expect(await InventoryMovement.countDocuments()).toBe(1);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('não expõe DELETE, restore ou mutações de movimento', async () => {
    const athlete = await createUser('athlete');
    const item = await createItem(athlete);
    const movementId = new mongoose.Types.ObjectId();
    const calls = [
      request(app).delete(`/api/v1/inventory/${item.id}`),
      request(app).patch(`/api/v1/inventory/${item.id}/restore`).send({}),
      request(app)
        .patch(`/api/v1/inventory/${item.id}/movements/${movementId}`)
        .send({ reason: 'Correção.' }),
      request(app).delete(
        `/api/v1/inventory/${item.id}/movements/${movementId}`,
      ),
    ];
    const responses = await Promise.all(
      calls.map((call) => call.set('Authorization', authorization(athlete))),
    );
    expect(responses.map((response) => response.status)).toEqual([
      404,
      404,
      404,
      404,
    ]);
  });
});
