const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const ProfessionalProfile = require('../../src/models/professional-profile');
const Substance = require('../../src/models/substance');
const User = require('../../src/models/user');
const { normalizeSubstanceName } = require('../../src/utils/normalize-substance-name');
const { generateToken } = require('../../src/utils/jwt');

async function createUser(role) {
  return User.create({
    name: `Usuário ${role}`,
    email: `${role}-${new mongoose.Types.ObjectId()}@example.com`,
    passwordHash: await bcrypt.hash('SenhaForte123!', 10),
    role,
  });
}

async function createApprovedProfessional() {
  const professional = await createUser('professional');
  await ProfessionalProfile.create({
    userId: professional.id,
    verificationStatus: 'approved',
    verificationDocument: {
      storageKey: `${professional.id}.pdf`,
      url: `/private-files/${professional.id}.pdf`,
      originalName: 'documento.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
    },
    submittedAt: new Date(),
    reviewedAt: new Date(),
    reviewedBy: professional.id,
    rejectionReason: null,
  });
  return professional;
}

async function createSubstance(createdBy, overrides = {}) {
  const name = overrides.name || `Substância ${new mongoose.Types.ObjectId()}`;
  return Substance.create({
    name,
    normalizedName: normalizeSubstanceName(name),
    description: 'Descrição informativa.',
    category: 'supplement',
    defaultUnit: 'g',
    active: true,
    createdBy: createdBy.id,
    ...overrides,
  });
}

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

describe('biblioteca de substâncias', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Substance.init();
  }, 120000);

  afterEach(async () => {
    await Promise.all([
      ProfessionalProfile.deleteMany({}),
      Substance.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('POST /api/v1/substances', () => {
    it('permite que admin cadastre com nome normalizado e createdBy autenticado', async () => {
      const admin = await createUser('admin');

      const response = await request(app)
        .post('/api/v1/substances')
        .set('Authorization', authorization(admin))
        .send({
          name: '  Creatina   Monohidratada  ',
          description: 'Item informativo.',
          category: 'supplement',
          defaultUnit: 'g',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.substance).toMatchObject({
        name: 'Creatina Monohidratada',
        category: 'supplement',
        defaultUnit: 'g',
        active: true,
        createdBy: admin.id,
      });
      expect(response.body.data.substance).not.toHaveProperty('passwordHash');

      const stored = await Substance.findById(
        response.body.data.substance.id,
      ).select('+normalizedName');
      expect(stored.normalizedName).toBe('creatina monohidratada');
    });

    it('permite que profissional aprovado cadastre substância', async () => {
      const professional = await createApprovedProfessional();

      const response = await request(app)
        .post('/api/v1/substances')
        .set('Authorization', authorization(professional))
        .send({
          name: 'Creatina',
          description: 'Item criado durante o protocolo.',
          category: 'supplement',
          defaultUnit: 'g',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.substance).toMatchObject({
        name: 'Creatina',
        category: 'supplement',
        defaultUnit: 'g',
        createdBy: professional.id,
      });
    });

    it('impede cadastro pelo perfil athlete', async () => {
      const athlete = await createUser('athlete');

      const response = await request(app)
        .post('/api/v1/substances')
        .set('Authorization', authorization(athlete))
        .send({ name: 'Creatina', category: 'supplement' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejeita nomes equivalentes por caixa e espaços', async () => {
      const admin = await createUser('admin');
      await createSubstance(admin, { name: 'Creatina Monohidratada' });

      const response = await request(app)
        .post('/api/v1/substances')
        .set('Authorization', authorization(admin))
        .send({
          name: '  CREATINA   monohidratada ',
          category: 'supplement',
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DUPLICATE_RESOURCE');
      expect(await Substance.countDocuments()).toBe(1);
    });

    it('rejeita normalizedName, createdBy, active e campos desconhecidos', async () => {
      const admin = await createUser('admin');

      const response = await request(app)
        .post('/api/v1/substances')
        .set('Authorization', authorization(admin))
        .send({
          name: 'Creatina',
          category: 'supplement',
          normalizedName: 'fraude',
          createdBy: new mongoose.Types.ObjectId(),
          active: false,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(await Substance.countDocuments()).toBe(0);
    });

    it('rejeita payload inválido e requisição sem autenticação', async () => {
      const admin = await createUser('admin');
      const invalid = await request(app)
        .post('/api/v1/substances')
        .set('Authorization', authorization(admin))
        .send({ name: 'C', category: 'invalid' });
      const unauthenticated = await request(app)
        .post('/api/v1/substances')
        .send({ name: 'Creatina', category: 'supplement' });

      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
      expect(unauthenticated.status).toBe(401);
    });
  });

  describe('GET /api/v1/substances', () => {
    it.each(['admin', 'professional', 'athlete'])(
      'permite consulta autenticada pelo perfil %s',
      async (role) => {
        const user = await createUser(role);
        await createSubstance(user);

        const response = await request(app)
          .get('/api/v1/substances')
          .set('Authorization', authorization(user));

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
      },
    );

    it('pagina, busca nome/descrição e filtra categoria/status', async () => {
      const admin = await createUser('admin');
      await createSubstance(admin, {
        name: 'Creatina',
        description: 'Suplemento informativo',
      });
      await createSubstance(admin, {
        name: 'Vitamina D',
        description: 'Descrição solar',
        category: 'vitamin',
        active: false,
      });
      await createSubstance(admin, { name: 'Outro suplemento' });

      const response = await request(app)
        .get('/api/v1/substances?search=solar&category=vitamin&active=false&page=1&limit=1')
        .set('Authorization', authorization(admin));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        name: 'Vitamina D',
        active: false,
      });
      expect(response.body.meta).toEqual({
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
      });
    });

    it('ordena por nome e data de criação', async () => {
      const admin = await createUser('admin');
      await createSubstance(admin, { name: 'Zinco' });
      await createSubstance(admin, { name: 'Creatina' });

      const byName = await request(app)
        .get('/api/v1/substances?sortBy=name&sortOrder=asc')
        .set('Authorization', authorization(admin));
      const byCreation = await request(app)
        .get('/api/v1/substances?sortBy=createdAt&sortOrder=desc')
        .set('Authorization', authorization(admin));

      expect(byName.body.data.map((item) => item.name)).toEqual([
        'Creatina',
        'Zinco',
      ]);
      expect(byCreation.body.data[0].name).toBe('Creatina');
    });

    it('rejeita query inválida e exige autenticação', async () => {
      const admin = await createUser('admin');
      const invalid = await request(app)
        .get('/api/v1/substances?limit=101&sortBy=invalid')
        .set('Authorization', authorization(admin));
      const unauthenticated = await request(app).get('/api/v1/substances');

      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
      expect(unauthenticated.status).toBe(401);
    });
  });

  describe('GET /api/v1/substances/:id', () => {
    it('permite que atleta consulte substância inativa', async () => {
      const admin = await createUser('admin');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin, { active: false });

      const response = await request(app)
        .get(`/api/v1/substances/${substance.id}`)
        .set('Authorization', authorization(athlete));

      expect(response.status).toBe(200);
      expect(response.body.data.substance.active).toBe(false);
    });

    it('retorna RESOURCE_NOT_FOUND e INVALID_OBJECT_ID', async () => {
      const admin = await createUser('admin');
      const missing = await request(app)
        .get(`/api/v1/substances/${new mongoose.Types.ObjectId()}`)
        .set('Authorization', authorization(admin));
      const invalid = await request(app)
        .get('/api/v1/substances/invalido')
        .set('Authorization', authorization(admin));

      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('INVALID_OBJECT_ID');
    });
  });

  describe('PATCH /api/v1/substances/:id', () => {
    it('permite que admin atualize dados e recalcule normalizedName', async () => {
      const admin = await createUser('admin');
      const substance = await createSubstance(admin, { name: 'Creatina' });

      const response = await request(app)
        .patch(`/api/v1/substances/${substance.id}`)
        .set('Authorization', authorization(admin))
        .send({
          name: '  Vitamina   C ',
          description: 'Nova descrição.',
          category: 'vitamin',
          defaultUnit: 'tablet',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.substance).toMatchObject({
        name: 'Vitamina C',
        category: 'vitamin',
        defaultUnit: 'tablet',
      });
      const stored = await Substance.findById(substance.id).select(
        '+normalizedName',
      );
      expect(stored.normalizedName).toBe('vitamina c');
    });

    it('rejeita renomeação duplicada', async () => {
      const admin = await createUser('admin');
      const creatine = await createSubstance(admin, { name: 'Creatina' });
      await createSubstance(admin, { name: 'Vitamina C' });

      const response = await request(app)
        .patch(`/api/v1/substances/${creatine.id}`)
        .set('Authorization', authorization(admin))
        .send({ name: ' VITAMINA   c ' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DUPLICATE_RESOURCE');
    });

    it.each(['professional', 'athlete'])(
      'impede atualização pelo perfil %s',
      async (role) => {
        const admin = await createUser('admin');
        const user = await createUser(role);
        const substance = await createSubstance(admin);

        const response = await request(app)
          .patch(`/api/v1/substances/${substance.id}`)
          .set('Authorization', authorization(user))
          .send({ description: 'Tentativa.' });

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      },
    );

    it('retorna recurso inexistente e rejeita payload vazio', async () => {
      const admin = await createUser('admin');
      const missing = await request(app)
        .patch(`/api/v1/substances/${new mongoose.Types.ObjectId()}`)
        .set('Authorization', authorization(admin))
        .send({ description: 'Teste.' });
      const substance = await createSubstance(admin);
      const empty = await request(app)
        .patch(`/api/v1/substances/${substance.id}`)
        .set('Authorization', authorization(admin))
        .send({});

      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(empty.status).toBe(400);
      expect(empty.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/substances/:id/status', () => {
    it('admin desativa e reativa sem apagar o documento', async () => {
      const admin = await createUser('admin');
      const substance = await createSubstance(admin);

      const disabled = await request(app)
        .patch(`/api/v1/substances/${substance.id}/status`)
        .set('Authorization', authorization(admin))
        .send({ active: false });
      expect(disabled.status).toBe(200);
      expect(disabled.body.data.substance.active).toBe(false);
      expect(await Substance.countDocuments()).toBe(1);

      const enabled = await request(app)
        .patch(`/api/v1/substances/${substance.id}/status`)
        .set('Authorization', authorization(admin))
        .send({ active: true });
      expect(enabled.status).toBe(200);
      expect(enabled.body.data.substance.active).toBe(true);
      expect(await Substance.countDocuments()).toBe(1);
    });

    it('impede alteração de status por profissional', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const substance = await createSubstance(admin);

      const response = await request(app)
        .patch(`/api/v1/substances/${substance.id}/status`)
        .set('Authorization', authorization(professional))
        .send({ active: false });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('não disponibiliza exclusão física', async () => {
      const admin = await createUser('admin');
      const substance = await createSubstance(admin);

      const response = await request(app)
        .delete(`/api/v1/substances/${substance.id}`)
        .set('Authorization', authorization(admin));

      expect(response.status).toBe(404);
      expect(await Substance.countDocuments()).toBe(1);
    });
  });
});
