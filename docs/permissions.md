# Atlas Protocol — Matriz de permissões

## 1. Legenda

- **T**: permitido em todos os registros do escopo administrativo.
- **V**: permitido apenas para atletas com vínculo `active`.
- **P**: permitido apenas em registros próprios.
- **N**: não permitido.
- **C**: permitido com condição adicional.

Autorização é sempre aplicada no backend.

Profissional só exerce permissões profissionais quando `verificationStatus=approved`.

## 2. Usuários

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Listar usuários | T | N | N |
| Ver usuário por ID | T | P | P |
| Atualizar próprio perfil | P | P | P |
| Atualizar perfil de outro usuário | T | N | N |
| Bloquear/desbloquear usuário | T | N | N |
| Alterar role manualmente | C | N | N |
| Excluir fisicamente | N | N | N |

Regra: role não pode ser promovida silenciosamente via payload do próprio usuário.

## 3. Cadastro e verificação profissional

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Cadastro público como profissional | N/A | P | N |
| Enviar documento de verificação próprio | N/A | P | N |
| Ver status de verificação próprio | T | P | N |
| Listar profissionais pendentes | T | N | N |
| Aprovar profissional | T | N | N |
| Rejeitar profissional | T | N | N |
| Ver documento comprobatório | T | P próprio | N |
| Excluir documento/histórico fisicamente | N | N | N |

Profissional `pending` ou `rejected` pode consultar sua situação, mas não acessar recursos profissionais. A aprovação é uma simulação acadêmica e não certifica credencial real.

## 4. Vínculos profissional-atleta

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Solicitar vínculo | N | C | N |
| Listar vínculos | T | P | P |
| Ver vínculo | T | P | P |
| Aceitar solicitação | N | N | P |
| Rejeitar solicitação | N | N | P |
| Encerrar vínculo ativo | C | P | P |
| Reativar vínculo encerrado | N | N | N |
| Excluir fisicamente | N | N | N |

Condições:

- profissional solicitante deve estar `approved`;
- atleta só aceita/rejeita solicitação destinada a ele;
- admin só encerra vínculo ativo quando informa motivo;
- profissional ou atleta participante pode encerrar vínculo ativo com motivo
  opcional;
- motivos de rejeição e encerramento são registrados somente em metadata segura
  da auditoria;
- dados do atleta só ficam acessíveis ao profissional após `active`.

## 5. Biblioteca de substâncias/itens

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Listar itens ativos | T | T | T |
| Ver item | T | T | T |
| Criar item global | T | N | N |
| Criar item privado | N | P | N |
| Atualizar item global | T | N | N |
| Atualizar item privado próprio | T | P | N |
| Desativar item | T | P próprio | N |
| Excluir fisicamente | N | N | N |

## 6. Protocolos

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Listar | C | V | P |
| Ver detalhes | C | V | P |
| Criar | N | V | N |
| Editar rascunho | N | V | N |
| Cancelar rascunho | N | V | N |
| Ativar | N | V | N |
| Criar nova versão | N | V | N |
| Pausar | N | V | N |
| Retomar | N | V | N |
| Encerrar | N | V | N |
| Alterar protocolo encerrado | N | N | N |
| Excluir fisicamente | N | N | N |

Admin pode consultar apenas quando necessário para suporte/auditoria, sem editar conteúdo.

## 7. Registros de acompanhamento

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Listar | T | V | P |
| Ver | T | V | P |
| Criar manualmente | N | V | C |
| Marcar `completed` | N | V | P |
| Marcar `missed` | N | V | N |
| Marcar `cancelled` | N | V | C |
| Corrigir registro finalizado | T | C | N |
| Excluir fisicamente | N | N | N |

Condições:

- admin pode listar e consultar todos os registros para suporte, auditoria e
  demonstração, mas não cria nem executa mudança normal de status;
- atleta cria somente tracking próprio `manual`, sem protocolo e sem
  profissional associado;
- atleta conclui tracking próprio;
- atleta cancela somente tracking próprio `manual`, criado por ele, com motivo
  obrigatório;
- profissional precisa estar `approved` e possuir vínculo `active` com o
  atleta para listar, consultar, criar ou alterar status;
- profissional corrige somente tracking finalizado no qual é o
  `professionalId` responsável e enquanto o vínculo permanece `active`;
- admin corrige qualquer tracking finalizado;
- correção exige motivo e gera auditoria;
- tracking com `professionalId=null` não pode ser corrigido por profissional.

## 8. Check-ins

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Listar | T | V | P |
| Ver | T | V | P |
| Criar `pending` | N | N | P |
| Editar enquanto `pending` | N | N | P |
| Enviar | N | N | P |
| Revisar `submitted` | N | C | N |
| Reabrir | N | N | N |
| Excluir fisicamente | N | N | N |

Condições:

- admin pode listar e consultar check-ins completos para suporte, auditoria e
  demonstração, mas não cria, edita, envia ou revisa;
- atleta cria, edita e envia somente check-in próprio;
- após `submitted`, respostas do atleta são imutáveis na V1;
- profissional precisa estar `approved` e manter vínculo `active` com o atleta
  para listar e consultar;
- para revisar, o profissional também precisa ser o `professionalId`
  responsável pelo check-in;
- profissional diferente do responsável não revisa, mesmo que também possua
  vínculo com o atleta;
- `reviewed` é final e não existe reabertura administrativa ou profissional.

## 9. Exames

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Listar | C | V | P |
| Ver | C | V | P |
| Cadastrar | N | V | P |
| Fazer upload de PDF | N | V | P |
| Atualizar metadados permitidos | N | V | P |
| Arquivar | C | V | P |
| Excluir definitivamente | N | N | N |

Admin não altera conteúdo clínico; acesso administrativo deve ser excepcional e auditável.

## 10. Evolução física e histórico

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Listar evolução | C | V | P |
| Ver registro | C | V | P |
| Criar registro | N | V | P |
| Atualizar registro permitido | N | V | P |
| Arquivar | C | V | P |
| Ver timeline histórica | C | V | P |
| Excluir fisicamente | N | N | N |

Timeline é somente leitura e derivada dos registros-fonte.

## 11. Estoque simples

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Listar estoque do atleta | N | V | P |
| Ver item | N | V | P |
| Criar item | N | N | P |
| Atualizar metadados do item | N | N | P |
| Registrar entrada/saída/ajuste | N | N | P |
| Ver movimentações | N | V | P |
| Arquivar item | N | N | P |
| Excluir fisicamente | N | N | N |

Profissional possui leitura apenas do estoque de atleta com vínculo `active`.

## 12. Notificações

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Listar próprias | P | P | P |
| Marcar própria como lida | P | P | P |
| Marcar todas próprias como lidas | P | P | P |
| Arquivar/ocultar própria | P | P | P |
| Criar manualmente | N | N | N |
| Excluir fisicamente | N | N | N |

Notificações são geradas pelo sistema.

## 13. Dashboard

Existe um único endpoint backend: `GET /dashboard`.

| Conteúdo retornado | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Visão administrativa | P | N | N |
| Visão profissional | N | P | N |
| Visão atleta | N | N | P |

O backend escolhe a resposta pela role autenticada.

## 14. Auditoria

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Consultar logs gerais | T | N | N |
| Consultar evento exposto em histórico próprio | C | C | C |
| Criar log manualmente | N | N | N |
| Alterar log | N | N | N |
| Excluir log | N | N | N |

AuditLog é escrito somente pela aplicação.

## 15. Uploads

| Ação | Admin | Profissional | Atleta |
|---|---:|---:|---:|
| Upload comprovação profissional | N/A | P | N |
| Visualizar comprovação para análise | T | P próprio | N |
| Upload PDF de exame | N | V | P |
| Excluir arquivo de histórico definitivamente | N | N | N |

Arquivos exigem validação de MIME, tamanho, autorização e storage seguro.

## 16. Regras de implementação

Toda rota privada combina, quando aplicável:

1. autenticação;
2. aprovação profissional, se role `professional`;
3. role;
4. ownership ou vínculo `active`;
5. estado do recurso;
6. validação da operação.

Exemplo:

```text
PATCH /protocols/:id/status
  -> auth
  -> role professional
  -> verify professional approved
  -> validate ObjectId
  -> load protocol
  -> verify active link
  -> verify current state
  -> apply transition
  -> audit
```

Nunca confiar em `professionalId`, `athleteId`, `role` ou status enviados pelo cliente sem validação contra o usuário autenticado e o estado persistido.
