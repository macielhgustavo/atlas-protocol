const mongoose = require('mongoose');

const Exam = require('../../src/models/exam');

describe('Exam model', () => {
  it('define índices oficiais e não possui type', () => {
    const indexes = Exam.schema.indexes().map(([fields]) => fields);
    expect(indexes).toEqual(expect.arrayContaining([
      { athleteId: 1, examDate: -1 },
      { athleteId: 1, archivedAt: 1 },
    ]));
    expect(Exam.schema.path('type')).toBeUndefined();
    expect(Exam.schema.path('document.storageKey').options.select).toBe(false);
    expect(Exam.schema.path('document.url').options.select).toBe(false);
  });

  it('valida limites e aplica defaults seguros', async () => {
    const id = new mongoose.Types.ObjectId();
    const exam = new Exam({
      athleteId: id,
      title: ' Exame ',
      examDate: new Date(),
      results: [{ marker: ' M ', value: ' 10 ' }],
      createdBy: id,
    });
    await expect(exam.validate()).resolves.toBeUndefined();
    expect(exam.title).toBe('Exame');
    expect(exam.professionalId).toBeNull();
    expect(exam.results[0]).toMatchObject({
      marker: 'M',
      value: '10',
      unit: null,
      referenceRange: null,
    });
  });
});
