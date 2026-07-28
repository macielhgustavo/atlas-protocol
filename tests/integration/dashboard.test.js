const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const AUDIT_ACTIONS = require('../../src/constants/audit-actions');
const AuditLog = require('../../src/models/audit-log');
const CheckIn = require('../../src/models/check-in');
const ProfessionalAthleteLink = require(
  '../../src/models/professional-athlete-link',
);
const ProfessionalProfile = require('../../src/models/professional-profile');
const Protocol = require('../../src/models/protocol');
const TrackingRecord = require('../../src/models/tracking-record');
const User = require('../../src/models/user');
const { generateToken } = require('../../src/utils/jwt');
const {
  normalizeReferenceWeek,
} = require('../../src/utils/normalize-reference-week');

let passwordHash;

async function createUser(role, overrides = {}) {
  const {
    verificationStatus = 'approved',
    withProfessionalProfile = true,
    ...userOverrides
  } = overrides;
  const user = await User.create({
    name: `Usuário ${role}`,
    email: `${role}-${new mongoose.Types.ObjectId()}@example.com`,
    passwordHash,
    role,
    ...userOverrides,
  });

  if (role === 'professional' && withProfessionalProfile) {
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
      submittedAt: new Date(),
      reviewedAt: reviewed ? new Date() : null,
      reviewedBy: reviewed ? user.id : null,
      rejectionReason:
        verificationStatus === 'rejected' ? 'Documento rejeitado.' : null,
    });
  }

  return user;
}

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

async function createLink(
  professional,
  athlete,
  status = 'active',
  overrides = {},
) {
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
    ...overrides,
  });
}

function protocolHistory(professionalId, status, changedAt) {
  const initial = {
    from: null,
    to: 'draft',
    reason: null,
    changedAt: new Date(changedAt.getTime() - 1000),
    changedBy: professionalId,
  };
  if (status === 'draft') return [initial];

  return [
    initial,
    {
      from: 'draft',
      to: 'active',
      reason: null,
      changedAt,
      changedBy: professionalId,
    },
  ];
}

async function createProtocol(
  professional,
  athlete,
  status = 'active',
  overrides = {},
) {
  const occurredAt = overrides.updatedAt || new Date();
  return Protocol.create({
    athleteId: athlete.id,
    professionalId: professional.id,
    title: `Protocolo ${new mongoose.Types.ObjectId()}`,
    status,
    currentVersion: 1,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: null,
    continuous: true,
    activatedAt: status === 'active' ? occurredAt : null,
    statusHistory: protocolHistory(professional.id, status, occurredAt),
    createdAt: overrides.createdAt || occurredAt,
    updatedAt: occurredAt,
    ...overrides,
  });
}

async function createTracking(
  professional,
  athlete,
  overrides = {},
) {
  const status = overrides.status || 'scheduled';
  const professionalId =
    overrides.professionalId === undefined ?
      professional?.id || null :
      overrides.professionalId;
  const createdBy =
    overrides.createdBy || professionalId || athlete.id;
  const completed = status === 'completed';
  const hasReason = ['missed', 'cancelled'].includes(status);

  return TrackingRecord.create({
    athleteId: athlete.id,
    professionalId,
    protocolId: null,
    protocolVersion: null,
    type: professionalId ? 'scheduled' : 'manual',
    title: `Tracking ${new mongoose.Types.ObjectId()}`,
    scheduledFor: new Date('2099-01-01T12:00:00.000Z'),
    status,
    statusReason: hasReason ? 'Motivo preservado fora do card.' : null,
    completedAt: completed ? new Date() : null,
    completedBy: completed ? createdBy : null,
    notes: 'Notas completas não podem aparecer no dashboard.',
    createdBy,
    ...overrides,
  });
}

async function createCheckIn(
  professional,
  athlete,
  overrides = {},
) {
  const status = overrides.status || 'pending';
  return CheckIn.create({
    athleteId: athlete.id,
    professionalId: professional.id,
    protocolId: null,
    referenceWeek: normalizeReferenceWeek(new Date()),
    status,
    responses: { private: 'não expor no dashboard' },
    submittedAt: status === 'pending' ? null : new Date(),
    reviewedAt: status === 'reviewed' ? new Date() : null,
    reviewedBy: status === 'reviewed' ? professional.id : null,
    reviewComment:
      status === 'reviewed' ? 'Comentário completo não deve aparecer.' : null,
    ...overrides,
  });
}

function expectNoSensitiveContent(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'passwordHash',
    'responses',
    'reviewComment',
    'statusReason',
    'storageKey',
    'ipHash',
    'metadata',
    'Bearer ',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe('Dashboard API unificado V1', () => {
  let mongoServer;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('SenhaForte123!', 4);
    mongoServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 30000 },
    });
    await mongoose.connect(mongoServer.getUri());
    await Promise.all([
      AuditLog.init(),
      CheckIn.init(),
      ProfessionalAthleteLink.init(),
      ProfessionalProfile.init(),
      Protocol.init(),
      TrackingRecord.init(),
      User.init(),
    ]);
  }, 120000);

  afterEach(async () => {
    if (mongoose.connection.readyState !== 1) return;

    await Promise.all([
      AuditLog.deleteMany({}),
      CheckIn.deleteMany({}),
      ProfessionalAthleteLink.deleteMany({}),
      ProfessionalProfile.deleteMany({}),
      Protocol.deleteMany({}),
      TrackingRecord.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  describe('autenticação, identidade e rota única', () => {
    it('exige token válido e usuário persistido', async () => {
      const user = await createUser('athlete');
      const missingUserToken = authorization(user);
      await User.deleteOne({ _id: user.id });

      const [missing, invalid, nonexistent] = await Promise.all([
        request(app).get('/api/v1/dashboard'),
        request(app)
          .get('/api/v1/dashboard')
          .set('Authorization', 'Bearer token-invalido'),
        request(app)
          .get('/api/v1/dashboard')
          .set('Authorization', missingUserToken),
      ]);

      expect(missing.status).toBe(401);
      expect(missing.body.error.code).toBe('AUTH_REQUIRED');
      expect(invalid.status).toBe(401);
      expect(invalid.body.error.code).toBe('INVALID_TOKEN');
      expect(nonexistent.status).toBe(401);
      expect(nonexistent.body.error.code).toBe('INVALID_TOKEN');
    });

    it.each([
      [{ active: false }, 'inativo'],
      [{ blockedAt: new Date() }, 'bloqueado'],
    ])('bloqueia usuário $1', async (overrides) => {
      const user = await createUser('athlete', overrides);
      const response = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', authorization(user));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('USER_BLOCKED');
    });

    it('rejeita role persistida inválida com FORBIDDEN', async () => {
      const user = await createUser('athlete');
      await User.collection.updateOne(
        { _id: user._id },
        { $set: { role: 'unknown' } },
      );

      const response = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', authorization(user));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejeita query de seleção de identidade e mantém somente a rota única', async () => {
      const admin = await createUser('admin');
      const query = await request(app)
        .get(`/api/v1/dashboard?role=athlete&userId=${admin.id}`)
        .set('Authorization', authorization(admin));

      expect(query.status).toBe(400);
      expect(query.body.error.code).toBe('VALIDATION_ERROR');

      for (const path of [
        '/api/v1/dashboard/admin',
        '/api/v1/dashboard/professional',
        '/api/v1/dashboard/athlete',
      ]) {
        const response = await request(app)
          .get(path)
          .set('Authorization', authorization(admin));
        expect(response.status).toBe(404);
      }
    });

    it('é somente leitura e não cria auditoria', async () => {
      const athlete = await createUser('athlete');
      const before = athlete.updatedAt;

      const response = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', authorization(athlete));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          role: 'athlete',
          activeProtocol: null,
          nextTracking: null,
          currentCheckIn: null,
          recentActivity: [],
          unreadNotifications: 0,
          inventoryAlerts: [],
        },
      });
      expect(await AuditLog.countDocuments()).toBe(0);
      expect((await User.findById(athlete.id)).updatedAt).toEqual(before);
    });

    it('propaga falha de módulo implementado como INTERNAL_ERROR', async () => {
      const athlete = await createUser('athlete');
      const databaseError = new Error('falha simulada do banco');
      const findOne = jest
        .spyOn(Protocol, 'findOne')
        .mockImplementationOnce(() => {
          throw databaseError;
        });
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        const response = await request(app)
          .get('/api/v1/dashboard')
          .set('Authorization', authorization(athlete));

        expect(response.status).toBe(500);
        expect(response.body.error.code).toBe('INTERNAL_ERROR');
        expect(response.body.error.message).toBe(
          'Ocorreu um erro interno no servidor.',
        );
        expect(consoleError).toHaveBeenCalledWith(databaseError);
      } finally {
        findOne.mockRestore();
        consoleError.mockRestore();
      }
    });
  });

  describe('dashboard do atleta', () => {
    it('seleciona apenas cards próprios, atuais e determinísticos', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      const olderProtocol = await createProtocol(
        professional,
        athlete,
        'active',
        {
          activatedAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      );
      const newerProtocol = await createProtocol(
        professional,
        athlete,
        'active',
        {
          activatedAt: new Date('2026-02-01T00:00:00.000Z'),
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          updatedAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      );
      await createProtocol(professional, athlete, 'draft');
      await createProtocol(professional, outsider, 'active');

      const firstTracking = await createTracking(professional, athlete, {
        scheduledFor: new Date('2099-01-01T10:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await createTracking(professional, athlete, {
        scheduledFor: new Date('2099-01-02T10:00:00.000Z'),
      });
      await createTracking(professional, athlete, {
        scheduledFor: new Date('2020-01-01T10:00:00.000Z'),
      });
      await createTracking(professional, athlete, {
        status: 'completed',
        scheduledFor: new Date('2099-01-01T09:00:00.000Z'),
      });
      await createTracking(professional, outsider, {
        scheduledFor: new Date('2098-01-01T10:00:00.000Z'),
      });

      const currentCheckIn = await createCheckIn(professional, athlete, {
        status: 'reviewed',
      });
      await createCheckIn(professional, athlete, {
        referenceWeek: new Date(
          normalizeReferenceWeek(new Date()).getTime() - 7 * 86400000,
        ),
      });
      await createCheckIn(professional, outsider);

      const response = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', authorization(athlete));

      expect(response.status).toBe(200);
      expect(response.body.data.activeProtocol).toMatchObject({
        id: newerProtocol.id,
        status: 'active',
        professionalId: professional.id,
      });
      expect(response.body.data.activeProtocol.id).not.toBe(olderProtocol.id);
      expect(response.body.data.nextTracking).toMatchObject({
        id: firstTracking.id,
        status: 'scheduled',
      });
      expect(response.body.data.currentCheckIn).toMatchObject({
        id: currentCheckIn.id,
        status: 'reviewed',
      });
      expect(response.body.data.currentCheckIn).not.toHaveProperty('responses');
      expect(response.body.data.currentCheckIn).not.toHaveProperty(
        'reviewComment',
      );
      expectNoSensitiveContent(response.body);
    });

    it('limita e ordena atividade recente própria', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');

      for (let index = 0; index < 12; index += 1) {
        const occurredAt = new Date(
          Date.UTC(2026, 0, 1, 0, index),
        );
        await createProtocol(professional, athlete, 'draft', {
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
      }
      await createProtocol(professional, outsider, 'draft', {
        updatedAt: new Date('2099-01-01T00:00:00.000Z'),
      });

      const response = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', authorization(athlete));

      expect(response.status).toBe(200);
      expect(response.body.data.recentActivity).toHaveLength(10);
      expect(
        response.body.data.recentActivity.every(
          ({ type }) => type === 'protocol',
        ),
      ).toBe(true);
      const timestamps = response.body.data.recentActivity.map(({ occurredAt }) =>
        new Date(occurredAt).getTime(),
      );
      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
      expectNoSensitiveContent(response.body.data.recentActivity);
    });
  });

  describe('dashboard do profissional', () => {
    it.each(['pending', 'rejected'])(
      'retorna dashboard limitado para professional %s',
      async (verificationStatus) => {
        const professional = await createUser('professional', {
          verificationStatus,
        });
        const athlete = await createUser('athlete');
        await createLink(professional, athlete);
        await createProtocol(professional, athlete);
        await createCheckIn(professional, athlete, { status: 'submitted' });
        await createTracking(professional, athlete);

        const response = await request(app)
          .get('/api/v1/dashboard')
          .set('Authorization', authorization(professional));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
          role: 'professional',
          verificationStatus,
          athleteCount: 0,
          activeProtocols: 0,
          pendingCheckIns: 0,
          upcomingTrackings: [],
          recentActivity: [],
        });
      },
    );

    it('falha de modo seguro quando não existe ProfessionalProfile', async () => {
      const professional = await createUser('professional', {
        withProfessionalProfile: false,
      });

      const response = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', authorization(professional));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(
        'PROFESSIONAL_VERIFICATION_REQUIRED',
      );
    });

    it('agrega somente atletas com vínculo active e limita próximos trackings', async () => {
      const professional = await createUser('professional');
      const otherProfessional = await createUser('professional');
      const firstAthlete = await createUser('athlete');
      const secondAthlete = await createUser('athlete');
      const endedAthlete = await createUser('athlete');
      const pendingAthlete = await createUser('athlete');

      await createLink(professional, firstAthlete, 'active');
      await createLink(professional, secondAthlete, 'active');
      await createLink(professional, endedAthlete, 'ended');
      await createLink(professional, pendingAthlete, 'pending');
      await createLink(otherProfessional, firstAthlete, 'active');

      await createProtocol(professional, firstAthlete, 'active');
      await createProtocol(professional, secondAthlete, 'draft');
      await createProtocol(professional, endedAthlete, 'active');
      await createProtocol(otherProfessional, firstAthlete, 'active');

      await createCheckIn(professional, firstAthlete, {
        status: 'submitted',
      });
      await createCheckIn(professional, secondAthlete, { status: 'pending' });
      await createCheckIn(professional, endedAthlete, {
        status: 'submitted',
      });
      await createCheckIn(otherProfessional, pendingAthlete, {
        status: 'submitted',
      });

      const expectedTrackingIds = [];
      for (let index = 0; index < 11; index += 1) {
        const tracking = await createTracking(professional, firstAthlete, {
          scheduledFor: new Date(
            Date.UTC(2099, 0, 1, 10, index),
          ),
        });
        if (index < 10) expectedTrackingIds.push(tracking.id);
      }
      await createTracking(professional, endedAthlete, {
        scheduledFor: new Date('2098-01-01T00:00:00.000Z'),
      });
      await createTracking(professional, firstAthlete, {
        scheduledFor: new Date('2020-01-01T00:00:00.000Z'),
      });
      await createTracking(professional, firstAthlete, {
        status: 'completed',
        scheduledFor: new Date('2098-01-01T00:00:00.000Z'),
      });
      await createTracking(null, firstAthlete, {
        professionalId: null,
        createdBy: firstAthlete.id,
        type: 'manual',
        scheduledFor: new Date('2098-01-01T00:00:00.000Z'),
      });
      await createTracking(otherProfessional, firstAthlete, {
        scheduledFor: new Date('2098-01-01T00:00:00.000Z'),
      });

      const response = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', authorization(professional));

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        role: 'professional',
        verificationStatus: 'approved',
        athleteCount: 2,
        activeProtocols: 1,
        pendingCheckIns: 1,
      });
      expect(response.body.data.upcomingTrackings).toHaveLength(10);
      expect(
        response.body.data.upcomingTrackings.map(({ id }) => id),
      ).toEqual(expectedTrackingIds);
      expect(
        response.body.data.upcomingTrackings.every(
          ({ athleteId }) => athleteId === firstAthlete.id,
        ),
      ).toBe(true);
      expect(response.body.data.recentActivity).toHaveLength(10);
      expect(
        response.body.data.recentActivity.every(({ athleteId }) =>
          [firstAthlete.id, secondAthlete.id].includes(athleteId),
        ),
      ).toBe(true);
      expectNoSensitiveContent(response.body);
    });
  });

  describe('dashboard do admin', () => {
    it('retorna contadores reais e auditoria reduzida e ordenada', async () => {
      const admin = await createUser('admin');
      const athlete = await createUser('athlete');
      await createUser('athlete', { blockedAt: new Date() });
      await createUser('athlete', { active: false });
      const pendingProfessional = await createUser('professional', {
        verificationStatus: 'pending',
      });
      const approvedProfessional = await createUser('professional');

      await createLink(approvedProfessional, athlete, 'active');
      await createLink(pendingProfessional, athlete, 'pending');

      const audits = [];
      for (let index = 0; index < 12; index += 1) {
        audits.push(
          await AuditLog.create({
            actorId: admin.id,
            action: AUDIT_ACTIONS.USER_BLOCKED,
            entityType: 'User',
            entityId: athlete.id,
            metadata: {
              passwordHash: `não deve sair ${index}`,
            },
            ipHash: `hash-${index}`,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
          }),
        );
      }

      const response = await request(app)
        .get('/api/v1/dashboard')
        .set('Authorization', authorization(admin));

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        role: 'admin',
        users: {
          total: 6,
          active: 4,
          blocked: 1,
          byRole: {
            admin: 1,
            professional: 2,
            athlete: 3,
          },
        },
        professionalsPending: 1,
        activeLinks: 1,
      });
      expect(response.body.data).not.toHaveProperty('activeProtocol');
      expect(response.body.data).not.toHaveProperty('athleteCount');
      expect(response.body.data.recentAudit).toHaveLength(10);
      expect(response.body.data.recentAudit[0].id).toBe(audits[11].id);
      expect(response.body.data.recentAudit[9].id).toBe(audits[2].id);
      expectNoSensitiveContent(response.body);
      expect(await AuditLog.countDocuments()).toBe(12);
    });
  });
});
