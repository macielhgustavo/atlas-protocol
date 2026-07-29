const NOTIFICATION_TYPES = require(
  '../../src/constants/notification-types',
);
const {
  getNotificationTemplate,
  NOTIFICATION_TEMPLATES,
} = require('../../src/utils/notification-templates');

describe('notification templates', () => {
  it('possui exatamente um template seguro para cada tipo oficial', () => {
    expect(Object.keys(NOTIFICATION_TEMPLATES).sort()).toEqual(
      Object.values(NOTIFICATION_TYPES).sort(),
    );

    Object.values(NOTIFICATION_TEMPLATES).forEach((template) => {
      expect(Object.keys(template).sort()).toEqual(['message', 'title']);
      expect(template.title).not.toMatch(/<[^>]*>/u);
      expect(template.message).not.toMatch(/<[^>]*>/u);
      expect(template.title.length).toBeLessThanOrEqual(160);
      expect(template.message.length).toBeLessThanOrEqual(500);
    });
  });

  it('mantém os textos congelados de eventos sensíveis sem detalhes', () => {
    expect(
      getNotificationTemplate(NOTIFICATION_TYPES.PROFESSIONAL_REJECTED),
    ).toEqual({
      title: 'Cadastro profissional não aprovado',
      message:
        'Seu cadastro profissional foi revisado e não foi aprovado.',
    });
    expect(getNotificationTemplate(NOTIFICATION_TYPES.EXAM_CREATED)).toEqual({
      title: 'Exame registrado',
      message: 'Um exame foi registrado no seu histórico.',
    });
    expect(getNotificationTemplate('generic')).toBeNull();
  });
});
