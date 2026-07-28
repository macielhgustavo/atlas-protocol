const {
  dashboardQuerySchema,
} = require('../../src/validators/dashboard-validators');

describe('validator do dashboard', () => {
  it('aceita query vazia', () => {
    expect(dashboardQuerySchema.validate({}).error).toBeUndefined();
  });

  it.each(['role', 'userId', 'athleteId', 'professionalId', 'dateFrom'])(
    'rejeita o parâmetro %s',
    (field) => {
      const { error } = dashboardQuerySchema.validate({
        [field]: 'valor',
      });

      expect(error).toBeDefined();
      expect(error.details[0].type).toBe('object.unknown');
    },
  );
});
