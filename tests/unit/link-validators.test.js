const {
  createLinkSchema,
  endLinkSchema,
  linkListQuerySchema,
  rejectLinkSchema,
} = require('../../src/validators/link-validators');

describe('link validators', () => {
  it('normaliza o e-mail exato do atleta e rejeita campos de identidade', () => {
    const valid = createLinkSchema.validate({
      athleteEmail: '  ATLETA@EXAMPLE.COM  ',
    });
    const unknown = createLinkSchema.validate({
      athleteEmail: 'atleta@example.com',
      professionalId: '507f1f77bcf86cd799439011',
    });

    expect(valid.error).toBeUndefined();
    expect(valid.value).toEqual({ athleteEmail: 'atleta@example.com' });
    expect(unknown.error?.details[0].type).toBe('object.unknown');
  });

  it('aplica paginação e ordenação padrão com whitelist estrita', () => {
    const defaults = linkListQuerySchema.validate({});
    const requestedAt = linkListQuerySchema.validate({
      sortBy: 'requestedAt',
      sortOrder: 'asc',
    });
    const arbitrary = linkListQuerySchema.validate({ sortBy: 'updatedAt' });

    expect(defaults.error).toBeUndefined();
    expect(defaults.value).toMatchObject({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(requestedAt.error).toBeUndefined();
    expect(requestedAt.value).toMatchObject({
      sortBy: 'requestedAt',
      sortOrder: 'asc',
    });
    expect(arbitrary.error?.details[0].type).toBe('any.only');
  });

  it('normaliza motivos opcionais sem impor tamanho mínimo arbitrário', () => {
    const rejected = rejectLinkSchema.validate({ reason: '  x  ' });
    const ended = endLinkSchema.validate({});

    expect(rejected.error).toBeUndefined();
    expect(rejected.value).toEqual({ reason: 'x' });
    expect(ended.error).toBeUndefined();
    expect(ended.value).toEqual({});
  });

  it('rejeita motivos vazios, excessivos e campos desconhecidos', () => {
    const empty = rejectLinkSchema.validate({ reason: '   ' });
    const excessive = endLinkSchema.validate({ reason: 'x'.repeat(501) });
    const unknown = rejectLinkSchema.validate({ observation: 'não permitido' });

    expect(empty.error).toBeDefined();
    expect(excessive.error?.details[0].type).toBe('string.max');
    expect(unknown.error?.details[0].type).toBe('object.unknown');
  });
});
