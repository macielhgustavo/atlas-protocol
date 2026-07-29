# Atlas Protocol Backend

API REST do **Atlas Protocol**, plataforma web para acompanhamento entre atletas e profissionais, com protocolos versionados, registros, check-ins, exames, evolução, estoque simples, notificações, dashboards e auditoria.

O sistema organiza informações e preserva histórico. Não diagnostica, não prescreve, não recomenda substâncias, não sugere doses e não interpreta exames automaticamente.

## Stack

- Node.js
- Express.js
- MongoDB + Mongoose
- JWT
- bcrypt
- Joi/validators
- Jest + Supertest
- ESLint

Frontend separado em Angular.

## Requisitos

- Node.js 20 ou superior
- npm
- MongoDB local ou MongoDB Atlas 6.0 ou superior, com FCV 6.0 ou superior

## Instalação

```bash
npm install
```

Crie `.env` a partir de `.env.example` e configure os valores necessários.

Exemplo mínimo:

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/atlas_protocol
JWT_SECRET=substitua-por-uma-chave-segura-com-32-caracteres
JWT_EXPIRES_IN=1d
BCRYPT_SALT_ROUNDS=12
FRONTEND_URL=http://localhost:4200
PROFESSIONAL_DOCUMENT_MAX_BYTES=5242880
EXAM_DOCUMENT_MAX_BYTES=10485760
STORAGE_LOCAL_ROOT=.storage
```

Quando upload estiver habilitado, variáveis específicas do provedor de storage devem ser adicionadas ao `.env.example`. Nunca commite segredos.

## Execução

Desenvolvimento:

```bash
npm run dev
```

Produção:

```bash
npm start
```

Health check:

```text
GET http://localhost:3000/api/v1/health
```

Dashboard autenticado unificado:

```text
GET http://localhost:3000/api/v1/dashboard
```

O backend seleciona a projeção de atleta, profissional ou admin pela identidade
autenticada. Não existem rotas separadas por perfil.

Exames:

```text
POST  /api/v1/exams
GET   /api/v1/exams
GET   /api/v1/exams/:id
PATCH /api/v1/exams/:id
PATCH /api/v1/exams/:id/archive
```

Atletas operam exames próprios; profissionais aprovados operam dentro de
vínculo ativo e somente alteram ou arquivam exames de sua responsabilidade.
Admin não possui acesso operacional a exames na V1.

O PDF opcional é validado por MIME, extensão, tamanho e assinatura no início
do arquivo, armazenado privadamente e nunca expõe `storageKey`, URL interna ou
caminho nas respostas. A V1 não possui substituição nem endpoint de download
de PDF. Arquivamento é lógico e idempotente.

Backend publicado atualmente:

```text
https://atlas-protocol-6yo0.onrender.com
```

API pública:

```text
https://atlas-protocol-6yo0.onrender.com/api/v1
```

## Qualidade

```bash
npm test
npm run lint
```

## Arquitetura

Fluxo padrão:

```text
route
  -> authMiddleware
  -> roleMiddleware
  -> validationMiddleware
  -> controller
  -> service
  -> model
  -> response
```

Regras críticas ficam no backend.

## Perfis

- `admin`
- `professional`
- `athlete`

Cadastro público:

- atleta: conta ativa;
- profissional: exige PDF comprobatório e fica `pending` até aprovação do admin. Essa validação é simulada para fins acadêmicos e não certifica credencial profissional real.

Profissional só exerce permissões profissionais quando aprovado.

## Fluxo principal da V1

```text
cadastro profissional
-> upload de comprovacao
-> aprovacao admin
-> solicitacao de vinculo
-> aceite do atleta
-> criacao de protocolo
-> ativacao/versionamento
-> tracking/check-in
-> revisao profissional
-> exame/evolucao
-> timeline historica
-> estoque simples
-> auditoria
```

## Módulos da V1

- autenticação e usuários;
- verificação profissional;
- vínculos profissional-atleta;
- biblioteca de substâncias/itens;
- protocolos e versões;
- tracking records;
- check-ins;
- exames com suporte a PDF;
- evolução física;
- timeline/histórico;
- estoque simples e movimentações;
- notificações internas;
- dashboard por perfil;
- auditoria.

## Preservação histórica

A V1 evita exclusão física de dados de negócio.

Usa:

- estados de domínio;
- `active=false`;
- `archivedAt`;
- cancelamento/encerramento.

Protocolos versionados, check-ins, exames, tracking, estoque e auditoria preservam histórico.

## Documentação obrigatória

Antes de implementar qualquer módulo, leia:

1. `AGENTS.md`
2. `docs/domain-rules.md`
3. `docs/permissions.md`
4. `docs/api-contracts.md`
5. `docs/database-models.md`

Esses documentos são a fonte de verdade da V1.

## Frontend

Repositório:

```text
https://github.com/henryportes880/atlas-protocol-front
```

Rotas públicas previstas:

```text
/
/login
/register
/register/professional
```

Área autenticada:

```text
/app
/app/dashboard
/app/profile
/app/protocols
/app/tracking
/app/check-ins
/app/history
/app/exams
/app/inventory
/app/notifications
```

## Ordem oficial de desenvolvimento restante

1. Frontend atleta.
2. Frontend profissional.
3. Exames + PDF.
4. Evolução + timeline.
5. Estoque simples.
6. Notificações.
7. Admin.
8. Seed mínimo.
9. Deploy frontend.
10. Testes E2E/QA.
11. Documentação final e ensaio do TCC.

## Seed de demonstração

Manter o mínimo necessário:

- 1 admin;
- 1 profissional aprovado;
- 1 atleta;
- 1 usuário extra opcional para acesso negado;
- poucas substâncias fictícias;
- poucos registros de contingência.

A apresentação deve priorizar o fluxo criado ao vivo.
