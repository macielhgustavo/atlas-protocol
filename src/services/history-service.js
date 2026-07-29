const mongoose = require('mongoose');

const HISTORY_EVENT_TYPES = require('../constants/history-event-types');
const ERROR_CODES = require('../constants/error-codes');
const LINK_STATUSES = require('../constants/link-statuses');
const TRACKING_RECORD_STATUSES = require(
  '../constants/tracking-record-statuses',
);
const USER_ROLES = require('../constants/user-roles');
const CheckIn = require('../models/check-in');
const Exam = require('../models/exam');
const PhysicalProgress = require('../models/physical-progress');
const ProfessionalAthleteLink = require('../models/professional-athlete-link');
const Protocol = require('../models/protocol');
const ProtocolVersion = require('../models/protocol-version');
const TrackingRecord = require('../models/tracking-record');
const User = require('../models/user');
const AppError = require('../utils/app-error');
const {
  compareHistoryItems,
  toHistoryItem,
} = require('../utils/history-response');

const FINAL_TRACKING_STATUSES = [
  TRACKING_RECORD_STATUSES.COMPLETED,
  TRACKING_RECORD_STATUSES.MISSED,
  TRACKING_RECORD_STATUSES.CANCELLED,
];

function notFoundError() {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    'Histórico não encontrado.',
  );
}

function validationError(field, message) {
  return new AppError(
    400,
    ERROR_CODES.VALIDATION_ERROR,
    'Dados inválidos.',
    [{ field, message }],
  );
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function toObjectId(value) {
  return new mongoose.Types.ObjectId(value.toString());
}

async function resolveAthleteId(requester, query) {
  if (requester.role === USER_ROLES.ATHLETE) {
    if (hasOwn(query, 'athleteId')) {
      throw validationError(
        'athleteId',
        'athleteId é derivado do usuário autenticado.',
      );
    }
    return toObjectId(requester.id);
  }

  if (!query.athleteId) {
    throw validationError('athleteId', 'Informe o atleta.');
  }

  const athleteId = toObjectId(query.athleteId);
  const [athleteExists, activeLinkExists] = await Promise.all([
    User.exists({ _id: athleteId, role: USER_ROLES.ATHLETE }),
    ProfessionalAthleteLink.exists({
      professionalId: requester.id,
      athleteId,
      status: LINK_STATUSES.ACTIVE,
    }),
  ]);
  if (!athleteExists || !activeLinkExists) throw notFoundError();
  return athleteId;
}

function dateMatch(query) {
  const occurredAt = {};
  if (query.dateFrom) occurredAt.$gte = query.dateFrom;
  if (query.dateTo) occurredAt.$lte = query.dateTo;
  return Object.keys(occurredAt).length ? [{ $match: { occurredAt } }] : [];
}

async function aggregateSource(model, eventPipeline, query, windowSize) {
  const [result] = await model.aggregate([
    ...eventPipeline,
    { $match: { occurredAt: { $type: 'date' } } },
    ...dateMatch(query),
    {
      $project: {
        _id: 0,
        id: 1,
        type: 1,
        occurredAt: 1,
        title: 1,
        summary: 1,
        entityId: 1,
      },
    },
    {
      $facet: {
        events: [
          { $sort: { occurredAt: -1, id: -1 } },
          { $limit: windowSize },
        ],
        total: [{ $count: 'value' }],
      },
    },
  ]);

  return {
    events: result.events.map(toHistoryItem),
    total: result.total[0]?.value || 0,
  };
}

function protocolVersionSource(athleteId, query, windowSize) {
  return aggregateSource(
    ProtocolVersion,
    [
      {
        $lookup: {
          from: Protocol.collection.name,
          let: { protocolId: '$protocolId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$protocolId'] },
                    { $eq: ['$athleteId', athleteId] },
                  ],
                },
              },
            },
            { $project: { _id: 1, title: 1 } },
          ],
          as: 'protocol',
        },
      },
      { $unwind: '$protocol' },
      {
        $project: {
          id: {
            $concat: [
              `${HISTORY_EVENT_TYPES.PROTOCOL_VERSION}:`,
              { $toString: '$_id' },
            ],
          },
          type: { $literal: HISTORY_EVENT_TYPES.PROTOCOL_VERSION },
          occurredAt: '$createdAt',
          title: { $literal: 'Versão de protocolo registrada' },
          summary: {
            $concat: [
              'Versão ',
              { $toString: '$version' },
              ' do protocolo ',
              '$protocol.title',
              ' registrada.',
            ],
          },
          entityId: '$protocolId',
        },
      },
    ],
    query,
    windowSize,
  );
}

function protocolStatusSource(athleteId, query, windowSize) {
  return aggregateSource(
    Protocol,
    [
      { $match: { athleteId } },
      {
        $unwind: {
          path: '$statusHistory',
          includeArrayIndex: 'statusHistoryIndex',
        },
      },
      {
        $match: {
          $nor: [
            {
              'statusHistory.from': null,
              'statusHistory.to': 'draft',
            },
          ],
        },
      },
      {
        $project: {
          id: {
            $concat: [
              `${HISTORY_EVENT_TYPES.PROTOCOL_STATUS}:`,
              { $toString: '$_id' },
              ':',
              { $toString: '$statusHistoryIndex' },
            ],
          },
          type: { $literal: HISTORY_EVENT_TYPES.PROTOCOL_STATUS },
          occurredAt: '$statusHistory.changedAt',
          title: { $literal: 'Status do protocolo atualizado' },
          summary: {
            $concat: [
              'Status alterado de ',
              '$statusHistory.from',
              ' para ',
              '$statusHistory.to',
              '.',
            ],
          },
          entityId: '$_id',
        },
      },
    ],
    query,
    windowSize,
  );
}

function trackingSource(athleteId, query, windowSize) {
  return aggregateSource(
    TrackingRecord,
    [
      {
        $match: {
          athleteId,
          status: { $in: FINAL_TRACKING_STATUSES },
        },
      },
      {
        $set: {
          occurredAt: {
            $cond: [
              { $eq: ['$status', TRACKING_RECORD_STATUSES.COMPLETED] },
              { $ifNull: ['$completedAt', '$updatedAt'] },
              '$updatedAt',
            ],
          },
        },
      },
      {
        $project: {
          id: {
            $concat: [
              `${HISTORY_EVENT_TYPES.TRACKING}:`,
              { $toString: '$_id' },
            ],
          },
          type: { $literal: HISTORY_EVENT_TYPES.TRACKING },
          occurredAt: 1,
          title: '$title',
          summary: {
            $switch: {
              branches: [
                {
                  case: {
                    $eq: [
                      '$status',
                      TRACKING_RECORD_STATUSES.COMPLETED,
                    ],
                  },
                  then: 'Tracking concluído.',
                },
                {
                  case: {
                    $eq: ['$status', TRACKING_RECORD_STATUSES.MISSED],
                  },
                  then: 'Tracking marcado como perdido.',
                },
              ],
              default: 'Tracking cancelado.',
            },
          },
          entityId: '$_id',
        },
      },
    ],
    query,
    windowSize,
  );
}

function checkInEvent(kind, dateField, title) {
  return {
    id: {
      $concat: [
        `${HISTORY_EVENT_TYPES.CHECKIN}:`,
        { $toString: '$_id' },
        `:${kind}`,
      ],
    },
    type: HISTORY_EVENT_TYPES.CHECKIN,
    occurredAt: dateField,
    title,
    summary: {
      $concat: [
        'Semana de referência: ',
        {
          $dateToString: {
            date: '$referenceWeek',
            format: '%Y-%m-%dT%H:%M:%S.%LZ',
            timezone: 'UTC',
          },
        },
        '.',
      ],
    },
    entityId: '$_id',
  };
}

function checkInSource(athleteId, query, windowSize) {
  return aggregateSource(
    CheckIn,
    [
      {
        $match: {
          athleteId,
          $or: [
            { submittedAt: { $ne: null } },
            { reviewedAt: { $ne: null } },
          ],
        },
      },
      {
        $project: {
          events: {
            $concatArrays: [
              {
                $cond: [
                  { $ne: ['$submittedAt', null] },
                  [
                    checkInEvent(
                      'submitted',
                      '$submittedAt',
                      'Check-in enviado',
                    ),
                  ],
                  [],
                ],
              },
              {
                $cond: [
                  { $ne: ['$reviewedAt', null] },
                  [
                    checkInEvent(
                      'reviewed',
                      '$reviewedAt',
                      'Check-in revisado',
                    ),
                  ],
                  [],
                ],
              },
            ],
          },
        },
      },
      { $unwind: '$events' },
      { $replaceRoot: { newRoot: '$events' } },
    ],
    query,
    windowSize,
  );
}

function examSource(athleteId, query, windowSize) {
  return aggregateSource(
    Exam,
    [
      { $match: { athleteId } },
      {
        $project: {
          id: {
            $concat: [
              `${HISTORY_EVENT_TYPES.EXAM}:`,
              { $toString: '$_id' },
            ],
          },
          type: { $literal: HISTORY_EVENT_TYPES.EXAM },
          occurredAt: '$examDate',
          title: '$title',
          summary: { $literal: 'Exame registrado.' },
          entityId: '$_id',
        },
      },
    ],
    query,
    windowSize,
  );
}

function progressSource(athleteId, query, windowSize) {
  return aggregateSource(
    PhysicalProgress,
    [
      { $match: { athleteId } },
      {
        $project: {
          id: {
            $concat: [
              `${HISTORY_EVENT_TYPES.PROGRESS}:`,
              { $toString: '$_id' },
            ],
          },
          type: { $literal: HISTORY_EVENT_TYPES.PROGRESS },
          occurredAt: '$referenceDate',
          title: { $literal: 'Registro de evolução' },
          summary: { $literal: 'Registro de evolução adicionado.' },
          entityId: '$_id',
        },
      },
    ],
    query,
    windowSize,
  );
}

const SOURCES = Object.freeze({
  [HISTORY_EVENT_TYPES.PROTOCOL_VERSION]: protocolVersionSource,
  [HISTORY_EVENT_TYPES.PROTOCOL_STATUS]: protocolStatusSource,
  [HISTORY_EVENT_TYPES.TRACKING]: trackingSource,
  [HISTORY_EVENT_TYPES.CHECKIN]: checkInSource,
  [HISTORY_EVENT_TYPES.EXAM]: examSource,
  [HISTORY_EVENT_TYPES.PROGRESS]: progressSource,
});

async function listHistory(requester, query) {
  const athleteId = await resolveAthleteId(requester, query);
  const windowSize = query.page * query.limit;
  const sourceFunctions = query.type
    ? [SOURCES[query.type]]
    : Object.values(SOURCES);
  const sourceResults = await Promise.all(
    sourceFunctions.map((source) =>
      source(athleteId, query, windowSize)),
  );

  const total = sourceResults.reduce(
    (sum, source) => sum + source.total,
    0,
  );
  const offset = (query.page - 1) * query.limit;
  const events = sourceResults
    .flatMap((source) => source.events)
    .sort(compareHistoryItems)
    .slice(offset, offset + query.limit);

  return {
    events,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

module.exports = { listHistory };
