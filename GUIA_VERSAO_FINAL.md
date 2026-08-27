# Guia da Versão Final — Editor de Protocolos BPMN do MPSC

**Data de consolidação:** 27 de agosto de 2026  
**Finalidade:** orientar a compreensão, implantação, validação e uso da versão final do editor de fluxos do Ministério Público de Santa Catarina.

> Este sistema produz uma **minuta técnica de modelagem e revisão**. O conteúdo dos fluxos não constitui ato normativo, comando operacional ou protocolo institucional aprovado. As marcações **[A VALIDAR]** devem ser preservadas até manifestação formal das áreas competentes.

## 1. Resultado entregue

O editor permite estruturar, revisar, versionar e exportar fluxos antes da modelagem definitiva no Bizagi Modeler. A aplicação mantém Pools e baias, bloqueia a Administração Superior na primeira baia do Pool MPSC, oferece elementos BPMN essenciais e estendidos, comentários com anexos, perfis institucionais, histórico de versões, auditoria, importação Markdown e exportações BPMN, SVG, JSON e impressão/PDF.

| Dimensão | Situação final | Evidência principal |
|---|---|---|
| Governança | Administração Superior permanece bloqueada na primeira baia; **[A VALIDAR]** é preservado | `shared/flowModel.ts` e validações automatizadas |
| Modelagem | Paletas Essencial e Estendida, arrastar e soltar, conexão visual, grade, encaixe e organização | `client/src/components/FlowEditor.tsx` |
| Colaboração | Comentários, anexos, revisão, aprovação e histórico persistente | `server/flowDb.ts` e rotas tRPC |
| Autorização | Administrador possui visão global; demais usuários somente acessam fluxos próprios ou atribuídos | `flowMembers`, `server/flowDb.ts` e botão **Acessos** |
| Segurança | Modelo Zod estrito, limites de payload e anexos, tipos controlados e prevenção de conflito concorrente | `server/routers/flow.ts` e `server/_core/index.ts` |
| Auditoria | Eventos append-only para versões, restauração, comentários e atribuições | `flowAuditEvents` e painel Histórico |
| Exportação BPMN | Pools, baias, formas e waypoints recalibrados; mensagens referenciam participantes válidos | `shared/bpmnExport.ts` |
| Infográfico | Prompt institucional gerado a partir do fluxo atual, revisável e copiável | `shared/infographicPrompt.ts` |

## 2. Passo a passo do que foi realizado

| Etapa | Ação executada | Resultado |
|---|---|---|
| 1 | Foram analisados o propósito institucional, as regras de governança e a linguagem visual definida para o fluxo | O modelo diferencia atuação da Administração Superior, Promotoria, CISI e órgãos externos |
| 2 | O modelo de dados foi estruturado para Pools, baias, elementos, conexões, versões, comentários, anexos e auditoria | O fluxo passou a ser persistente, versionável e recuperável |
| 3 | A interface visual foi construída com edição de propriedades, arraste, criação de conectores e controles de navegação | O usuário consegue reorganizar o fluxo antes do Bizagi |
| 4 | Foram incluídos perfis de Editor, Revisor, Aprovador e Administrador | As ações de comentário, edição, aprovação e gestão ficaram separadas |
| 5 | A revisão final introduziu autorização por fluxo por meio da tabela `flowMembers` | Revisores e aprovadores não possuem mais acesso global automático |
| 6 | A exportação BPMN foi recalibrada e recebeu verificação de colisão de identificadores | Reduziu-se a desconfiguração observada no Bizagi e evitam-se XMLs ambíguos |
| 7 | O limite global de requisição foi reduzido e o total de anexos passou a ser verificado antes da decodificação | Diminuiu-se o risco de consumo excessivo de memória |
| 8 | O salvamento recebeu controle otimista de concorrência | Uma edição não sobrescreve silenciosamente outra versão gravada no mesmo intervalo |
| 9 | A acessibilidade foi revista com rótulos para controles icônicos, indicação de modo e atalhos documentados | Os controles principais apresentam melhor suporte a teclado e tecnologias assistivas |
| 10 | A suíte foi ampliada para autorização por fluxo, concorrência, exportação, auditoria e anexos | A versão final possui **30 testes automatizados aprovados** |

## 3. Como utilizar o editor

O usuário deve iniciar no modo **Essencial**, inserindo evento de início, tarefas, decisões, gateways, dados, anotações e evento de fim. O modo **Estendido** deve ser usado somente quando o fluxo exigir subprocesso, evento intermediário, gateways adicionais ou repositório de dados.

Para criar uma ligação, é possível usar os campos **Origem** e **Destino** na lateral ou arrastar o ponto de saída de um elemento até o ponto de entrada do elemento seguinte. O sistema infere fluxo de sequência dentro do mesmo Pool e fluxo de mensagem entre Pools distintos.

Durante a revisão, os filtros por nível N0–N3 e responsável ajudam a reduzir o conteúdo visível. O mini-mapa navega por fluxos extensos. A grade e o encaixe de 20 pixels podem ser ativados ou desativados, e o botão **Organizar** redistribui os elementos horizontalmente por baia.

O painel **Revisão** reúne alertas BPMN, comentários e anexos. O painel **Histórico** registra versões, restaurações e eventos de auditoria. Os atalhos disponíveis são `Ctrl+Z` para desfazer e `Ctrl+Y` ou `Ctrl+Shift+Z` para refazer.

Antes de exportar, os erros críticos indicados pelo editor devem ser corrigidos. O botão **Baixar fluxo** gera BPMN 2.0; **Imagem SVG** gera material visual; **Imprimir/PDF** prepara a saída de apresentação; **Especificação** preserva o modelo estruturado; e **Prompt infográfico** cria orientação textual para uma imagem institucional.

## 4. Como administrar acessos

O administrador define o papel institucional de cada usuário e usa o botão **Acessos** para conceder ou remover acesso ao fluxo atual. O proprietário mantém acesso integral ao próprio fluxo. Administradores possuem acesso global; editores, revisores e aprovadores visualizam apenas fluxos próprios ou atribuídos.

| Papel | Editar | Comentar | Aprovar | Gerenciar usuários e acessos |
|---|---:|---:|---:|---:|
| Editor | Sim | Sim | Não | Não |
| Revisor | Não | Sim | Não | Não |
| Aprovador | Não | Sim | Sim | Não |
| Administrador | Sim | Sim | Sim | Sim |

## 5. Passo a passo de implantação técnica

| Ordem | Procedimento | Comando ou local |
|---|---|---|
| 1 | Instalar dependências | `pnpm install` |
| 2 | Configurar os segredos fornecidos pela plataforma, sem criar arquivo `.env` versionado | Painel de segredos do projeto |
| 3 | Aplicar as migrações do banco na ordem numérica | Diretório `drizzle/` |
| 4 | Confirmar a existência de `flowMembers` e `flowAuditEvents` | Painel de banco ou consulta administrativa |
| 5 | Verificar os tipos | `pnpm check` |
| 6 | Executar a suíte | `pnpm test` |
| 7 | Gerar a build de produção | `pnpm build` |
| 8 | Publicar por checkpoint | Fluxo de publicação da plataforma |

## 6. Validações finais realizadas

| Verificação | Resultado |
|---|---|
| TypeScript | Sem erros |
| Testes automatizados | 30 aprovados em 6 arquivos |
| Build de produção | Concluída |
| Auditoria de dependências de produção | 0 vulnerabilidades informativas, baixas, moderadas, altas ou críticas |
| Integridade do diff | Sem erros de espaços ou marcadores inválidos |
| Banco de dados | Migração `flowMembers` aplicada sem alteração destrutiva das tabelas existentes |
| Revisão visual | Interface íntegra em viewport desktop; cabeçalho ajustado para melhor distribuição intermediária |
| Bizagi Modeler | Arquivo aberto pelo usuário; pequenos ajustes manuais foram considerados não impeditivos |

## 7. Limites e decisões de fechamento

O Bizagi Modeler pode aplicar regras próprias de roteamento, dimensionamento e posicionamento ao importar BPMN. A exportação foi ajustada para reduzir diferenças, mas não se promete equivalência visual absoluta entre o canvas web e o Bizagi. O arquivo exportado deve continuar sendo tratado como base para a modelagem definitiva.

O editor não substitui validação jurídica, operacional ou institucional. Canais internos, plantões, titulares, substitutos, prazos, critérios de escalonamento e contatos externos permanecem **[A VALIDAR]** quando ainda não houver confirmação formal.

## 8. Critério para continuidade futura

Qualquer evolução posterior deve preservar quatro invariantes: Administração Superior na primeira baia do Pool MPSC; proteção da vida e acionamento direto dos serviços competentes antes ou simultaneamente à comunicação interna; CISI como ponto focal técnico-operacional sem substituição das autoridades; e manutenção explícita de **[A VALIDAR]** até aprovação competente.

Este guia encerra a etapa de construção técnica. A etapa seguinte, quando determinada pelo MPSC, é a validação institucional do conteúdo e a modelagem oficial no Bizagi Modeler.
