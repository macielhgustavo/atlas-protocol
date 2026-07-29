process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/atlas_protocol_test';
process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_SALT_ROUNDS = '10';
process.env.PROFESSIONAL_DOCUMENT_MAX_BYTES = '1024';
process.env.EXAM_DOCUMENT_MAX_BYTES = '1024';
process.env.STORAGE_LOCAL_ROOT = '.storage/test';
