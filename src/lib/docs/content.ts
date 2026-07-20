/**
 * Documentação pública da API Dark Pay (produção).
 * Base URL real do gateway em VPS: https://darkpays.online
 * Foco: autenticação sk_/pk_ + cobranças Pix + consultas + saques.
 */

export type DocSectionId =
  | "introducao"
  | "integracao-ia"
  | "autenticacao"
  | "tratamento-erros"
  | "enums"
  | "faq-localizacao"
  | "faq-webhooks-limite"
  | "faq-calculo"
  | "faq-polling"
  | "webhooks-intro"
  | "webhooks-pagamentos"
  | "status-api"
  | "conta-me"
  | "conta-saldo"
  | "depositos-pagamentos"
  | "depositos-criar-pix"
  | "depositos-listar"
  | "depositos-consultar"
  | "depositos-sync"
  | "consultas-transacoes"
  | "saques-criar"
  | "saques-listar";

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

/** URL base da API em produção (VPS darkpays.online) */
export const DOCS_ORIGIN = "https://darkpays.online";
export const DOCS_BASE = `${DOCS_ORIGIN}/api/v1`;
export const DOCS_HEALTH = `${DOCS_ORIGIN}/api/health`;

/** @deprecated use DOCS_BASE — mantido se algum import legado existir */
const BASE = DOCS_BASE;

export const DOCS_NAV: DocNavItem[] = [
  { id: "introducao", label: "Introdução", group: "Comece aqui" },
  { id: "integracao-ia", label: "Integração com IA", group: "Comece aqui" },

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
    id: "faq-polling",
    label: "Polling bloqueado",
    group: "Dúvidas Frequentes",
  },

  { id: "webhooks-intro", label: "Introdução", group: "Webhooks" },
  { id: "webhooks-pagamentos", label: "Pagamentos Pix", group: "Webhooks" },

  {
    id: "status-api",
    label: "Status da API",
    group: "Status",
    method: "GET",
  },

  {
    id: "conta-me",
    label: "Minha conta",
    group: "Conta",
    method: "GET",
  },
  {
    id: "conta-saldo",
    label: "Meu saldo / financeiro",
    group: "Conta",
    method: "GET",
  },

  {
    id: "depositos-pagamentos",
    label: "Visão geral Pix",
    group: "Pagamentos Pix",
  },
  {
    id: "depositos-criar-pix",
    label: "Criar cobrança Pix",
    group: "Pagamentos Pix",
    method: "POST",
  },
  {
    id: "depositos-listar",
    label: "Listar cobranças",
    group: "Pagamentos Pix",
    method: "GET",
  },
  {
    id: "depositos-consultar",
    label: "Consultar cobrança",
    group: "Pagamentos Pix",
    method: "GET",
  },
  {
    id: "depositos-sync",
    label: "Sincronizar status",
    group: "Pagamentos Pix",
    method: "POST",
  },

  {
    id: "consultas-transacoes",
    label: "Listar transações",
    group: "Transações",
    method: "GET",
  },

  {
    id: "saques-criar",
    label: "Criar saque Pix",
    group: "Saques",
    method: "POST",
  },
  {
    id: "saques-listar",
    label: "Listar saques",
    group: "Saques",
    method: "GET",
  },
];

export const DOCS_SECTIONS: Record<DocSectionId, DocSection> = {
  introducao: {
    id: "introducao",
    category: "Comece aqui",
    title: "Introdução",
    subtitle: "API de pagamentos Pix do gateway Dark Pay",
    lead: [
      "Bem-vindo(a) à documentação da API Dark Pay. Com ela você cria cobranças Pix (QR Code / copia-e-cola), consulta status, lista transações e solicita saques — tudo autenticado com as chaves da sua conta (pk_ / sk_) geradas em Integrações → API.",
      "O Dark Pay é o gateway: você integra com darkpays.online; a adquirente (PodPay/Velana) fica no servidor e não é exposta ao seu frontend.",
    ],
    headings: [
      {
        title: "URL base (produção)",
        paragraphs: [
          "Todas as rotas de negócio usam HTTPS. Não use HTTP sem TLS.",
          "URL base da API v1:",
        ],
        codes: [
          {
            language: "text",
            title: "Base URL",
            code: DOCS_BASE,
          },
          {
            language: "text",
            title: "Painel / origem",
            code: DOCS_ORIGIN,
          },
        ],
      },
      {
        title: "Primeiros passos",
        paragraphs: [
          "1. Entre no painel → Integrações → API e crie uma credencial (pk_live_… / sk_live_…).",
          "2. Copie a secret completa (botão copiar) e guarde só no backend.",
          "3. Crie uma cobrança com POST /payments (Pix).",
          "4. Exiba o QR / copia-e-cola ao cliente e confirme o pagamento via webhook ou POST …/sync.",
        ],
      },
      {
        title: "Formato",
        paragraphs: [
          "Request e response em JSON. Valores monetários (amount) em reais (BRL), número decimal — mínimo R$ 1,00 (ex.: 97.00).",
          "Códigos HTTP 2xx = sucesso. Erros vêm em JSON com code e message.",
        ],
      },
    ],
  },

  "integracao-ia": {
    id: "integracao-ia",
    category: "Comece aqui",
    title: "Integração com IA",
    subtitle: "Automações e agentes usando a API Pix",
    lead: [
      "Você pode conectar a API a agentes de IA ou automações para criar cobranças e consultar status.",
      "Nunca coloque a sk_ no prompt, no frontend, em repositório público ou em logs abertos.",
    ],
    headings: [
      {
        title: "Boas práticas",
        paragraphs: [
          "Exponha só funções controladas no seu backend (criar Pix, consultar ID, listar últimos pagamentos).",
          "Valide amount, document e metadata antes de chamar a API.",
          "Prefira webhooks ou sync pontual em vez de polling agressivo.",
        ],
      },
    ],
  },

  autenticacao: {
    id: "autenticacao",
    category: "Informações da API",
    title: "Autenticação",
    subtitle: "Bearer sk_ ou sessão do painel",
    lead: [
      "Gere as chaves em Integrações → API. Use a secret (sk_) no backend do seu sistema.",
      "O gateway autentica a sua conta Dark Pay; a adquirente fica só no servidor Dark Pay.",
    ],
    headings: [
      {
        title: "Header obrigatório (API key)",
        paragraphs: [
          "Substitua sk_live_xxxxxxxx pela secret completa da conta. Em teste use sk_test_ se a credencial for de ambiente test.",
        ],
        codes: [
          {
            language: "bash",
            title: "Criar cobrança Pix",
            code: `curl -X POST ${DOCS_BASE}/payments \\
  -H "Authorization: Bearer sk_live_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 97.00,
    "description": "Pedido #1001",
    "customerName": "Cliente Final",
    "customerDocument": "52998224725",
    "customerEmail": "cliente@email.com"
  }'`,
          },
        ],
      },
      {
        title: "Formas aceitas",
        paragraphs: [
          "Authorization: Bearer sk_live_… (recomendado)",
          "X-Api-Key: sk_live_…",
          "Basic base64(pk_live_…:sk_live_…)",
          "Sessão do painel (cookie) — útil em testes logado no darkpays.online",
        ],
      },
      {
        title: "Chave pública vs secreta",
        paragraphs: [
          "pk_live_ / pk_test_ — Client ID (identificação da credencial).",
          "sk_live_ / sk_test_ — Client Secret. Somente no backend. Nunca no app do cliente final.",
        ],
      },
    ],
  },

  "tratamento-erros": {
    id: "tratamento-erros",
    category: "Informações da API",
    title: "Tratamento de erros",
    subtitle: "Códigos HTTP e corpo de erro",
    lead: [
      "Em falha, a API retorna JSON com error.code e error.message (e às vezes hint).",
    ],
    headings: [
      {
        title: "Formato padrão",
        paragraphs: ["Exemplo de validação de valor:"],
        codes: [
          {
            language: "json",
            title: "Error body",
            code: `{
  "error": {
    "code": "invalid_amount",
    "message": "amount obrigatório (mín. R$ 1,00)"
  }
}`,
          },
        ],
      },
      {
        title: "Códigos HTTP comuns",
        paragraphs: [
          "400 validação · 401 não autenticado / secret inválida · 403 sem permissão · 404 não encontrado · 429 rate limit · 503 adquirente/banco indisponível · 5xx falha interna.",
        ],
      },
    ],
  },

  enums: {
    id: "enums",
    category: "Informações da API",
    title: "Enums (Tipos de dados)",
    subtitle: "Status e métodos usados na API Pix",
    lead: [
      "Use estes valores ao comparar status de cobranças e saques.",
    ],
    headings: [
      {
        title: "Status de cobrança / pagamento",
        paragraphs: [
          "waiting_payment / pending — aguardando Pix",
          "paid / aprovada — pago",
          "refused — recusado",
          "expired — expirado",
          "refunded — reembolsado",
        ],
      },
      {
        title: "Status de saque",
        paragraphs: [
          "pending — solicitado",
          "processing — em processamento",
          "paid / approved — concluído",
          "refused / rejected — recusado",
        ],
      },
      {
        title: "Método",
        paragraphs: ["pix — pagamento instantâneo (método principal da API)."],
      },
    ],
  },

  "faq-localizacao": {
    id: "faq-localizacao",
    category: "Dúvidas Frequentes",
    title: "API bloqueada por localização",
    subtitle: "Requisições recusadas por IP / região",
    lead: [
      "Algumas redes ou regiões podem ser bloqueadas por segurança. Se receber 403, confira a secret, use HTTPS e contate o suporte com o horário da falha.",
    ],
    headings: [
      {
        title: "O que fazer",
        paragraphs: [
          "Confirme sk_ completa (não use máscara sk_••••).",
          "Evite proxies abertos de data centers em listas de abuso.",
          "Teste com curl a partir do seu servidor de produção.",
        ],
      },
    ],
  },

  "faq-webhooks-limite": {
    id: "faq-webhooks-limite",
    category: "Dúvidas Frequentes",
    title: "Limite de webhooks via API",
    subtitle: "Quantas URLs posso cadastrar?",
    lead: [
      "No painel (Integrações → Webhooks) você cadastra as URLs que recebem eventos de pagamento. Limites maiores podem ser pedidos ao suporte.",
    ],
    headings: [],
  },

  "faq-calculo": {
    id: "faq-calculo",
    category: "Dúvidas Frequentes",
    title: "Cálculo do valor da transação",
    subtitle: "Como a taxa é aplicada",
    lead: [
      "O amount enviado é o valor cobrado do pagador em reais (ex.: 100.00 = R$ 100,00). MDR e taxas de saque seguem o plano da conta e são descontados na liquidação.",
    ],
    headings: [
      {
        title: "Exemplo",
        paragraphs: [
          "Cobrança amount: 100.00. Com taxa 3% + R$ 0,15, o líquido aproximado creditado é R$ 96,85.",
        ],
      },
    ],
  },

  "faq-polling": {
    id: "faq-polling",
    category: "Dúvidas Frequentes",
    title: "Polling bloqueado",
    subtitle: "Evite consultar status em loop",
    lead: [
      "Consultas excessivas podem retornar 429. Prefira webhooks ou use POST /payments/{id}/sync de forma pontual (ex.: a cada 5–10s enquanto pendente).",
    ],
    headings: [],
  },

  "webhooks-intro": {
    id: "webhooks-intro",
    category: "Webhooks",
    title: "Introdução a Webhooks",
    subtitle: "Eventos no seu servidor",
    lead: [
      "Webhooks avisam seu backend quando um Pix muda de status, sem precisar de polling constante.",
      "Cadastre a URL no painel em Integrações → Webhooks. A Dark Pay envia POST JSON para a sua URL.",
    ],
    headings: [
      {
        title: "Boas práticas",
        paragraphs: [
          "Responda HTTP 2xx rapidamente.",
          "Valide a origem/secret do webhook quando configurado.",
          "Trate eventos de forma idempotente (mesmo id não processa duas vezes).",
        ],
      },
    ],
  },

  "webhooks-pagamentos": {
    id: "webhooks-pagamentos",
    category: "Webhooks",
    title: "Webhooks de Pagamentos Pix",
    subtitle: "Eventos de cobrança",
    lead: [
      "Eventos típicos de ciclo de vida da cobrança Pix.",
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
            title: "Exemplo payment.paid",
            code: `{
  "id": "evt_91ab",
  "type": "payment.paid",
  "data": {
    "id": "pay_8f2a1c9e",
    "status": "paid",
    "amount": 97.00,
    "method": "pix"
  }
}`,
          },
        ],
      },
      {
        title: "Webhooks da adquirente (servidor Dark Pay)",
        paragraphs: [
          "Rotas internas do gateway (não use no seu app de cliente):",
          `${DOCS_ORIGIN}/api/v1/webhooks/podpay`,
          `${DOCS_ORIGIN}/api/v1/webhooks/velana`,
        ],
      },
    ],
  },

  "status-api": {
    id: "status-api",
    category: "Status",
    title: "Status da API",
    subtitle: "Health check do gateway",
    method: "GET",
    path: "/api/health",
    lead: [
      "Endpoint público para verificar se o serviço e o banco estão operacionais.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${DOCS_HEALTH}`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl ${DOCS_HEALTH}`,
          },
          {
            language: "json",
            title: "Response 200",
            code: `{
  "ok": true,
  "service": "darkpay",
  "time": "2026-07-20T04:00:00.000Z",
  "database": "ok",
  "env": "production"
}`,
          },
        ],
      },
    ],
  },

  "conta-me": {
    id: "conta-me",
    category: "Conta",
    title: "Minha conta",
    subtitle: "Dados do usuário autenticado",
    method: "GET",
    path: "/auth/me",
    lead: [
      "Retorna o usuário da sessão ou o vínculo da API key (roles, status, e-mail).",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${DOCS_BASE}/auth/me`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl ${DOCS_BASE}/auth/me \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
        ],
      },
    ],
  },

  "conta-saldo": {
    id: "conta-saldo",
    category: "Conta",
    title: "Meu saldo / financeiro",
    subtitle: "Saldos e resumo financeiro do seller",
    method: "GET",
    path: "/finance",
    lead: [
      "Consulta saldo disponível, pendente, retido e listagens financeiras da conta autenticada.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${DOCS_BASE}/finance`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl ${DOCS_BASE}/finance \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
        ],
      },
    ],
  },

  "depositos-pagamentos": {
    id: "depositos-pagamentos",
    category: "Pagamentos Pix",
    title: "Visão geral Pix",
    subtitle: "Fluxo de recebimento via Pix",
    lead: [
      "Toda cobrança Pix passa por POST /payments. O gateway gera QR Code e código copia-e-cola na adquirente configurada.",
    ],
    headings: [
      {
        title: "Fluxo recomendado",
        paragraphs: [
          `1. POST ${DOCS_BASE}/payments — cria cobrança.`,
          "2. Mostre pix.qrCode / pix.copyPaste ao pagador.",
          `3. Confirme com webhook ou POST ${DOCS_BASE}/payments/{id}/sync.`,
          `4. Consulte a qualquer momento com GET ${DOCS_BASE}/payments/{id}.`,
        ],
      },
    ],
  },

  "depositos-criar-pix": {
    id: "depositos-criar-pix",
    category: "Pagamentos Pix",
    title: "Criar cobrança Pix",
    subtitle: "Gera QR Code e copia-e-cola",
    method: "POST",
    path: "/payments",
    lead: [
      "Cria uma cobrança Pix real na conta do seller autenticado. amount em reais (mín. 1.00).",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`POST ${DOCS_BASE}/payments`],
        codes: [
          {
            language: "json",
            title: "Request body",
            code: `{
  "amount": 97.00,
  "description": "Pedido #1042",
  "customerName": "Ana Souza",
  "customerDocument": "52998224725",
  "customerEmail": "ana@email.com",
  "customerPhone": "11999999999",
  "metadata": {
    "orderId": "1042"
  }
}`,
          },
          {
            language: "bash",
            title: "cURL",
            code: `curl -X POST ${DOCS_BASE}/payments \\
  -H "Authorization: Bearer sk_live_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 97.00,
    "description": "Pedido #1042",
    "customerName": "Ana Souza",
    "customerDocument": "52998224725"
  }'`,
          },
          {
            language: "json",
            title: "Response 201",
            code: `{
  "id": "pay_8f2a1c9e",
  "status": "waiting_payment",
  "amount": 97,
  "currency": "BRL",
  "method": "pix",
  "provider": "velana",
  "real": true,
  "pix": {
    "qrCode": "00020126...6304ABCD",
    "copyPaste": "00020126...6304ABCD"
  },
  "expiresAt": "2026-07-20T19:00:00.000Z",
  "createdAt": "2026-07-20T18:00:00.000Z",
  "syncUrl": "/api/v1/payments/pay_8f2a1c9e/sync"
}`,
          },
        ],
      },
      {
        title: "Campos",
        paragraphs: [
          "amount (obrigatório) — número ≥ 1 (reais).",
          "description — texto do pedido.",
          "customerName / customerDocument / customerEmail / customerPhone — dados do pagador (documento ajuda a adquirente).",
          "metadata — objeto string→string opcional.",
        ],
      },
    ],
  },

  "depositos-listar": {
    id: "depositos-listar",
    category: "Pagamentos Pix",
    title: "Listar cobranças",
    subtitle: "Histórico de cobranças Pix da conta",
    method: "GET",
    path: "/payments",
    lead: [
      "Lista as cobranças do seller autenticado (mais recentes primeiro).",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${DOCS_BASE}/payments`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl ${DOCS_BASE}/payments \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
        ],
      },
    ],
  },

  "depositos-consultar": {
    id: "depositos-consultar",
    category: "Pagamentos Pix",
    title: "Consultar cobrança",
    subtitle: "Detalhe de uma cobrança pelo ID",
    method: "GET",
    path: "/payments/{id}",
    lead: [
      "Retorna status, valor, Pix e datas de uma cobrança específica da sua conta.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${DOCS_BASE}/payments/{id}`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl ${DOCS_BASE}/payments/pay_8f2a1c9e \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
          {
            language: "json",
            title: "Response 200",
            code: `{
  "id": "pay_8f2a1c9e",
  "status": "paid",
  "amount": 97,
  "method": "pix",
  "pix": {
    "qrCode": "00020126...",
    "copyPaste": "00020126..."
  },
  "paidAt": "2026-07-20T18:05:00.000Z",
  "real": true
}`,
          },
        ],
      },
    ],
  },

  "depositos-sync": {
    id: "depositos-sync",
    category: "Pagamentos Pix",
    title: "Sincronizar status",
    subtitle: "Consulta a adquirente e atualiza a cobrança",
    method: "POST",
    path: "/payments/{id}/sync",
    lead: [
      "Força a sincronização do status do Pix com a adquirente. Use quando o pagamento acabou de ser feito e o webhook ainda não chegou.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`POST ${DOCS_BASE}/payments/{id}/sync`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl -X POST ${DOCS_BASE}/payments/pay_8f2a1c9e/sync \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
        ],
      },
    ],
  },

  "consultas-transacoes": {
    id: "consultas-transacoes",
    category: "Transações",
    title: "Listar transações",
    subtitle: "Extrato de movimentos da conta",
    method: "GET",
    path: "/transactions",
    lead: [
      "Lista transações (entradas/saídas) do seller autenticado, com filtros opcionais de período e status.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${DOCS_BASE}/transactions`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl "${DOCS_BASE}/transactions" \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
        ],
      },
    ],
  },

  "saques-criar": {
    id: "saques-criar",
    category: "Saques",
    title: "Criar saque Pix",
    subtitle: "Transfere saldo disponível para chave Pix",
    method: "POST",
    path: "/withdrawals",
    lead: [
      "Solicita saque do saldo disponível para uma chave Pix. amount em reais; pixKey obrigatória.",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`POST ${DOCS_BASE}/withdrawals`],
        codes: [
          {
            language: "json",
            title: "Request",
            code: `{
  "amount": 50.00,
  "pixKey": "luanmick121@gmail.com"
}`,
          },
          {
            language: "bash",
            title: "cURL",
            code: `curl -X POST ${DOCS_BASE}/withdrawals \\
  -H "Authorization: Bearer sk_live_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":50.00,"pixKey":"chave@email.com"}'`,
          },
        ],
      },
    ],
  },

  "saques-listar": {
    id: "saques-listar",
    category: "Saques",
    title: "Listar saques",
    subtitle: "Histórico de saques da conta",
    method: "GET",
    path: "/withdrawals",
    lead: [
      "Lista saques do seller. Filtro opcional: ?status=pending",
    ],
    headings: [
      {
        title: "Endpoint",
        paragraphs: [`GET ${DOCS_BASE}/withdrawals`],
        codes: [
          {
            language: "bash",
            title: "cURL",
            code: `curl "${DOCS_BASE}/withdrawals" \\
  -H "Authorization: Bearer sk_live_xxxxxxxx"`,
          },
        ],
      },
    ],
  },
};
