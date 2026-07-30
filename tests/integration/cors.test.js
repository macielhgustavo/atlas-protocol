const request = require('supertest');

jest.mock('../../src/config/env', () => ({
  ...jest.requireActual('../../src/config/env'),
  corsOrigins: ['https://frontend-configurado.example'],
}));

const app = require('../../src/app');

describe('CORS configurável', () => {
  let consoleErrorSpy;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('aceita origem configurada em env.corsOrigins', async () => {
    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'https://frontend-configurado.example')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://frontend-configurado.example',
    );
  });

  it('preserva requisições sem Origin', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('bloqueia origem ausente da configuração sem usar wildcard', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://origem-nao-configurada.example');

    expect(response.status).toBe(500);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });
});
