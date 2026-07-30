const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const env = require('../config/env');
const StorageService = require('./storage-service');

const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;

class LocalStorageService extends StorageService {
  constructor({ rootDirectory = env.storageLocalRoot } = {}) {
    super();
    this.rootDirectory = rootDirectory;
  }

  getResolvedRootDirectory() {
    if (!this.rootDirectory || typeof this.rootDirectory !== 'string') {
      throw new Error('Diretório de storage local não configurado.');
    }

    return path.resolve(this.rootDirectory);
  }

  resolveStoragePath(storageKey) {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new TypeError('Chave de storage inválida.');
    }

    return path.join(this.getResolvedRootDirectory(), storageKey);
  }

  async store(file) {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new TypeError('Arquivo inválido para armazenamento.');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new TypeError('Somente arquivos PDF podem ser armazenados.');
    }

    const storageKey = `${crypto.randomUUID()}.pdf`;
    const rootDirectory = this.getResolvedRootDirectory();
    const storagePath = this.resolveStoragePath(storageKey);

    await fs.mkdir(rootDirectory, { recursive: true });
    try {
      await fs.writeFile(storagePath, file.buffer, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        await fs.unlink(storagePath).catch((cleanupError) => {
          if (cleanupError.code !== 'ENOENT') throw cleanupError;
        });
      }
      throw error;
    }

    return {
      storageKey,
      url: path.posix.join('/private-files', storageKey),
    };
  }

  async read(storageKey) {
    const storagePath = this.resolveStoragePath(storageKey);

    try {
      return await fs.readFile(storagePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  async remove(storageKey) {
    const storagePath = this.resolveStoragePath(storageKey);

    try {
      await fs.unlink(storagePath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }

      throw error;
    }
  }
}

module.exports = LocalStorageService;
