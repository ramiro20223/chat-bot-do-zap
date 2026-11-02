// Questionário de configuração por tipo de empresa (puro).
// Tipos de pergunta: text | textarea | select | multi | boolean | hours

export const BUSINESS_TYPES = [
  { key: 'restaurante', label: 'Restaurante / Lanchonete / Delivery', group: 'restaurante' },
  { key: 'farmacia', label: 'Farmácia / Drogaria', group: 'farmacia' },
  { key: 'mercado', label: 'Mercado / Mercearia', group: 'loja' },
  { key: 'loja', label: 'Loja (roupas, eletrônicos, casa, etc.)', group: 'loja' },
  { key: 'petshop', label: 'Pet shop / Veterinária', group: 'loja' },
  { key: 'assistencia', label: 'Assistência técnica', group: 'assistencia' },
  { key: 'salao', label: 'Salão / Barbearia / Estética', group: 'servico' },
  { key: 'outro', label: 'Outro tipo de negócio', group: 'servico' },
];

const PAYMENTS = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito', 'Vale-refeição/alimentação', 'Boleto'];

// Rótulos dos campos de produto conforme o tipo (o banco usa as mesmas colunas).
export const PRODUCT_LABELS = {
  restaurante: { noun: 'item do cardápio', name: 'Nome do prato/item', category: 'Categoria (Lanches, Bebidas...)',
    description: 'Descrição', indications: 'Ingredientes e alergênicos', characteristics: 'Porção / observações' },
  farmacia: { noun: 'produto', name: 'Nome do produto', category: 'Categoria (Analgésicos, Vitaminas...)',
    description: 'Descrição', indications: 'Indicações (para que serve)',
    characteristics: 'Características (princípio ativo, dosagem, forma, contraindicações, exige receita?)' },
  loja: { noun: 'produto', name: 'Nome do produto', category: 'Categoria', description: 'Descrição',
    indications: 'Para que serve / como usar', characteristics: 'Características (marca, tamanho, cor, garantia)' },
  assistencia: { noun: 'serviço ou peça', name: 'Serviço ou peça', category: 'Categoria (Celular, Notebook...)',
    description: 'Descrição', indications: 'Problema que resolve', characteristics: 'Compatibilidade, garantia e prazo' },
  servico: { noun: 'serviço', name: 'Nome do serviço', category: 'Categoria', description: 'Descrição',
    indications: 'Para quem / quando é indicado', characteristics: 'Duração, o que inclui, observações' },
};

export const labelsFor = (type) => PRODUCT_LABELS[groupOf(type)] || PRODUCT_LABELS.servico;
export const groupOf = (type) => BUSINESS_TYPES.find((t) => t.key === type)?.group || 'servico';

const COMMON_BEFORE = [
  { key: 'about', label: 'Descreva a empresa em poucas frases (diferenciais, história, o que vocês fazem)', type: 'textarea', required: true },
  { key: 'address', label: 'Endereço completo (rua, número, bairro, cidade, ponto de referência)', type: 'textarea', required: true },
  { key: 'hours', label: 'Horário de funcionamento', type: 'hours', required: true },
  { key: 'holidays', label: 'Funciona em feriados? Alguma observação sobre horários?', type: 'text' },
];

const COMMON_AFTER = [
  { key: 'payment', label: 'Formas de pagamento aceitas', type: 'multi', options: PAYMENTS, required: true },
  { key: 'delivery', label: 'Entrega e retirada', type: 'select', required: true,
    options: ['Só retirada no local', 'Faz entregas', 'Entregas e retirada'] },
  { key: 'delivery_info', label: 'Taxa, área de entrega e prazo (se fizer entregas)', type: 'textarea' },
  { key: 'contact', label: 'Telefone/contato para quando o cliente precisar falar com uma pessoa', type: 'text' },
  { key: 'faq', label: 'Perguntas frequentes e respostas (uma por linha, no formato: Pergunta? Resposta)', type: 'textarea' },
  { key: 'tone', label: 'Tom de voz do atendimento', type: 'select', required: true,
    options: ['Amigável e descontraído', 'Formal e profissional', 'Direto e objetivo'] },
  { key: 'rules', label: 'Regras extras: o que o atendente virtual NUNCA deve fazer ou prometer', type: 'textarea' },
];

const SPECIFIC = {
  restaurante: [
    { key: 'cuisine', label: 'Tipo de culinária / especialidade da casa', type: 'text', required: true },
    { key: 'menu_note', label: 'Como funciona o cardápio? (pratos do dia, combos, promoções, sabores)', type: 'textarea' },
    { key: 'min_order', label: 'Pedido mínimo e tempo médio de preparo/entrega', type: 'text' },
    { key: 'orders_how', label: 'Como o cliente faz o pedido? (pelo WhatsApp mesmo, app, telefone, no balcão)', type: 'textarea', required: true },
    { key: 'reservations', label: 'Aceita reservas de mesa?', type: 'select', options: ['Não', 'Sim, pelo WhatsApp', 'Sim, por telefone'] },
  ],
  farmacia: [
    { key: 'open_24h', label: 'Funciona 24 horas?', type: 'boolean' },
    { key: 'prescription', label: 'Como funciona a venda de medicamentos que exigem receita e de controlados?', type: 'textarea', required: true },
    { key: 'pharmacist', label: 'Horário do farmacêutico responsável', type: 'text' },
    { key: 'pharma_services', label: 'Serviços oferecidos', type: 'multi',
      options: ['Aferição de pressão', 'Teste de glicemia', 'Aplicação de injetáveis', 'Manipulação', 'Entrega de medicamentos', 'Vacinas'] },
    { key: 'insurance', label: 'Convênios, planos e descontos aceitos', type: 'text' },
  ],
  loja: [
    { key: 'categories', label: 'Principais categorias e marcas que vendem', type: 'textarea', required: true },
    { key: 'installments', label: 'Parcelamento (em quantas vezes, com ou sem juros)', type: 'text' },
    { key: 'exchange', label: 'Política de trocas e devoluções', type: 'textarea' },
    { key: 'warranty', label: 'Garantia dos produtos', type: 'text' },
    { key: 'shipping', label: 'Envio para outras cidades? Prazos e transportadoras', type: 'textarea' },
  ],
  assistencia: [
    { key: 'brands', label: 'Marcas e aparelhos que atendem', type: 'textarea', required: true },
    { key: 'services_list', label: 'Principais serviços (troca de tela, bateria, formatação, placa...)', type: 'textarea', required: true },
    { key: 'diagnosis', label: 'Orçamento/diagnóstico é gratuito? Qual o valor, se houver?', type: 'text', required: true },
    { key: 'turnaround', label: 'Prazo médio dos reparos', type: 'text' },
    { key: 'repair_warranty', label: 'Garantia dos serviços e das peças', type: 'text' },
    { key: 'pickup', label: 'Busca e entrega o aparelho do cliente?', type: 'select', options: ['Não', 'Sim', 'Sim, mediante taxa'] },
  ],
  servico: [
    { key: 'services_list', label: 'Serviços oferecidos (com preço, se quiser que o bot informe)', type: 'textarea', required: true },
    { key: 'booking', label: 'Como funciona o agendamento? (pelo WhatsApp, link, telefone, ordem de chegada)', type: 'textarea', required: true },
    { key: 'cancel_policy', label: 'Política de cancelamento/atraso', type: 'text' },
  ],
};

export function questionsFor(type) {
  const group = groupOf(type);
  return [...COMMON_BEFORE, ...(SPECIFIC[group] || []), ...COMMON_AFTER];
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Lista as perguntas obrigatórias ainda sem resposta. */
export function missingRequired(type, answers = {}) {
  return questionsFor(type).filter((q) => q.required && isEmpty(answers[q.key]) && q.type !== 'boolean').map((q) => q.key);
}
