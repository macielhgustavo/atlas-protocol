# Atlas Protocol — Regras de domínio

## 1. Escopo do domínio

O Atlas Protocol permite:

- cadastro e autenticação de atletas e profissionais;
- comprovação e aprovação de profissionais;
- vínculo entre profissional e atleta;
- criação e versionamento de protocolos;
- registros de acompanhamento;
- check-ins periódicos;
- armazenamento de exames e PDFs;
- registro de evolução física;
- timeline histórica agregada;
- estoque simples individual;
- notificações internas;
- dashboards por perfil;
- auditoria de alterações relevantes.

O sistema não:

- prescreve;
- recomenda substâncias;
- calcula dose ideal;
- sugere correções clínicas;
- diagnostica;
- interpreta exames automaticamente;
- substitui acompanhamento profissional.

## 2. Perfis

Perfis válidos:

- `admin`
- `professional`
- `athlete`

Um usuário possui exatamente um perfil na V1.

### DR-001 — Cadastro de atleta

Cadastro público de atleta cria usuário com:

- `role = athlete`;
- conta ativa, salvo bloqueio administrativo posterior.

### DR-002 — Cadastro de profissional

Cadastro público de profissional exige:

- nome;
- e-mail;
- senha;
- upload de documento comprobatório em PDF.

O usuário é criado com:

- `role = professional`;
- `verificationStatus = pending`.

Profissional `pending` pode autenticar, mas não exerce permissões profissionais.

### DR-003 — Aprovação profissional

Somente admin pode:

- aprovar profissional;
- rejeitar profissional;
- registrar motivo de rejeição.

Estados de verificação:

- `pending`
- `approved`
- `rejected`

Somente `approved` pode exercer permissões profissionais.

### DR-004 — Documento profissional

O fluxo de comprovação é demonstrativo para fins acadêmicos e não certifica credencial médica ou profissional real.

O documento comprobatório:

- deve ser PDF;
- deve passar por validação de tipo e tamanho;
- não deve ser exposto publicamente;
- não deve ser gravado em logs ou auditoria em conteúdo completo.

## 3. Vínculo profissional-atleta

Estados:

- `pending`
- `active`
- `rejected`
- `ended`

### DR-005 — Vínculo obrigatório

Um profissional só pode acessar dados de acompanhamento de um atleta quando:

- o profissional está `approved`;
- existe vínculo `active` entre ambos.

### DR-006 — Solicitação de vínculo

Somente profissional `approved` pode solicitar vínculo.

A solicitação localiza o atleta exclusivamente pelo e-mail exato informado. O
backend normaliza o e-mail e obtém `professionalId` somente do usuário
autenticado, sem oferecer busca ampla de atletas.

Ao criar solicitação:

- status inicial = `pending`;
- usuário inexistente, não atleta, inativo, bloqueado ou indisponível produz o
  mesmo erro genérico `ATHLETE_NOT_AVAILABLE_FOR_LINK`;
- o atleta recebe notificação interna;
- gerar exatamente uma ocorrência de auditoria `LINK_REQUESTED`;
- não há acesso aos dados do atleta enquanto estiver `pending`.

### DR-007 — Aceite do atleta

Somente o atleta destinatário pode aceitar vínculo `pending`.

Ao aceitar:

- status = `active`;
- registrar `acceptedAt`;
- gerar exatamente uma ocorrência de auditoria `LINK_ACCEPTED`;
- gerar notificação para o profissional.

### DR-008 — Rejeição do atleta

Somente o atleta destinatário pode rejeitar vínculo `pending`.

Ao rejeitar:

- status = `rejected`;
- registrar `rejectedAt`;
- gerar exatamente uma ocorrência de auditoria `LINK_REJECTED`;
- o motivo opcional, quando informado, é normalizado e registrado somente em
  `AuditLog.metadata` no evento `LINK_REJECTED`;
- o motivo não é persistido no vínculo nem exposto desnecessariamente;
- não liberar acesso ao profissional;
- preservar o registro da solicitação.

### DR-009 — Encerramento do vínculo

Vínculo `active` pode virar `ended` por ação autorizada.

Encerramento:

- impede novos acessos e alterações do profissional;
- não apaga histórico criado durante o vínculo;
- registra `endedAt`;
- exige motivo quando realizado por admin e mantém o motivo opcional para
  profissional ou atleta participantes;
- gerar exatamente uma ocorrência de auditoria `LINK_ENDED`;
- o motivo é normalizado e registrado somente em `AuditLog.metadata` no evento
  `LINK_ENDED`, sem ser persistido no vínculo;
- gera notificações.

### DR-010 — Unicidade lógica

Não pode existir mais de um vínculo `pending` ou `active` para o mesmo par profissional-atleta.

Novo vínculo após `rejected` ou `ended` deve gerar novo registro, preservando o histórico anterior.

## 4. Biblioteca de substâncias/itens

### DR-011 — Escopo informativo

A biblioteca serve para catalogar itens referenciados por protocolos e estoque.

Categorias permitidas:

- `hormone`
- `peptide`
- `supplement`
- `vitamin`
- `medication`
- `other`

### DR-012 — Informação operacional

O sistema pode armazenar informação inserida pelo profissional para acompanhamento, mas não gera recomendação automática.

### DR-013 — Desativação

Itens não são excluídos fisicamente.

Ao desativar:

- deixam de aparecer em novas seleções, quando aplicável;
- snapshots históricos permanecem intactos.

## 5. Protocolos

Estados:

- `draft`
- `active`
- `paused`
- `closed`
- `cancelled`

### DR-014 — Criação

Somente profissional `approved` com vínculo `active` pode criar protocolo para o atleta.

Protocolo nasce em `draft` e cria versão inicial 1.

Na criação, o protocolo também recebe a entrada inicial de histórico:

```text
from = null
to = draft
reason = null
changedAt = data de criação
changedBy = profissional responsável
```

Essa criação gera `PROTOCOL_CREATED` no AuditLog. Não deve gerar
`PROTOCOL_STATUS_CHANGED` adicional apenas pela entrada inicial, para evitar
auditoria duplicada do mesmo evento.

### DR-015 — Rascunho

Protocolo `draft`:

- pode ser editado;
- pode ter itens adicionados ou removidos;
- pode ser cancelado;
- não é excluído fisicamente;
- não gera novos registros automáticos de acompanhamento.

### DR-016 — Ativação

Só pode ativar protocolo que:

- esteja em `draft`;
- tenha atleta e profissional válidos;
- tenha vínculo `active`;
- tenha pelo menos um item;
- tenha data inicial válida;
- não tenha data final anterior à inicial.

`activatedAt` representa a primeira transição `draft -> active`: é preenchido
nessa ativação, nunca é apagado e não é sobrescrito em uma retomada
`paused -> active`.

### DR-017 — Protocolo ativo

Protocolo `active`:

- fica visível ao atleta;
- não é editado diretamente sem versionamento;
- mudanças materiais geram nova versão;
- pode ser pausado ou encerrado.

### DR-018 — Versionamento

Toda mudança material em protocolo `active` ou `paused` cria nova versão sequencial.

Mudanças materiais incluem:

- inclusão ou remoção de item;
- alteração de frequência;
- alteração de período;
- alteração de instruções operacionais relevantes;
- alteração de campos que mudem o conteúdo efetivo do protocolo.

A versão anterior permanece imutável.

Cada versão posterior à versão inicial gera exatamente um
`PROTOCOL_VERSION_CREATED` no AuditLog. A versão 1 faz parte da criação do
protocolo e é coberta por `PROTOCOL_CREATED`, sem log adicional de versão.

### DR-019 — Mudança somente de status

Alteração apenas de status não cria nova versão de conteúdo.

Toda transição realizada por `PATCH /api/v1/protocols/:id/status` adiciona
exatamente uma entrada ao `statusHistory` embutido no protocolo, com:

- `from`: estado anterior;
- `to`: novo estado;
- `reason`: motivo opcional, normalizado com `trim`, limitado a 500 caracteres,
  ou `null` quando omitido;
- `changedAt`: instante da transição em UTC;
- `changedBy`: usuário autenticado responsável pela transição.

`statusHistory` é append-only: entradas existentes não podem ser editadas,
substituídas ou removidas por operações normais do sistema. O cliente não pode
enviar nem substituir `statusHistory` diretamente em payloads.

O array é a fonte de verdade do histórico funcional de estados do protocolo.
Cada transição também gera exatamente um `PROTOCOL_STATUS_CHANGED` no
AuditLog, com metadata mínima e segura (`from`, `to` e `reason`, quando
informado). AuditLog mantém finalidade de auditoria e rastreabilidade e não
substitui o histórico funcional do domínio.

### DR-020 — Pausa

`active -> paused` é permitido.

Durante a pausa:

- histórico anterior permanece;
- o protocolo pode voltar a `active`;
- `pausedAt` registra a pausa mais recente e é atualizado em cada transição
  `active -> paused`;
- a retomada `paused -> active` não limpa `pausedAt` nem sobrescreve
  `activatedAt`;
- cada pausa e retomada permanece representada no `statusHistory`.

Não existe `resumedAt` na V1. O histórico completo de retomadas é obtido pelo
`statusHistory`.

### DR-021 — Encerramento

`active` ou `paused` pode virar `closed`.

Após `closed`:

- somente leitura;
- não pode ser reaberto na V1;
- não aceita novos registros vinculados ao protocolo;
- histórico permanece disponível;
- `closedAt` registra a entrada em `closed` e nunca é apagado.

### DR-022 — Cancelamento

Somente `draft` pode virar `cancelled`.

Protocolos ativados não são cancelados; são encerrados.

`cancelledAt` registra a entrada em `cancelled` e nunca é apagado.

### DR-023 — Datas

- datas persistidas em UTC;
- `endDate >= startDate`;
- `continuous=true` permite `endDate=null`;
- o sistema não calcula duração clínica.

### DR-024 — Snapshot histórico

Cada item da versão deve preservar snapshot mínimo da substância/item referenciado.

Desativar item da biblioteca não altera versões históricas.

## 6. Registros de acompanhamento

Estados:

- `scheduled`
- `completed`
- `missed`
- `cancelled`

Campo temporal padrão:

- `scheduledFor`

Filtros temporais padrão:

- `dateFrom`
- `dateTo`

### DR-025 — Origem

Registro pode ser:

- criado pelo profissional `approved` com vínculo `active`;
- criado pelo atleta somente para si, com `type=manual`,
  `protocolId=null` e `professionalId=null`;
- associado opcionalmente a protocolo ativo quando criado pelo profissional.

Na criação pelo atleta, `athleteId` e `createdBy` são derivados do usuário
autenticado. O atleta não informa `athleteId`, `professionalId` ou
`protocolId` e não pode criar registro com `type=scheduled`.

Na criação pelo profissional, `professionalId` e `createdBy` são derivados
do usuário autenticado. O `athleteId` informado precisa pertencer a atleta
com vínculo `active`.

### DR-026 — Protocolo vinculado

Tracking vinculado a protocolo só pode ser criado quando o protocolo está
`active`.

Não permitir criar novo tracking vinculado a protocolo `draft`, `paused`,
`closed` ou `cancelled`.

O protocolo deve pertencer ao atleta informado e
`TrackingRecord.professionalId` deve coincidir com
`Protocol.professionalId`.

Quando associado a protocolo, preservar referências necessárias para contexto histórico.

### DR-027 — Transições

Permitido:

```text
scheduled -> completed
scheduled -> missed
scheduled -> cancelled
```

Estados finais não retornam a `scheduled` na V1.

As transições devem ser atômicas ou usar mecanismo equivalente para que
somente uma requisição concorrente vença e gere auditoria.

Permissões do atleta:

- pode concluir tracking próprio;
- pode cancelar apenas tracking próprio, `manual` e criado por ele;
- nunca pode marcar tracking como `missed`.

Profissional só altera tracking quando está `approved` e mantém vínculo
`active` com o atleta.

Transições para `missed` ou `cancelled` exigem `reason` com trim, entre 1 e
500 caracteres. O motivo é persistido em `statusReason`.

### DR-028 — Conclusão

Ao concluir:

- registrar `completedAt`;
- registrar `completedBy`;
- manter `statusReason=null`;
- manter coerência entre status e campos de conclusão.

Ao marcar `missed` ou `cancelled`:

- manter `completedAt=null`;
- manter `completedBy=null`;
- persistir o motivo em `statusReason`.

### DR-029 — Histórico

Registro concluído, perdido ou cancelado não é excluído fisicamente.

Correções excepcionais alteram somente `notes`, preservam o estado final e
devem ser auditadas com motivo obrigatório de 1 a 500 caracteres.

Admin pode corrigir qualquer tracking finalizado.

Profissional pode corrigir somente quando está `approved`, é o
`professionalId` responsável pelo tracking e mantém vínculo `active` com o
atleta. Tracking com `professionalId=null` só pode ser corrigido por admin.

Atleta não corrige tracking finalizado.

## 7. Check-ins

Estados:

- `pending`
- `submitted`
- `reviewed`

### DR-030 — Unicidade semanal

Só pode existir um check-in do mesmo atleta para a mesma `referenceWeek`.

A semana começa na segunda-feira, considerando `America/Sao_Paulo` para normalização funcional.

Uma entrada ISO contendo somente `YYYY-MM-DD` é interpretada como data civil
nesse timezone. Uma entrada com horário e offset é interpretada como instante
antes da normalização.

### DR-031 — Protocolo opcional

Check-in pode referenciar `protocolId` opcional para manter contexto.

Quando informado, o protocolo deve:

- pertencer ao atleta autenticado;
- estar `active`;
- determinar o `professionalId` responsável;
- possuir vínculo `active` entre profissional e atleta.

Protocolos `draft`, `paused`, `closed` ou `cancelled` não recebem novos
check-ins. Check-in já criado permanece histórico quando o protocolo muda de
estado posteriormente.

Sem protocolo:

- nenhum vínculo `active`: falhar com `ATHLETE_LINK_REQUIRED`;
- um vínculo `active`: derivar o profissional;
- múltiplos vínculos `active`: exigir `professionalId` e validar o vínculo,
  sem selecionar profissional silenciosamente.

### DR-032 — Rascunho

Enquanto `pending`, o atleta pode editar respostas permitidas.

Na edição comum, somente `responses` pode ser alterado. O objeto enviado
substitui integralmente o valor anterior, sem merge implícito.

### DR-033 — Envio

Somente o atleta dono envia.

`pending -> submitted`.

Ao enviar:

- registrar `submittedAt`;
- respostas ficam imutáveis para o atleta.

O contrato de `responses` deve ser validado novamente antes do envio.

### DR-034 — Revisão

Somente o profissional responsável, `approved` e com vínculo `active`, pode
revisar.

`submitted -> reviewed`.

Registrar:

- `reviewedAt`;
- `reviewedBy`;
- `reviewComment`.

`reviewComment` é obrigatório, recebe trim e possui entre 1 e 2000
caracteres.

### DR-035 — Sem reabertura na V1

Check-in `submitted` ou `reviewed` não volta a `pending` na V1.

Correções posteriores devem ocorrer por registro complementar ou procedimento administrativo auditado, sem sobrescrever o conteúdo original.

### DR-036 — Conteúdo

Pode armazenar dados de acompanhamento definidos pelo produto, desde que:

- não gerem diagnóstico automático;
- não gerem prescrição;
- não gerem recomendação automática.

`responses` é um objeto JSON simples e flexível com:

- entre 1 e 20 propriedades;
- tamanho serializado máximo de 16 KB;
- chaves de 1 a 50 caracteres, sem `.`, null byte, prefixo `$` ou os nomes
  `__proto__`, `constructor` e `prototype`;
- sem objetos aninhados, funções, buffers ou tipos especiais;
- valores `string`, número finito, boolean, `null` ou array de até 20 valores
  escalares;
- strings de até 1000 caracteres;
- sem arrays aninhados ou objetos dentro de arrays.

O mesmo contrato é aplicado na criação, edição e antes do envio. O campo
histórico `answers` não é aceito.

## 8. Exames

### DR-037 — Propriedade

Exame pertence a um atleta.

### DR-038 — Cadastro

Atleta pode cadastrar exame próprio.

Profissional `approved` com vínculo `active` pode cadastrar exame do atleta vinculado.

### DR-039 — PDF

A V1 suporta PDF de exame.

O arquivo:

- é validado por tipo e tamanho;
- é armazenado via serviço de storage;
- tem URL/metadados persistidos;
- não é interpretado automaticamente.

### DR-040 — Resultados estruturados

Resultados estruturados são opcionais e informativos.

O sistema não classifica como normal, anormal, seguro ou perigoso.

### DR-041 — Arquivamento

Exame não é excluído fisicamente.

Pode ser arquivado quando necessário, preservando histórico e auditoria.

## 9. Evolução física e timeline

### DR-042 — Registro temporal

Cada registro de evolução possui `referenceDate`.

### DR-043 — Valores

Valores numéricos, quando presentes, devem respeitar validações de domínio e não podem ser negativos.

### DR-044 — Sem avaliação automática

O sistema pode mostrar diferenças históricas, mas não atribui causa, julgamento ou recomendação.

### DR-045 — Propriedade

Atleta vê próprios registros.

Profissional vê apenas atleta com vínculo `active`.

### DR-046 — Timeline agregada

A timeline histórica pode agregar eventos como:

- criação e versões de protocolo;
- mudanças de status relevantes;
- check-ins enviados/revisados;
- trackings;
- exames;
- registros de evolução.

A timeline é uma visão derivada; não duplica nem altera os registros-fonte.

## 10. Estoque simples

O estoque existe para cumprir o escopo do TCC sem virar ERP.

### DR-047 — Dono

Estoque pertence ao atleta.

Atleta gerencia o próprio estoque.

Profissional `approved` com vínculo `active` possui leitura do estoque do atleta.

### DR-048 — Quantidade

Quantidade nunca pode ficar negativa.

### DR-049 — Movimentações

Quantidade muda por movimentação:

- `in`
- `out`
- `adjustment`

Movimentações são imutáveis.

### DR-050 — Estoque insuficiente

Saída maior que quantidade disponível é bloqueada.

Erro de domínio: `INVENTORY_INSUFFICIENT`.

### DR-051 — Validade

Item vencido deve gerar estado/alerta e não pode ser usado em operação futura que o domínio marque como utilização.

Erro de domínio quando aplicável: `INVENTORY_ITEM_EXPIRED`.

### DR-052 — Estoque baixo

Quando `quantity <= lowStockThreshold`, o item é considerado baixo para alertas e dashboard.

O sistema não recomenda compra, dose ou substituição.

### DR-053 — Escopo reduzido

Fora da V1:

- fornecedores;
- compras;
- custos;
- pedidos;
- múltiplos depósitos;
- controle financeiro.

### DR-054 — Arquivamento

Item de estoque não é excluído fisicamente.

Pode ser arquivado, mantendo movimentações históricas.

## 11. Notificações

### DR-055 — Apenas internas

A V1 usa notificações internas.

Não inclui push real, SMS, WhatsApp ou e-mail transacional obrigatório.

### DR-056 — Eventos possíveis

Exemplos:

- vínculo solicitado;
- vínculo aceito;
- vínculo rejeitado;
- vínculo encerrado;
- profissional aprovado/rejeitado;
- protocolo criado/atualizado/status alterado;
- check-in disponível/enviado/revisado;
- acompanhamento próximo;
- exame adicionado;
- estoque baixo;
- item vencido.

### DR-057 — Leitura

Usuário só marca suas próprias notificações como lidas.

### DR-058 — Não bloquear operação principal

Falha ao criar notificação não deve invalidar a operação principal já concluída, salvo se explicitamente tratado como transação futura.

## 12. Dashboard

### DR-059 — Endpoint único

A API expõe:

```text
GET /api/v1/dashboard
```

A resposta varia conforme `req.user.role`.

### DR-060 — Escopo por perfil

Dashboard respeita ownership, vínculo e aprovação profissional.

### DR-061 — Sem cálculo clínico

Cards e listas mostram dados operacionais e históricos; não produzem avaliação médica.

### DR-062 — Atleta

Pode incluir:

- protocolo ativo;
- próximo acompanhamento;
- check-in atual;
- atividade recente;
- notificações não lidas;
- alertas simples de estoque.

### DR-063 — Profissional

Pode incluir:

- atletas vinculados ativos;
- protocolos ativos;
- check-ins aguardando revisão;
- próximos acompanhamentos;
- atividade recente.

### DR-064 — Admin

Pode incluir:

- usuários por perfil;
- profissionais pendentes;
- contas bloqueadas/ativas;
- vínculos ativos;
- logs recentes ou contagens administrativas.

## 13. Auditoria

### DR-065 — Eventos auditáveis

Registrar ações relevantes, incluindo:

- bloqueio/desbloqueio de usuário;
- cadastro/aprovação/rejeição profissional;
- solicitação/aceite/rejeição/encerramento de vínculo;
- criação e versionamento de protocolo;
- mudanças de status de protocolo;
- mudanças relevantes de tracking;
- envio e revisão de check-in;
- cadastro/arquivamento de exame;
- alterações de estoque relevantes;
- ações administrativas críticas.

### DR-066 — Imutabilidade

AuditLog é imutável para usuários.

Somente a aplicação escreve.

AuditLog registra auditoria e rastreabilidade, mas não é a fonte funcional
exclusiva para reconstruir estados de entidades de domínio. Para protocolos, o
histórico funcional de status pertence ao `Protocol.statusHistory` append-only.

### DR-067 — Conteúdo seguro

Não gravar:

- senha;
- token;
- PDF completo;
- conteúdo integral de exame;
- documento profissional completo;
- segredos de ambiente.

Metadata deve ser mínima e segura.

## 14. Exclusão e preservação histórica

### DR-068 — Sem DELETE físico na V1

Dados de negócio não são excluídos fisicamente.

Preferir:

- `active=false`;
- `archivedAt`;
- mudança de status;
- encerramento/cancelamento.

### DR-069 — Usuários

Usuário é bloqueado/desativado, não apagado.

Histórico permanece.

### DR-070 — Protocolos

Rascunho pode ser `cancelled`, não deletado.

Protocolos publicados permanecem para sempre no histórico.

### DR-071 — Check-ins, tracking, exames e evolução

Preservar registros e arquivar quando necessário.

### DR-072 — Estoque

Arquivar item sem apagar movimentações.

### DR-073 — Notificações

Pode haver ocultação/arquivamento visual, sem remover auditoria relacionada.

## 15. Upload e storage

### DR-074 — Abstração de storage

Upload deve passar por serviço próprio, sem acoplar controllers ao provedor.

### DR-075 — Tipos suportados na V1

- comprovação profissional: PDF obrigatório;
- exame: PDF suportado.

### DR-076 — Validação

Validar no mínimo:

- MIME esperado;
- extensão compatível;
- tamanho máximo configurado;
- nome seguro;
- autorização de quem envia.

## 16. Seed e demonstração

### DR-077 — Seed mínimo

Seed deve criar apenas o necessário para segurança da apresentação:

- 1 admin;
- 1 profissional aprovado;
- 1 atleta;
- 1 usuário extra opcional para testar acesso negado;
- poucas substâncias fictícias;
- 1 vínculo ativo;
- poucos registros de backup.

### DR-078 — Fluxo principal da banca

Priorizar criação ao vivo do fluxo:

```text
cadastro profissional
-> aprovação admin
-> solicitação de vínculo
-> aceite atleta
-> criação/ativação/versionamento de protocolo
-> check-in
-> revisão
-> tracking/exame/evolução
-> timeline
-> estoque
-> auditoria
```

Seed serve como contingência.
