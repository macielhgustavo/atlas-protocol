# Atlas Protocol — Master Specification da V1

> **Documento consolidado do projeto**  
> **Versão:** 1.0  
> **Atualizado em:** 28 de julho de 2026  
> **Projeto:** TCC Lions Dev  
> **Tipo:** aplicação web full stack  
> **Status:** V1 em desenvolvimento

---

## 1. Finalidade deste documento

Este documento reúne, em uma única visão, o objetivo, o escopo, as regras de domínio, as permissões, os modelos conceituais, os contratos principais, a arquitetura, o frontend, o estado da implementação e o roadmap do **Atlas Protocol**.

Ele deve ser usado como:

- ponto inicial para novos integrantes ou agentes de código;
- visão consolidada e atualizada da V1;
- referência para planejamento, apresentação e validação do TCC;
- registro das decisões que substituíram versões antigas da especificação.

Os documentos especializados continuam detalhando partes específicas:

1. `docs/domain-rules.md` — regras de negócio;
2. `docs/permissions.md` — matriz de autorização;
3. `docs/api-contracts.md` — endpoints, payloads, respostas e erros;
4. `docs/database-models.md` — collections, campos, validações e índices;
5. `AGENTS.md` — instruções obrigatórias para agentes de código.

Quando este arquivo e um documento especializado divergirem, a divergência deve ser corrigida. Nenhuma implementação deve escolher silenciosamente uma das versões. Para detalhes exatos de um endpoint, campo ou índice, o documento especializado correspondente deve ser consultado.

---

## 2. Visão geral

O **Atlas Protocol** é uma plataforma web para organizar protocolos e acompanhar, ao longo do tempo, informações registradas por atletas e profissionais vinculados.

A aplicação centraliza informações que normalmente ficariam espalhadas em planilhas, mensagens, anotações e sistemas genéricos:

- usuários e perfis;
- comprovação e aprovação de profissionais;
- vínculos entre profissionais e atletas;
- biblioteca de substâncias e itens;
- protocolos e versões históricas;
- registros de acompanhamento;
- check-ins periódicos;
- exames e documentos em PDF;
- registros de evolução física;
- timeline cronológica;
- estoque individual e movimentações;
- notificações internas;
- dashboards por perfil;
- auditoria de ações críticas.

O conceito central do produto é:

> **O tempo faz parte do dado.**

O estado atual não substitui a trajetória. O sistema deve preservar versões, mudanças de status, registros, revisões e eventos relevantes para que o usuário compreenda o contexto completo.

Frase de posicionamento:

> **Evolução não é apenas onde você chegou. É tudo o que aconteceu até chegar lá.**

---

## 3. Problema e proposta de valor

### 3.1 Problema

O acompanhamento de protocolos pode ser prejudicado quando informações ficam distribuídas entre ferramentas sem versionamento, controle de acesso ou histórico confiável. Isso dificulta:

- saber qual protocolo estava vigente em determinada data;
- diferenciar informação atual de informação histórica;
- acompanhar registros planejados, concluídos, perdidos ou cancelados;
- organizar check-ins e revisões;
- reunir exames e evolução em uma linha do tempo;
- verificar quem alterou uma informação importante;
- manter separação adequada entre dados de diferentes atletas.

### 3.2 Solução

O Atlas Protocol oferece uma estrutura centralizada com:

- perfis e permissões claramente definidos;
- autorização baseada em vínculo ativo;
- protocolos imutavelmente versionados;
- histórico funcional de mudanças;
- registros cronológicos;
- auditoria append-only;
- frontend organizado por papel;
- API REST com contratos previsíveis.

### 3.3 Diferencial

O diferencial principal não é somente cadastrar dados, mas preservar contexto:

- qual versão estava ativa;
- quando o protocolo foi pausado ou retomado;
- qual profissional estava vinculado;
- quando um check-in foi enviado e revisado;
- quais eventos ocorreram em sequência;
- quem executou alterações críticas.

---

## 4. Limites de segurança e responsabilidade

O Atlas Protocol é uma ferramenta de **organização e acompanhamento**.

O sistema não deve:

- diagnosticar;
- prescrever;
- recomendar substâncias;
- sugerir doses;
- calcular uma dose ideal;
- interpretar exames automaticamente;
- classificar automaticamente um resultado como normal, perigoso ou seguro;
- indicar compra, substituição ou ajuste de produto;
- atribuir causalidade médica a mudanças físicas;
- substituir avaliação ou acompanhamento profissional.

Os dados registrados representam informações inseridas pelos usuários. Dashboards e timelines são descritivos, não prescritivos.

A comprovação profissional da V1 é uma **simulação acadêmica para o TCC**. O envio de um PDF e sua aprovação administrativa não constituem certificação profissional real.

---

## 5. Escopo da V1

### 5.1 Incluído

- autenticação JWT;
- senhas protegidas com bcrypt;
- perfis `admin`, `professional` e `athlete`;
- cadastro público de atleta;
- cadastro público de profissional com PDF;
- aprovação ou rejeição administrativa de profissional;
- vínculo profissional-atleta mediante solicitação e aceite;
- biblioteca de substâncias e itens;
- protocolos com versionamento;
- histórico de estados dos protocolos;
- tracking records;
- check-ins semanais;
- exames com suporte a PDF;
- registros de evolução física;
- timeline histórica agregada;
- estoque simples com movimentações e alertas;
- notificações internas;
- dashboard adaptado ao perfil;
- auditoria de ações críticas;
- frontend Angular responsivo;
- backend e frontend publicados;
- seed mínimo de demonstração;
- testes automatizados e roteiro de apresentação.

### 5.2 Fora da V1

- pagamentos;
- assinaturas;
- CRM;
- chat em tempo real;
- aplicativo mobile nativo;
- multiempresa ou multiclínica;
- integração automática com laboratórios;
- recomendação clínica por IA;
- prescrição ou ajuste automático;
- notificações reais por SMS ou WhatsApp;
- push notification nativa;
- estoque de clínica compartilhado;
- compras, fornecedores, custos e ERP;
- análise médica automática de exames;
- relatórios avançados fora do necessário ao TCC.

---

## 6. Perfis de usuário

Um usuário possui exatamente um papel na V1:

```text
admin
professional
athlete
```

### 6.1 Atleta

O atleta pode:

- acessar e atualizar o próprio perfil dentro dos campos permitidos;
- visualizar solicitações de vínculo recebidas;
- aceitar ou rejeitar solicitações próprias;
- visualizar protocolos próprios e suas versões;
- criar tracking manual próprio sem protocolo ou profissional associado;
- consultar tracking records próprios;
- concluir registros permitidos;
- criar e editar check-in enquanto estiver `pending`;
- enviar check-in;
- visualizar a revisão profissional;
- cadastrar e consultar exames próprios;
- cadastrar e consultar evolução física própria;
- consultar a timeline histórica própria;
- gerenciar o próprio estoque;
- consultar e marcar notificações próprias como lidas.

O atleta não pode:

- acessar dados de outro atleta;
- criar ou editar protocolos;
- revisar check-ins;
- administrar profissionais;
- gerenciar a biblioteca global de substâncias;
- consultar auditoria geral.

### 6.2 Profissional

Um profissional só exerce funções profissionais quando:

```text
user.role === "professional"
AND
ProfessionalProfile.verificationStatus === "approved"
AND
user.active === true
```

O profissional aprovado pode:

- solicitar vínculo por e-mail exato;
- listar os próprios vínculos;
- acessar somente atletas com vínculo `active`;
- criar protocolos para atletas vinculados;
- editar protocolos `draft`;
- criar novas versões de protocolos publicados;
- alterar estados de protocolos dentro da máquina de estados;
- criar e acompanhar tracking records;
- visualizar e revisar check-ins dos atletas vinculados;
- cadastrar ou consultar exames conforme permissão;
- consultar evolução e timeline dos atletas vinculados;
- consultar estoque do atleta somente quando a matriz detalhada permitir leitura;
- criar itens privados na biblioteca quando autorizado.

Profissionais `pending` ou `rejected` podem autenticar, consultar o próprio status e visualizar uma interface de situação da verificação, mas não podem exercer funções profissionais.

### 6.3 Administrador

O administrador pode:

- listar e consultar usuários;
- bloquear e desbloquear contas;
- aprovar ou rejeitar profissionais;
- consultar verificações profissionais;
- gerenciar itens globais da biblioteca;
- consultar vínculos conforme o contrato;
- encerrar vínculo quando justificado;
- consultar protocolos para suporte e auditoria;
- consultar audit logs;
- acessar dashboard administrativo.

O administrador não deve atuar como profissional no fluxo normal. Ele não cria, edita ou versiona protocolos clínicos de atletas.

---

## 7. Fluxo principal da V1

```text
Cadastro do profissional
        ↓
Upload de PDF comprobatório
        ↓
ProfessionalProfile = pending
        ↓
Admin aprova ou rejeita
        ↓
Professional = approved
        ↓
Profissional informa e-mail exato do atleta
        ↓
Solicitação de vínculo = pending
        ↓
Atleta aceita ou rejeita
        ↓
Vínculo = active
        ↓
Profissional cria protocolo draft
        ↓
Ativa e versiona o protocolo
        ↓
Tracking records e check-ins
        ↓
Revisão profissional
        ↓
Exames, evolução e estoque
        ↓
Timeline, dashboard e auditoria
```

---

## 8. Arquitetura técnica

### 8.1 Backend

Stack:

- Node.js;
- JavaScript com ES Modules;
- Express.js;
- MongoDB;
- Mongoose;
- JWT;
- bcrypt;
- Joi;
- Jest;
- Supertest;
- ESLint.

Fluxo obrigatório:

```text
route
  -> authMiddleware
  -> role/authorization middleware
  -> validationMiddleware
  -> controller
  -> service
  -> model
  -> response
```

Responsabilidades:

- `routes`: endpoints e ordem dos middlewares;
- `middlewares`: autenticação, autorização, validação e upload;
- `controllers`: adaptação HTTP e resposta;
- `services`: regras de negócio e coordenação das operações;
- `models`: schemas, índices e métodos do documento;
- `validators`: validação de params, query e body;
- `utils`: funções puras e serialização segura;
- `constants`: estados, ações, papéis e códigos;
- `storage`: abstração de armazenamento de arquivos.

Regras arquiteturais:

- controllers não concentram regras de negócio;
- services não dependem de `req` ou `res`;
- models não dependem de controllers;
- autorização é sempre aplicada no backend;
- IDs de ownership não são confiados apenas porque vieram do cliente;
- operações críticas registram auditoria explicitamente;
- não usar hooks globais para auditar tudo automaticamente.

### 8.2 Frontend

Stack:

- Angular;
- TypeScript;
- Angular Router;
- Reactive Forms;
- HttpClient;
- guards;
- interceptors;
- componentes standalone conforme o padrão atual do projeto.

### 8.3 Repositórios

Backend:

```text
https://github.com/macielhgustavo/atlas-protocol
```

Frontend:

```text
https://github.com/henryportes880/atlas-protocol-front
```

Backend conhecido em produção:

```text
https://atlas-protocol-6yo0.onrender.com
```

Base da API:

```text
https://atlas-protocol-6yo0.onrender.com/api/v1
```

---

## 9. Convenções globais

### 9.1 Código

- arquivos e diretórios: `kebab-case`;
- variáveis e funções: `camelCase`;
- classes e models: `PascalCase`;
- constantes: `UPPER_SNAKE_CASE`;
- endpoints: substantivos no plural;
- mensagens públicas: português;
- códigos de erro: inglês e `UPPER_SNAKE_CASE`.

### 9.2 Datas

- persistência em UTC;
- transporte em ISO 8601;
- exibição local no frontend em `America/Sao_Paulo`;
- semanas de check-in iniciam na segunda-feira nesse timezone.

### 9.3 Paginação

Padrão:

```text
?page=1&limit=20
```

- `page` inicia em 1;
- limite padrão 20;
- limite máximo 100;
- ordenação padrão `createdAt desc`, salvo regra específica.

### 9.4 Respostas

Sucesso:

```json
{
  "success": true,
  "data": {},
  "message": "Operação realizada com sucesso."
}
```

Lista paginada:

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

Erro:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensagem legível.",
    "fields": []
  }
}
```

Nunca retornar stack trace em produção.

---

## 10. Autenticação e usuários

### 10.1 User

Modelo conceitual:

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

Regras:

- e-mail único e normalizado;
- senha nunca armazenada em texto puro;
- `passwordHash` nunca aparece em respostas;
- conta bloqueada ou inativa não realiza operações protegidas;
- alterações de role envolvendo profissional não podem contornar a verificação profissional;
- não excluir fisicamente usuários.

### 10.2 Endpoints principais

```text
POST  /api/v1/auth/register
POST  /api/v1/auth/register-professional
POST  /api/v1/auth/login
GET   /api/v1/auth/me
PATCH /api/v1/auth/password

GET   /api/v1/users
GET   /api/v1/users/:id
PATCH /api/v1/users/:id
PATCH /api/v1/users/:id/block
```

`POST /auth/register` cria atleta.

`POST /auth/register-professional` usa `multipart/form-data` e exige o campo de arquivo:

```text
document
```

---

## 11. Verificação profissional

### 11.1 Estados

```text
pending
approved
rejected
```

### 11.2 ProfessionalProfile

Modelo conceitual:

```js
{
  userId: ObjectId,
  verificationStatus: "pending" | "approved" | "rejected",
  document: {
    originalName: String,
    mimeType: String,
    sizeBytes: Number,
    storageKey: String,
    url: String | null
  },
  submittedAt: Date,
  reviewedAt: Date | null,
  reviewedBy: ObjectId | null,
  rejectionReason: String | null,
  createdAt: Date,
  updatedAt: Date
}
```

Campos internos como `storageKey`, caminho privado e URL interna não devem ser expostos em respostas comuns.

### 11.3 Fluxo

1. usuário envia nome, e-mail, senha e PDF;
2. sistema cria `User` com role `professional`;
3. sistema cria `ProfessionalProfile` com `pending`;
4. usuário pode autenticar;
5. middleware bloqueia operações profissionais;
6. admin aprova ou rejeita;
7. middleware consulta o banco e passa a liberar imediatamente um profissional aprovado, mesmo com JWT emitido anteriormente.

### 11.4 Endpoints

```text
GET   /api/v1/professional-verifications
GET   /api/v1/professional-verifications/me
GET   /api/v1/professional-verifications/:id
PATCH /api/v1/professional-verifications/:id/approve
PATCH /api/v1/professional-verifications/:id/reject
```

Listagem administrativa usa filtro:

```text
status
```

### 11.5 Upload

- apenas PDF;
- MIME `application/pdf`;
- extensão coerente;
- validação da assinatura `%PDF-`;
- tamanho máximo configurável;
- nome interno por UUID;
- nome original sanitizado somente como metadado;
- arquivo não servido por `express.static`;
- armazenamento atrás de `StorageService`;
- rollback compensatório para evitar usuário ou arquivo órfão.

A implementação local atual é adequada ao desenvolvimento. Antes do deploy final, os arquivos devem estar em armazenamento persistente, porque filesystem efêmero não é suficiente para documentos reais.

---

## 12. Vínculos profissional-atleta — Links V2

### 12.1 Estados

```text
pending
active
rejected
ended
```

### 12.2 Fluxo oficial

```text
Professional approved
        ↓
Informa e-mail exato do atleta
        ↓
Link pending
        ↓
Athlete aceita ou rejeita
      ↙                 ↘
   active             rejected
      ↓
    ended
```

Não existe busca ampla de atletas na V1.

### 12.3 Solicitação por e-mail

O profissional envia somente:

```json
{
  "athleteEmail": "atleta@example.com"
}
```

O backend:

1. deriva `professionalId` do usuário autenticado;
2. exige profissional `approved`;
3. normaliza o e-mail;
4. procura o usuário;
5. exige role `athlete`;
6. exige conta ativa e disponível;
7. cria vínculo `pending`;
8. registra `LINK_REQUESTED`.

Nunca aceitar `professionalId` do cliente para criar solicitação.

### 12.4 Privacidade

E-mail inexistente, conta não-atleta, conta inativa, bloqueada ou indisponível devem produzir comportamento genérico seguro, sem revelar a existência ou o papel da conta.

### 12.5 Aceite e rejeição

Somente o atleta destinatário pode decidir.

```text
pending -> active
pending -> rejected
```

- outro atleta não decide;
- profissional não decide em nome do atleta;
- admin não transforma o fluxo normal em `active` ignorando o aceite;
- rejeição pode receber `reason`;
- `reason` da rejeição fica somente em `AuditLog.metadata`;
- não existe `rejectionReason` no model do vínculo;
- vínculo rejeitado permanece preservado.

### 12.6 Encerramento

```text
active -> ended
```

- participantes autorizados podem encerrar conforme a matriz;
- admin precisa informar `reason` obrigatório;
- para profissional ou atleta participante, `reason` é opcional na V1;
- o motivo fica no AuditLog;
- encerramento bloqueia novos acessos profissionais;
- protocolos, check-ins, exames, tracking e auditoria permanecem.

### 12.7 Duplicidade e concorrência

Para o mesmo par profissional-atleta:

- `pending` existente: bloquear nova solicitação;
- `active` existente: bloquear nova solicitação;
- `rejected`: permitir novo registro no futuro;
- `ended`: permitir novo registro no futuro.

A proteção deve existir no service e no banco. Quando compatível com o ambiente, usar índice único parcial para impedir mais de um `pending` ou `active` do mesmo par e tratar `duplicate key` de forma previsível.

A base de desenvolvimento antiga é descartável. Não criar migração para preservar `invitedBy`, `startedAt` ou índices do fluxo antigo.

### 12.8 Modelo conceitual

```js
{
  professionalId: ObjectId,
  athleteId: ObjectId,
  status: "pending" | "active" | "rejected" | "ended",
  requestedAt: Date,
  acceptedAt: Date | null,
  rejectedAt: Date | null,
  endedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

### 12.9 Endpoints planejados da V1

Os nomes exatos devem permanecer sincronizados com `docs/api-contracts.md`:

```text
POST  /api/v1/links
GET   /api/v1/links
GET   /api/v1/links/:id
PATCH /api/v1/links/:id/accept
PATCH /api/v1/links/:id/reject
PATCH /api/v1/links/:id/end
```

Ordenação de listagem:

```text
sortBy = createdAt | requestedAt
sortOrder = asc | desc
padrão = createdAt desc
```

---

## 13. Biblioteca de substâncias e itens

### 13.1 Finalidade

A biblioteca organiza referências que podem aparecer em itens de protocolo. Ela não gera orientações automáticas.

Categorias:

```text
hormone
peptide
supplement
vitamin
medication
other
```

Escopos:

```text
global
private
```

### 13.2 Regras

- admin cria e mantém itens globais;
- profissional aprovado pode criar itens privados quando autorizado;
- atleta consulta itens ativos, mas não gerencia a biblioteca;
- item desativado não aparece em novas seleções;
- snapshots históricos mantêm nome e categoria;
- não excluir fisicamente itens usados historicamente;
- não armazenar recomendações automáticas de uso.

### 13.3 Endpoints principais

```text
GET   /api/v1/substances
POST  /api/v1/substances
GET   /api/v1/substances/:id
PATCH /api/v1/substances/:id
PATCH /api/v1/substances/:id/status
```

---

## 14. Protocolos e versionamento

### 14.1 Estados

```text
draft
active
paused
closed
cancelled
```

### 14.2 Máquina de estados

```text
draft -> active
draft -> cancelled
active -> paused
active -> closed
paused -> active
paused -> closed
```

Não permitir:

- voltar de protocolo ativado para `draft`;
- reabrir `closed`;
- reabrir `cancelled`;
- cancelar protocolo que já foi ativado.

### 14.3 Criação

Somente profissional aprovado com vínculo `active` pode criar protocolo para o atleta.

A criação gera:

- `Protocol` em `draft`;
- `ProtocolVersion` versão 1;
- entrada inicial `null -> draft` no `statusHistory`;
- evento `PROTOCOL_CREATED`.

### 14.4 Rascunho

`PATCH /protocols/:id` edita somente `draft`.

O rascunho pode alterar título, objetivo, datas e itens dentro das validações. A política final da V1 não expõe exclusão física do protocolo; cancelamento preserva o registro.

### 14.5 Ativação

Para ativar:

- status atual `draft`;
- atleta e profissional válidos;
- vínculo `active`;
- ao menos um item;
- data inicial válida;
- data final não anterior à inicial;
- protocolo contínuo permite `endDate = null`.

### 14.6 Versionamento

Protocolos `active` ou `paused` não são editados diretamente.

Mudança material usa:

```text
POST /api/v1/protocols/:id/versions
```

Regras:

- incrementar `currentVersion`;
- criar novo `ProtocolVersion`;
- preservar versão anterior;
- armazenar snapshots mínimos dos itens;
- registrar `changeReason`;
- gerar `PROTOCOL_VERSION_CREATED`;
- não sobrescrever versão publicada.

### 14.7 Mudança de status

Endpoint único:

```text
PATCH /api/v1/protocols/:id/status
```

Payload conceitual:

```json
{
  "status": "paused",
  "reason": "Motivo opcional."
}
```

Toda transição válida:

- altera o status;
- atualiza o timestamp correspondente;
- adiciona uma entrada em `statusHistory`;
- registra exatamente um `PROTOCOL_STATUS_CHANGED`.

### 14.8 StatusHistory

O histórico funcional pertence ao domínio do protocolo e não pode depender apenas do AuditLog.

```js
statusHistory: [
  {
    from: "draft" | "active" | "paused" | "closed" | "cancelled" | null,
    to: "draft" | "active" | "paused" | "closed" | "cancelled",
    reason: String | null,
    changedAt: Date,
    changedBy: ObjectId
  }
]
```

Regras:

- append-only;
- criação registra `null -> draft`;
- `reason` é opcional;
- entradas anteriores não são alteradas;
- AuditLog complementa, mas não substitui o histórico.

### 14.9 Semântica dos timestamps

- `activatedAt`: primeira ativação, nunca sobrescrita na retomada;
- `pausedAt`: pausa mais recente, não é apagada na retomada;
- `closedAt`: entrada definitiva em `closed`;
- `cancelledAt`: entrada definitiva em `cancelled`;
- não existe `resumedAt`; retomadas aparecem no `statusHistory`.

### 14.10 Endpoints principais

```text
POST  /api/v1/protocols
GET   /api/v1/protocols
GET   /api/v1/protocols/:id
PATCH /api/v1/protocols/:id
POST  /api/v1/protocols/:id/versions
GET   /api/v1/protocols/:id/versions
GET   /api/v1/protocols/:id/versions/:version
PATCH /api/v1/protocols/:id/status
```

---

## 15. Tracking Records

### 15.1 Finalidade

TrackingRecord representa um registro planejado ou manual de acompanhamento. Ele organiza eventos; não calcula recomendações.

### 15.2 Estados

```text
scheduled
completed
missed
cancelled
```

Estados finais não voltam para `scheduled`.

### 15.3 Tipos

```text
scheduled
manual
```

### 15.4 Modelo conceitual

```js
{
  athleteId: ObjectId,
  professionalId: ObjectId | null,
  protocolId: ObjectId | null,
  protocolVersion: Number | null,
  createdBy: ObjectId,
  type: "scheduled" | "manual",
  title: String,
  scheduledFor: Date,
  status: "scheduled" | "completed" | "missed" | "cancelled",
  statusReason: String | null,
  completedAt: Date | null,
  completedBy: ObjectId | null,
  notes: String | null,
  createdAt: Date,
  updatedAt: Date
}
```

Não existe `protocolItemId` na especificação final.

### 15.5 Criação e protocolo

- atleta cria somente tracking próprio, `manual`, com `protocolId=null`,
  `professionalId=null`, status inicial `scheduled` e IDs derivados do JWT;
- profissional precisa estar `approved`, ter vínculo `active` com o atleta e
  tem `professionalId` e `createdBy` derivados do JWT;
- tracking vinculado a protocolo só pode ser criado por profissional quando o
  protocolo está `active`, pertence ao atleta e possui o mesmo
  `professionalId`;
- `draft`, `paused`, `closed` e `cancelled` não geram novos trackings
  vinculados;
- tracking já criado permanece histórico mesmo se o protocolo for pausado ou encerrado depois.

### 15.6 Transições e permissões

Atleta:

- pode marcar registro próprio `scheduled -> completed`;
- pode cancelar somente registro próprio `manual`, criado por ele;
- não marca `missed`.

Profissional aprovado e vinculado:

- `scheduled -> completed`;
- `scheduled -> missed`;
- `scheduled -> cancelled`.

`missed` e `cancelled` exigem `reason` com trim, entre 1 e 500 caracteres,
persistido em `statusReason`. `completed` mantém `statusReason=null` e
preenche `completedAt` e `completedBy`.

Admin:

- lista e consulta todos para suporte, auditoria e demonstração;
- não cria nem executa mudança normal de status;
- corrige qualquer registro finalizado pelo endpoint específico.

Correção altera somente `notes`, exige `reason` entre 1 e 500 caracteres,
preserva o status e gera `TRACKING_CORRECTED`. Profissional só corrige quando
é o responsável pelo tracking e mantém vínculo `active`; tracking sem
profissional só pode ser corrigido por admin.

### 15.7 Endpoints

```text
POST  /api/v1/tracking-records
GET   /api/v1/tracking-records
GET   /api/v1/tracking-records/:id
PATCH /api/v1/tracking-records/:id/status
PATCH /api/v1/tracking-records/:id/correction
```

Filtros oficiais:

```text
athleteId
protocolId
status
type
dateFrom
dateTo
```

Ordenação:

```text
sortBy = scheduledFor | createdAt
sortOrder = asc | desc
padrão = scheduledFor asc
```

Não criar novos filtros chamados `from` e `to` nesse módulo.

### 15.8 Histórico e auditoria

- nenhuma exclusão física;
- correção de registro finalizado gera auditoria;
- mudanças de estado relevantes devem registrar ator, estado anterior e novo estado;
- notas e motivos devem ser limitados e seguros.

### 15.9 Estratégia de integração

Existe uma branch histórica `feature/tracking-checkins`. Ela não deve ser mergeada ou cherry-picked cegamente.

Reutilizar seletivamente:

- constantes de status e tipo;
- `normalize-reference-week`;
- ownership;
- vínculo ativo;
- paginação e ordenação;
- `dateFrom/dateTo`;
- máquina de estados;
- testes conceituais úteis.

Recriar ou adaptar models, validators, services, controllers, responses e testes para os contratos atuais.

---

## 16. Check-ins

### 16.1 Estados

```text
pending -> submitted -> reviewed
```

Não existe reabertura na V1.

Não existem:

```text
reopenedAt
POST /check-ins/:id/reopen
```

### 16.2 Modelo conceitual

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

Usar `responses`, nunca `answers`.

### 16.3 Unicidade semanal

Só pode existir um check-in para:

```text
athleteId + referenceWeek
```

A semana é normalizada para segunda-feira em `America/Sao_Paulo`.

ISO date-only (`YYYY-MM-DD`) representa uma data civil nesse timezone;
datetime com offset representa um instante antes da normalização.

### 16.4 Criação e escolha do profissional

O `athleteId` é derivado do JWT.

Quando `protocolId` é informado:

```text
Protocol.professionalId
→ profissional responsável
```

O protocolo deve pertencer ao atleta, estar `active` e manter vínculo
`active`. Protocolos `draft`, `paused`, `closed` e `cancelled` não recebem
novos check-ins.

Se `professionalId` também for enviado, deve coincidir com o profissional do
protocolo; valor conflitante é rejeitado.

Quando não há protocolo e existe um único vínculo ativo, o backend deriva o profissional.

Quando não há protocolo e existem vários vínculos ativos, o cliente informa `professionalId`, e o backend valida que o vínculo com o atleta autenticado está `active`.

Sem vínculo `active`, a criação falha com `ATHLETE_LINK_REQUIRED`.

Nenhuma escolha silenciosa deve ocorrer entre vários profissionais.

### 16.5 Edição, envio e revisão

- atleta edita somente `responses` permitidas enquanto `pending`;
- a edição substitui integralmente `responses`, sem merge implícito;
- `referenceWeek` e `protocolId` não devem ser alterados por edição comum;
- depois de `submitted`, o conteúdo é imutável;
- somente o profissional responsável, `approved` e com vínculo `active`,
  revisa;
- `reviewComment` é obrigatório na revisão, recebe trim e possui de 1 a 2000
  caracteres;
- `reviewed` é final.

`responses` é objeto JSON simples flexível, com 1 a 20 propriedades e no
máximo 16 KB serializados. Chaves têm de 1 a 50 caracteres e não aceitam `.`,
null byte, prefixo `$`, `__proto__`, `constructor` ou `prototype`. Valores
podem ser string de até 1000 caracteres, número finito, boolean, `null` ou
array de até 20 valores escalares. Objetos e arrays aninhados não são aceitos.
Esse contrato é aplicado na criação, edição e antes do envio.

### 16.6 Endpoints

```text
POST  /api/v1/check-ins
GET   /api/v1/check-ins
GET   /api/v1/check-ins/:id
PATCH /api/v1/check-ins/:id
PATCH /api/v1/check-ins/:id/submit
PATCH /api/v1/check-ins/:id/review
```

Filtros e ordenação:

```text
athleteId
protocolId
status
dateFrom
dateTo
sortBy = referenceWeek | createdAt | submittedAt
sortOrder = asc | desc
padrão = referenceWeek desc
```

Admin lista e consulta check-ins completos, mas não cria, edita, envia ou
revisa.

### 16.7 Auditoria

Registrar:

```text
CHECKIN_SUBMITTED
CHECKIN_REVIEWED
```

Sem conteúdo completo sensível nas metadatas.

---

## 17. Exames e documentos

### 17.1 Finalidade

O módulo armazena e organiza informações de exames. O sistema não interpreta resultados automaticamente.

### 17.2 Modelo conceitual

```js
{
  athleteId: ObjectId,
  professionalId: ObjectId | null,
  title: String,
  examDate: Date,
  laboratory: String | null,
  notes: String | null,
  document: {
    originalName: String,
    mimeType: String,
    sizeBytes: Number,
    storageKey: String,
    url: String | null
  } | null,
  results: [
    {
      marker: String,
      value: String,
      unit: String | null,
      referenceRange: String | null
    }
  ],
  archivedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

### 17.3 Regras

- atleta ou profissional aprovado vinculado cadastra conforme permissão;
- admin não acessa o módulo de exames na V1;
- infraestrutura de PDF reutiliza `StorageService`;
- validar MIME, extensão, tamanho e assinatura `%PDF-` exatamente no início;
- não armazenar o binário no documento MongoDB;
- não tornar arquivo privado publicamente navegável;
- respostas expõem somente `originalName`, `mimeType` e `sizeBytes`;
- não existe substituição, remoção ou download de PDF nesta etapa;
- título possui 1–160 caracteres; laboratório até 160; notas até 2000;
- resultados possuem no máximo 100 itens e aceitam somente campos textuais
  limitados e sem estruturas aninhadas;
- arquivamento preserva histórico;
- arquivamento é idempotente e apenas a primeira chamada gera
  `EXAM_ARCHIVED`;
- sem DELETE físico na API da V1;
- AuditLog não recebe conteúdo do exame nem PDF.

---

## 18. Evolução física e timeline

### 18.1 Evolução física

O módulo registra dados temporais informados pelo usuário.

Modelo conceitual:

```js
{
  athleteId: ObjectId,
  professionalId: ObjectId | null,
  referenceDate: Date,
  weightKg: Number | null,
  bodyFatPercent: Number | null,
  measurements: Object,
  notes: String | null,
  archivedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

Regras:

- valores numéricos não negativos;
- percentual, quando existente, dentro do intervalo válido;
- comparação é descritiva;
- não comparar o corpo do atleta a um ideal;
- não atribuir causas ou recomendações;
- não produzir crítica estética.

### 18.2 Timeline histórica

A tela de histórico agrega eventos de diferentes módulos em ordem cronológica:

- criação e versões de protocolos;
- mudanças de status;
- tracking records;
- envio e revisão de check-ins;
- exames adicionados;
- registros de evolução;
- eventos relevantes de vínculo;
- movimentações ou alertas importantes quando aplicável.

A timeline não substitui os registros originais. Cada item deve manter referência para a entidade de origem.

---

## 19. Estoque simples

### 19.1 Escopo

O estoque é individual e administrativo. Não é um ERP.

Inclui:

- item;
- quantidade;
- unidade;
- limite de estoque baixo;
- validade;
- movimentações;
- alerta de estoque baixo;
- alerta de vencimento;
- bloqueio de saída insuficiente.

Não inclui:

- fornecedores;
- pedidos de compra;
- custos;
- centros de distribuição;
- recomendação de compra;
- substituição automática;
- cálculo de dose.

### 19.2 InventoryItem

```js
{
  ownerId: ObjectId,
  substanceId: ObjectId | null,
  name: String,
  brand: String | null,
  batch: String | null,
  unit: "unit" | "ml" | "mg" | "g" | "capsule" | "tablet" | "vial" | "box",
  quantity: Number,
  lowStockThreshold: Number | null,
  expirationDate: Date | null,
  archivedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

### 19.3 InventoryMovement

```js
{
  inventoryItemId: ObjectId,
  ownerId: ObjectId,
  type: "in" | "out" | "adjustment",
  quantity: Number,
  previousQuantity: Number,
  resultingQuantity: Number,
  reason: String,
  relatedTrackingRecordId: ObjectId | null,
  createdBy: ObjectId,
  createdAt: Date
}
```

Movimentações são imutáveis.

### 19.4 Regras

- quantidade não pode ser negativa;
- saída não pode gerar estoque negativo;
- quantidade muda somente por movimentação;
- item vencido gera alerta;
- não recomendar uso, compra ou substituição;
- arquivamento lógico preserva movimentações.

---

## 20. Notificações internas

A V1 usa notificações internas no banco. Não há dependência de SMS, WhatsApp, push nativo ou e-mail automatizado.

Modelo conceitual:

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

Eventos previstos:

- solicitação de vínculo;
- vínculo aceito, rejeitado ou encerrado;
- profissional aprovado ou rejeitado;
- protocolo atualizado ou com status alterado;
- check-in disponível, enviado ou revisado;
- tracking próximo;
- exame adicionado;
- estoque baixo;
- item vencido.

Falha de notificação não deve desfazer a operação principal.

Endpoints conceituais:

```text
GET   /api/v1/notifications
PATCH /api/v1/notifications/:id/read
PATCH /api/v1/notifications/read-all
```

---

## 21. Dashboard unificado

A V1 possui um único endpoint:

```text
GET /api/v1/dashboard
```

O backend decide a resposta conforme `req.user.role`.

Não existem `/dashboard/admin`, `/dashboard/professional` ou
`/dashboard/athlete`. O endpoint não aceita query para selecionar role ou
identidade. Dashboard é projeção somente de leitura, sem collection, snapshots
persistidos ou AuditLog de consulta.

### 21.1 Atleta

- protocolo próprio `active` mais recente por `activatedAt desc`,
  `createdAt desc`, `_id desc`;
- próximo tracking próprio `scheduled` e futuro por `scheduledFor asc`,
  `createdAt asc`, `_id asc`;
- check-in próprio da semana atual normalizada em `America/Sao_Paulo`;
- até 10 atividades próprias de Protocol, TrackingRecord e CheckIn por
  `occurredAt desc`, `entityId desc`;
- `unreadNotifications=0` e `inventoryAlerts=[]` enquanto esses módulos não
  estiverem implementados.

Cards não retornam respostas, comentários de revisão, notas completas ou
motivos completos.

### 21.2 Profissional

Somente profissional `approved` recebe dashboard profissional completo.
Profissional `pending` ou `rejected` recebe `200`, seu `verificationStatus` e
valores operacionais neutros.

- `athleteCount`: atletas distintos com link `active`;
- `activeProtocols`: protocolos `active` do profissional e de atletas com
  link `active` atual;
- `pendingCheckIns`: check-ins `submitted` aguardando revisão, no mesmo escopo;
- `upcomingTrackings`: até 10 futuros `scheduled`, ordenados por
  `scheduledFor asc`, `createdAt asc`, `_id asc`;
- `recentActivity`: até 10 itens de Protocol, TrackingRecord e CheckIn no
  escopo ativo, por `occurredAt desc`, `entityId desc`.

### 21.3 Admin

- usuários totais e por role;
- usuários ativos (`active=true` e `blockedAt=null`);
- usuários bloqueados (`blockedAt` preenchido);
- ProfessionalProfile com `verificationStatus=pending`;
- vínculos com `status=active`;
- até 10 AuditLogs por `createdAt desc`, `_id desc`, sem `metadata` ou
  `ipHash`.

Dashboards mostram informações descritivas, sem cálculo clínico.

---

## 22. Auditoria

### 22.1 Objetivo

AuditLog registra rastreabilidade de ações críticas. Ele não é um histórico editável e não substitui históricos funcionais como `Protocol.statusHistory`.

### 22.2 Modelo

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

### 22.3 Regras

- collection `audit_logs`;
- append-only;
- documento imutável;
- somente aplicação escreve;
- nenhum POST público manual;
- nenhum PATCH;
- nenhum DELETE;
- ordenação mais recente primeiro;
- acesso geral somente para admin.

Não registrar:

- senha;
- `passwordHash`;
- JWT ou token;
- PDF;
- documento profissional completo;
- exame completo;
- buffer;
- `storageKey`;
- URL ou caminho privado;
- snapshots integrais desnecessários.

Metadata deve ser limitada em tamanho, profundidade e quantidade de campos.

### 22.4 Ações já implementadas

```text
PROFESSIONAL_REGISTERED
PROFESSIONAL_APPROVED
PROFESSIONAL_REJECTED
USER_BLOCKED
USER_UNBLOCKED
PROTOCOL_CREATED
PROTOCOL_VERSION_CREATED
PROTOCOL_STATUS_CHANGED
```

### 22.5 Ações de Links V2

```text
LINK_REQUESTED
LINK_ACCEPTED
LINK_REJECTED
LINK_ENDED
```

### 22.6 Ações de Tracking e Check-ins

```text
TRACKING_CREATED
TRACKING_STATUS_CHANGED
TRACKING_CORRECTED
CHECKIN_SUBMITTED
CHECKIN_REVIEWED
```

### 22.7 Ações futuras

```text
EXAM_CREATED
EXAM_ARCHIVED
PROGRESS_CREATED
PROGRESS_ARCHIVED
INVENTORY_UPDATED
INVENTORY_MOVEMENT_CREATED
USER_ACTIVATED
```

Os nomes definitivos devem permanecer centralizados em constantes.

### 22.8 Endpoint

```text
GET /api/v1/audit-logs
```

Filtros:

```text
actorId
entityType
entityId
action
dateFrom
dateTo
page
limit
```

### 22.9 Consistência

As gravações de auditoria são aguardadas e erros críticos não são ignorados. A V1 não introduziu transactions ou outbox em todos os fluxos. Em algumas operações, a mutação pode persistir antes de uma falha de auditoria; esse limite técnico deve ser conhecido e não permite usar AuditLog como única fonte de verdade de um estado funcional.

---

## 23. Preservação histórica e exclusão lógica

A V1 evita exclusão física de dados de negócio.

Política:

```text
User                 -> inactive / blocked
ProfessionalProfile  -> pending / approved / rejected
Link                 -> pending / active / rejected / ended
Substance            -> active = false
Protocol             -> cancelled / closed
TrackingRecord       -> cancelled ou preservado em estado final
CheckIn              -> preservado
Exam                 -> archivedAt
PhysicalProgress     -> archivedAt
InventoryItem        -> archivedAt
Notification         -> readAt / archivedAt
AuditLog             -> imutável
```

Não usar cascade delete automático para histórico.

Exclusão física fica restrita a dados de teste ou dados efêmeros sem dependências. Limpeza de banco em testes com `deleteMany` não representa endpoint de exclusão de negócio.

---

## 24. Segurança e privacidade

### 24.1 Autenticação

- JWT contém somente identificadores e papel necessários;
- `verificationStatus` profissional não entra no token;
- middleware consulta estado persistido;
- token expirado ou inválido retorna erro padronizado.

### 24.2 Autorização

Toda rota privada combina:

1. autenticação;
2. papel;
3. aprovação profissional quando aplicável;
4. ownership ou vínculo ativo;
5. estado do recurso;
6. validação da operação.

### 24.3 Proteção contra enumeração

Quando a existência de um recurso ou usuário não deve ser revelada, preferir resposta genérica ou `404` conforme o contrato.

### 24.4 Uploads

- validar MIME;
- validar tamanho;
- validar assinatura do arquivo;
- não confiar no nome original;
- usar armazenamento privado;
- não inserir caminho interno em resposta;
- não gravar conteúdo do arquivo em log.

### 24.5 Validação

- validar ObjectIds;
- rejeitar campos desconhecidos;
- normalizar e-mail;
- aplicar trim em strings;
- validar `dateFrom <= dateTo`;
- aplicar whitelist em filtros e ordenação;
- evitar NoSQL injection;
- não confiar em IDs enviados pelo cliente.

### 24.6 Segredos

Nunca versionar:

- `.env`;
- JWT secret;
- URI real do banco;
- tokens;
- senhas;
- PDFs privados;
- credenciais de deploy.

---

## 25. Contratos de API — visão consolidada

Base:

```text
/api/v1
```

### 25.1 Públicos e autenticação

```text
GET   /health
POST  /auth/register
POST  /auth/register-professional
POST  /auth/login
GET   /auth/me
PATCH /auth/password
```

### 25.2 Usuários e verificação

```text
GET   /users
GET   /users/:id
PATCH /users/:id
PATCH /users/:id/block

GET   /professional-verifications
GET   /professional-verifications/me
GET   /professional-verifications/:id
PATCH /professional-verifications/:id/approve
PATCH /professional-verifications/:id/reject
```

### 25.3 Links V2

```text
POST  /links
GET   /links
GET   /links/:id
PATCH /links/:id/accept
PATCH /links/:id/reject
PATCH /links/:id/end
```

### 25.4 Substâncias

```text
GET   /substances
POST  /substances
GET   /substances/:id
PATCH /substances/:id
PATCH /substances/:id/status
```

### 25.5 Protocolos

```text
POST  /protocols
GET   /protocols
GET   /protocols/:id
PATCH /protocols/:id
POST  /protocols/:id/versions
GET   /protocols/:id/versions
GET   /protocols/:id/versions/:version
PATCH /protocols/:id/status
```

### 25.6 Tracking

```text
POST  /tracking-records
GET   /tracking-records
GET   /tracking-records/:id
PATCH /tracking-records/:id/status
PATCH /tracking-records/:id/correction
```

### 25.7 Check-ins

```text
POST  /check-ins
GET   /check-ins
GET   /check-ins/:id
PATCH /check-ins/:id
PATCH /check-ins/:id/submit
PATCH /check-ins/:id/review
```

### 25.8 Exames, evolução e histórico

```text
POST  /exams
GET   /exams
GET   /exams/:id
PATCH /exams/:id
PATCH /exams/:id/archive

POST  /progress
GET   /progress
GET   /progress/:id
PATCH /progress/:id
PATCH /progress/:id/archive

GET   /history
```

### 25.9 Estoque

```text
POST  /inventory
GET   /inventory
GET   /inventory/:id
PATCH /inventory/:id
PATCH /inventory/:id/archive
POST  /inventory/:id/movements
GET   /inventory/:id/movements
```

### 25.10 Notificações, dashboard e auditoria

```text
GET   /notifications
PATCH /notifications/:id/read
PATCH /notifications/read-all

GET   /dashboard
GET   /audit-logs
```

### 25.11 Rotas antigas que não devem retornar

```text
DELETE /protocols/:id
DELETE /substances/:id
DELETE /exams/:id
DELETE /progress/:id
DELETE /inventory/:id
DELETE /notifications/:id
POST   /check-ins/:id/reopen
PATCH  /check-ins/:id/reopen
PATCH  /tracking-records/:id
DELETE /tracking-records/:id
DELETE /check-ins/:id
GET    /dashboard/admin
GET    /dashboard/professional
GET    /dashboard/athlete
POST   /tracking-records/:id/complete
POST   /tracking-records/:id/miss
POST   /tracking-records/:id/cancel
POST   /protocols/:id/activate
POST   /protocols/:id/pause
POST   /protocols/:id/resume
POST   /protocols/:id/close
POST   /protocols/:id/cancel
```

---

## 26. Frontend

### 26.1 Identidade visual

Direção aprovada:

- visual claro;
- bege `#E9DFD0`;
- superfícies off-white;
- texto marrom escuro;
- botões em azul-marinho;
- aparência premium, institucional e editorial;
- Atlas grego sustentando a esfera como elemento central;
- evitar neon, cyberpunk, hospital genérico ou academia genérica.

Conceitos:

```text
ATLAS      = estrutura
PROTOCOL   = organização e versionamento
DIFERENCIAL = contexto histórico
```

### 26.2 Rotas públicas

```text
/
/login
/register
/register/professional
```

### 26.3 Área autenticada comum

```text
/app
/app/dashboard
/app/profile
/app/protocols
/app/protocols/:id
/app/tracking
/app/check-ins
/app/check-ins/:id
/app/history
/app/exams
/app/inventory
/app/notifications
```

### 26.4 Rotas profissionais

```text
/app/athletes
/app/athletes/:id
/app/links
/app/protocols/new
/app/protocols/:id/edit
/app/tracking/new
```

### 26.5 Rotas administrativas

```text
/app/admin/users
/app/admin/professionals
/app/admin/substances
/app/admin/audit
```

### 26.6 Dashboard

A rota é única:

```text
/app/dashboard
```

O frontend escolhe o componente interno conforme o papel e o estado de verificação.

### 26.7 Sidebar e autorização

- sidebar adaptada ao papel;
- itens indisponíveis não substituem a autorização do backend;
- profissional `pending` ou `rejected` vê tela de status, não dashboard profissional completo;
- guards tratam autenticação e guest routes;
- interceptor anexa JWT.

### 26.8 Estados obrigatórios de UI

Toda página dependente de API deve possuir:

```text
loading
success
empty
error
unauthorized
```

Ações devem possuir:

```text
idle
saving
success feedback
validation error
server error
```

### 26.9 Estado atual do frontend

Já existe:

- home pública;
- login;
- cadastro de atleta;
- AuthService;
- JWT interceptor;
- AuthGuard;
- GuestGuard;
- layout autenticado;
- sidebar;
- header;
- dashboard visual;
- design system e responsividade base.

Ainda precisam ser conectadas à API as telas funcionais dos módulos restantes.

---

## 27. Qualidade e testes

### 27.1 Cobertura mínima por endpoint

- sucesso;
- autenticação ausente;
- papel sem permissão;
- profissional não aprovado, quando aplicável;
- payload inválido;
- ObjectId inválido;
- recurso inexistente;
- transição inválida;
- ownership inválido;
- vínculo inexistente ou não ativo;
- paginação e filtros;
- campos sensíveis ausentes da resposta.

### 27.2 Testes por domínio

- models e validações;
- services e regras de negócio;
- integração das rotas;
- máquinas de estado;
- concorrência e duplicidade quando relevantes;
- imutabilidade de versões e logs;
- regressão dos módulos existentes.

### 27.3 Comandos obrigatórios

```bash
npm test
npm run lint
git diff --check
```

Não afirmar que passaram sem executar.

### 27.4 Definition of Done

Uma tarefa está concluída quando:

- segue a documentação;
- possui validação;
- respeita autenticação e permissão;
- possui tratamento de erro;
- possui testes;
- não quebra testes existentes;
- lint passa;
- `git diff --check` passa;
- documentação foi atualizada quando o contrato mudou;
- não há segredo ou arquivo sensível versionado;
- relatório final descreve arquivos, decisões, testes e pendências.

---

## 28. Git e colaboração

### 28.1 Regra de escopo

```text
uma branch = um objetivo
```

Não misturar, por exemplo:

```text
Links + Tracking + Dashboard + Frontend
```

### 28.2 Fluxo

```text
develop atualizada
        ↓
branch da tarefa
        ↓
implementação
        ↓
testes + lint + diff-check
        ↓
revisão
        ↓
commit
        ↓
merge em develop
        ↓
novos testes
        ↓
push
```

### 28.3 Commits

Não permitir commit automático por agente.

Convenção:

```text
type(scope): descrição em português
```

Exemplos:

```text
feat(auth): implementando cadastro e aprovacao de profissionais
feat(audit): implementando infraestrutura de auditoria
fix(protocols): alinhando contratos e historico de status a v1
feat(links): implementando solicitacao e aceite de vinculos
```

### 28.4 Agentes de código

Antes de alterar código, o agente deve:

1. ler `AGENTS.md` e `docs/`;
2. executar `git status`;
3. confirmar a branch;
4. revisar o log recente;
5. analisar o módulo atual;
6. parar diante de ambiguidade real;
7. não criar contrato silenciosamente;
8. não fazer commit, merge ou cherry-pick sem autorização.

---

## 29. Estado atual da implementação

### 29.1 Backend concluído ou estabilizado

```text
Fundação da API                         concluído
MongoDB/Mongoose                        concluído
Tratamento global de erros              concluído
Health check                            concluído
Autenticação JWT/bcrypt                 concluído
Cadastro de atleta                      concluído
Usuários e roles                        concluído
Cadastro de profissional + PDF          concluído
ProfessionalProfile                     concluído
Aprovação/rejeição profissional         concluído
Professional approval middleware        concluído
StorageService                          concluído
Biblioteca de substâncias               concluído
Protocolos e ProtocolVersion            concluído
Contrato V1 de Protocolos               concluído
Protocol.statusHistory                  concluído
AuditLog e AuditService                 concluído
API administrativa de auditoria        concluído
Links V2 por e-mail + aceite            concluído
Tracking Records V1                     concluído
Check-ins V1                            concluído
Dashboard API unificado V1              concluído
```

### 29.2 Próxima etapa

```text
Frontend atleta funcional              próxima implementação
```

Tracking Records e Check-ins foram implementados na branch:

```text
feat/tracking-checkins-v1
```

### 29.3 Não integrado ou pendente

```text
Frontend atleta funcional               pendente
Frontend profissional funcional         pendente
Exames + PDF                            pendente
Evolução + timeline                     pendente
Estoque                                 pendente
Notificações                            pendente
Admin frontend final                    pendente
Seed mínimo                             pendente
Deploy frontend                         pendente
E2E/segurança/QA                        pendente
Documentação e ensaio final             pendente
```

### 29.4 Testes conhecidos das últimas etapas

Cadastro profissional:

```text
19 suítes
161 testes
lint sem erros
```

Auditoria:

```text
22 suítes
193 testes
lint sem erros
```

Tracking Records e Check-ins:

```text
30 suítes
424 testes
lint sem erros
```

Dashboard API unificado:

```text
33 suítes
447 testes
lint sem erros
```

Os números atuais do repositório devem ser confirmados novamente depois dos
merges e antes de registrar novos valores neste documento.

---

## 30. Roadmap restante

Ordem recomendada a partir do estado atual:

1. conectar frontend do atleta;
2. conectar frontend do profissional;
3. implementar exames e PDF;
4. implementar evolução e timeline;
5. implementar estoque;
6. implementar notificações internas;
7. finalizar telas administrativas;
8. criar seed mínimo;
9. configurar armazenamento persistente de arquivos;
10. publicar frontend;
11. executar E2E, segurança e QA;
12. atualizar README e documentação final;
13. ensaiar demonstração do TCC.

---

## 31. Seed de demonstração

Manter o mínimo necessário:

- 1 admin;
- 1 profissional aprovado;
- 1 atleta;
- opcionalmente 1 profissional `pending` ou `rejected`;
- opcionalmente 1 atleta sem vínculo para demonstrar acesso negado;
- poucas substâncias fictícias;
- um protocolo com versão adicional;
- um check-in revisado;
- um tracking concluído;
- um exame fictício;
- um registro de evolução;
- estoque normal, baixo e vencido;
- poucos audit logs e notificações.

Durante a apresentação, criar o máximo possível do fluxo ao vivo. Dados de contingência existem apenas para evitar uma demonstração vazia em caso de tempo ou falha externa.

Usar somente dados fictícios.

---

## 32. Roteiro de demonstração

1. abrir a home e apresentar o problema;
2. cadastrar um profissional com PDF;
3. entrar como admin e aprovar;
4. entrar como profissional e solicitar vínculo por e-mail;
5. entrar como atleta e aceitar;
6. voltar ao profissional e criar protocolo `draft`;
7. ativar o protocolo;
8. criar nova versão e mostrar a anterior preservada;
9. pausar e retomar, mostrando `statusHistory`;
10. mostrar tracking record;
11. enviar check-in como atleta;
12. tentar duplicar o check-in semanal e demonstrar bloqueio;
13. revisar como profissional;
14. mostrar exame, evolução e timeline;
15. mostrar estoque baixo ou vencido;
16. demonstrar bloqueio de acesso sem vínculo;
17. mostrar dashboard adaptado ao perfil;
18. mostrar AuditLog;
19. apresentar frontend, backend, deploy e repositórios.

---

## 33. Critérios acadêmicos atendidos

O projeto demonstra:

- frontend e backend separados;
- Angular;
- Node.js e Express;
- API REST;
- MongoDB e Mongoose;
- autenticação JWT;
- bcrypt;
- rotas protegidas;
- autorização por perfil;
- ownership e relacionamento entre entidades;
- CRUDs e operações de domínio;
- validações;
- regras de negócio;
- máquinas de estado;
- versionamento;
- upload de arquivos;
- auditoria;
- testes automatizados;
- controle de versão;
- deploy;
- documentação técnica.

O diferencial técnico é formado pela combinação de:

- verificação profissional;
- vínculo com consentimento do atleta;
- protocolos versionados;
- `statusHistory` funcional;
- check-in único por período;
- histórico cronológico agregado;
- auditoria imutável;
- autorização por vínculo ativo.

---

## 34. Decisões congeladas da V1

Estas decisões não devem ser redesenhadas sem atualização explícita dos documentos:

1. profissional pode se cadastrar publicamente;
2. cadastro profissional exige PDF no campo `document`;
3. profissional inicia `pending`;
4. pending e rejected podem autenticar, mas não operar profissionalmente;
5. verificação profissional não entra no JWT;
6. link é solicitado por e-mail exato;
7. não há busca ampla de atletas;
8. atleta aceita ou rejeita o vínculo;
9. somente link `active` concede acesso;
10. rejected e ended permitem nova solicitação futura como novo registro;
11. base legada de links é descartável;
12. protocolo possui `statusHistory` próprio;
13. AuditLog não é fonte exclusiva do histórico funcional;
14. edição direta de protocolo é somente para `draft`;
15. protocolo publicado muda por nova versão;
16. mudança de status usa endpoint único;
17. tracking usa `scheduledFor`, `dateFrom` e `dateTo`;
18. tracking muda status por endpoint único;
19. check-in usa `responses`;
20. não existe reabertura de check-in na V1;
21. reviewComment é obrigatório ao revisar;
22. dashboard possui endpoint único;
23. notificações são internas;
24. estoque permanece simples;
25. dados de negócio não são excluídos fisicamente;
26. frontend possui uma rota de dashboard e interface adaptada ao papel;
27. todas as páginas de API possuem estados de loading, empty, success, error e unauthorized;
28. seed deve ser mínimo;
29. Tracking e Check-ins antigos serão portados manualmente, sem merge cego;
30. o sistema nunca diagnostica, prescreve ou recomenda automaticamente;
31. atleta cria somente tracking próprio `manual`, sem protocolo ou
    profissional;
32. `TrackingRecord.professionalId` é anulável e `statusReason` preserva o
    motivo de `missed` ou `cancelled`;
33. check-ins usam `PATCH` para submit e review;
34. `responses` segue limites explícitos e não aceita objetos aninhados;
35. admin possui leitura completa de tracking e check-ins, sem mutações do
    fluxo normal.

---

## 35. Pontos técnicos a acompanhar

### 35.1 Armazenamento persistente

`LocalStorageService` é adequado para desenvolvimento e testes. Antes da entrega final, configurar armazenamento persistente ou object storage compatível com o deploy.

### 35.2 Atomicidade de auditoria

A auditoria é explícita e aguardada, mas a V1 não garante transação distribuída em todos os fluxos. Avaliar transactions ou outbox como evolução futura, sem bloquear a entrega atual.

### 35.3 Concorrência de Links

Confirmar a compatibilidade do índice parcial com a versão real do MongoDB, Atlas e MongoMemoryServer. A regra de negócio permanece obrigatória independentemente da estratégia técnica.

### 35.4 Sincronização documental

Os documentos antigos em DOCX permanecem úteis para apresentação e visão acadêmica, mas contêm contratos históricos. Este master spec e os arquivos atuais de `docs/` devem ser atualizados sempre que uma decisão oficial mudar.

---

## 36. Checklist final da V1

### Backend

- [x] autenticação;
- [x] usuários e roles;
- [x] cadastro profissional;
- [x] aprovação profissional;
- [x] upload privado;
- [x] substâncias;
- [x] protocolos e versões;
- [x] statusHistory;
- [x] auditoria base;
- [x] Links V2;
- [x] tracking;
- [x] check-ins;
- [x] dashboard;
- [ ] exames;
- [ ] evolução e timeline;
- [ ] estoque;
- [ ] notificações;
- [ ] seed final;
- [ ] E2E e QA.

### Frontend

- [x] home;
- [x] login;
- [x] cadastro base;
- [x] autenticação, guards e interceptor;
- [x] layout, header e sidebar;
- [x] dashboard visual;
- [ ] cadastro profissional funcional;
- [ ] estado pending/rejected;
- [ ] Links V2;
- [ ] protocolos funcionais;
- [ ] tracking;
- [ ] check-ins;
- [ ] histórico;
- [ ] exames;
- [ ] estoque;
- [ ] notificações;
- [ ] admin;
- [ ] deploy final.

### Entrega

- [ ] armazenamento persistente;
- [ ] CORS do frontend de produção;
- [ ] credenciais fictícias de demonstração;
- [ ] README dos dois repositórios;
- [ ] URLs públicas confirmadas;
- [ ] roteiro ensaiado;
- [ ] apresentação final;
- [ ] documentação revisada;
- [ ] testes executados no commit final.

---

## 37. Regra final

O Atlas Protocol deve priorizar:

```text
consistência
segurança
histórico
permissão
clareza de contrato
MVP demonstrável
```

Não priorizar:

```text
escopo excessivo
refatoração sem necessidade
compatibilidade com dados descartáveis
funcionalidades clínicas automáticas
complexidade que não contribui para o TCC
```

Ao encontrar uma ambiguidade real, a implementação deve parar, registrar a dúvida e atualizar a documentação antes de inventar comportamento.

---

**Fim do documento.**
