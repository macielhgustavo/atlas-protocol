const mongoose = require('mongoose');

const LINK_STATUSES = require('../constants/link-statuses');

const professionalAthleteLinkSchema = new mongoose.Schema(
  {
    professionalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: Object.values(LINK_STATUSES),
      default: LINK_STATUSES.PENDING,
      required: true,
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    collection: 'professional_athlete_links',
    strict: 'throw',
    timestamps: true,
  },
);

professionalAthleteLinkSchema.pre('validate', function validateState(next) {
  const hasAcceptedData = this.acceptedAt !== null;
  const hasRejectedData = this.rejectedAt !== null;
  const hasEndedData = this.endedAt !== null || this.endedBy !== null;

  if (
    this.professionalId &&
    this.athleteId &&
    this.professionalId.toString() === this.athleteId.toString()
  ) {
    this.invalidate(
      'athleteId',
      'O profissional e o atleta devem ser usuários diferentes.',
    );
  }

  if (
    this.status === LINK_STATUSES.PENDING &&
    (hasAcceptedData || hasRejectedData || hasEndedData)
  ) {
    this.invalidate(
      'status',
      'Um vínculo pendente não pode possuir dados de transição.',
    );
  }

  if (this.status === LINK_STATUSES.ACTIVE) {
    if (!this.acceptedAt) {
      this.invalidate(
        'acceptedAt',
        'acceptedAt é obrigatório para vínculos ativos.',
      );
    }
    if (hasRejectedData || hasEndedData) {
      this.invalidate(
        'status',
        'Um vínculo ativo não pode possuir dados de rejeição ou encerramento.',
      );
    }
  }

  if (this.status === LINK_STATUSES.REJECTED) {
    if (!this.rejectedAt) {
      this.invalidate(
        'rejectedAt',
        'rejectedAt é obrigatório para vínculos rejeitados.',
      );
    }
    if (hasAcceptedData || hasEndedData) {
      this.invalidate(
        'status',
        'Um vínculo rejeitado não pode possuir dados de aceite ou encerramento.',
      );
    }
  }

  if (this.status === LINK_STATUSES.ENDED) {
    if (!this.acceptedAt) {
      this.invalidate(
        'acceptedAt',
        'acceptedAt é obrigatório para vínculos encerrados.',
      );
    }
    if (!this.endedAt) {
      this.invalidate(
        'endedAt',
        'endedAt é obrigatório para vínculos encerrados.',
      );
    }
    if (!this.endedBy) {
      this.invalidate(
        'endedBy',
        'endedBy é obrigatório para vínculos encerrados.',
      );
    }
    if (hasRejectedData) {
      this.invalidate(
        'status',
        'Um vínculo encerrado não pode possuir dados de rejeição.',
      );
    }
  }

  next();
});

professionalAthleteLinkSchema.index({
  professionalId: 1,
  athleteId: 1,
  status: 1,
});
professionalAthleteLinkSchema.index({ athleteId: 1, status: 1 });
professionalAthleteLinkSchema.index({ professionalId: 1, status: 1 });
professionalAthleteLinkSchema.index(
  { professionalId: 1, athleteId: 1 },
  {
    name: 'unique_open_professional_athlete_link',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [LINK_STATUSES.PENDING, LINK_STATUSES.ACTIVE],
      },
    },
  },
);

module.exports = mongoose.model(
  'ProfessionalAthleteLink',
  professionalAthleteLinkSchema,
);
