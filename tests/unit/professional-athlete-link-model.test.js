const mongoose = require('mongoose');

const ProfessionalAthleteLink = require('../../src/models/professional-athlete-link');

function linkData(overrides = {}) {
  return {
    professionalId: new mongoose.Types.ObjectId(),
    athleteId: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

describe('ProfessionalAthleteLink model', () => {
  it('define a collection, os campos e os estados oficiais da V1', () => {
    expect(ProfessionalAthleteLink.collection.name).toBe(
      'professional_athlete_links',
    );
    expect(ProfessionalAthleteLink.schema.path('status').options.enum).toEqual(
      ['active', 'ended', 'pending', 'rejected'],
    );

    for (const field of [
      'professionalId',
      'athleteId',
      'status',
      'requestedAt',
      'acceptedAt',
      'rejectedAt',
      'endedAt',
      'endedBy',
      'createdAt',
      'updatedAt',
    ]) {
      expect(ProfessionalAthleteLink.schema.path(field)).toBeDefined();
    }

    for (const legacyOrReasonField of [
      'invitedBy',
      'startedAt',
      'rejectionReason',
      'endReason',
    ]) {
      expect(
        ProfessionalAthleteLink.schema.path(legacyOrReasonField),
      ).toBeUndefined();
    }
  });

  it('cria pending por padrão sem dados de transição', async () => {
    const link = new ProfessionalAthleteLink(linkData());

    await expect(link.validate()).resolves.toBeUndefined();
    expect(link.status).toBe('pending');
    expect(link.requestedAt).toBeInstanceOf(Date);
    expect(link.acceptedAt).toBeNull();
    expect(link.rejectedAt).toBeNull();
    expect(link.endedAt).toBeNull();
    expect(link.endedBy).toBeNull();
  });

  it('impede vínculo do usuário consigo mesmo', async () => {
    const userId = new mongoose.Types.ObjectId();
    const link = new ProfessionalAthleteLink({
      professionalId: userId,
      athleteId: userId,
    });

    await expect(link.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ athleteId: expect.any(Object) }),
    });
  });

  it('exige acceptedAt para active e rejeita dados incompatíveis', async () => {
    const missingAcceptedAt = new ProfessionalAthleteLink(
      linkData({ status: 'active' }),
    );
    const incompatible = new ProfessionalAthleteLink(
      linkData({
        status: 'active',
        acceptedAt: new Date(),
        rejectedAt: new Date(),
      }),
    );

    await expect(missingAcceptedAt.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ acceptedAt: expect.any(Object) }),
    });
    await expect(incompatible.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ status: expect.any(Object) }),
    });
  });

  it('exige rejectedAt para rejected e rejeita dados de aceite', async () => {
    const missingRejectedAt = new ProfessionalAthleteLink(
      linkData({ status: 'rejected' }),
    );
    const incompatible = new ProfessionalAthleteLink(
      linkData({
        status: 'rejected',
        rejectedAt: new Date(),
        acceptedAt: new Date(),
      }),
    );

    await expect(missingRejectedAt.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ rejectedAt: expect.any(Object) }),
    });
    await expect(incompatible.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ status: expect.any(Object) }),
    });
  });

  it('exige acceptedAt, endedAt e endedBy para ended', async () => {
    const link = new ProfessionalAthleteLink(
      linkData({
        status: 'ended',
      }),
    );

    await expect(link.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        acceptedAt: expect.any(Object),
        endedAt: expect.any(Object),
        endedBy: expect.any(Object),
      }),
    });
  });

  it('aceita os quatro estados quando seus timestamps são coerentes', async () => {
    const now = new Date();
    const actorId = new mongoose.Types.ObjectId();
    const links = [
      new ProfessionalAthleteLink(linkData({ status: 'pending' })),
      new ProfessionalAthleteLink(
        linkData({ status: 'active', acceptedAt: now }),
      ),
      new ProfessionalAthleteLink(
        linkData({ status: 'rejected', rejectedAt: now }),
      ),
      new ProfessionalAthleteLink(
        linkData({
          status: 'ended',
          acceptedAt: now,
          endedAt: now,
          endedBy: actorId,
        }),
      ),
    ];

    await expect(
      Promise.all(links.map((link) => link.validate())),
    ).resolves.toHaveLength(4);
  });

  it('rejeita campos legados e campos permanentes de motivo', () => {
    for (const field of [
      'invitedBy',
      'startedAt',
      'rejectionReason',
      'endReason',
    ]) {
      expect(
        () =>
          new ProfessionalAthleteLink(
            linkData({
              [field]:
                field === 'invitedBy'
                  ? new mongoose.Types.ObjectId()
                  : 'valor indevido',
            }),
          ),
      ).toThrow();
    }
  });

  it('define índices de consulta e unicidade parcial para pending ou active', () => {
    const indexes = ProfessionalAthleteLink.schema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          { professionalId: 1, athleteId: 1, status: 1 },
          expect.any(Object),
        ],
        [{ athleteId: 1, status: 1 }, expect.any(Object)],
        [{ professionalId: 1, status: 1 }, expect.any(Object)],
        [
          { professionalId: 1, athleteId: 1 },
          expect.objectContaining({
            name: 'unique_open_professional_athlete_link',
            unique: true,
            partialFilterExpression: {
              status: { $in: ['pending', 'active'] },
            },
          }),
        ],
      ]),
    );
  });
});
