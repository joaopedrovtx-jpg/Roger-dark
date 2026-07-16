export type DocSectionId =
  | "introducao"
  | "integracao-ia"
  | "autenticacao"
  | "tratamento-erros"
  | "enums"
  | "faq-localizacao"
  | "faq-webhooks-limite"
  | "faq-calculo"
  | "faq-split"
  | "faq-polling"
  | "webhooks-intro"
  | "webhooks-pagamentos"
  | "webhooks-transferencias"
  | "webhooks-chargebacks"
  | "status-api"
  | "produtor-meus-dados"
  | "produtor-meu-saldo"
  | "produtor-testar-credenciais"
  | "consultas-transacao"
  | "consultas-assinaturas"
  | "consultas-transferencia"
  | "depositos-pagamentos"
  | "depositos-receber-pix"
  | "assinaturas-pix"
  | "transferencias-criar"
  | "transferencias-buscar"
  | "outros-taxas-cambio";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface DocNavItem {
  id: DocSectionId;
  label: string;
  group: string;
  method?: HttpMethod;
}

export interface CodeBlock {
  language: string;
  title?: string;
  code: string;
}

export interface DocHeading {
  title: string;
  paragraphs: string[];
  codes?: CodeBlock[];
}

export interface DocSection {
  id: DocSectionId;
  category: string;
  title: string;
  subtitle: string;
  lead: string[];
  headings: DocHeading[];
  method?: HttpMethod;
  path?: string;
}

export const DOCS_NAV: DocNavItem[] = [
  // Comece aqui
  { id: "introducao", label: "Introdução", group: "Comece aqui" },
  { id: "integracao-ia", label: "Integração com IA", group: "Comece aqui" },
  // Informações da API
  { id: "autenticacao", label: "Autenticação", group: "Informações da API" },
  {
    id: "tratamento-erros",
    label: "Tratamento de erros",
    group: "Informações da API",
  },
  {
    id: "enums",
    label: "Enums (Tipos de dados)",
    group: "Informações da API",
  },
  // Dúvidas Frequentes
  {
    id: "faq-localizacao",
    label: "API bloqueada por localização",
    group: "Dúvidas Frequentes",
  },
  {
    id: "faq-webhooks-limite",
    label: "Limite de webhooks via API",
    group: "Dúvidas Frequentes",
  },
  {
    id: "faq-calculo",
    label: "Cálculo do valor da transação",
    group: "Dúvidas Frequentes",
  },
  {
    id: "faq-split",
    label: "Como usar o split via API",
    group: "Dúvidas Frequentes",
  },
  {
    id: "faq-polling",
    label: "Polling bloqueado",
    group: "Dúvidas Frequentes",
  },
  // Webhooks
  { id: "webhooks-intro", label: "Introdução", group: "Webhooks" },
  { id: "webhooks-pagamentos", label: "Pagamentos", group: "Webhooks" },
  {
    id: "webhooks-transferencias",
    label: "Transferências",
    group: "Webhooks",
  },
  {
    id: "webhooks-chargebacks",
    label: "Chargebacks / Disputas",
    group: "Webhooks",
  },
  // Status
  {
    id: "status-api",
    label: "Status da API",
    group: "Status",
    method: "GET",
  },
  // Produtor
  {
    id: "produtor-meus-dados",
    label: "Meus dados",
    group: "Produtor",
    method: "GET",
  },
  {
    id: "produtor-meu-saldo",
    label: "Meu saldo",
    group: "Produtor",
    method: "GET",
  },
  {
    id: "produtor-testar-credenciais",
    label: "Testar credenciais",
    group: "Produtor",
    method: "GET",
  },
  // Consultas
  {
    id: "consultas-transacao",
    label: "Buscar transação",
    group: "Consultas",
    method: "GET",
  },
  {
    id: "consultas-assinaturas",
    label: "Buscar assinaturas",
    group: "Consultas",
    method: "GET",
  },
  {
    id: "consultas-transferencia",
    label: "Buscar transferência",
    group: "Consultas",
    method: "GET",
  },
  // Depósitos
  {
    id: "depositos-pagamentos",
    label: "Pagamentos",
    group: "Depósitos",
  },
  {
    id: "depositos-receber-pix",
    label: "Receber pix",
    group: "Depósitos",
    method: "POST",
  },
  // Assinaturas
  {
    id: "assinaturas-pix",
    label: "Assinatura pix",
    group: "Assinaturas",
    method: "POST",
  },
  // Transferências
  {
    id: "transferencias-criar",
    label: "Criar transferência",
    group: "Transferências",
    method: "POST",
  },
  {
    id: "transferencias-buscar",
    label: "Buscar transferência",
    group: "Transferências",
    method: "GET",
  },
  // Outros
  {
    id: "outros-taxas-cambio",
    label: "Taxas de câmbio",
    group: "Outros",
    method: "GET",
  },
];

const BASE = "https://api.darkpay.app/api/v1";

export const DOCS_SECTIONS: Record<DocSectionId, DocSection> = {
  introducao: {
    id: "introducao",
    category: "Comece aqui",
    title: "Introdução",
    subtitle: "Aprenda a configurar e realizar transações",
    lead: [
      "Bem-vindo(a) à documentação da API da Dark Pay, onde fornecemos todas as ferramentas necessárias para que você possa integrar facilmente funcionalidades de pagamentos e gerenciamento financeiro em sua aplicação. Esta API permite realizar operações como recebimentos via Pix, além de permitir saques, transferências, consulta de saldos e histórico de pagamento.",
      "Nossa API é projetada com foco na segurança e na facilidade de uso, garantindo que você possa implementar funcionalidades complexas com simplicidade e confiabilidade.",
    ],
    headings: [
      {
        title: "Requisições e URL base",
        paragraphs: [
          "A API da Dark Pay é construída sobre os princípios REST, utilizando HTTPS em todas as requisições para garantir a segurança, a integridade e a privacidade dos seus dados. Não são suportadas requisições HTTP sem criptografia.",
          "Utilize a seguinte URL base para todas as suas requisições:",
        ],
        codes: [
          {
            language: "text",
            title: "URL base",
            code: BASE,
          },
        ],
      },
      {
        title: "Autenticação",
        paragraphs: [
          "Todas as requisições autenticadas usam o header Authorization com Bearer Token e a sua secret key. Veja a seção Autenticação em Informações da API.",
        ],
      },
      {
        title: "Formato de Respostas",
        paragraphs: [
          "Todas as respostas são retornadas em JSON. Códigos HTTP 2xx indicam sucesso. Erros seguem o formato padronizado descrito em Tratamento de erros.",
        ],
      },
      {
        title: "Suporte e Dúvidas",
        paragraphs: [
          "Consulte as Dúvidas Frequentes na navegação ou entre em contato com o suporte pelo painel Dark Pay.",
        ],
      },
    ],
  },

  "integracao-ia": {
    id: "integracao-ia",
    category: "Comece aqui",
    title: "Integração com IA",
    subtitle: "Conecte a API Dark Pay a assistentes e automações",
    lead: [
      "Você pode integrar a API Dark Pay a agentes de IA e automações para criar cobranças, consultar status e acionar transferências de forma assistida.",
      "Nunca exponha a chave secreta no prompt, no frontend ou em repositórios públicos.",
    ],
    headings: [
      {
        title: "Boas práticas",
        paragraphs: [
          "Exponha apenas funções controladas (criar cobrança, consultar ID, listar últimos pagamentos).",
          "Valide amount, document e metadata antes de chamar a API.",
          "Use webhooks para confirmar pagamento em vez de polling agressivo.",
        ],
      },
    ],
  },

  autenticacao: {
    id: "autenticacao",
    category: "Informações da API",
    title: "Autenticação",
    subtitle: "Como autenticar suas requisições na API Dark Pay",
    lead: [
      "Gere as chaves em Integrações → API no painel do seller. Use a secret (sk_) no backend do seu cassino/checkout.",
      "O DarkPay é o gateway: você autentica com as chaves da sua conta DarkPay; a adquirente (ex.: PodPay) fica só no servidor DarkPay.",
    ],
    headings: [
      {
        title: "Header obrigatório",
        paragraphs: [
          "Substitua sk_live_xxxxxxxx pela chave secreta da sua conta. Em ambiente de teste, use sk_test_.",
        ],
        codes: [
          {
            language: "bash",
            title: "Criar cobrança PIX",
            code: `curl -X POST ${BASE}/payments \\
  -H "Authorization: Bearer sk_live_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 97.00,
    "description": "Pedido #1001",
    "customerName": "Cliente Final",
    "customerDocument": "52998224725"
  }'`,
          },
        ],
      },
      {
        title: "Chave pública vs secreta",
        paragraphs: [
          "pk_live_ / pk_test_ — Client ID (pode ir em configs; ainda não exponha em frontend público se possível).",
          "sk_live_ / sk_test_ — Client Secret. Só no backend. Nunca no app do jogador, repositório ou prompt de IA.",
          "Também aceito: header X-Api-Key: sk_… ou Basic base64(pk:sk).",
        ],
      },
    ],
  },

  "tratamento-erros": {
    id: "tratamento-erros",
    category: "Informações da API",
    title: "Tratamento de erros",
    subtitle: "Códigos HTTP e formato de erro da API",
    lead: [
      "Quando uma requisição falha, a API retorna um corpo JSON com code, message e opcionalmente details.",
    ],
    headings: [
      {
        title: "Formato padrão",
        paragraphs: ["Exemplo de resposta de erro de validação:"],
        codes: [
          {
            language: "json",
            title: "Error body",
            code: `{
  "error": {
    "code": "invalid_amount",
    "message": "O valor mínimo da cobrança é R$ 1,00",
    "details": { "field": "amount", "min": 100 }
  }
}`,
          },
        ],
      },
      {
        title: "Códigos HTTP comuns",
        paragraphs: [
          "400 — validação · 401 — não autenticado · 403 — sem permissão · 404 — não encontrado · 409 — conflito · 429 — rate limit · 5xx — falha interna.",
        ],
      },
    ],
  },

  enums: {
    id: "enums",
    category: "Informações da API",
    title: "Enums (Tipos de dados)",
    subtitle: "Valores aceitos em status e métodos",
    lead: [
      "Use apenas os valores abaixo em filtros e comparações de status nas requisições e nos webhooks.",
    ],
    headings: [
      {
        title: "Status de pagamento",
        paragraphs: [
          "pending — aguardando pagamento",
          "paid — pago / aprovado",
          "refused — recusado",
          "expired — expirado",
          "refunded — reembolsado",
          "chargedback — chargeback / disputa",
        ],
      },
      {
        title: "Status de transferência",
        paragraphs: [
          "processing — em processamento",
          "paid — concluída",
          "refused — recusada",
        ],
      },
      {
        title: "Método de pagamento",
        paragraphs: ["pix — Pix (principal método suportado)."],
      },
    ],
  },

  "faq-localizacao": {
    id: "faq-localizacao",
    category: "Dúvidas Frequentes",
    title: "API bloqueada por localização",
    subtitle: "Por que minhas requisições são bloqueadas?",
    lead: [
      "Por segurança, algumas regiões ou IPs podem ser bloqueados temporariamente. Se receber 403 com code region_blocked, contate o suporte Dark Pay.",
    ],
    headings: [
      {
        title: "O que fazer",
        paragraphs: [
          "Confirme se está usando a secret key correta e HTTPS.",
          "Evite proxies abertos ou VPNs de data centers em listas de abuso.",
          "Abra um ticket com o request_id retornado no header da resposta.",
        ],
      },
    ],
  },

  "faq-webhooks-limite": {
    id: "faq-webhooks-limite",
    category: "Dúvidas Frequentes",
    title: "Limite de webhooks via API",
    subtitle: "Quantas URLs de webhook posso cadastrar?",
    lead: [
      "Por padrão, cada conta pode registrar até 5 endpoints de webhook ativos. Limites maiores podem ser solicitados ao suporte.",
    ],
    headings: [],
  },

  "faq-calculo": {
    id: "faq-calculo",
    category: "Dúvidas Frequentes",
    title: "Cálculo do valor da transação",
    subtitle: "Como a taxa é aplicada na cobrança",
    lead: [
      "O amount enviado na criação da cobrança é o valor cobrado do pagador. As taxas de MDR (ex.: 3,00% + R$ 0,15 no Pix D+0) são descontadas na liquidação, conforme o plano da conta.",
    ],
    headings: [
      {
        title: "Exemplo",
        paragraphs: [
          "Cobrança de R$ 100,00 (amount: 10000 centavos). Com taxa 3% + R$ 0,15, o líquido aproximado creditado é R$ 96,85.",
        ],
      },
    ],
  },

  "faq-split": {
    id: "faq-split",
    category: "Dúvidas Frequentes",
    title: "Como usar o split via API",
    subtitle: "Divisão de recebíveis entre contas",
    lead: [
      "O split permite repartir o valor de uma cobrança entre a conta principal e recebedores cadastrados. Envie o array splits no body de POST de pagamento quando disponível no seu plano.",
    ],
    headings: [
      {
        title: "Exemplo de payload",
        paragraphs: [],
        codes: [
          {
            language: "json",
            title: "splits",
            code: `{
  "amount": 10000,
  "splits": [
    { "recipient_id": "rc_abc", "percentage": 80 },
    { "recipient_id": "rc_def", "percentage": 20 }
  ]
}`,
          },
        ],
      },
    ],
  },

  "faq-polling": {
    id: "faq-polling",
    category: "Dúvidas Frequentes",
    title: "Polling bloqueado",
    subtitle: "Por que não devo consultar o status em loop",
    lead: [
      "Consultas excessivas aos endpoints de busca podem ser limitadas (429). Prefira webhooks para confirmação de pagamento e use consulta pontual apenas como fallback.",
    ],
    headings: [],
  },

  "webhooks-intro": {
    id: "webhooks-intro",
    category: "Webhooks",
    title: "Introdução a Webhooks",
    subtitle: "Receba eventos no seu servidor em tempo real",
    lead: [
      "Webhooks notificam seu backend quando pagamentos, transferências ou chargebacks mudam de status — sem necessidade de polling.",
    ],
    headings: [
      {
        title: "Configuração",
        paragraphs: [
          "Cadastre a URL do webhook no painel (Integrações) ou via API. A Dark Pay envia POST JSON com o header X-DarkPay-Signature (HMAC-SHA256).",
          "Responda HTTP 2xx em até 5s. Em falha, reintentamos com backoff.",
        ],
      },
      {
        title: "Assinatura",
        paragraphs: [
          "Valide a assinatura com a secret key antes de processar o evento.",
        ],
      },
    ],
  },

  "webhooks-pagamentos": {
    id: "webhooks-pagamentos",
    category: "Webhooks",
    title: "Webhooks de Pagamentos",
    subtitle: "Eventos de cobranças e depósitos",
    lead: [
      "Eventos relacionados a pagamentos Pix e status de cobrança.",
    ],
    headings: [
      {
        title: "Eventos",
        paragraphs: [
          "payment.created · payment.paid · payment.refused · payment.expired · payment.refunded",
        ],
        codes: [
          {
            language: "json",
            title: "payment.paid",
            code: `{
  "id": "evt_91ab",
  "type": "payment.paid",
  "data": {
    "id": "pay_8f2a1c9e",
    "status": "paid",
    "amount": 9900
  }
}`,
          },
        ],
      },
    ],
  },

  "webhooks-transferencias": {
    id: "webhooks-transferencias",
    category: "Webhooks",
    title: "Webhooks de Transferências",
    subtitle: "Eventos de saques e transferências",
    lead: [
      "Receba atualizações quando uma transferência for processada, paga ou recusada.",
    ],
    headings: [
      {
        title: "Eventos",
        paragraphs: [
          "transfer.created · transfer.processing · transfer.paid · transfer.refused",
        ],
      },
    ],
  },

  "webhooks-chargebacks": {
    id: "webhooks-chargebacks",
    category: "Webhooks",
    title: "Chargebacks / Disputas",
    subtitle: "Eventos de contestação e chargeback",
    lead: [
      "Notificações quando uma disputa ou chargeback é aberta, atualizada ou resolvida.",
    ],
    headings: [
      {
        title: "Eventos",
        paragraphs: [
          "chargeback.opened · chargeback.updated · chargeback.won · chargeback.lost",
        ],
      },
    ],
  },

  "status-api": {
    id: "status-api",
    category: "Status",
    title: "Status da API",
    subtitle: "Verifica se a API está operacional",
    method: "GET",
    path: "/status",
    lead: [
      "Endpoint público (ou autenticado, conforme configuração) para health check da API Dark Pay.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${BASE}/status`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl ${BASE}/status`,
          },
          {
            language: "json",
            title: "Response 200",
            code: `{
  "status": "ok",
  "time": "2026-07-12T18:00:00.000Z"
}`,
          },
        ],
      },
    ],
  },

  "produtor-meus-dados": {
    id: "produtor-meus-dados",
    category: "Produtor",
    title: "Meus dados",
    subtitle: "Retorna os dados da conta autenticada",
    method: "GET",
    path: "/producer/me",
    lead: [
      "Obtém nome, e-mail, documento e informações cadastrais do produtor autenticado.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${BASE}/producer/me`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl ${BASE}/producer/me \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
        ],
      },
    ],
  },

  "produtor-meu-saldo": {
    id: "produtor-meu-saldo",
    category: "Produtor",
    title: "Meu saldo",
    subtitle: "Consulta saldos disponíveis, pendentes e retidos",
    method: "GET",
    path: "/producer/balance",
    lead: [
      "Retorna o saldo disponível para saque, o saldo pendente e o retido da conta.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${BASE}/producer/balance`],
        codes: [
          {
            language: "json",
            title: "Response 200",
            code: `{
  "available": 78890186,
  "pending": 19722546,
  "held": 4930637,
  "currency": "BRL"
}`,
          },
        ],
      },
    ],
  },

  "produtor-testar-credenciais": {
    id: "produtor-testar-credenciais",
    category: "Produtor",
    title: "Testar credenciais",
    subtitle: "Valida se a secret key está correta",
    method: "GET",
    path: "/producer/credentials/test",
    lead: [
      "Útil para checar se o token está válido antes de processar operações em produção.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${BASE}/producer/credentials/test`],
        codes: [
          {
            language: "json",
            title: "Response 200",
            code: `{
  "valid": true,
  "environment": "live",
  "account_id": "acc_xxx"
}`,
          },
        ],
      },
    ],
  },

  "consultas-transacao": {
    id: "consultas-transacao",
    category: "Consultas",
    title: "Buscar transação",
    subtitle: "Consulta uma transação pelo ID",
    method: "GET",
    path: "/transactions/{id}",
    lead: [
      "Retorna status, valor, método e metadados de uma transação específica.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${BASE}/transactions/{id}`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl ${BASE}/transactions/pay_8f2a1c9e \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
        ],
      },
    ],
  },

  "consultas-assinaturas": {
    id: "consultas-assinaturas",
    category: "Consultas",
    title: "Buscar assinaturas",
    subtitle: "Lista ou detalha assinaturas Pix",
    method: "GET",
    path: "/subscriptions",
    lead: [
      "Consulte assinaturas recorrentes vinculadas à sua conta, com filtros por status e cliente.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${BASE}/subscriptions`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl "${BASE}/subscriptions?status=active&limit=20" \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
        ],
      },
    ],
  },

  "consultas-transferencia": {
    id: "consultas-transferencia",
    category: "Consultas",
    title: "Buscar transferência",
    subtitle: "Consulta uma transferência pelo ID",
    method: "GET",
    path: "/transfers/{id}",
    lead: [
      "Obtém o status e os detalhes de uma transferência/saque específico.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${BASE}/transfers/{id}`],
      },
    ],
  },

  "depositos-pagamentos": {
    id: "depositos-pagamentos",
    category: "Depósitos",
    title: "Pagamentos",
    subtitle: "Visão geral dos depósitos e recebimentos",
    lead: [
      "A área de Depósitos cobre a criação e o acompanhamento de pagamentos recebidos (principalmente via Pix).",
      "Use Receber pix para criar uma cobrança e as consultas de transação para acompanhar o status.",
    ],
    headings: [
      {
        title: "Fluxo recomendado",
        paragraphs: [
          "1. Crie a cobrança com POST /payments/pix (Receber pix).",
          "2. Exiba o QR Code / copia-e-cola ao cliente.",
          "3. Confirme via webhook payment.paid (ou consulta pontual).",
        ],
      },
    ],
  },

  "depositos-receber-pix": {
    id: "depositos-receber-pix",
    category: "Depósitos",
    title: "Receber pix",
    subtitle: "Cria uma cobrança Pix para receber um pagamento",
    method: "POST",
    path: "/payments/pix",
    lead: [
      "Gera QR Code e EMV (copia-e-cola) para o valor informado. O status inicial é pending.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`POST ${BASE}/payments/pix`],
        codes: [
          {
            language: "json",
            title: "Request",
            code: `{
  "amount": 9900,
  "description": "Pedido #1042",
  "customer": {
    "name": "Ana Souza",
    "document": "12345678909",
    "email": "ana@email.com"
  },
  "expires_in": 3600
}`,
          },
          {
            language: "bash",
            title: "cURL",
            code: `curl -X POST ${BASE}/payments/pix \\
  -H "Authorization: Bearer sk_live_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":9900,"description":"Pedido #1042"}'`,
          },
          {
            language: "json",
            title: "Response 201",
            code: `{
  "id": "pay_8f2a1c9e",
  "status": "pending",
  "amount": 9900,
  "pix": {
    "qr_code": "00020126...6304ABCD",
    "qr_code_base64": "data:image/png;base64,...",
    "expires_at": "2026-07-12T19:00:00.000Z"
  }
}`,
          },
        ],
      },
    ],
  },

  "assinaturas-pix": {
    id: "assinaturas-pix",
    category: "Assinaturas",
    title: "Assinatura pix",
    subtitle: "Cria uma assinatura recorrente via Pix",
    method: "POST",
    path: "/subscriptions/pix",
    lead: [
      "Cria cobranças recorrentes em intervalos definidos (semanal, mensal, anual), usando Pix como meio de pagamento.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`POST ${BASE}/subscriptions/pix`],
        codes: [
          {
            language: "json",
            title: "Request",
            code: `{
  "amount": 4990,
  "interval": "month",
  "description": "Plano Pro",
  "customer": {
    "name": "Bruno Lima",
    "document": "12345678909",
    "email": "bruno@email.com"
  }
}`,
          },
        ],
      },
    ],
  },

  "transferencias-criar": {
    id: "transferencias-criar",
    category: "Transferências",
    title: "Criar transferência",
    subtitle: "Solicita transferência/saque do saldo via Pix",
    method: "POST",
    path: "/transfers",
    lead: [
      "Transfere valor do saldo disponível para uma chave Pix. Pode haver taxa de saque conforme o plano (ex.: 3%).",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`POST ${BASE}/transfers`],
        codes: [
          {
            language: "json",
            title: "Request",
            code: `{
  "amount": 10000,
  "pix_key": "email@empresa.com",
  "pix_key_type": "email"
}`,
          },
        ],
      },
    ],
  },

  "transferencias-buscar": {
    id: "transferencias-buscar",
    category: "Transferências",
    title: "Buscar transferência",
    subtitle: "Consulta uma transferência pelo ID",
    method: "GET",
    path: "/transfers/{id}",
    lead: [
      "Mesmo recurso de consulta de transferência, disponível também no grupo Transferências.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${BASE}/transfers/{id}`],
      },
    ],
  },

  "outros-taxas-cambio": {
    id: "outros-taxas-cambio",
    category: "Outros",
    title: "Taxas de câmbio",
    subtitle: "Consulta taxas de câmbio disponíveis",
    method: "GET",
    path: "/fx/rates",
    lead: [
      "Retorna cotações de câmbio quando o recurso estiver habilitado na conta (operações multi-moeda).",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${BASE}/fx/rates`],
        codes: [
          {
            language: "json",
            title: "Response 200",
            code: `{
  "base": "BRL",
  "rates": {
    "USD": 0.18,
    "EUR": 0.17
  },
  "updated_at": "2026-07-12T18:00:00.000Z"
}`,
          },
        ],
      },
    ],
  },
};
