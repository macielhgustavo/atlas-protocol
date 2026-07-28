# Atlas Protocol — Contratos da API

## 1. Convenções

Base URL:

```text
/api/v1
```

Autenticação:

```http
Authorization: Bearer <token>
```

JSON:

```http
Content-Type: application/json
```

Upload:

```http
Content-Type: multipart/form-data
```

Paginação:

```text
?page=1&limit=20
```

- `page` inicia em 1;
- `limit` padrão 20;
- máximo 100;
- ordenação: `sortBy` e `sortOrder=asc|desc`;
- filtros de intervalo: `dateFrom` e `dateTo`;
- ordenação padrão quando não especificada: `createdAt desc`, salvo regra
  específica do recurso.

## 2. Envelope de resposta

### Sucesso

```json
{
  "success": true,
  "data": {},
  "message": "Operação realizada com sucesso."
}
```

### Lista paginada

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

### Erro

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "fields": [
      {
        "field": "email",
        "message": "Informe um e-mail válido."
      }
    ]
  }
}
```

## 3. Status HTTP

- `200`: consulta ou alteração concluída;
- `201`: recurso criado;
- `400`: payload, parâmetro ou arquivo inválido;
- `401`: autenticação ausente ou inválida;
- `403`: sem permissão;
- `404`: recurso inexistente ou invisível ao usuário;
- `409`: conflito de regra/unicidade;
- `422`: transição/estado não permitido;
- `500`: erro interno.

A V1 não usa `DELETE` físico em dados de negócio.

## 4. Códigos de erro principais

### Gerais

- `VALIDATION_ERROR`
- `INVALID_OBJECT_ID`
- `AUTH_REQUIRED`
- `INVALID_TOKEN`
- `TOKEN_EXPIRED`
- `INVALID_CREDENTIALS`
- `USER_BLOCKED`
- `FORBIDDEN`
- `RESOURCE_NOT_FOUND`
- `DUPLICATE_RESOURCE`
- `INTERNAL_ERROR`

### Usuários/profissionais

- `EMAIL_ALREADY_EXISTS`
- `PROFESSIONAL_VERIFICATION_REQUIRED`
- `PROFESSIONAL_PENDING_APPROVAL`
- `PROFESSIONAL_REJECTED`
- `PROFESSIONAL_ALREADY_REVIEWED`
- `INVALID_UPLOAD_TYPE`
- `UPLOAD_TOO_LARGE`

### Vínculos

- `ACTIVE_LINK_ALREADY_EXISTS`
- `PENDING_LINK_ALREADY_EXISTS`
- `ATHLETE_NOT_AVAILABLE_FOR_LINK`
- `ATHLETE_LINK_REQUIRED`
- `LINK_NOT_PENDING`
- `LINK_NOT_ACTIVE`

### Protocolos

- `INVALID_STATE_TRANSITION`
- `PROTOCOL_EMPTY`
- `PROTOCOL_READ_ONLY`

### Check-ins/tracking

- `CHECKIN_ALREADY_EXISTS`
- `CHECKIN_ALREADY_SUBMITTED`
- `CHECKIN_NOT_SUBMITTED`

### Estoque

- `INVENTORY_INSUFFICIENT`
- `INVENTORY_ITEM_EXPIRED`
- `INVENTORY_ITEM_ARCHIVED`

## 5. Auth

### POST `/auth/register`

Cadastro público de atleta.

Request:

```json
{
  "name": "Rafael Freire",
  "email": "rafael@example.com",
  "password": "SenhaForte123!"
}
```

Response `201`:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "ObjectId",
      "name": "Rafael Freire",
      "email": "rafael@example.com",
      "role": "athlete",
      "active": true
    },
    "token": "jwt"
  },
  "message": "Cadastro realizado com sucesso."
}
```

Erros: `VALIDATION_ERROR`, `EMAIL_ALREADY_EXISTS`.

### POST `/auth/register-professional`

Cadastro público de profissional com comprovação simulada para fins acadêmicos. A aprovação no sistema não certifica credencial profissional real.

`multipart/form-data`:

```text
name: string
email: string
password: string
document: PDF obrigatório
```

Response `201`:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "ObjectId",
      "name": "Profissional Teste",
      "email": "profissional@example.com",
      "role": "professional",
      "active": true
    },
    "verification": {
      "status": "pending",
      "submittedAt": "2026-08-01T12:00:00.000Z"
    },
    "token": "jwt"
  },
  "message": "Cadastro enviado para análise."
}
```

O token permite sessão e consulta do próprio status, mas não libera operações profissionais.

Erros:

- `VALIDATION_ERROR`
- `EMAIL_ALREADY_EXISTS`
- `PROFESSIONAL_VERIFICATION_REQUIRED`
- `INVALID_UPLOAD_TYPE`
- `UPLOAD_TOO_LARGE`

### POST `/auth/login`

```json
{
  "email": "rafael@example.com",
  "password": "SenhaForte123!"
}
```

Response `200`: usuário seguro + token.

Para profissional, incluir status de verificação:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "ObjectId",
      "name": "Profissional Teste",
      "email": "profissional@example.com",
      "role": "professional",
      "active": true,
      "verificationStatus": "pending"
    },
    "token": "jwt"
  }
}
```

Profissional `pending` ou `rejected` pode autenticar para consultar situação, mas rotas profissionais retornam `403` com código apropriado.

Erros: `INVALID_CREDENTIALS`, `USER_BLOCKED`.

### GET `/auth/me`

Retorna usuário autenticado.

Para profissional, inclui:

- `verificationStatus`;
- `rejectionReason` apenas quando aplicável ao próprio usuário.

### PATCH `/auth/password`

```json
{
  "currentPassword": "SenhaAtual123!",
  "newPassword": "NovaSenha123!"
}
```

## 6. Users

### GET `/users`

Admin.

Filtros:

- `role`
- `active`
- `search`
- paginação

### GET `/users/:id`

Admin ou próprio usuário.

### PATCH `/users/:id`

Próprio usuário pode alterar campos básicos permitidos.

```json
{
  "name": "Novo nome"
}
```

Admin pode alterar campos administrativos permitidos, sem usar este endpoint para aprovar profissional.

### PATCH `/users/:id/block`

Admin.

```json
{
  "blocked": true
}
```

Não existe exclusão física de usuário.

## 7. Professional verification

### GET `/professional-verifications`

Admin.

Filtros:

- `status=pending|approved|rejected`
- `search`
- paginação

### GET `/professional-verifications/me`

Profissional autenticado.

Retorna status próprio e metadados seguros.

### GET `/professional-verifications/:id`

Admin.

Retorna dados necessários à análise. O acesso ao arquivo deve ser protegido conforme estratégia de storage.

### PATCH `/professional-verifications/:id/approve`

Admin.

Sem payload obrigatório.

Resultado:

- `verificationStatus=approved`;
- `reviewedAt`;
- `reviewedBy`;
- auditoria;
- notificação interna.

### PATCH `/professional-verifications/:id/reject`

Admin.

```json
{
  "reason": "Documento inválido ou insuficiente."
}
```

Resultado:

- `verificationStatus=rejected`;
- motivo persistido;
- auditoria;
- notificação.

## 8. Links

### POST `/links`

Profissional `approved` solicita vínculo.

`professionalId` é obtido exclusivamente do usuário autenticado. O atleta é
localizado somente pelo e-mail exato, normalizado pelo backend; não existe busca
ampla de atletas neste fluxo.

Request:

```json
{
  "athleteEmail": "atleta@example.com"
}
```

Response `201`:

```json
{
  "success": true,
  "data": {
    "id": "ObjectId",
    "professionalId": "ObjectId",
    "athleteId": "ObjectId",
    "status": "pending",
    "requestedAt": "2026-08-01T12:00:00.000Z"
  }
}
```

Erros:

- `ATHLETE_NOT_AVAILABLE_FOR_LINK`
- `PENDING_LINK_ALREADY_EXISTS`
- `ACTIVE_LINK_ALREADY_EXISTS`
- `PROFESSIONAL_PENDING_APPROVAL`

E-mail inexistente, usuário não atleta, usuário inativo, bloqueado ou
indisponível retorna o mesmo erro genérico
`ATHLETE_NOT_AVAILABLE_FOR_LINK`, sem revelar qual condição ocorreu.

### GET `/links`

- admin: todos;
- profissional: próprios;
- atleta: próprios.

Filtros:

- `status`
- `professionalId` admin only
- `athleteId` admin/professional conforme escopo
- paginação
- `sortBy=createdAt|requestedAt`
- `sortOrder=asc|desc`

Ordenação padrão: `sortBy=createdAt&sortOrder=desc`. Outros valores de `sortBy`
são rejeitados.

### GET `/links/:id`

Respeita ownership/admin.

### PATCH `/links/:id/accept`

Somente atleta destinatário.

`pending -> active`.

### PATCH `/links/:id/reject`

Somente atleta destinatário.

`pending -> rejected`.

Payload opcional:

```json
{
  "reason": "Solicitação recusada."
}
```

Quando informado, `reason` é validado, normalizado e registrado somente em
`AuditLog.metadata` no evento `LINK_REJECTED`. O motivo não integra o vínculo
nem é exposto desnecessariamente na resposta.

### PATCH `/links/:id/end`

Profissional do vínculo, atleta do vínculo ou admin quando justificado.

Para admin, `reason` é obrigatório. Para profissional ou atleta participantes,
é opcional.

```json
{
  "reason": "Encerramento do acompanhamento."
}
```

`active -> ended`.

Quando informado, `reason` é validado, normalizado e registrado somente em
`AuditLog.metadata` no evento `LINK_ENDED`. O motivo não integra o vínculo.

Não existe delete nem reativação do mesmo registro.

## 9. Substances

### GET `/substances`

Filtros:

- `category`
- `active`
- `search`
- `scope`
- paginação

### POST `/substances`

Admin cria global; profissional `approved` pode criar privado.

```json
{
  "name": "Item informativo",
  "category": "other",
  "description": "Descrição informativa.",
  "scope": "private"
}
```

### GET `/substances/:id`

### PATCH `/substances/:id`

Admin ou proprietário do item privado conforme permissões.

### PATCH `/substances/:id/deactivate`

Desativação lógica.

Não existe `DELETE /substances/:id` na V1.

## 10. Protocols

### POST `/protocols`

Profissional `approved` com vínculo `active`.

```json
{
  "athleteId": "ObjectId",
  "title": "Protocolo de acompanhamento",
  "objective": "Organização do acompanhamento.",
  "startDate": "2026-08-01T00:00:00.000Z",
  "endDate": "2026-10-01T00:00:00.000Z",
  "continuous": false,
  "items": [
    {
      "substanceId": "ObjectId",
      "instructions": "Informação registrada pelo profissional.",
      "frequencyType": "weekly",
      "weekDays": [1, 4],
      "time": "08:00"
    }
  ]
}
```

Cria protocolo `draft` e versão 1.

`statusHistory` não é aceito no payload de criação; o campo é gerenciado pelo
backend.

O backend cria também a entrada inicial de `statusHistory`:

```json
{
  "from": null,
  "to": "draft",
  "reason": null,
  "changedAt": "2026-08-01T12:00:00.000Z",
  "changedBy": "ObjectId"
}
```

A criação gera `PROTOCOL_CREATED`, sem gerar
`PROTOCOL_STATUS_CHANGED` adicional para a entrada inicial.

### GET `/protocols`

Filtros:

- `athleteId`
- `professionalId`
- `status`
- `dateFrom`
- `dateTo`
- paginação

Escopo aplicado automaticamente.

### GET `/protocols/:id`

Retorna protocolo + versão atual.

O objeto `protocol` inclui o histórico funcional seguro em `statusHistory`,
ordenado na sequência em que as transições ocorreram:

```json
{
  "statusHistory": [
    {
      "from": null,
      "to": "draft",
      "reason": null,
      "changedAt": "2026-08-01T12:00:00.000Z",
      "changedBy": "ObjectId"
    }
  ]
}
```

Cada item expõe somente `from`, `to`, `reason`, `changedAt` e `changedBy`.

### PATCH `/protocols/:id`

Somente `draft`.

Payload parcial permitido conforme validator.

`status`, `statusHistory` e timestamps de transição são controlados pelo
backend e não são aceitos nesse payload.

### PATCH `/protocols/:id/status`

Endpoint único de transição de status.

```json
{
  "status": "active",
  "reason": "Motivo opcional."
}
```

`reason` é opcional em todas as transições válidas. Quando informado, deve ser
string, recebe `trim` e aceita no máximo 500 caracteres. Quando omitido, é
persistido como `null` no histórico. O cliente não pode enviar
`statusHistory`, timestamps de transição ou `changedBy`.

Transições válidas:

```text
draft -> active | cancelled
active -> paused | closed
paused -> active | closed
```

Status `closed` e `cancelled` são finais.

Cada transição válida:

- adiciona exatamente uma entrada append-only em `Protocol.statusHistory`;
- registra `changedAt` no instante da mudança e `changedBy` com o usuário
  autenticado;
- gera exatamente um `PROTOCOL_STATUS_CHANGED` no AuditLog, com metadata
  mínima `{ from, to, reason }`, omitindo `reason` quando `null` se esse for o
  padrão de serialização adotado;
- não cria nova versão de conteúdo.

Semântica dos timestamps:

- `activatedAt`: primeira transição `draft -> active`; nunca é apagado nem
  sobrescrito em `paused -> active`;
- `pausedAt`: pausa mais recente; `active -> paused` o atualiza e
  `paused -> active` não o limpa;
- `closedAt`: preenchido ao entrar em `closed` e nunca apagado;
- `cancelledAt`: preenchido ao entrar em `cancelled` e nunca apagado;
- não existe `resumedAt` na V1; retomadas ficam registradas em
  `statusHistory`.

`Protocol.statusHistory` é a fonte de verdade do histórico funcional de
estados. AuditLog permanece como trilha de auditoria e não é seu substituto.

Erros: `PROTOCOL_EMPTY`, `ATHLETE_LINK_REQUIRED`, `INVALID_STATE_TRANSITION`.

### POST `/protocols/:id/versions`

Cria nova versão para protocolo `active` ou `paused`.

```json
{
  "changeReason": "Ajuste registrado pelo profissional.",
  "startDate": "2026-08-15T00:00:00.000Z",
  "endDate": "2026-10-15T00:00:00.000Z",
  "continuous": false,
  "items": []
}
```

`statusHistory` não é aceito no payload de versionamento.

Cada criação bem-sucedida por este endpoint gera exatamente um
`PROTOCOL_VERSION_CREATED` no AuditLog, com metadata segura das versões
anterior e nova. A versão inicial é coberta por `PROTOCOL_CREATED`.

### GET `/protocols/:id/versions`

### GET `/protocols/:id/versions/:version`

Não existe delete físico de protocolo.

## 11. Tracking records

Nome de rota oficial: `/tracking-records`.

Campo oficial: `scheduledFor`.

Filtros oficiais: `dateFrom` e `dateTo`.

### POST `/tracking-records`

Profissional `approved` com vínculo `active` ou atleta dentro do fluxo
manual próprio.

Payload do profissional:

```json
{
  "athleteId": "ObjectId",
  "protocolId": "ObjectId opcional",
  "type": "manual",
  "title": "Registro de acompanhamento",
  "scheduledFor": "2026-08-05T11:00:00.000Z",
  "notes": "Observação opcional."
}
```

Payload do atleta:

```json
{
  "type": "manual",
  "title": "Registro de acompanhamento",
  "scheduledFor": "2026-08-05T11:00:00.000Z",
  "notes": "Observação opcional."
}
```

Regras:

- atleta cria somente tracking próprio `manual`, sem `protocolId` e com
  `professionalId=null`;
- `athleteId` e `createdBy` do atleta são derivados do JWT;
- profissional não envia `professionalId` ou `createdBy`; ambos são derivados
  do JWT;
- protocolo, quando informado pelo profissional, deve estar `active`,
  pertencer ao atleta e ao profissional autenticado;
- `draft`, `paused`, `closed` e `cancelled` são rejeitados;
- campos `professionalId`, `createdBy` e `protocolItemId` nunca são aceitos do
  cliente;
- `type` é obrigatório; profissional pode criar `scheduled` ou `manual`, com
  protocolo opcional;
- status inicial é sempre `scheduled`;
- sucesso gera exatamente um `TRACKING_CREATED`.

Operações de recurso único retornam o TrackingRecord serializado diretamente
em `data`, com os campos oficiais `id`, `athleteId`, `professionalId`,
`protocolId`, `protocolVersion`, `type`, `title`, `scheduledFor`, `status`,
`statusReason`, `completedAt`, `completedBy`, `notes`, `createdBy`,
`createdAt` e `updatedAt`.

### GET `/tracking-records`

Filtros:

- `athleteId`
- `protocolId`
- `status`
- `type`
- `dateFrom`
- `dateTo`
- paginação
- `sortBy=scheduledFor|createdAt`
- `sortOrder=asc|desc`

Ordenação padrão:

```text
sortBy=scheduledFor
sortOrder=asc
```

Campos de ordenação diferentes retornam `VALIDATION_ERROR`.

Não são aceitos `from`, `to` ou `professionalId` como filtros.

`dateFrom` e `dateTo` filtram `scheduledFor` de forma inclusiva.

Escopo:

- admin lista todos;
- atleta lista somente os próprios;
- profissional `approved` lista somente atletas com vínculo `active`;
- filtros enviados pelo cliente nunca ampliam o escopo.

### GET `/tracking-records/:id`

Admin consulta qualquer registro. Atleta consulta somente registro próprio.
Profissional `approved` consulta somente registro de atleta com vínculo
`active`. Recurso fora do escopo retorna `RESOURCE_NOT_FOUND`.

### PATCH `/tracking-records/:id/status`

Transição única por endpoint.

Exemplo conclusão:

```json
{
  "status": "completed",
  "completedAt": "2026-08-05T11:10:00.000Z",
  "notes": "Registro concluído."
}
```

Exemplo perdido/cancelado:

```json
{
  "status": "missed",
  "reason": "Não realizado."
}
```

Transições válidas:

```text
scheduled -> completed | missed | cancelled
```

Regras:

- transição para `completed` aceita `completedAt` e `notes`; `reason` não é
  usado;
- `notes` não é aceito em transições para `missed` ou `cancelled`;
- `completed` preenche `completedAt` e `completedBy` e mantém
  `statusReason=null`;
- `missed` e `cancelled` exigem `reason` string com trim, entre 1 e 500
  caracteres;
- `missed` e `cancelled` persistem o motivo em `statusReason` e mantêm
  `completedAt` e `completedBy` nulos;
- atleta conclui tracking próprio;
- atleta cancela somente tracking próprio, `manual` e criado por ele;
- atleta nunca marca `missed`;
- profissional precisa estar `approved` e manter vínculo `active`;
- admin não usa este endpoint;
- a transição é atômica e somente a vencedora gera
  `TRACKING_STATUS_CHANGED`.

Estado final ou transição incompatível retorna `INVALID_STATE_TRANSITION`.

### PATCH `/tracking-records/:id/correction`

Admin ou profissional autorizado, apenas para correção auditada de registro
`completed`, `missed` ou `cancelled`.

```json
{
  "notes": "Correção documentada.",
  "reason": "Erro de digitação."
}
```

Regras:

- `notes` é obrigatório no payload e é o único campo alterado; aceita `null`
  ou string com trim de até 2000 caracteres;
- `reason` é obrigatório, recebe trim e possui entre 1 e 500 caracteres;
- o motivo fica somente em metadata segura do AuditLog e não altera
  `statusReason`;
- admin corrige qualquer tracking finalizado;
- profissional precisa estar `approved`, ser o `professionalId` responsável e
  manter vínculo `active`;
- profissional não corrige tracking com `professionalId=null`;
- atleta não corrige;
- status e campos de conclusão permanecem inalterados;
- sucesso gera exatamente um `TRACKING_CORRECTED`.

Não existe delete físico.

## 12. Check-ins

### POST `/check-ins`

Atleta.

```json
{
  "protocolId": "ObjectId opcional",
  "professionalId": "ObjectId condicional",
  "referenceWeek": "2026-08-03T03:00:00.000Z",
  "responses": {
    "notes": "Registro semanal."
  }
}
```

Regras:

- `athleteId` vem exclusivamente do JWT e não é aceito no payload;
- cria status `pending`;
- `referenceWeek` é normalizada para a segunda-feira correspondente em
  `America/Sao_Paulo`;
- ISO date-only (`YYYY-MM-DD`) é tratado como data civil em
  `America/Sao_Paulo`; datetime com offset é tratado como instante;
- com `protocolId`, o protocolo precisa pertencer ao atleta, estar `active` e
  determina o `professionalId`; vínculo `active` é obrigatório;
- quando `protocolId` e `professionalId` são enviados juntos, o
  `professionalId` deve coincidir com o profissional do protocolo; valor
  conflitante retorna `VALIDATION_ERROR`;
- sem protocolo e sem vínculo `active`, retorna `ATHLETE_LINK_REQUIRED`;
- sem protocolo e com um único vínculo `active`, o backend deriva o
  profissional;
- sem protocolo e com múltiplos vínculos `active`, `professionalId` é
  obrigatório;
- `professionalId`, quando informado, deve identificar profissional com
  vínculo `active`; não existe escolha silenciosa;
- segundo check-in do atleta na mesma semana retorna
  `CHECKIN_ALREADY_EXISTS`, inclusive em corrida `E11000`.

Operações de recurso único retornam o CheckIn serializado diretamente em
`data`, com os campos oficiais `id`, `athleteId`, `professionalId`,
`protocolId`, `referenceWeek`, `status`, `responses`, `submittedAt`,
`reviewedAt`, `reviewedBy`, `reviewComment`, `createdAt` e `updatedAt`.

Contrato de `responses`:

- objeto JSON simples obrigatório com 1 a 20 propriedades;
- tamanho serializado máximo de 16 KB em UTF-8;
- chaves entre 1 e 50 caracteres;
- chaves não podem conter `.`, null byte, iniciar com `$` ou ser
  `__proto__`, `constructor` ou `prototype`;
- não aceita objetos aninhados, funções, buffers ou tipos especiais;
- valores permitidos: string, número finito, boolean, `null` ou array de
  valores escalares permitidos;
- strings possuem no máximo 1000 caracteres;
- arrays possuem no máximo 20 elementos e não aceitam objetos ou arrays
  internos;
- `answers` e demais campos desconhecidos são rejeitados.

### GET `/check-ins`

Filtros:

- `athleteId`
- `protocolId`
- `status`
- `dateFrom`
- `dateTo`
- paginação
- `sortBy=referenceWeek|createdAt|submittedAt`
- `sortOrder=asc|desc`

Ordenação padrão:

```text
sortBy=referenceWeek
sortOrder=desc
```

`dateFrom` e `dateTo` filtram `referenceWeek` de forma inclusiva.

Escopo:

- admin lista todos;
- atleta lista somente os próprios;
- profissional `approved` lista somente check-ins sob vínculo `active`;
- filtros não ampliam ownership;
- `sortBy` inválido retorna `VALIDATION_ERROR`.

### GET `/check-ins/:id`

Admin consulta qualquer check-in completo. Atleta consulta somente o próprio.
Profissional `approved` consulta somente check-in de atleta com vínculo
`active`. Recurso fora do escopo retorna `RESOURCE_NOT_FOUND`.

### PATCH `/check-ins/:id`

Atleta dono, apenas enquanto `pending`. Somente `responses` é aceito e o
mesmo contrato da criação é aplicado. O objeto enviado substitui integralmente
o valor anterior; não existe merge implícito de propriedades.

Tentativa de editar check-in `submitted` ou `reviewed` retorna
`CHECKIN_ALREADY_SUBMITTED`.

### PATCH `/check-ins/:id/submit`

Atleta dono.

`pending -> submitted`.

O contrato de `responses` é validado novamente antes da transição.

Segunda tentativa de submit ou submit de check-in `reviewed` retorna
`CHECKIN_ALREADY_SUBMITTED`.

Somente a transição atômica vencedora define `submittedAt` e gera exatamente
um `CHECKIN_SUBMITTED`.

### PATCH `/check-ins/:id/review`

Somente o profissional responsável, `approved` e com vínculo `active`.

```json
{
  "reviewComment": "Feedback de acompanhamento."
}
```

`submitted -> reviewed`.

`reviewComment` é obrigatório, recebe trim e possui entre 1 e 2000
caracteres.

Revisão de check-in `pending` retorna `CHECKIN_NOT_SUBMITTED`.

Segunda revisão de check-in `reviewed` retorna
`INVALID_STATE_TRANSITION`.

Profissional diferente do responsável recebe `RESOURCE_NOT_FOUND`.

Somente a transição atômica vencedora define `reviewedAt`, `reviewedBy` e
gera exatamente um `CHECKIN_REVIEWED`.

Admin não cria, edita, envia ou revisa check-in.

Não existe endpoint de reabertura na V1.

Não existe delete físico.

## 13. Exams

### POST `/exams`

Atleta próprio ou profissional vinculado.

Pode aceitar `multipart/form-data` para suportar PDF.

Campos:

```text
athleteId: ObjectId quando necessário e autorizado
title: string
examDate: ISO 8601
laboratory: string opcional
notes: string opcional
results: JSON serializado opcional
document: PDF opcional
```

Exemplo de `results`:

```json
[
  {
    "marker": "Marcador",
    "value": "10",
    "unit": "unidade",
    "referenceRange": "informado pelo laboratório"
  }
]
```

O backend não interpreta resultados.

### GET `/exams`

Filtros:

- `athleteId`
- `dateFrom`
- `dateTo`
- `archived`
- paginação

### GET `/exams/:id`

### PATCH `/exams/:id`

Atualiza metadados permitidos e, se previsto, substitui documento preservando auditoria.

### PATCH `/exams/:id/archive`

Arquiva logicamente.

Não existe delete físico.

## 14. Physical progress

### POST `/progress`

Atleta próprio ou profissional vinculado.

```json
{
  "athleteId": "ObjectId",
  "referenceDate": "2026-08-01T00:00:00.000Z",
  "weightKg": 80.5,
  "bodyFatPercent": 12.5,
  "measurements": {
    "chestCm": 105,
    "waistCm": 82,
    "armCm": 40
  },
  "notes": "Registro de evolução."
}
```

### GET `/progress`

Filtros:

- `athleteId`
- `dateFrom`
- `dateTo`
- `archived`
- paginação

### GET `/progress/:id`

### PATCH `/progress/:id`

### PATCH `/progress/:id/archive`

Arquivamento lógico.

Não existe delete físico.

## 15. History / timeline

### GET `/history`

Timeline agregada.

Filtros:

- `athleteId` quando permitido;
- `type` opcional;
- `dateFrom`;
- `dateTo`;
- paginação.

Exemplo:

```json
{
  "success": true,
  "data": [
    {
      "id": "event-id",
      "type": "protocol_version",
      "occurredAt": "2026-08-01T12:00:00.000Z",
      "title": "Nova versão de protocolo",
      "summary": "Versão 2 registrada.",
      "entityId": "ObjectId"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

A timeline é leitura derivada e não altera entidades-fonte.

## 16. Inventory

Estoque simples de propriedade do atleta.

### POST `/inventory`

Atleta.

```json
{
  "substanceId": "ObjectId",
  "name": "Item cadastrado",
  "unit": "unit",
  "quantity": 3,
  "lowStockThreshold": 1,
  "expirationDate": "2027-01-01T00:00:00.000Z"
}
```

### GET `/inventory`

- atleta: próprio;
- profissional: atleta vinculado, somente leitura.

Filtros:

- `athleteId` para profissional autorizado;
- `search`;
- `expired`;
- `lowStock`;
- `archived`;
- paginação.

### GET `/inventory/:id`

### PATCH `/inventory/:id`

Atleta dono.

Atualiza metadados, nunca quantidade diretamente.

### POST `/inventory/:id/movements`

Atleta dono.

```json
{
  "type": "out",
  "quantity": 1,
  "reason": "Baixa manual."
}
```

Erros:

- `INVENTORY_INSUFFICIENT`
- `INVENTORY_ITEM_EXPIRED`
- `INVENTORY_ITEM_ARCHIVED`

### GET `/inventory/:id/movements`

Atleta dono ou profissional vinculado em leitura.

### PATCH `/inventory/:id/archive`

Atleta dono.

Não existe delete físico.

## 17. Notifications

### GET `/notifications`

Próprias.

Filtros:

- `read`
- `archived`
- paginação

### PATCH `/notifications/:id/read`

Marca própria como lida.

### PATCH `/notifications/read-all`

Marca todas próprias como lidas.

### PATCH `/notifications/:id/archive`

Oculta/arquiva para o usuário.

Não existe criação manual pelo cliente nem delete físico.

## 18. Dashboard

### GET `/dashboard`

Endpoint único autenticado.

O backend determina a resposta exclusivamente por `req.user.role`. O endpoint
não possui query params funcionais e rejeita campos desconhecidos. Não são
aceitos `role`, `userId`, `athleteId` ou `professionalId` para escolher outra
identidade.

### Athlete

```json
{
  "success": true,
  "data": {
    "role": "athlete",
    "activeProtocol": null,
    "nextTracking": null,
    "currentCheckIn": null,
    "recentActivity": [],
    "unreadNotifications": 0,
    "inventoryAlerts": []
  }
}
```

`activeProtocol` contém somente o protocolo próprio `active` mais recente por
`activatedAt desc`, `createdAt desc`, `_id desc`:

```json
{
  "id": "ObjectId",
  "title": "Protocolo",
  "status": "active",
  "professionalId": "ObjectId",
  "currentVersion": 2,
  "startDate": "ISO",
  "endDate": "ISO|null",
  "continuous": false,
  "activatedAt": "ISO|null"
}
```

`nextTracking` contém somente o primeiro tracking próprio `scheduled` com
`scheduledFor` maior ou igual ao instante da consulta, ordenado por
`scheduledFor asc`, `createdAt asc`, `_id asc`:

```json
{
  "id": "ObjectId",
  "title": "Título",
  "type": "scheduled",
  "scheduledFor": "ISO",
  "status": "scheduled",
  "protocolId": "ObjectId|null",
  "professionalId": "ObjectId|null"
}
```

`currentCheckIn` representa a semana atual normalizada para segunda-feira em
`America/Sao_Paulo`, em qualquer status:

```json
{
  "id": "ObjectId",
  "professionalId": "ObjectId",
  "protocolId": "ObjectId|null",
  "referenceWeek": "ISO",
  "status": "pending",
  "submittedAt": "ISO|null",
  "reviewedAt": "ISO|null"
}
```

`recentActivity` combina no máximo 10 itens próprios de Protocol,
TrackingRecord e CheckIn, ordenados por `occurredAt desc` e `entityId desc`.
Não inclui `responses`, `reviewComment`, `notes` ou `statusReason`.

Enquanto Notifications e Inventory não estiverem implementados:

```text
unreadNotifications = 0
inventoryAlerts = []
```

### Professional

Profissional `approved`:

```json
{
  "success": true,
  "data": {
    "role": "professional",
    "verificationStatus": "approved",
    "athleteCount": 8,
    "activeProtocols": 6,
    "pendingCheckIns": 3,
    "upcomingTrackings": [],
    "recentActivity": []
  }
}
```

Semântica:

- `athleteCount`: atletas distintos com vínculo `active`;
- `activeProtocols`: protocolos `active` do profissional cujo atleta mantém
  vínculo `active`;
- `pendingCheckIns`: check-ins `submitted` aguardando revisão cujo atleta
  mantém vínculo `active`;
- `upcomingTrackings`: no máximo 10 trackings `scheduled` futuros, ordenados
  por `scheduledFor asc`, `createdAt asc`, `_id asc`;
- `recentActivity`: no máximo 10 itens de Protocol, TrackingRecord e CheckIn,
  somente no escopo de vínculos `active`, ordenados por `occurredAt desc` e
  `entityId desc`.

Profissional `pending` ou `rejected` recebe `200` sem dados de atletas:

```json
{
  "success": true,
  "data": {
    "role": "professional",
    "verificationStatus": "pending",
    "athleteCount": 0,
    "activeProtocols": 0,
    "pendingCheckIns": 0,
    "upcomingTrackings": [],
    "recentActivity": []
  }
}
```

### Admin

```json
{
  "success": true,
  "data": {
    "role": "admin",
    "users": {
      "total": 0,
      "active": 0,
      "blocked": 0,
      "byRole": {
        "admin": 0,
        "professional": 0,
        "athlete": 0
      }
    },
    "professionalsPending": 2,
    "activeLinks": 10,
    "recentAudit": []
  }
}
```

`users.total` conta todos os Users. `users.active` usa
`active=true` e `blockedAt=null`. `users.blocked` conta `blockedAt` preenchido.
`users.byRole` conta todos os usuários por role. `professionalsPending` conta
ProfessionalProfile `pending`; `activeLinks` conta somente vínculos `active`.

`recentAudit` retorna no máximo 10 itens por `createdAt desc`, `_id desc`:

```json
{
  "id": "ObjectId",
  "actorId": "ObjectId|null",
  "action": "string",
  "entityType": "string",
  "entityId": "ObjectId|null",
  "createdAt": "ISO"
}
```

Não retorna `metadata` nem `ipHash`.

Em todas as roles, o dashboard é somente leitura, não cria AuditLog e não
retorna e-mails, hashes, documentos, PDFs, tokens, storageKey nem conteúdo
clínico completo.

## 19. Audit

### GET `/audit-logs`

Admin.

Filtros:

- `actorId`
- `entityType`
- `entityId`
- `action`
- `dateFrom`
- `dateTo`
- paginação

Audit logs não podem ser criados/alterados via API pública comum.

## 20. Health

### GET `/health`

Público.

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-08-01T12:00:00.000Z"
  }
}
```

## 21. Validação transversal

- ObjectId inválido: `400 INVALID_OBJECT_ID`;
- recurso fora do escopo: preferir `404` quando apropriado para não vazar existência;
- e-mail normalizado;
- strings com trim;
- campos desconhecidos rejeitados;
- datas ISO 8601;
- paginação normalizada;
- `dateFrom <= dateTo`;
- IDs de ownership nunca confiados sem verificação;
- profissional deve estar `approved` antes de operações profissionais;
- vínculo `active` obrigatório quando acessar atleta;
- uploads validados por MIME, tamanho e autorização;
- PDF/documentos não entram em logs ou respostas desnecessárias.

## 22. Rotas removidas/substituídas em relação à documentação antiga

Não implementar na V1:

```text
DELETE /protocols/:id
DELETE /substances/:id
DELETE /exams/:id
DELETE /progress/:id
DELETE /inventory/:id
DELETE /notifications/:id
POST /check-ins/:id/reopen
PATCH /check-ins/:id/reopen
PATCH /tracking-records/:id
DELETE /tracking-records/:id
DELETE /check-ins/:id
GET /dashboard/admin
GET /dashboard/professional
GET /dashboard/athlete
POST /tracking-records/:id/complete
POST /tracking-records/:id/miss
POST /tracking-records/:id/cancel
PATCH /protocols/:id/activate
PATCH /protocols/:id/pause
PATCH /protocols/:id/resume
PATCH /protocols/:id/close
PATCH /protocols/:id/cancel
```

Substituições:

```text
protocol delete -> PATCH /protocols/:id/status com cancelled quando draft
transições legadas de protocolo -> PATCH /protocols/:id/status
substance delete -> PATCH /substances/:id/deactivate
exam delete -> PATCH /exams/:id/archive
progress delete -> PATCH /progress/:id/archive
inventory delete -> PATCH /inventory/:id/archive
notification delete -> PATCH /notifications/:id/archive
tracking transitions -> PATCH /tracking-records/:id/status
dashboards por role -> GET /dashboard
```
