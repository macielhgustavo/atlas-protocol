const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const LocalStorageService = require('../../src/storage/local-storage-service');
const StorageService = require('../../src/storage/storage-service');

describe('LocalStorageService', () => {
  let rootDirectory;
  let storage;

  beforeEach(async () => {
    rootDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'atlas-storage-test-'),
    );
    storage = new LocalStorageService({ rootDirectory });
  });

  afterEach(async () => {
    await fs.rm(rootDirectory, { recursive: true, force: true });
  });

  it('implementa o contrato de StorageService', () => {
    expect(storage).toBeInstanceOf(StorageService);
  });

  it('armazena o PDF com chave opaca e não expõe caminho absoluto', async () => {
    const buffer = Buffer.from('%PDF-1.7\nconteúdo de teste');

    const result = await storage.store({
      buffer,
      mimetype: 'application/pdf',
      originalname: '../../documento-cliente.pdf',
    });

    expect(result.storageKey).toMatch(
      /^[0-9a-f-]{36}\.pdf$/i,
    );
    expect(result.url).toBe(`/private-files/${result.storageKey}`);
    expect(result.url).not.toContain(rootDirectory);
    expect(path.isAbsolute(result.storageKey)).toBe(false);
    await expect(
      fs.readFile(path.join(rootDirectory, result.storageKey)),
    ).resolves.toEqual(buffer);
  });

  it('remove pelo storageKey e trata arquivo inexistente de forma idempotente', async () => {
    const stored = await storage.store({
      buffer: Buffer.from('%PDF-1.7\nteste'),
      mimetype: 'application/pdf',
    });

    await expect(storage.remove(stored.storageKey)).resolves.toBe(true);
    await expect(storage.remove(stored.storageKey)).resolves.toBe(false);
  });

  it('lê somente pela chave opaca e trata arquivo inexistente', async () => {
    const buffer = Buffer.from('%PDF-1.7\nleitura segura');
    const stored = await storage.store({
      buffer,
      mimetype: 'application/pdf',
    });

    await expect(storage.read(stored.storageKey)).resolves.toEqual(buffer);
    await expect(
      storage.read('00000000-0000-4000-8000-000000000000.pdf'),
    ).resolves.toBeNull();
  });

  it('rejeita chave que tente sair da raiz configurada', async () => {
    await expect(storage.read('../documento.pdf')).rejects.toThrow(
      'Chave de storage inválida.',
    );
    await expect(storage.remove('../documento.pdf')).rejects.toThrow(
      'Chave de storage inválida.',
    );
  });
});
