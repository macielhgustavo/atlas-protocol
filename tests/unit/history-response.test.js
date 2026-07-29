const {
  compareHistoryItems,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  toHistoryItem,
} = require('../../src/utils/history-response');

describe('history response', () => {
  it('retorna exatamente os seis campos públicos e aplica limites', () => {
    const item = toHistoryItem({
      id: 'exam:507f1f77bcf86cd799439011',
      type: 'exam',
      occurredAt: new Date('2026-08-01T12:00:00.000Z'),
      title: 'T'.repeat(200),
      summary: 'S'.repeat(400),
      entityId: '507f1f77bcf86cd799439011',
      athleteId: 'não deve aparecer',
      notes: 'não deve aparecer',
    });

    expect(Object.keys(item)).toEqual([
      'id',
      'type',
      'occurredAt',
      'title',
      'summary',
      'entityId',
    ]);
    expect(item.title).toHaveLength(MAX_TITLE_LENGTH);
    expect(item.summary).toHaveLength(MAX_SUMMARY_LENGTH);
  });

  it('ordena por occurredAt desc e id desc', () => {
    const events = [
      { id: 'exam:a', occurredAt: '2026-08-01T00:00:00.000Z' },
      { id: 'exam:z', occurredAt: '2026-08-01T00:00:00.000Z' },
      { id: 'exam:m', occurredAt: '2026-08-02T00:00:00.000Z' },
    ];

    expect(events.sort(compareHistoryItems).map((event) => event.id)).toEqual([
      'exam:m',
      'exam:z',
      'exam:a',
    ]);
  });
});
