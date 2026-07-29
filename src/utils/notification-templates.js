const NOTIFICATION_TYPES = require('../constants/notification-types');

const NOTIFICATION_TEMPLATES = Object.freeze({
  [NOTIFICATION_TYPES.PROFESSIONAL_APPROVED]: Object.freeze({
    title: 'Cadastro profissional aprovado',
    message: 'Seu cadastro profissional foi aprovado.',
  }),
  [NOTIFICATION_TYPES.PROFESSIONAL_REJECTED]: Object.freeze({
    title: 'Cadastro profissional não aprovado',
    message:
      'Seu cadastro profissional foi revisado e não foi aprovado.',
  }),
  [NOTIFICATION_TYPES.LINK_REQUESTED]: Object.freeze({
    title: 'Nova solicitação de vínculo',
    message: 'Você recebeu uma solicitação de vínculo profissional.',
  }),
  [NOTIFICATION_TYPES.LINK_ACCEPTED]: Object.freeze({
    title: 'Solicitação de vínculo aceita',
    message: 'Uma solicitação de vínculo foi aceita.',
  }),
  [NOTIFICATION_TYPES.LINK_REJECTED]: Object.freeze({
    title: 'Solicitação de vínculo rejeitada',
    message: 'Uma solicitação de vínculo foi rejeitada.',
  }),
  [NOTIFICATION_TYPES.LINK_ENDED]: Object.freeze({
    title: 'Vínculo encerrado',
    message: 'Um vínculo profissional foi encerrado.',
  }),
  [NOTIFICATION_TYPES.PROTOCOL_CREATED]: Object.freeze({
    title: 'Protocolo registrado',
    message: 'Um protocolo foi registrado para acompanhamento.',
  }),
  [NOTIFICATION_TYPES.PROTOCOL_VERSION_CREATED]: Object.freeze({
    title: 'Nova versão de protocolo',
    message: 'Uma nova versão do protocolo foi registrada.',
  }),
  [NOTIFICATION_TYPES.PROTOCOL_STATUS_CHANGED]: Object.freeze({
    title: 'Status do protocolo atualizado',
    message: 'Uma alteração de status foi registrada no protocolo.',
  }),
  [NOTIFICATION_TYPES.TRACKING_CREATED]: Object.freeze({
    title: 'Novo acompanhamento registrado',
    message: 'Um novo acompanhamento foi registrado.',
  }),
  [NOTIFICATION_TYPES.CHECKIN_SUBMITTED]: Object.freeze({
    title: 'Check-in enviado',
    message: 'Um check-in foi enviado para revisão.',
  }),
  [NOTIFICATION_TYPES.CHECKIN_REVIEWED]: Object.freeze({
    title: 'Check-in revisado',
    message: 'Seu check-in foi revisado.',
  }),
  [NOTIFICATION_TYPES.EXAM_CREATED]: Object.freeze({
    title: 'Exame registrado',
    message: 'Um exame foi registrado no seu histórico.',
  }),
  [NOTIFICATION_TYPES.INVENTORY_LOW_STOCK]: Object.freeze({
    title: 'Estoque baixo',
    message: 'Um item do estoque atingiu o limite configurado.',
  }),
  [NOTIFICATION_TYPES.INVENTORY_EXPIRED]: Object.freeze({
    title: 'Item vencido',
    message: 'Um item do estoque está com a validade vencida.',
  }),
});

function getNotificationTemplate(type) {
  return NOTIFICATION_TEMPLATES[type] || null;
}

module.exports = {
  getNotificationTemplate,
  NOTIFICATION_TEMPLATES,
};
