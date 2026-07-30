class StorageService {
  async store(_file) {
    throw new Error('StorageService.store deve ser implementado.');
  }

  async read(_storageKey) {
    throw new Error('StorageService.read deve ser implementado.');
  }

  async remove(_storageKey) {
    throw new Error('StorageService.remove deve ser implementado.');
  }
}

module.exports = StorageService;
