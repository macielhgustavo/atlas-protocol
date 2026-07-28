# Atlas Protocol — Modelos de banco de dados

## 1. Convenções gerais

- Banco: MongoDB.
- Versão mínima: MongoDB 6.0 com FCV 6.0 ou superior.
- ODM: Mongoose.
- IDs: `ObjectId`.
- Timestamps: `createdAt` e `updatedAt` quando aplicável.
- Datas persistidas em UTC.
- Sem exclusão física de dados de negócio na V1.
- Preferir `active`, `archivedAt` ou estados de domínio.
- Campos sensíveis usam `select: false` quando possível.
- Índices únicos também devem ser tratados no service.
- Arquivos ficam em storage externo/abstraído; MongoDB armazena metadados e referências.

## 2. User

Collection: `users`

```js
{
  name: String,
  email: String,
  passwordHash: String,
  role: "admin" | "professional" | "athlete",
  active: Boolean,
  blockedAt: Date | null,
  lastLoginAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

Validações:

- `name`: obrigatório, 2–120 caracteres;
- `email`: obrigatório, lowercase, trim, formato válido;
- `passwordHash`: obrigatório, `select: false`;
- `role`: obrigatório;
- `active`: default `true`.

Índices:

```js
{ email: 1 } // unique
{ role: 1, active: 1 }
```

Nunca retornar `passwordHash`.

## 3. ProfessionalProfile

Collection: `professional_profiles`

```js
{
  userId: ObjectId,
  verificationStatus: "pending" | "approved" | "rejected",
  verificationDocument: {
    storageKey: String,
    url: String,
    originalName: String,
    mimeType: String,
    sizeBytes: Number
  },
  submittedAt: Date,
  reviewedAt: Date | null,
  reviewedBy: ObjectId | null,
  rejectionReason: String | null,
  createdAt: Date,
  updatedAt: Date
}
```

Regras:

- `userId` deve referenciar `User.role=professional`;
- um perfil por profissional;
- PDF obrigatório no cadastro profissional;
- fluxo de aprovação é demonstrativo para fins acadêmicos e não certifica credencial real;
- `reviewedAt` e `reviewedBy` obrigatórios para `approved` ou `rejected`;
- `rejectionReason` obrigatório quando `rejected`;
- profissional só exerce permissões profissionais quando `approved`.

Índices:

```js
{ userId: 1 } // unique
{ verificationStatus: 1, submittedAt: 1 }
```

## 4. ProfessionalAthleteLink

Collection: `professional_athlete_links`

```js
{
  professionalId: ObjectId,
  athleteId: ObjectId,
  status: "pending" | "active" | "rejected" | "ended",
  requestedAt: Date,
  acceptedAt: Date | null,
  rejectedAt: Date | null,
  endedAt: Date | null,
  endedBy: ObjectId | null,
  createdAt: Date,
  updatedAt: Date
}
```

Validações:

- profissional deve ter role `professional` e status `approved` para solicitar;
- atleta deve ter role `athlete`;
- usuário não pode vincular-se a si mesmo;
- somente atleta destinatário aceita/rejeita;
- `endedAt` obrigatório quando status `ended`;
- motivos opcionais de rejeição e encerramento não integram este model e são
  registrados somente em `AuditLog.metadata`.

Índices:

```js
ProfessionalAthleteLinkSchema.index(
  { professionalId: 1, athleteId: 1 },
  {
    unique: true,
    name: "unique_open_professional_athlete_link",
    partialFilterExpression: {
      status: { $in: ["pending", "active"] }
    }
  }
)
{ professionalId: 1, athleteId: 1, status: 1 }
{ athleteId: 1, status: 1 }
{ professionalId: 1, status: 1 }
```

O índice único parcial exige MongoDB/FCV 6.0 ou superior. A unicidade também é
validada preventivamente no service, e conflitos concorrentes de chave duplicada
devem ser tratados pela aplicação.

Regra lógica: não pode haver mais de um vínculo `pending` ou `active` para o
mesmo par. Vínculos `rejected` e `ended` ficam fora do índice parcial e permitem
uma nova solicitação em outro documento.

## 5. Substance

Collection: `substances`

```js
{
  name: String,
  slug: String,
  category: "hormone" | "peptide" | "supplement" | "vitamin" | "medication" | "other",
  description: String | null,
  active: Boolean,
  scope: "global" | "private",
  ownerId: ObjectId | null,
  createdAt: Date,
  updatedAt: Date
}
```

Validações:

- nome obrigatório, 2–120;
- `slug` obrigatório;
- `ownerId` obrigatório quando `scope=private`;
- `ownerId=null` quando `scope=global`.

Índices:

```js
{ slug: 1, scope: 1, ownerId: 1 }
{ category: 1, active: 1 }
```

Não armazenar orientação automática de uso.

## 6. Protocol

Collection: `protocols`

```js
{
  athleteId: ObjectId,
  professionalId: ObjectId,
  title: String,
  objective: String | null,
  status: "draft" | "active" | "paused" | "closed" | "cancelled",
  currentVersion: Number,
  startDate: Date,
  endDate: Date | null,
  continuous: Boolean,
  activatedAt: Date | null,
  pausedAt: Date | null,
  closedAt: Date | null,
  cancelledAt: Date | null,
  statusHistory: [
    {
      from: "draft" | "active" | "paused" | "closed" | "cancelled" | null,
      to: "draft" | "active" | "paused" | "closed" | "cancelled",
      reason: String | null,
      changedAt: Date,
      changedBy: ObjectId
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

Validações:

- título: 3–160;
- `currentVersion >= 1`;
- `endDate >= startDate`;
- `continuous=true` permite `endDate=null`;
- profissional precisa estar `approved` e ter vínculo `active`;
- na criação, `statusHistory` recebe exatamente a entrada inicial
  `{ from: null, to: "draft", reason: null, changedAt, changedBy }`;
- toda transição posterior adiciona exatamente uma nova entrada ao final de
  `statusHistory`;
- entradas de `statusHistory` são append-only e não podem ser editadas,
  substituídas ou removidas por operações normais;
- `reason` é opcional, recebe `trim`, tem no máximo 500 caracteres e é
  persistido como `null` quando omitido;
- `changedAt` é armazenado em UTC e `changedBy` identifica o usuário
  autenticado responsável;
- `statusHistory` é controlado pelo backend e não pode ser fornecido pelo
  cliente em payloads de criação, edição, versionamento ou transição.

Semântica dos timestamps de status:

- `activatedAt`: data da primeira transição `draft -> active`; nunca é apagado
  ou sobrescrito em uma retomada;
- `pausedAt`: data da pausa mais recente; é atualizado em `active -> paused` e
  não é limpo em `paused -> active`;
- `closedAt`: data da entrada em `closed`; nunca é apagado;
- `cancelledAt`: data da entrada em `cancelled`; nunca é apagado;
- não existe `resumedAt`; retomadas `paused -> active` ficam integralmente no
  `statusHistory`.

`statusHistory` é a fonte de verdade do histórico funcional de estados do
protocolo. AuditLog registra auditoria e rastreabilidade, mas não substitui esse
histórico. A entrada inicial gera `PROTOCOL_CREATED`, sem
`PROTOCOL_STATUS_CHANGED` duplicado; cada transição posterior gera exatamente
um `PROTOCOL_STATUS_CHANGED` com metadata mínima (`from`, `to` e `reason`,
quando informado).

Índices:

```js
{ athleteId: 1, status: 1 }
{ professionalId: 1, status: 1 }
{ athleteId: 1, createdAt: -1 }
```

Não existe delete físico. Draft descartado vira `cancelled`.

## 7. ProtocolVersion

Collection: `protocol_versions`

```js
{
  protocolId: ObjectId,
  version: Number,
  createdBy: ObjectId,
  changeReason: String | null,
  startDate: Date,
  endDate: Date | null,
  continuous: Boolean,
  items: [
    {
      substanceId: ObjectId,
      substanceSnapshot: {
        name: String,
        category: String
      },
      instructions: String,
      frequencyType: "daily" | "weekly" | "custom",
      weekDays: [Number],
      time: String | null,
      startDate: Date | null,
      endDate: Date | null,
      active: Boolean
    }
  ],
  createdAt: Date
}
```

Regras:

- combinação `protocolId + version` única;
- snapshot obrigatório;
- `weekDays`: valores 1–7, sem duplicidade;
- `time`: `HH:mm`;
- versão publicada é imutável;
- a versão 1 é auditada por `PROTOCOL_CREATED`; cada versão posterior gera
  exatamente um `PROTOCOL_VERSION_CREATED` após ser publicada.

Índice:

```js
{ protocolId: 1, version: 1 } // unique
```

## 8. TrackingRecord

Collection: `tracking_records`

```js
{
  athleteId: ObjectId,
  professionalId: ObjectId,
  protocolId: ObjectId | null,
  protocolVersion: Number | null,
  type: "scheduled" | "manual",
  title: String,
  scheduledFor: Date,
  status: "scheduled" | "completed" | "missed" | "cancelled",
  completedAt: Date | null,
  completedBy: ObjectId | null,
  notes: String | null,
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

Regras:

- `scheduledFor` é o único nome de campo temporal de agendamento;
- protocolo opcional deve estar em estado permitido;
- status final não retorna a `scheduled` na V1;
- `completedAt` e `completedBy` coerentes com `completed`.

Índices:

```js
{ athleteId: 1, scheduledFor: 1 }
{ protocolId: 1, status: 1 }
{ athleteId: 1, status: 1, scheduledFor: 1 }
```

## 9. CheckIn

Collection: `check_ins`

```js
{
  athleteId: ObjectId,
  professionalId: ObjectId,
  protocolId: ObjectId | null,
  referenceWeek: Date,
  status: "pending" | "submitted" | "reviewed",
  responses: Object,
  submittedAt: Date | null,
  reviewedAt: Date | null,
  reviewedBy: ObjectId | null,
  reviewComment: String | null,
  createdAt: Date,
  updatedAt: Date
}
```

Regras:

- `referenceWeek` normalizada para segunda-feira;
- um check-in por atleta/semana;
- respostas editáveis apenas enquanto `pending`;
- sem `reopenedAt` na V1;
- `submitted -> reviewed`, sem retorno a `pending`.

Índices:

```js
{ athleteId: 1, referenceWeek: 1 } // unique
{ professionalId: 1, status: 1, referenceWeek: -1 }
{ protocolId: 1, referenceWeek: -1 }
```

## 10. Exam

Collection: `exams`

```js
{
  athleteId: ObjectId,
  professionalId: ObjectId | null,
  title: String,
  examDate: Date,
  laboratory: String | null,
  results: [
    {
      marker: String,
      value: String,
      unit: String | null,
      referenceRange: String | null
    }
  ],
  document: {
    storageKey: String,
    url: String,
    originalName: String,
    mimeType: String,
    sizeBytes: Number
  } | null,
  notes: String | null,
  archivedAt: Date | null,
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

Regras:

- título e data obrigatórios;
- PDF suportado;
- resultados estruturados opcionais;
- sistema não interpreta resultado;
- arquivamento lógico, sem delete físico.

Índices:

```js
{ athleteId: 1, examDate: -1 }
{ athleteId: 1, archivedAt: 1 }
```

## 11. PhysicalProgress

Collection: `physical_progress`

```js
{
  athleteId: ObjectId,
  recordedBy: ObjectId,
  referenceDate: Date,
  weightKg: Number | null,
  bodyFatPercent: Number | null,
  measurements: {
    chestCm: Number | null,
    waistCm: Number | null,
    armCm: Number | null,
    thighCm: Number | null,
    calfCm: Number | null
  },
  notes: String | null,
  archivedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

Validações:

- valores não negativos;
- `bodyFatPercent` entre 0 e 100, quando presente;
- ao menos um dado ou observação;
- sem julgamento automático do resultado.

Índice:

```js
{ athleteId: 1, referenceDate: -1 }
```

## 12. History/Timeline

Não precisa de collection própria na V1.

A timeline é uma projeção agregada derivada de:

- Protocol/ProtocolVersion;
- TrackingRecord;
- CheckIn;
- Exam;
- PhysicalProgress;
- eventos relevantes auditáveis quando apropriado.

Formato sugerido de resposta:

```js
{
  id: String,
  type: "protocol_version" | "tracking" | "checkin" | "exam" | "progress",
  occurredAt: Date,
  title: String,
  summary: String,
  entityId: ObjectId
}
```

Nenhum dado-fonte é alterado pela timeline.

## 13. InventoryItem

Collection: `inventory_items`

```js
{
  athleteId: ObjectId,
  substanceId: ObjectId | null,
  name: String,
  unit: "unit" | "ml" | "mg" | "g" | "capsule" | "tablet" | "vial" | "box",
  quantity: Number,
  lowStockThreshold: Number | null,
  expirationDate: Date | null,
  archivedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

Escopo reduzido: não incluir fornecedor, custo, compra, depósito ou ERP.

Validações:

- `quantity >= 0`;
- `lowStockThreshold >= 0`;
- nome obrigatório.

Índices:

```js
{ athleteId: 1, archivedAt: 1 }
{ athleteId: 1, expirationDate: 1 }
```

## 14. InventoryMovement

Collection: `inventory_movements`

```js
{
  inventoryItemId: ObjectId,
  athleteId: ObjectId,
  type: "in" | "out" | "adjustment",
  quantity: Number,
  previousQuantity: Number,
  resultingQuantity: Number,
  reason: String,
  createdBy: ObjectId,
  createdAt: Date
}
```

Regras:

- quantidade da movimentação > 0;
- saída não gera estoque negativo;
- movimentação imutável;
- item vencido respeita bloqueios definidos no domínio;
- alteração de quantidade ocorre via movimentação, não edição direta.

Índices:

```js
{ inventoryItemId: 1, createdAt: -1 }
{ athleteId: 1, createdAt: -1 }
```

## 15. Notification

Collection: `notifications`

```js
{
  userId: ObjectId,
  type: String,
  title: String,
  message: String,
  entityType: String | null,
  entityId: ObjectId | null,
  readAt: Date | null,
  archivedAt: Date | null,
  createdAt: Date
}
```

Índices:

```js
{ userId: 1, readAt: 1, createdAt: -1 }
{ userId: 1, archivedAt: 1, createdAt: -1 }
```

## 16. AuditLog

Collection: `audit_logs`

```js
{
  actorId: ObjectId | null,
  action: String,
  entityType: String,
  entityId: ObjectId | null,
  metadata: Object,
  ipHash: String | null,
  createdAt: Date
}
```

Regras:

- somente aplicação escreve;
- sem senha, token, PDF, exame completo ou documento profissional completo;
- documento imutável.

Índices:

```js
{ entityType: 1, entityId: 1, createdAt: -1 }
{ actorId: 1, createdAt: -1 }
{ action: 1, createdAt: -1 }
```

## 17. Relacionamentos principais

```text
User (professional)
  -> ProfessionalProfile
  -> ProfessionalAthleteLink
  -> User (athlete)

Protocol
  -> athleteId
  -> professionalId
  -> ProtocolVersion[]
  -> statusHistory[]

TrackingRecord
  -> athlete
  -> professional
  -> Protocol opcional

CheckIn
  -> athlete
  -> professional
  -> Protocol opcional

Exam / PhysicalProgress
  -> athlete
  -> professional quando aplicável

InventoryItem
  -> athlete
  -> InventoryMovement[]

Notification
  -> user

AuditLog
  -> actor/entity
```

## 18. Preservação e arquivamento

Não usar cascade delete automático para histórico.

Ao desativar usuário:

- bloquear login/ações conforme regra;
- manter perfis, vínculos e histórico;
- não apagar protocolos, check-ins, exames ou auditoria.

Ao desativar substância:

- ocultar de novas seleções;
- manter snapshots históricos.

Ao cancelar protocolo draft:

- preservar protocolo e versão inicial para rastreabilidade;
- marcar `cancelled`.

Ao arquivar exame, evolução ou estoque:

- preservar referências e histórico;
- não remover registros relacionados.
