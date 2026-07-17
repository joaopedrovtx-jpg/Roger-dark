/** Mock data do Painel Admin — DarkPay */

export type UserStatus = "ativo" | "bloqueado" | "pendente";
export type DocReviewStatus = "pendente" | "aprovado" | "rejeitado";
export type AdminSaqueStatus = "pago" | "recusado" | "processando";
export type AdquirenteStatus = "ativo" | "inativo" | "manutencao";

/** PF = CPF · PJ = CNPJ + contrato social */
export type PersonType = "pf" | "pj";

/** Tipos de documento com preview de imagem */
export type SellerDocKind =
  | "selfie"
  | "doc_frente"
  | "doc_verso"
  | "contrato_social";

/** Taxas personalizadas do seller (MDR + saque) */
export interface SellerFees {
  /** % MDR sobre transação (ex.: 3.00) */
  mdrPercent: number;
  /** Fixo por transação em R$ */
  mdrFixed: number;
  /** % sobre saque */
  saquePercent: number;
  /** Fixo por saque em R$ */
  saqueFixed: number;
}

/** Adquirente personalizado (ex.: rota “Quente”) só deste seller */
export interface SellerCustomAdquirente {
  id: string;
  name: string;
  feePercent: number;
  feeFixed: number;
  settlement: string;
  enabled: boolean;
}

export const DEFAULT_SELLER_FEES: SellerFees = {
  mdrPercent: 3.0,
  mdrFixed: 0.15,
  /** Taxa de saque da plataforma (lucro admin) */
  saquePercent: 3.0,
  saqueFixed: 0,
};

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  document: string;
  phone: string;
  status: UserStatus;
  createdAt: string;
  balance: number;
  /** Saldo retido na conta do seller (reserva / hold) */
  heldBalance: number;
  volumeTotal: number;
  /** Lucro da plataforma sobre a movimentação do seller */
  platformProfit: number;
  /** Pessoa física (CPF) ou jurídica (CNPJ) */
  personType: PersonType;
  /** Dados completos (preview na lista; detalhe no modal) */
  displayName?: string;
  company?: string;
  cnpj?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** Taxas da conta (editáveis no modal) */
  fees?: SellerFees;
  /** IDs de adquirentes da plataforma liberados para este seller */
  adquirenteIds?: string[];
  /**
   * Roteamento:
   * - "plataforma" → usa a ordem (prioridade) global: principal → fallbacks
   * - "personalizado" → força uma adquirente (nicho white/black ou alerta)
   */
  routingMode?: "plataforma" | "personalizado";
  /** Adquirente preferida quando routingMode = personalizado */
  preferredAdquirenteId?: string | null;
  /** Adquirentes personalizados deste seller */
  customAdquirentes?: SellerCustomAdquirente[];
  /** Saque automático liberado para o seller */
  saqueAutomatico?: boolean;
}

export interface AdminDocument {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  type: string;
  typeLabel: string;
  submittedAt: string;
  status: DocReviewStatus;
  notes?: string;
  /** Kind para preview visual no detalhe do seller */
  kind?: SellerDocKind;
  /** URL da imagem de preview (mock) */
  previewUrl?: string | null;
}

/** Documentos exigidos por tipo de conta */
export function requiredDocsForPersonType(
  personType: PersonType
): Array<{ kind: SellerDocKind; typeLabel: string }> {
  if (personType === "pj") {
    return [
      { kind: "doc_frente", typeLabel: "Documento (frente)" },
      { kind: "doc_verso", typeLabel: "Documento (verso)" },
      { kind: "selfie", typeLabel: "Selfie com documento" },
      { kind: "contrato_social", typeLabel: "Contrato social" },
    ];
  }
  // PF (CPF)
  return [
    { kind: "selfie", typeLabel: "Selfie" },
    { kind: "doc_frente", typeLabel: "Documento (frente)" },
    { kind: "doc_verso", typeLabel: "Documento (verso)" },
  ];
}

/** Monta previews de documentos do seller (mock com placeholders) */
export function getSellerDocPreviews(user: AdminUser): Array<{
  kind: SellerDocKind;
  typeLabel: string;
  status: DocReviewStatus;
  submittedAt?: string;
  previewUrl: string | null;
  notes?: string;
}> {
  const required = requiredDocsForPersonType(user.personType);
  const existing = adminDocumentsMock.filter((d) => d.userId === user.id);

  return required.map((req) => {
    const found = existing.find(
      (d) => d.kind === req.kind || d.type === req.kind
    );
    // Conta ativa → todos os docs aprovados (não deixa nenhum em análise)
    let status: DocReviewStatus =
      found?.status ?? (user.status === "ativo" ? "aprovado" : "pendente");
    if (user.status === "ativo") {
      status = "aprovado";
    } else if (user.status === "pendente" && !found) {
      status = "pendente";
    }
    return {
      kind: req.kind,
      typeLabel: req.typeLabel,
      status,
      submittedAt: found?.submittedAt,
      previewUrl: found?.previewUrl ?? null,
      notes: found?.notes,
    };
  });
}

export interface AdminSaque {
  id: string;
  userId: string;
  userName: string;
  date: string;
  amount: number;
  method: "PIX";
  destination: string;
  status: AdminSaqueStatus;
  /** Taxa % cobrada neste saque (editável no admin) */
  feePercent: number;
  /** Taxa fixa em R$ (editável no admin) */
  feeFixed: number;
}

/** Valor da taxa de um saque */
export function saqueFeeAmount(s: Pick<AdminSaque, "amount" | "feePercent" | "feeFixed">): number {
  return (s.amount * s.feePercent) / 100 + s.feeFixed;
}

export interface Adquirente {
  id: string;
  name: string;
  code: string;
  status: AdquirenteStatus;
  feePercent: number;
  feeFixed: number;
  volumeMes: number;
  transactionsMes: number;
  settlement: string;
  priority: number;
  /** Taxa de conversão de pagamentos (0–100) — exibida no admin em vez da taxa MDR */
  conversionRate: number;
}

export interface AdminMetrics {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  blockedUsers: number;
  pendingDocs: number;
  pendingSaques: number;
  pendingSaquesAmount: number;
  volumeProcessed: number;
  platformRevenue: number;
  activeAdquirentes: number;
  totalTransactions: number;
  averageTicket: number;
  /** Soma do saldo retido de todos os sellers */
  totalHeldBalance: number;
  /** Taxa de conversão de pagamentos (0–100) */
  conversionRate: number;
}

export const adminUserMock = {
  name: "Admin DarkPay",
  avatarUrl: null as string | null,
};

export interface TopSeller {
  rank: number;
  name: string;
  revenue: number;
  initials: string;
}

/** Top 10 sellers mais faturados (ranking / pódio) */
export type GerenteStatus = "ativo" | "inativo";

/** Habilidades / áreas do painel liberadas para o gerente */
export type GerentePermission =
  | "dashboard"
  | "usuarios"
  | "documentos"
  | "saques"
  | "adquirentes"
  | "gerentes";

export const GERENTE_PERMISSION_OPTIONS: Array<{
  id: GerentePermission;
  label: string;
  description: string;
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Visão geral e métricas da plataforma",
  },
  {
    id: "usuarios",
    label: "Usuários",
    description: "Listar e gerenciar sellers",
  },
  {
    id: "documentos",
    label: "Documentos",
    description: "Revisar e aprovar documentos",
  },
  {
    id: "saques",
    label: "Saques",
    description: "Aprovar e recusar saques",
  },
  {
    id: "adquirentes",
    label: "Adquirentes",
    description: "Configurar adquirentes e rotas",
  },
  {
    id: "gerentes",
    label: "Gerentes",
    description: "Ver e gerenciar outros gerentes",
  },
];

export const DEFAULT_GERENTE_PERMISSIONS: GerentePermission[] = [
  "dashboard",
  "usuarios",
  "documentos",
  "saques",
];

export interface AdminGerente {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: GerenteStatus;
  sellersCount: number;
  volumeTotal: number;
  createdAt: string;
  /** Seller de origem (quando promovido a gerente) */
  userId?: string;
  /** CPF do seller de origem */
  document?: string;
  /** Permissões liberadas no painel */
  permissions: GerentePermission[];
}

export const adminGerentesMock: AdminGerente[] = [
  {
    id: "mgr_01",
    name: "Marina Alves",
    email: "marina.alves@darkpay.app",
    phone: "(11) 99100-2200",
    status: "ativo",
    sellersCount: 42,
    volumeTotal: 1_820_400.0,
    createdAt: "2025-03-12T10:00:00",
    permissions: [
      "dashboard",
      "usuarios",
      "documentos",
      "saques",
      "adquirentes",
      "gerentes",
    ],
  },
  {
    id: "mgr_02",
    name: "Ricardo Pires",
    email: "ricardo.pires@darkpay.app",
    phone: "(21) 98811-3344",
    status: "ativo",
    sellersCount: 28,
    volumeTotal: 990_250.5,
    createdAt: "2025-05-08T14:30:00",
    permissions: DEFAULT_GERENTE_PERMISSIONS,
  },
  {
    id: "mgr_03",
    name: "Juliana Costa",
    email: "juliana.costa@darkpay.app",
    phone: "(31) 97722-5566",
    status: "ativo",
    sellersCount: 35,
    volumeTotal: 1_245_800.0,
    createdAt: "2025-06-20T09:15:00",
    permissions: ["dashboard", "usuarios", "documentos", "saques"],
  },
  {
    id: "mgr_04",
    name: "Pedro Nogueira",
    email: "pedro.nogueira@darkpay.app",
    phone: "(41) 99633-7788",
    status: "inativo",
    sellersCount: 0,
    volumeTotal: 210_500.0,
    createdAt: "2025-01-18T11:40:00",
    permissions: ["dashboard", "usuarios"],
  },
  {
    id: "mgr_05",
    name: "Camila Duarte",
    email: "camila.duarte@darkpay.app",
    phone: "(51) 98144-9900",
    status: "ativo",
    sellersCount: 19,
    volumeTotal: 640_120.0,
    createdAt: "2025-09-02T16:05:00",
    permissions: DEFAULT_GERENTE_PERMISSIONS,
  },
  {
    id: "mgr_06",
    name: "Thiago Barbosa",
    email: "thiago.barbosa@darkpay.app",
    phone: "(61) 99255-1122",
    status: "inativo",
    sellersCount: 4,
    volumeTotal: 88_300.0,
    createdAt: "2025-04-25T08:50:00",
    permissions: ["dashboard", "saques"],
  },
];

export const topSellersMock: TopSeller[] = [
  { rank: 1, name: "Igor Rocha", revenue: 2_140_500.0, initials: "IR" },
  { rank: 2, name: "Carla Mendes", revenue: 890_220.5, initials: "CM" },
  { rank: 3, name: "Felipe Rocha", revenue: 412_000.0, initials: "FR" },
  { rank: 4, name: "Ana Souza", revenue: 318_900.0, initials: "AS" },
  { rank: 5, name: "Gabriela Nunes", revenue: 96_430.0, initials: "GN" },
  { rank: 6, name: "Diego Alves", revenue: 55_100.0, initials: "DA" },
  { rank: 7, name: "Hugo Martins", revenue: 22_800.0, initials: "HM" },
  { rank: 8, name: "Elena Costa", revenue: 18_450.0, initials: "EC" },
  { rank: 9, name: "Bruno Lima", revenue: 12_200.0, initials: "BL" },
  { rank: 10, name: "Isabela Freitas", revenue: 8_900.0, initials: "IF" },
];

export const adminMetricsMock: AdminMetrics = {
  totalUsers: 248,
  activeUsers: 211,
  pendingUsers: 24,
  blockedUsers: 13,
  pendingDocs: 18,
  pendingSaques: 7,
  pendingSaquesAmount: 86_420.5,
  volumeProcessed: 4_892_340.75,
  platformRevenue: 146_770.22,
  activeAdquirentes: 3,
  totalTransactions: 12_847,
  averageTicket: 380.74,
  totalHeldBalance: 312_480.55,
  conversionRate: 91.4,
};

/** Série do gráfico de movimentação (mesmo formato do faturamento do usuário) */
export const adminVolumeHistoryMock: Array<{
  date: string;
  amount: number;
  grain?: "hour" | "day";
}> = [
  { date: "2025-12-23", amount: 186_400 },
  { date: "2025-12-22", amount: 212_800 },
  { date: "2025-12-21", amount: 168_200 },
  { date: "2025-12-20", amount: 241_500 },
  { date: "2025-12-19", amount: 198_900 },
  { date: "2025-12-18", amount: 175_600 },
  { date: "2025-12-17", amount: 159_300 },
  { date: "2025-12-16", amount: 204_100 },
  { date: "2025-12-15", amount: 171_750 },
  { date: "2025-12-14", amount: 188_920 },
];

/** Tipo unificado: vendas (entrada) + saques (saída) */
export type AdminTxDirection = "entrada" | "saida";
export type AdminTxKind = "venda" | "saque";
export type AdminTxStatus =
  | "pendente"
  | "aprovada"
  | "recusada"
  | "reembolsada"
  | "pago"
  | "processando"
  | "recusado";

export interface AdminLedgerTx {
  id: string;
  date: string;
  userName: string;
  kind: AdminTxKind;
  direction: AdminTxDirection;
  description: string;
  method: "PIX";
  amount: number;
  status: AdminTxStatus;
}

/** Histórico total — entradas (vendas) e saídas (saques), ordenado por data desc */
const adminLedgerRaw: AdminLedgerTx[] = [
  {
    id: "TX-20941",
    date: "2025-12-23T16:45:00",
    userName: "Ana Souza",
    kind: "venda",
    direction: "entrada",
    description: "Curso Digital Pro",
    method: "PIX",
    amount: 297.0,
    status: "aprovada",
  },
  {
    id: "SQ-10495",
    date: "2025-12-23T14:05:00",
    userName: "Ana Souza",
    kind: "saque",
    direction: "saida",
    description: "Saque",
    method: "PIX",
    amount: 8_500.0,
    status: "processando",
  },
  {
    id: "SQ-10482",
    date: "2025-12-23T14:32:00",
    userName: "Igor Rocha",
    kind: "saque",
    direction: "saida",
    description: "Saque",
    method: "PIX",
    amount: 5_000.0,
    status: "pago",
  },
  {
    id: "TX-20938",
    date: "2025-12-23T15:12:00",
    userName: "Bruno Lima",
    kind: "venda",
    direction: "entrada",
    description: "Mentoria 1:1",
    method: "PIX",
    amount: 890.0,
    status: "pendente",
  },
  {
    id: "SQ-10490",
    date: "2025-12-23T11:20:00",
    userName: "Felipe Rocha",
    kind: "saque",
    direction: "saida",
    description: "Saque",
    method: "PIX",
    amount: 15_000.0,
    status: "processando",
  },
  {
    id: "TX-20930",
    date: "2025-12-23T11:08:00",
    userName: "Carla Mendes",
    kind: "venda",
    direction: "entrada",
    description: "E-book Premium",
    method: "PIX",
    amount: 47.9,
    status: "aprovada",
  },
  {
    id: "SQ-10471",
    date: "2025-12-22T09:15:00",
    userName: "Gabriela Nunes",
    kind: "saque",
    direction: "saida",
    description: "Saque",
    method: "PIX",
    amount: 12_450.5,
    status: "pago",
  },
  {
    id: "TX-20922",
    date: "2025-12-22T21:33:00",
    userName: "Diego Alves",
    kind: "venda",
    direction: "entrada",
    description: "Assinatura Mensal",
    method: "PIX",
    amount: 97.0,
    status: "recusada",
  },
  {
    id: "TX-20915",
    date: "2025-12-22T18:05:00",
    userName: "Elena Costa",
    kind: "venda",
    direction: "entrada",
    description: "Pack Templates",
    method: "PIX",
    amount: 129.9,
    status: "aprovada",
  },
  {
    id: "TX-20901",
    date: "2025-12-22T09:40:00",
    userName: "Felipe Rocha",
    kind: "venda",
    direction: "entrada",
    description: "Workshop Live",
    method: "PIX",
    amount: 197.0,
    status: "reembolsada",
  },
  {
    id: "SQ-10460",
    date: "2025-12-20T18:40:00",
    userName: "Igor Rocha",
    kind: "saque",
    direction: "saida",
    description: "Saque",
    method: "PIX",
    amount: 3_200.0,
    status: "processando",
  },
  {
    id: "SQ-10455",
    date: "2025-12-19T11:05:00",
    userName: "Carla Mendes",
    kind: "saque",
    direction: "saida",
    description: "Saque",
    method: "PIX",
    amount: 8_900.0,
    status: "pago",
  },
  {
    id: "TX-20888",
    date: "2025-12-21T14:22:00",
    userName: "Gabriela Nunes",
    kind: "venda",
    direction: "entrada",
    description: "Curso Digital Pro",
    method: "PIX",
    amount: 297.0,
    status: "aprovada",
  },
  {
    id: "SQ-10440",
    date: "2025-12-17T16:22:00",
    userName: "Diego Alves",
    kind: "saque",
    direction: "saida",
    description: "Saque",
    method: "PIX",
    amount: 1_500.0,
    status: "recusado",
  },
  {
    id: "TX-20870",
    date: "2025-12-21T10:15:00",
    userName: "Hugo Martins",
    kind: "venda",
    direction: "entrada",
    description: "Consultoria",
    method: "PIX",
    amount: 1_500.0,
    status: "pendente",
  },
  {
    id: "SQ-10428",
    date: "2025-12-15T08:50:00",
    userName: "Felipe Rocha",
    kind: "saque",
    direction: "saida",
    description: "Saque",
    method: "PIX",
    amount: 25_000.0,
    status: "pago",
  },
];

export const adminLedgerMock: AdminLedgerTx[] = [...adminLedgerRaw].sort(
  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
);

export const adminUsersMock: AdminUser[] = [
  {
    id: "usr_01",
    name: "Igor Rocha",
    email: "igor.rocha@darkpay.app",
    document: "123.456.890-12",
    phone: "(11) 98800-0000",
    status: "ativo",
    createdAt: "2025-08-12T10:00:00",
    balance: 788_901.86,
    heldBalance: 49_306.37,
    volumeTotal: 2_140_500.0,
    platformProfit: 64_215.0,
    personType: "pj",
    displayName: "DarkPay Store",
    company: "DarkPay Soluções LTDA",
    cnpj: "12.345.678/0001-90",
    address: "Av. Paulista, 1000 — cj. 101",
    city: "São Paulo",
    state: "SP",
    zip: "01310-100",
  },
  {
    id: "usr_02",
    name: "Ana Souza",
    email: "ana.souza@email.com",
    document: "234.567.441-90",
    phone: "(21) 97711-2233",
    status: "ativo",
    createdAt: "2025-09-03T14:22:00",
    balance: 42_150.3,
    heldBalance: 5_200.0,
    volumeTotal: 318_900.0,
    platformProfit: 9_567.0,
    personType: "pf",
    displayName: "Ana Digital",
    company: "Ana Souza ME",
    cnpj: "23.456.789/0001-01",
    address: "Rua das Laranjeiras, 220",
    city: "Rio de Janeiro",
    state: "RJ",
    zip: "22240-003",
  },
  {
    id: "usr_03",
    name: "Bruno Lima",
    email: "bruno.lima@loja.com",
    document: "345.678.112-33",
    phone: "(31) 99100-4455",
    status: "pendente",
    createdAt: "2025-12-18T09:10:00",
    balance: 0,
    heldBalance: 0,
    volumeTotal: 0,
    platformProfit: 0,
    personType: "pf",
    displayName: "Loja Bruno",
    company: "Bruno Lima Comércio",
    cnpj: "34.567.890/0001-12",
    address: "Av. Afonso Pena, 1500",
    city: "Belo Horizonte",
    state: "MG",
    zip: "30130-009",
  },
  {
    id: "usr_04",
    name: "Carla Mendes",
    email: "carla@infoprodutos.io",
    document: "456.789.778-01",
    phone: "(11) 96540-8899",
    status: "ativo",
    createdAt: "2025-07-21T16:40:00",
    balance: 125_400.0,
    heldBalance: 18_400.0,
    volumeTotal: 890_220.5,
    platformProfit: 26_706.61,
    personType: "pj",
    displayName: "Infoprodutos CM",
    company: "Carla Mendes Infoprodutos LTDA",
    cnpj: "45.678.901/0001-23",
    address: "Rua Augusta, 500",
    city: "São Paulo",
    state: "SP",
    zip: "01305-000",
  },
  {
    id: "usr_05",
    name: "Diego Alves",
    email: "diego.alves@corp.br",
    document: "567.890.556-22",
    phone: "(48) 98400-1122",
    status: "bloqueado",
    createdAt: "2025-06-02T11:05:00",
    balance: 3_200.0,
    heldBalance: 1_100.0,
    volumeTotal: 55_100.0,
    platformProfit: 1_653.0,
    personType: "pj",
    displayName: "Corp Diego",
    company: "Diego Alves Corp",
    cnpj: "56.789.012/0001-34",
    address: "Rua Felipe Schmidt, 80",
    city: "Florianópolis",
    state: "SC",
    zip: "88010-000",
  },
  {
    id: "usr_06",
    name: "Elena Costa",
    email: "elena.costa@mail.com",
    document: "678.901.334-55",
    phone: "(85) 99221-3344",
    status: "pendente",
    createdAt: "2025-12-20T18:30:00",
    balance: 0,
    heldBalance: 0,
    volumeTotal: 1_200.0,
    platformProfit: 36.0,
    personType: "pf",
    displayName: "Elena Cursos",
    company: "Elena Costa LTDA",
    cnpj: "67.890.123/0001-45",
    address: "Av. Beira Mar, 3200",
    city: "Fortaleza",
    state: "CE",
    zip: "60165-121",
  },
  {
    id: "usr_07",
    name: "Felipe Rocha",
    email: "felipe@digitalhub.com",
    document: "789.012.990-08",
    phone: "(19) 98112-6677",
    status: "ativo",
    createdAt: "2025-10-15T08:15:00",
    balance: 67_890.4,
    heldBalance: 8_750.0,
    volumeTotal: 412_000.0,
    platformProfit: 12_360.0,
    personType: "pj",
    displayName: "Digital Hub",
    company: "Digital Hub Pagamentos",
    cnpj: "78.901.234/0001-56",
    address: "Rua Barão de Jaguara, 1400",
    city: "Campinas",
    state: "SP",
    zip: "13015-002",
  },
  {
    id: "usr_08",
    name: "Gabriela Nunes",
    email: "gabi.nunes@studio.app",
    document: "890.123.221-77",
    phone: "(51) 99880-5566",
    status: "ativo",
    createdAt: "2025-11-01T13:50:00",
    balance: 18_750.0,
    heldBalance: 2_100.0,
    volumeTotal: 96_430.0,
    platformProfit: 2_892.9,
    personType: "pf",
    displayName: "Studio Gabi",
    company: "Gabriela Nunes Studio",
    cnpj: "89.012.345/0001-67",
    address: "Av. Ipiranga, 6681",
    city: "Porto Alegre",
    state: "RS",
    zip: "90619-900",
  },
  {
    id: "usr_09",
    name: "Hugo Martins",
    email: "hugo.m@consultoria.br",
    document: "901.234.665-44",
    phone: "(61) 99334-2211",
    status: "bloqueado",
    createdAt: "2025-05-19T10:20:00",
    balance: 0,
    heldBalance: 500.0,
    volumeTotal: 22_800.0,
    platformProfit: 684.0,
    personType: "pj",
    displayName: "HM Consultoria",
    company: "Hugo Martins Consultoria",
    cnpj: "90.123.456/0001-78",
    address: "SCS Quadra 2, Bloco C",
    city: "Brasília",
    state: "DF",
    zip: "70302-000",
  },
  {
    id: "usr_10",
    name: "Isabela Freitas",
    email: "isabela@academy.com",
    document: "012.345.118-99",
    phone: "(71) 98765-4321",
    status: "pendente",
    createdAt: "2025-12-23T15:05:00",
    balance: 0,
    heldBalance: 0,
    volumeTotal: 0,
    platformProfit: 0,
    personType: "pf",
    displayName: "Academy Isa",
    company: "Isabela Freitas Academy",
    cnpj: "01.234.567/0001-89",
    address: "Av. Sete de Setembro, 1800",
    city: "Salvador",
    state: "BA",
    zip: "40060-001",
  },
];

export const adminDocumentsMock: AdminDocument[] = [
  {
    id: "doc_01",
    userId: "usr_03",
    userName: "Bruno Lima",
    userEmail: "bruno.lima@loja.com",
    type: "rg",
    typeLabel: "Documento de identidade",
    submittedAt: "2025-12-22T10:30:00",
    status: "pendente",
  },
  {
    id: "doc_02",
    userId: "usr_03",
    userName: "Bruno Lima",
    userEmail: "bruno.lima@loja.com",
    type: "selfie",
    typeLabel: "Selfie com documento",
    submittedAt: "2025-12-22T10:35:00",
    status: "pendente",
  },
  {
    id: "doc_03",
    userId: "usr_06",
    userName: "Elena Costa",
    userEmail: "elena.costa@mail.com",
    type: "cnpj",
    typeLabel: "Comprovante de CNPJ",
    submittedAt: "2025-12-21T14:12:00",
    status: "pendente",
  },
  {
    id: "doc_04",
    userId: "usr_06",
    userName: "Elena Costa",
    userEmail: "elena.costa@mail.com",
    type: "endereco",
    typeLabel: "Comprovante de endereço",
    submittedAt: "2025-12-21T14:18:00",
    status: "pendente",
  },
  {
    id: "doc_05",
    userId: "usr_10",
    userName: "Isabela Freitas",
    userEmail: "isabela@academy.com",
    type: "rg",
    typeLabel: "Documento de identidade",
    submittedAt: "2025-12-23T09:00:00",
    status: "pendente",
  },
  {
    id: "doc_06",
    userId: "usr_10",
    userName: "Isabela Freitas",
    userEmail: "isabela@academy.com",
    type: "selfie",
    typeLabel: "Selfie com documento",
    submittedAt: "2025-12-23T09:05:00",
    status: "pendente",
  },
  {
    id: "doc_07",
    userId: "usr_02",
    userName: "Ana Souza",
    userEmail: "ana.souza@email.com",
    type: "endereco",
    typeLabel: "Comprovante de endereço",
    submittedAt: "2025-12-15T16:40:00",
    status: "aprovado",
  },
  {
    id: "doc_08",
    userId: "usr_04",
    userName: "Carla Mendes",
    userEmail: "carla@infoprodutos.io",
    type: "cnpj",
    typeLabel: "Comprovante de CNPJ",
    submittedAt: "2025-12-10T11:20:00",
    status: "aprovado",
  },
  {
    id: "doc_09",
    userId: "usr_05",
    userName: "Diego Alves",
    userEmail: "diego.alves@corp.br",
    type: "rg",
    typeLabel: "Documento de identidade",
    submittedAt: "2025-12-05T08:55:00",
    status: "rejeitado",
    notes: "Documento ilegível / vencido",
  },
  {
    id: "doc_10",
    userId: "usr_08",
    userName: "Gabriela Nunes",
    userEmail: "gabi.nunes@studio.app",
    type: "rg",
    typeLabel: "Documento de identidade",
    submittedAt: "2025-12-19T13:10:00",
    status: "aprovado",
  },
];

export const adminSaquesMock: AdminSaque[] = [
  {
    id: "SQ-10460",
    userId: "usr_01",
    userName: "Igor Rocha",
    date: "2025-12-20T18:40:00",
    amount: 3_200.0,
    method: "PIX",
    destination: "(11) 9••••-4421",
    status: "processando",
    feePercent: 0,
    feeFixed: 10,
  },
  {
    id: "SQ-10412",
    userId: "usr_04",
    userName: "Carla Mendes",
    date: "2025-12-12T13:10:00",
    amount: 4_320.8,
    method: "PIX",
    destination: "•••.•••.890-12",
    status: "processando",
    feePercent: 1.5,
    feeFixed: 0,
  },
  {
    id: "SQ-10490",
    userId: "usr_07",
    userName: "Felipe Rocha",
    date: "2025-12-23T11:20:00",
    amount: 15_000.0,
    method: "PIX",
    destination: "felipe@digitalhub.com",
    status: "processando",
    feePercent: 0,
    feeFixed: 2.5,
  },
  {
    id: "SQ-10495",
    userId: "usr_02",
    userName: "Ana Souza",
    date: "2025-12-23T14:05:00",
    amount: 8_500.0,
    method: "PIX",
    destination: "ana.souza@email.com",
    status: "processando",
    feePercent: 0,
    feeFixed: 10,
  },
  {
    id: "SQ-10482",
    userId: "usr_01",
    userName: "Igor Rocha",
    date: "2025-12-23T14:32:00",
    amount: 5_000.0,
    method: "PIX",
    destination: "•••.•••.890-12",
    status: "pago",
    feePercent: 0,
    feeFixed: 10,
  },
  {
    id: "SQ-10471",
    userId: "usr_08",
    userName: "Gabriela Nunes",
    date: "2025-12-22T09:15:00",
    amount: 12_450.5,
    method: "PIX",
    destination: "empresa@email.com",
    status: "pago",
    feePercent: 1,
    feeFixed: 0,
  },
  {
    id: "SQ-10455",
    userId: "usr_04",
    userName: "Carla Mendes",
    date: "2025-12-19T11:05:00",
    amount: 8_900.0,
    method: "PIX",
    destination: "•••.•••.890-12",
    status: "pago",
    feePercent: 0,
    feeFixed: 1,
  },
  {
    id: "SQ-10440",
    userId: "usr_05",
    userName: "Diego Alves",
    date: "2025-12-17T16:22:00",
    amount: 1_500.0,
    method: "PIX",
    destination: "chave-aleatoria-****",
    status: "recusado",
    feePercent: 0,
    feeFixed: 10,
  },
  {
    id: "SQ-10428",
    userId: "usr_07",
    userName: "Felipe Rocha",
    date: "2025-12-15T08:50:00",
    amount: 25_000.0,
    method: "PIX",
    destination: "felipe@digitalhub.com",
    status: "pago",
    feePercent: 0.5,
    feeFixed: 0,
  },
  {
    id: "SQ-10398",
    userId: "usr_02",
    userName: "Ana Souza",
    date: "2025-12-10T19:45:00",
    amount: 7_100.0,
    method: "PIX",
    destination: "(11) 9••••-4421",
    status: "pago",
    feePercent: 0,
    feeFixed: 10,
  },
];

export const adquirentesMock: Adquirente[] = [
  {
    id: "podpay",
    name: "PodPay",
    code: "PODPAY",
    status: "ativo",
    feePercent: 1.49,
    feeFixed: 0.15,
    volumeMes: 2_140_800.0,
    transactionsMes: 6_420,
    settlement: "D+0",
    priority: 1,
    conversionRate: 94.2,
  },
  {
    id: "velana",
    name: "Velana",
    code: "VELANA",
    status: "ativo",
    /** Custo DarkPay → Velana: R$ 0,80 / TX (sem MDR %) */
    feePercent: 0,
    feeFixed: 0.8,
    volumeMes: 0,
    transactionsMes: 0,
    settlement: "D+0",
    priority: 2,
    conversionRate: 0,
  },
  {
    id: "acq_01",
    name: "SafraPay",
    code: "SAFRA",
    status: "ativo",
    feePercent: 1.49,
    feeFixed: 0.15,
    volumeMes: 1_580_220.5,
    transactionsMes: 4_110,
    settlement: "D+0",
    priority: 3,
    conversionRate: 91.5,
  },
  {
    id: "acq_02",
    name: "Pagar.me",
    code: "PAGARME",
    status: "ativo",
    feePercent: 1.79,
    feeFixed: 0.2,
    volumeMes: 980_400.25,
    transactionsMes: 2_890,
    settlement: "D+1",
    priority: 4,
    conversionRate: 88.7,
  },
  {
    id: "acq_03",
    name: "Mercado Pago",
    code: "MPAGO",
    status: "manutencao",
    feePercent: 1.99,
    feeFixed: 0.0,
    volumeMes: 190_920.0,
    transactionsMes: 427,
    settlement: "D+0",
    priority: 5,
    conversionRate: 82.1,
  },
  {
    id: "acq_04",
    name: "Cielo",
    code: "CIELO",
    status: "inativo",
    feePercent: 1.65,
    feeFixed: 0.25,
    volumeMes: 0,
    transactionsMes: 0,
    settlement: "D+1",
    priority: 6,
    conversionRate: 0,
  },
];
