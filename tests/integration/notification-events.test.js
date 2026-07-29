const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const AuditLog = require('../../src/models/audit-log');
const CheckIn = require('../../src/models/check-in');
const Exam = require('../../src/models/exam');
const InventoryItem = require('../../src/models/inventory-item');
const InventoryMovement = require('../../src/models/inventory-movement');
const Notification = require('../../src/models/notification');
const ProfessionalAthleteLink = require(
  '../../src/models/professional-athlete-link',
);
const ProfessionalProfile = require('../../src/models/professional-profile');
const Protocol = require('../../src/models/protocol');
const ProtocolVersion = require('../../src/models/protocol-version');
const Substance = require('../../src/models/substance');
const TrackingRecord = require('../../src/models/tracking-record');
const User = require('../../src/models/user');
const checkInService = require('../../src/services/check-in-service');
const examService = require('../../src/services/exam-service');
const inventoryService = require('../../src/services/inventory-service');
const linkService = require('../../src/services/link-service');
const professionalVerificationService = require(
  '../../src/services/professional-verification-service',
);
const protocolService = require('../../src/services/protocol-service');
const trackingRecordService = require(
  '../../src/services/tracking-record-service',
);
const logger = require('../../src/utils/logger');

let mongoServer;

async function createUser(role = 'athlete', overrides = {}) {
  return User.create({
    name: `Usuário ${role}`,
    email: `${role}-${new mongoose.Types.ObjectId()}@example.com`,
    passwordHash: 'hash-for-notification-event-tests',
    role,
    ...overrides,
  });
}

async function createProfessionalProfile(
  professional,
  verificationStatus = 'approved',
) {
  const reviewed = verificationStatus !== 'pending';
  return ProfessionalProfile.create({
    userId: professional.id,
    verificationStatus,
    verificationDocument: {
      storageKey: `${professional.id}.pdf`,
      url: `/private-files/${professional.id}.pdf`,
      originalName: 'documento.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
    },
    submittedAt: new Date(),
    reviewedAt: reviewed ? new Date() : null,
    reviewedBy: reviewed ? professional.id : null,
    rejectionReason:
      verificationStatus === 'rejected' ? 'Motivo privado.' : null,
  });
}

async function createProfessional(overrides = {}) {
  const professional = await createUser('professional', overrides);
  await createProfessionalProfile(professional);
  return professional;
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

function createSubstance(admin) {
  return Substance.create({
    name: `Substância ${new mongoose.Types.ObjectId()}`,
    category: 'other',
    defaultUnit: 'mg',
    active: true,
    createdBy: admin.id,
  });
}

function protocolInput(athlete, substance, overrides = {}) {
  return {
    athleteId: athlete.id,
    title: 'Protocolo de acompanhamento',
    objective: 'Conteúdo privado do protocolo.',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-10-01T00:00:00.000Z'),
    continuous: false,
    items: [
      {
        substanceId: substance.id,
        instructions: 'Instrução privada.',
        frequencyType: 'weekly',
        weekDays: [1, 4],
        time: '08:00',
      },
    ],
    ...overrides,
  };
}

function createPendingCheckIn(professional, athlete, overrides = {}) {
  return CheckIn.create({
    athleteId: athlete.id,
    professionalId: professional.id,
    protocolId: null,
    referenceWeek:
      overrides.referenceWeek ||
      new Date('2026-08-03T03:00:00.000Z'),
    status: 'pending',
    responses: {
      observacao: 'Conteúdo privado da resposta.',
    },
  });
}

async function notificationsFor(type) {
  return Notification.find({ type }).sort({ createdAt: 1, _id: 1 });
}

async function expectNotification(type, userId, entityType, entityId) {
  const notification = await Notification.findOne({ type, userId });
  expect(notification).toMatchObject({
    type,
    entityType,
  });
  expect(notification.entityId.toString()).toBe(entityId.toString());
  return notification;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all([
    Notification.init(),
    ProfessionalAthleteLink.init(),
    ProtocolVersion.init(),
    CheckIn.init(),
    Substance.init(),
  ]);
}, 120000);

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([
    AuditLog.deleteMany({}),
    Notification.deleteMany({}),
    InventoryMovement.deleteMany({}),
    InventoryItem.deleteMany({}),
    Exam.deleteMany({}),
    CheckIn.deleteMany({}),
    TrackingRecord.deleteMany({}),
    ProtocolVersion.deleteMany({}),
    Protocol.deleteMany({}),
    ProfessionalAthleteLink.deleteMany({}),
    ProfessionalProfile.deleteMany({}),
    Substance.deleteMany({}),
    User.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('eventos internos de Notification V1', () => {
  it('notifica aprovação e rejeição profissional uma única vez e sem motivo', async () => {
    const admin = await createUser('admin');
    const approvedUser = await createUser('professional');
    const approvedProfile = await createProfessionalProfile(
      approvedUser,
      'pending',
    );
    const rejectedUser = await createUser('professional');
    const rejectedProfile = await createProfessionalProfile(
      rejectedUser,
      'pending',
    );

    await professionalVerificationService.approveProfessionalVerification(
      approvedProfile.id,
      admin.id,
    );
    await professionalVerificationService.rejectProfessionalVerification(
      rejectedProfile.id,
      admin.id,
      'Motivo que não pode aparecer na notificação.',
    );

    const approved = await expectNotification(
      'professional_approved',
      approvedUser.id,
      'ProfessionalProfile',
      approvedProfile.id,
    );
    const rejected = await expectNotification(
      'professional_rejected',
      rejectedUser.id,
      'ProfessionalProfile',
      rejectedProfile.id,
    );
    expect(approved.message).toBe('Seu cadastro profissional foi aprovado.');
    expect(rejected.message).not.toContain('Motivo');

    await expect(
      professionalVerificationService.approveProfessionalVerification(
        approvedProfile.id,
        admin.id,
      ),
    ).rejects.toMatchObject({ code: 'PROFESSIONAL_ALREADY_REVIEWED' });
    expect(await Notification.countDocuments()).toBe(2);
  });

  it('notifica request, accept, reject e end aos destinatários corretos', async () => {
    const professional = await createProfessional();
    const athlete = await createUser();

    const requestedResponse = await linkService.createLink(professional, {
      athleteEmail: athlete.email,
    });
    await expectNotification(
      'link_requested',
      athlete.id,
      'ProfessionalAthleteLink',
      requestedResponse.id,
    );

    await linkService.acceptLink(athlete, requestedResponse.id);
    await expectNotification(
      'link_accepted',
      professional.id,
      'ProfessionalAthleteLink',
      requestedResponse.id,
    );

    await linkService.endLink(professional, requestedResponse.id, {});
    const ended = await notificationsFor('link_ended');
    expect(ended).toHaveLength(1);
    expect(ended[0].userId.toString()).toBe(athlete.id);

    const otherAthlete = await createUser();
    const pending = await linkService.createLink(professional, {
      athleteEmail: otherAthlete.email,
    });
    await linkService.rejectLink(otherAthlete, pending.id, {
      reason: 'Motivo privado.',
    });
    const rejected = await expectNotification(
      'link_rejected',
      professional.id,
      'ProfessionalAthleteLink',
      pending.id,
    );
    expect(rejected.message).not.toContain('Motivo privado');

    await expect(
      linkService.rejectLink(otherAthlete, pending.id, {}),
    ).rejects.toMatchObject({ code: 'LINK_NOT_PENDING' });
    expect(await Notification.countDocuments({ type: 'link_rejected' })).toBe(
      1,
    );
  });

  it('encerramento administrativo notifica os dois participantes, não o admin', async () => {
    const admin = await createUser('admin');
    const professional = await createProfessional();
    const athlete = await createUser();
    const link = await createLink(professional, athlete);

    await linkService.endLink(admin, link.id, {
      reason: 'Encerramento administrativo.',
    });

    const notifications = await notificationsFor('link_ended');
    expect(
      notifications.map((notification) => notification.userId.toString()).sort(),
    ).toEqual([athlete.id, professional.id].sort());
    expect(
      notifications.some(
        (notification) => notification.userId.toString() === admin.id,
      ),
    ).toBe(false);
  });

  it('notifica criação, versão e mudança de status de protocolo sem conteúdo privado', async () => {
    const admin = await createUser('admin');
    const professional = await createProfessional();
    const athlete = await createUser();
    const substance = await createSubstance(admin);
    await createLink(professional, athlete);

    const created = await protocolService.createProtocol(
      professional,
      protocolInput(athlete, substance),
    );
    await protocolService.updateProtocolStatus(
      professional,
      created.protocol.id,
      { status: 'active', reason: 'Motivo privado.' },
    );
    await protocolService.createProtocolVersion(
      professional,
      created.protocol.id,
      {
        startDate: new Date('2026-08-02T00:00:00.000Z'),
        changeReason: 'Razão privada.',
      },
    );

    const notifications = await Notification.find({
      userId: athlete.id,
      entityId: created.protocol.id,
    });
    expect(notifications.map(({ type }) => type).sort()).toEqual(
      [
        'protocol_created',
        'protocol_status_changed',
        'protocol_version_created',
      ].sort(),
    );
    notifications.forEach((notification) => {
      expect(notification.entityType).toBe('Protocol');
      expect(notification.message).not.toMatch(
        /Motivo|Razão|Instrução|Conteúdo/u,
      );
    });
  });

  it('notifica somente tracking criado por profissional', async () => {
    const professional = await createProfessional();
    const athlete = await createUser();
    await createLink(professional, athlete);

    const professionalTracking =
      await trackingRecordService.createTrackingRecord(professional, {
        athleteId: athlete.id,
        type: 'scheduled',
        title: 'Acompanhamento',
        scheduledFor: new Date('2026-08-05T11:00:00.000Z'),
        notes: 'Nota privada.',
      });
    await trackingRecordService.createTrackingRecord(athlete, {
      type: 'manual',
      title: 'Registro próprio',
      scheduledFor: new Date('2026-08-06T11:00:00.000Z'),
      notes: 'Nota privada.',
    });

    const notifications = await notificationsFor('tracking_created');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].userId.toString()).toBe(athlete.id);
    expect(notifications[0].entityId.toString()).toBe(
      professionalTracking.id,
    );
    expect(notifications[0].message).not.toContain('Nota privada');
  });

  it('notifica envio ao profissional e revisão ao atleta sem conteúdo do check-in', async () => {
    const professional = await createProfessional();
    const athlete = await createUser();
    await createLink(professional, athlete);
    const checkIn = await createPendingCheckIn(professional, athlete);

    await checkInService.submitCheckIn(athlete, checkIn.id);
    await checkInService.reviewCheckIn(professional, checkIn.id, {
      reviewComment: 'Comentário privado da revisão.',
    });

    const submitted = await expectNotification(
      'checkin_submitted',
      professional.id,
      'CheckIn',
      checkIn.id,
    );
    const reviewed = await expectNotification(
      'checkin_reviewed',
      athlete.id,
      'CheckIn',
      checkIn.id,
    );
    expect(submitted.message).not.toContain('Conteúdo privado');
    expect(reviewed.message).not.toContain('Comentário privado');
  });

  it('notifica somente exame criado por profissional e não expõe dados do exame', async () => {
    const professional = await createProfessional();
    const athlete = await createUser();
    await createLink(professional, athlete);

    const professionalExam = await examService.createExam(
      professional,
      {
        athleteId: athlete.id,
        title: 'Título sensível',
        examDate: new Date('2026-07-29T12:00:00.000Z'),
        laboratory: 'Laboratório privado',
        results: [{ marker: 'Marcador', value: 'Valor' }],
        notes: 'Nota privada.',
      },
      null,
    );
    await examService.createExam(
      athlete,
      {
        title: 'Exame próprio',
        examDate: new Date('2026-07-29T12:00:00.000Z'),
        laboratory: null,
        results: [],
        notes: null,
      },
      null,
    );

    const notifications = await notificationsFor('exam_created');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].userId.toString()).toBe(athlete.id);
    expect(notifications[0].entityId.toString()).toBe(professionalExam.id);
    expect(notifications[0].message).toBe(
      'Um exame foi registrado no seu histórico.',
    );
  });

  it('notifica somente cruzamentos de lowStock e permite nova ocorrência após sair', async () => {
    const athlete = await createUser();
    const created = await inventoryService.createInventoryItem(athlete, {
      substanceId: null,
      name: 'Item baixo',
      unit: 'unit',
      quantity: 1,
      lowStockThreshold: 1,
      expirationDate: null,
    });
    expect(
      await Notification.countDocuments({
        type: 'inventory_low_stock',
        entityId: created.id,
      }),
    ).toBe(1);

    await inventoryService.updateInventoryItem(athlete, created.id, {
      name: 'Item ainda baixo',
    });
    expect(
      await Notification.countDocuments({
        type: 'inventory_low_stock',
        entityId: created.id,
      }),
    ).toBe(1);

    await inventoryService.createInventoryMovement(athlete, created.id, {
      type: 'in',
      quantity: 2,
      reason: 'Entrada para normalizar.',
    });
    await inventoryService.createInventoryMovement(athlete, created.id, {
      type: 'out',
      quantity: 2,
      reason: 'Saída para novo alerta.',
    });
    expect(
      await Notification.countDocuments({
        type: 'inventory_low_stock',
        entityId: created.id,
      }),
    ).toBe(2);

    const thresholdItem = await InventoryItem.create({
      athleteId: athlete.id,
      name: 'Item por limite',
      unit: 'unit',
      quantity: 5,
      lowStockThreshold: 1,
    });
    await inventoryService.updateInventoryItem(
      athlete,
      thresholdItem.id,
      { lowStockThreshold: 5 },
    );
    expect(
      await Notification.countDocuments({
        type: 'inventory_low_stock',
        entityId: thresholdItem.id,
      }),
    ).toBe(1);
  });

  it('notifica vencimento somente quando uma escrita cruza o estado', async () => {
    const athlete = await createUser();
    const expired = await inventoryService.createInventoryItem(athlete, {
      substanceId: null,
      name: 'Item vencido',
      unit: 'unit',
      quantity: 1,
      lowStockThreshold: null,
      expirationDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(
      await Notification.countDocuments({
        type: 'inventory_expired',
        entityId: expired.id,
      }),
    ).toBe(1);

    const future = await inventoryService.createInventoryItem(athlete, {
      substanceId: null,
      name: 'Item futuro',
      unit: 'unit',
      quantity: 1,
      lowStockThreshold: null,
      expirationDate: new Date('2099-01-01T00:00:00.000Z'),
    });
    await inventoryService.listInventoryItems(athlete, {
      archived: false,
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(
      await Notification.countDocuments({
        type: 'inventory_expired',
        entityId: future.id,
      }),
    ).toBe(0);

    await inventoryService.updateInventoryItem(athlete, future.id, {
      expirationDate: new Date('2025-01-01T00:00:00.000Z'),
    });
    await inventoryService.updateInventoryItem(athlete, future.id, {
      name: 'Continua vencido',
    });
    expect(
      await Notification.countDocuments({
        type: 'inventory_expired',
        entityId: future.id,
      }),
    ).toBe(1);
  });

  it('falha best-effort é registrada com segurança e não desfaz nenhum domínio', async () => {
    const logSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const notificationCreateSpy = jest.spyOn(Notification, 'create');
    const failNextNotification = () =>
      notificationCreateSpy.mockRejectedValueOnce(
        Object.assign(new Error('private failure'), {
          code: 'NOTIFICATION_WRITE_FAILED',
        }),
      );

    const admin = await createUser('admin');
    const pendingProfessional = await createUser('professional');
    const pendingProfile = await createProfessionalProfile(
      pendingProfessional,
      'pending',
    );
    failNextNotification();
    await expect(
      professionalVerificationService.approveProfessionalVerification(
        pendingProfile.id,
        admin.id,
      ),
    ).resolves.toBeDefined();
    expect(
      (await ProfessionalProfile.findById(pendingProfile.id))
        .verificationStatus,
    ).toBe('approved');

    const rejectedProfessional = await createUser('professional');
    const rejectedProfile = await createProfessionalProfile(
      rejectedProfessional,
      'pending',
    );
    failNextNotification();
    await expect(
      professionalVerificationService.rejectProfessionalVerification(
        rejectedProfile.id,
        admin.id,
        'Motivo privado.',
      ),
    ).resolves.toBeDefined();
    expect(
      (await ProfessionalProfile.findById(rejectedProfile.id))
        .verificationStatus,
    ).toBe('rejected');

    const professional = await createProfessional();
    const athlete = await createUser();
    failNextNotification();
    const link = await linkService.createLink(professional, {
      athleteEmail: athlete.email,
    });
    expect((await ProfessionalAthleteLink.findById(link.id)).status).toBe(
      'pending',
    );

    const domainAthlete = await createUser();
    const activeLink = await createLink(professional, domainAthlete);
    const substance = await createSubstance(admin);
    failNextNotification();
    const protocol = await protocolService.createProtocol(
      professional,
      protocolInput(domainAthlete, substance),
    );
    expect(await Protocol.findById(protocol.protocol.id)).not.toBeNull();
    expect(
      await ProtocolVersion.findOne({ protocolId: protocol.protocol.id }),
    ).not.toBeNull();

    failNextNotification();
    const tracking = await trackingRecordService.createTrackingRecord(
      professional,
      {
        athleteId: domainAthlete.id,
        type: 'scheduled',
        title: 'Tracking persistente',
        scheduledFor: new Date('2026-08-05T11:00:00.000Z'),
        notes: null,
      },
    );
    expect(await TrackingRecord.findById(tracking.id)).not.toBeNull();

    const checkIn = await createPendingCheckIn(
      professional,
      domainAthlete,
    );
    failNextNotification();
    await expect(
      checkInService.submitCheckIn(domainAthlete, checkIn.id),
    ).resolves.toMatchObject({ status: 'submitted' });
    expect((await CheckIn.findById(checkIn.id)).status).toBe('submitted');

    failNextNotification();
    const exam = await examService.createExam(
      professional,
      {
        athleteId: domainAthlete.id,
        title: 'Exame persistente',
        examDate: new Date(),
        laboratory: null,
        results: [],
        notes: null,
      },
      null,
    );
    expect(await Exam.findById(exam.id)).not.toBeNull();

    failNextNotification();
    const item = await inventoryService.createInventoryItem(domainAthlete, {
      substanceId: null,
      name: 'Item persistente',
      unit: 'unit',
      quantity: 0,
      lowStockThreshold: 0,
      expirationDate: null,
    });
    expect(await InventoryItem.findById(item.id)).not.toBeNull();

    const movementItem = await InventoryItem.create({
      athleteId: domainAthlete.id,
      name: 'Item de movimento persistente',
      unit: 'unit',
      quantity: 2,
      lowStockThreshold: 1,
    });
    failNextNotification();
    const movement =
      await inventoryService.createInventoryMovement(
        domainAthlete,
        movementItem.id,
        {
          type: 'out',
          quantity: 1,
          reason: 'Saída que cruza estoque baixo.',
        },
      );
    expect(await InventoryMovement.findById(movement.id)).not.toBeNull();
    expect((await InventoryItem.findById(movementItem.id)).quantity).toBe(1);

    const safeCalls = logSpy.mock.calls;
    expect(safeCalls.length).toBeGreaterThan(0);
    safeCalls.forEach(([, details]) => {
      expect(Object.keys(details).sort()).toEqual(
        ['entityType', 'errorCode', 'notificationType'].sort(),
      );
      expect(JSON.stringify(details)).not.toMatch(
        /private failure|Título|Mensagem|@example/u,
      );
    });
    expect(activeLink.status).toBe('active');
  });
});
