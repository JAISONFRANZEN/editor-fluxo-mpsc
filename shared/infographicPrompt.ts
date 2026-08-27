import type { FlowModel } from "./flowModel";

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function buildInstitutionalInfographicPrompt(model: FlowModel, title = "Fluxo Básico de Acionamento — Nível Promotoria de Justiça") {
  const orderedLanes = [...model.pools]
    .sort((a, b) => a.order - b.order)
    .flatMap(pool => model.lanes.filter(lane => lane.poolId === pool.id).sort((a, b) => a.order - b.order));
  const laneIndex = new Map(orderedLanes.map((lane, index) => [lane.id, index]));
  const activities = [...model.nodes]
    .sort((a, b) => (laneIndex.get(a.laneId) ?? 0) - (laneIndex.get(b.laneId) ?? 0) || a.x - b.x)
    .slice(0, 18)
    .map((node, index) => `${index + 1}. ${cleanText(node.label)}`);
  const validationItems = model.nodes
    .filter(node => node.requiresValidation || node.label.includes("[A VALIDAR]"))
    .map(node => cleanText(node.label.includes("[A VALIDAR]") ? node.label : `${node.label} [A VALIDAR]`))
    .slice(0, 8);
  const milestoneLabels = (model.milestones ?? []).map(item => cleanText(item.label));

  return `Crie um INFOGRÁFICO INSTITUCIONAL claro, didático e acessível, em português do Brasil, destinado a usuários que precisam compreender rapidamente como agir em um fluxo de acionamento em situação de risco, alerta, emergência ou crise.

TÍTULO PRINCIPAL
${cleanText(title)}

OBJETIVO DE COMUNICAÇÃO
Transformar o fluxo técnico abaixo em uma leitura simples, com prioridade à proteção da vida, à comunicação adequada e à coordenação institucional. A peça deve orientar, sem substituir protocolos oficiais, decisões de autoridades competentes ou o atendimento por órgãos externos.

MENSAGEM CENTRAL EM DESTAQUE
"Proteja a vida. Em perigo imediato, acione o serviço público competente. Em seguida, comunique a CISI pelo canal institucional aplicável."

ESTRUTURA VISUAL
- Formato vertical institucional, adequado para PDF, tela e impressão A4; leitura fluida de cima para baixo.
- Criar uma linha de ação principal com até 6 blocos numerados, condensando as atividades sem perder a ordem lógica.
- Usar três faixas de fase: ${milestoneLabels.length ? milestoneLabels.join("; ") : "PREVENÇÃO E PREPARAÇÃO; RESPOSTA E COORDENAÇÃO; RECUPERAÇÃO E APRENDIZADO"}.
- Destacar o ponto focal "CISI — ponto focal técnico-operacional interno", deixando claro que não substitui a Administração Superior, o Promotor natural ou os órgãos externos competentes.
- Reservar um bloco final para "Monitorar, registrar, estabilizar e aprender".
- Incluir, de forma visual e objetiva, uma nota de responsabilidade: "Minuta técnica. Sujeita à validação jurídica, operacional e institucional competente."

CONTEÚDO TÉCNICO A TRADUZIR EM LINGUAGEM SIMPLES
${activities.join("\n")}

MARCAÇÕES QUE DEVEM PERMANECER VISÍVEIS
${validationItems.length ? validationItems.map(item => `- ${item}`).join("\n") : "- Não há marcações pendentes no fluxo atual."}

DIREÇÃO DE ARTE
- Paleta institucional sóbria: azul cobalto #1F4788, azul médio #4A90E2, azul claro #87CEEB, fundo #F8F9FA, texto #333333.
- Usar ícones universais e discretos: alerta, proteção, telefone de emergência, comunicação, registro, coordenação, monitoramento e encerramento.
- Tipografia sem serifa, alto contraste, títulos curtos e linguagem direta. Evitar parágrafos extensos, poluição visual, efeitos 3D, fotografias dramáticas e excesso de elementos decorativos.
- Utilizar setas simples e blocos arredondados. A hierarquia visual deve destacar primeiro a proteção da vida, depois o acionamento competente, a comunicação com a CISI e o acompanhamento.
- Não inventar telefones, canais internos, responsáveis, prazos, competências, atos normativos ou logotipos. Não apresentar a peça como ato oficial aprovado.
- Não inserir dados pessoais, dados sensíveis, informação de inteligência ou detalhes operacionais restritos.

TOM
Sereno, objetivo, público, institucional e acolhedor. A imagem deve ser compreensível em poucos segundos por quem está sob pressão, sem simplificar indevidamente as competências legais e institucionais.`;
}
