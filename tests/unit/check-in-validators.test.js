const {
  createCheckInSchema,
  reviewCheckInSchema,
  updateCheckInSchema,
} = require('../../src/validators/check-in-validators');
const {
  MAX_SERIALIZED_BYTES,
  validateResponses,
} = require('../../src/utils/check-in-responses');

function validCreatePayload(overrides = {}) {
  return {
    referenceWeek: '2026-08-03T03:00:00.000Z',
    responses: { notes: 'Registro semanal.' },
    ...overrides,
  };
}

describe('check-in validators', () => {
  it('aceita escalares e arrays planos no contrato de responses', () => {
    const payload = validCreatePayload({
      responses: {
        text: 'Relato.',
        number: 10.5,
        boolean: true,
        empty: null,
        tags: ['um', 2, false, null],
      },
    });

    expect(createCheckInSchema.validate(payload).error).toBeUndefined();
  });

  it.each([
    ['objeto vazio', {}],
    ['objeto aninhado', { nested: { value: true } }],
    ['array aninhado', { nested: [['value']] }],
    ['objeto em array', { nested: [{ value: true }] }],
    ['string extensa', { notes: 'x'.repeat(1001) }],
    ['número não finito', { score: Number.POSITIVE_INFINITY }],
    ['array extenso', { items: Array.from({ length: 21 }, () => 'x') }],
    ['chave com ponto', { 'unsafe.key': true }],
    ['chave iniciada por cifrão', { '$where': true }],
    ['chave reservada', JSON.parse('{"__proto__":"unsafe"}')],
    ['chave constructor', { constructor: 'unsafe' }],
    ['chave prototype', { prototype: 'unsafe' }],
    ['chave com null byte', { 'unsafe\0key': true }],
  ])('rejeita responses com %s', (_case, responses) => {
    const { error } = createCheckInSchema.validate(
      validCreatePayload({ responses }),
    );

    expect(error).toBeDefined();
  });

  it('limita responses a vinte propriedades e 16 KB serializados', () => {
    const tooManyProperties = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`field${index}`, index]),
    );
    const tooLarge = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `field${index}`,
        'á'.repeat(1000),
      ]),
    );

    expect(validateResponses(tooManyProperties)).not.toBeNull();
    expect(Buffer.byteLength(JSON.stringify(tooLarge), 'utf8')).toBeGreaterThan(
      MAX_SERIALIZED_BYTES,
    );
    expect(validateResponses(tooLarge)).not.toBeNull();
  });

  it('rejeita answers, athleteId e campos internos na criação', () => {
    const { error } = createCheckInSchema.validate(
      {
        ...validCreatePayload(),
        athleteId: '507f1f77bcf86cd799439011',
        answers: { notes: 'Formato antigo.' },
        status: 'reviewed',
      },
      { abortEarly: false },
    );

    expect(error).toBeDefined();
    expect(error.details.map((detail) => detail.path[0])).toEqual(
      expect.arrayContaining(['athleteId', 'answers', 'status']),
    );
  });

  it('aceita somente responses na edição', () => {
    expect(
      updateCheckInSchema.validate({
        responses: { notes: 'Atualização.' },
      }).error,
    ).toBeUndefined();
    expect(
      updateCheckInSchema.validate({
        responses: { notes: 'Atualização.' },
        referenceWeek: '2026-08-10T00:00:00.000Z',
      }).error,
    ).toBeDefined();
  });

  it('normaliza reviewComment e aplica limite de 2000 caracteres', () => {
    const valid = reviewCheckInSchema.validate({
      reviewComment: '  Acompanhamento revisado.  ',
    });
    const empty = reviewCheckInSchema.validate({ reviewComment: '   ' });
    const tooLong = reviewCheckInSchema.validate({
      reviewComment: 'x'.repeat(2001),
    });

    expect(valid.error).toBeUndefined();
    expect(valid.value.reviewComment).toBe('Acompanhamento revisado.');
    expect(empty.error).toBeDefined();
    expect(tooLong.error).toBeDefined();
  });
});
