export type UserRole = 'SUPER_ADMIN' | 'SALON_ADMIN' | 'PROFESSIONAL' | 'CLIENT';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  salonId?: string;
  photoURL?: string;
  phone?: string;
  createdAt: number;
}

export type BusinessType = 'beauty' | 'health' | 'fitness' | 'services' | 'sports';

export interface Salon {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  planId: string;
  businessType?: BusinessType;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'BLOCKED';
  trialEndsAt: number;
  subscriptionId?: string;
  createdAt: number;
  settings: SalonSettings;
  // Programa de afiliados
  referredBy?: string;       // slug do salão que indicou
  referralCredits?: number;  // meses de crédito acumulados
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'MONTHLY' | 'YEARLY';
  features: {
    maxProfessionals: number;
    maxAppointmentsPerMonth: number;
    hasBooking: boolean;
    hasStore: boolean;
    hasReports: boolean;
    hasAdvancedCustomization: boolean;
    hasWhatsAppIntegration: boolean;
  hasClientRecords?: boolean;
  hasAnamnese?: boolean;
  hasBeforeAfter?: boolean;
    hasCRM: boolean; // CRM disponível nos planos Pro Agenda e Completo
    hasQuotes: boolean; // Módulo de orçamentos
  hasCRMPro: boolean; // CRM Pro standalone (plano invisível)
  hasScoreCheck?: boolean;    // Add-on pago: consulta CPF/Score de crédito
  hasCustomAppointments?: boolean; // Agendamentos com procedimentos customizados
  };
}

export interface Subscription {
  id: string;
  salonId: string;
  planId: string;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  mercadoPagoSubscriptionId?: string;
}

export interface SalonService {
  id: string;
  salonId: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  active: boolean;
  category: string;
  images?: string[];             // URLs Cloudinary (max 5)
  // Sinal/adiantamento
  requireDeposit?: boolean;      // exige pagamento antecipado
  depositPercent?: number;       // % do valor total (ex: 50)
  // Comissão e custos
  commissionPercent?: number;    // % de comissão padrão neste serviço
  materialCost?: number;         // custo de material (R$) descontado antes da comissão
  paymentFeePercent?: number;    // % de taxa de maquininha (descontada antes da comissão)
}

export interface Professional {
  id: string;
  salonId: string;
  userId: string;
  displayName: string;
  bio: string;
  specialties: string[];
  active: boolean;
  photoURL?: string;
  commissionPercent?: number;    // % de comissão padrão do profissional (override por serviço)
}

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED' | 'AWAITING_DEPOSIT';

export type DepositStatus = 'PENDING' | 'PAID_PIX' | 'PAID_ASAAS' | 'NOT_REQUIRED';

export interface Appointment {
  id: string;
  salonId: string;
  clientId: string;
  clientName: string;
  customerEmail?: string;
  customerPhone?: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  totalAmount: number;
  createdAt: number;
  notes?: string;
  reminderSent?: boolean;
  // Sinal/adiantamento
  depositRequired?: boolean;
  depositAmount?: number;
  depositPercent?: number;
  depositStatus?: DepositStatus;
  depositPaidAt?: number;
  depositExpiresAt?: number;     // 30 min após criação
  depositComprovanteUrl?: string;
  locationType?: 'SALON' | 'HOME';
  homeAddress?: Address;
  homeServiceFee?: number;
}

export interface Product {
  id: string;
  salonId: string;
  name: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  stock: number;
  category: string;
  images: string[];
  variants?: ProductVariant[];
  active: boolean;
  createdAt: number;
}

export interface ProductVariant {
  id: string;
  name: string;       // ex: "25ml", "50ml", "100ml", "P", "M", "G"
  price: number;      // preço específico desta variante
  stock: number;
  sku?: string;       // código opcional
}

export type OrderStatus =
  | 'AWAITING_PAYMENT'  // aguardando PIX
  | 'AWAITING_PIX'      // QR Code gerado, aguardando pagamento
  | 'PAID'              // PIX confirmado
  | 'RESERVED'          // reservado (pagar na entrega/retirada)
  | 'PREPARING'         // em preparação
  | 'SHIPPED'           // enviado
  | 'READY_FOR_PICKUP'  // pronto para retirada
  | 'COMPLETED'         // concluído / entregue
  | 'CANCELLED';        // cancelado

export type PaymentMethod =
  | 'PIX'               // PIX online (Asaas)
  | 'CASH'              // dinheiro na entrega
  | 'CARD_MACHINE'      // cartão via maquininha na entrega
  | 'ON_SITE';          // pagamento no local (reserva)

export interface Order {
  id: string;
  salonId: string;
  clientId: string;
  items: OrderItem[];
  totalAmount: number;
  shippingFee: number;
  status: OrderStatus;
  shippingMethod: 'FIXED' | 'PICKUP';
  paymentMethod: PaymentMethod;
  address?: Address;
  paymentId?: string;
  // PIX
  pixQrCode?: string;
  pixQrCodeBase64?: string;
  pixCopyPaste?: string;
  pixExpiresAt?: number;
  asaasPaymentId?: string;
  // Pagamento na entrega
  changeFor?: number;        // troco para (dinheiro)
  cardBrand?: string;        // bandeira do cartão
  // Dados do cliente
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  couponCode?: string;
  discount?: number;
  // Controle
  paidAt?: number;
  createdAt: number;
  updatedAt?: number;
  // Reserva — auto-completa se não confirmada
  reservationExpiresAt?: number;
  reservationReminderSent?: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  variantId?: string;
  image?: string;
  stock?: number;
}

export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface SalonSettings {
  branding: BrandingSettings;
  appearance: AppearanceSettings;
  business: BusinessSettings;
  social: SocialSettings;
  home: HomeSettings;
  cms: CMSSettings;
}

export interface BrandingSettings {
  name: string;
  slogan: string;
  shortDescription: string;
  fullDescription: string;
  logoURL: string;
  faviconURL: string;
  headerName: string;
  footerName: string;
}

export interface AppearanceSettings {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  buttonColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamilyPrimary: string;
  fontFamilySecondary: string;
  buttonStyle: 'rounded' | 'square' | 'pill';
  borderRadius: string;
  theme: 'light' | 'dark' | 'system';
  heroOverlayOpacity: number;
}

export interface BusinessSettings {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  number?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  cnpj: string;
  workingHours: Record<string, { open: string; close: string; lunchStart?: string; lunchEnd?: string; closed: boolean }>;
  slotInterval: number;
  allowDelivery: boolean;
  shippingFee: number;
  allowPickup: boolean;
  pickupMessage: string;
  offerHomeService: boolean;
  homeServiceFee: number;
  pixKey?: string;
  pixKeyType?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  pixOwnerName?: string;
  asaasApiKey?: string;
  ownerNotificationPhone?: string;
  botSalesEnabled?: boolean;
  deliveryEnabled?: boolean;
  deliveryFee?: number;
  deliveryZone?: 'local' | 'national' | 'fixed';
  cepOrigem?: string;
  avgWeightKg?: number;
}

export interface SocialSettings {
  instagram: string;
  facebook: string;
  tiktok: string;
  youtube: string;
  whatsappLink: string;
}

export interface HomeSettings {
  hero: {
    title: string;
    subtitle: string;
    description: string;
    imageURL: string;
    heroLayout: 'background' | 'split';
    button1Text: string;
    button1Link: string;
    button2Text: string;
    button2Link: string;
  };
  benefits: {
    icon: string;
    title: string;
    description: string;
  }[];
  about: {
    title: string;
    text: string;
    imageURL: string;
  };
  featuredServices: string[];
  shopCTA: {
    title: string;
    description: string;
    imageURL: string;
    buttonText: string;
  };
}

export interface CMSSettings {
  privacyPolicy: string;
  termsOfUse: string;
  aboutPage: string;
  contactText: string;
}

export interface BillingEvent {
  id: string;
  salonId: string;
  type: 'SUBSCRIPTION_CREATED' | 'SUBSCRIPTION_UPDATED' | 'PAYMENT_SUCCEEDED' | 'PAYMENT_FAILED' | 'TRIAL_STARTED' | 'TRIAL_ENDING_SOON';
  amount?: number;
  currency?: string;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING';
  metadata?: any;
  createdAt: number;
}

// ─── Avaliações ─────────────────────────────────────────────────────────────
export interface Review {
  id: string;
  salonId: string;
  clientId: string;
  clientName: string;
  professionalId?: string;
  professionalName?: string;
  serviceId?: string;
  serviceName?: string;
  appointmentId?: string;
  rating: number;        // 1-5
  comment?: string;
  createdAt: number;
  reply?: string;        // resposta do salão
  repliedAt?: number;
}

// ─── Fidelidade ─────────────────────────────────────────────────────────────
export interface LoyaltyConfig {
  enabled: boolean;
  pointsPerVisit: number;
  pointsPerReal: number;
  rewardThreshold: number;
  rewardDescription: string;
  rewardValue: number;
}

export interface LoyaltyAccount {
  clientId: string;
  clientName: string;
  salonId: string;
  points: number;
  totalVisits: number;
  totalSpent: number;
  redeemedRewards: number;
  lastVisit?: number;
  updatedAt: number;
}

export interface ContactMessage {
  id: string;
  salonId: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: 'NEW' | 'READ' | 'ARCHIVED';
  createdAt: number;
}

// ─── Orçamentos ──────────────────────────────────────────────────────────────
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'paid' | 'cancelled';
export type QuotePaymentMethod = 'PIX' | 'CREDIT_CARD' | 'BOLETO';

export interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Quote {
  id: string;
  salonId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientCpf?: string;
  items: QuoteItem[];
  subtotal: number;
  discount?: number;
  total: number;
  notes?: string;
  status: QuoteStatus;
  paymentMethod?: QuotePaymentMethod;
  installments?: number;       // parcelamento cartão
  asaasPaymentId?: string;
  asaasPaymentLink?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  boletoUrl?: string;
  paidAt?: number;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── CRM ─────────────────────────────────────────────────────────────────────
export type CRMLeadStatus = 'lead' | 'prospect' | 'client' | 'inactive' | 'vip';
export type CRMInteractionType = 'call' | 'whatsapp' | 'email' | 'visit' | 'note' | 'appointment';

export interface CRMClient {
  id: string;
  salonId: string;
  name: string;
  phone?: string;
  email?: string;
  birthdate?: string;          // YYYY-MM-DD
  address?: string;
  status: CRMLeadStatus;
  tags: string[];
  source?: string;             // ex: "instagram", "indicação", "google"
  notes?: string;              // anotações gerais
  totalSpent: number;
  totalVisits: number;
  lastVisit?: number;          // timestamp
  nextAppointment?: string;    // data YYYY-MM-DD
  returnDate?: string;         // retorno definido pelo profissional YYYY-MM-DD
  returnTime?: string;
  returnNotes?: string;
  professionalId?: string;     // profissional responsável
  professionalName?: string;
  humanTakeover?: boolean;     // atendente assumiu — bot não responde
  lastContact?: number;        // timestamp da última mensagem
  lastMessage?: { text: string; from: string; timestamp: number };
  createdAt: number;
  updatedAt: number;
}

export interface CRMInteraction {
  id: string;
  salonId: string;
  clientId: string;
  type: CRMInteractionType;
  title: string;
  description?: string;
  outcome?: string;
  scheduledAt?: number;        // para follow-ups futuros
  completedAt?: number;
  createdBy: string;           // uid do usuário
  createdByName: string;
  createdAt: number;
}

export interface CRMTask {
  id: string;
  salonId: string;
  clientId?: string;
  clientName?: string;
  title: string;
  description?: string;
  dueDate?: string;            // YYYY-MM-DD
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'done';
  assignedTo?: string;         // uid
  assignedToName?: string;
  createdAt: number;
}

// ─── Ficha do Cliente (adaptável por tipo de negócio) ─────────────────────────
export interface ClientRecord {
  id: string;
  salonId: string;
  clientId?: string;           // uid Firebase se tiver conta
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  // Campos comuns
  notes?: string;              // observações gerais
  allergies?: string;          // alergias (beleza/saúde)
  preferences?: string;        // preferências (beleza/fitness)
  clientCpf?: string;           // CPF para consulta de score
  pendingBalance?: number;      // saldo devedor (fiado)
  // Campos de saúde
  birthdate?: string;
  bloodType?: string;
  medications?: string;        // medicamentos em uso
  medicalHistory?: string;     // histórico médico
  // Sessões/Evoluções
  sessions: ClientSession[];
  createdAt: number;
  updatedAt: number;
  returnDate?: string;        // YYYY-MM-DD — próximo retorno
  returnTime?: string;        // HH:MM
  returnReminderSent?: boolean;
}

export interface ClientSession {
  id: string;
  date: string;                // YYYY-MM-DD
  professionalName?: string;
  title: string;               // ex: "Consulta de retorno", "Sessão 3"
  notes: string;               // evolução / anotações
  attachments?: string[];      // URLs de arquivos
  appointmentId?: string;
}

// ─── Pacotes / Programas ──────────────────────────────────────────────────────
export type PackageStatus = 'active' | 'completed' | 'cancelled' | 'pending_payment';

export interface ServicePackage {
  id: string;
  salonId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientCpf?: string;
  name: string;                // ex: "Plano Ortodôntico", "Pacote 10 sessões"
  description?: string;
  totalSessions: number;
  sessionsUsed: number;
  pricePerSession: number;
  totalPrice: number;
  discount?: number;
  finalPrice: number;
  status: PackageStatus;
  sessions: PackageSession[];
  asaasPaymentId?: string;
  paymentMethod?: string;
  paidAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PackageSession {
  id: string;
  sessionNumber: number;
  description: string;
  scheduledDate?: string;      // YYYY-MM-DD
  completedAt?: number;
  status: 'pending' | 'scheduled' | 'completed' | 'missed';
  appointmentId?: string;
  notes?: string;
}

// ─── Documentos / Receituário ────────────────────────────────────────────────
export type DocumentType = 'prescription' | 'certificate' | 'declaration' | 'report' | 'custom';

export interface MedicalDocument {
  id: string;
  salonId: string;
  clientName: string;
  clientCpf?: string;
  professionalName: string;
  professionalDocument?: string; // CRM, CRO, CREFITO etc.
  type: DocumentType;
  title: string;
  content: string;             // texto do documento
  signatureUrl?: string;        // assinatura digital (base64 PNG)
  pdfUrl?: string;
  createdAt: number;
}

// ─── Bloqueios de Agenda ─────────────────────────────────────────────────────

/**
 * Bloqueia horários recorrentes (ex: treino da escolinha toda segunda 18h-20h)
 * ou pontuais (ex: manutenção dia 15/01 10h-12h).
 * Quadra específica = professionalId. Todas as quadras = 'all'.
 */
// ─── Agendamento Customizado (procedimentos com duração manual) ─────────────
export interface CustomProcedure {
  id: string;
  name: string;            // ex: "Canal dente 36", "Limpeza + Aplicação de flúor"
  durationMinutes: number; // duração deste procedimento em minutos
}

export interface CustomAppointment {
  id: string;
  salonId: string;
  clientName: string;
  clientPhone?: string;
  professionalId?: string;
  professionalName?: string;
  date: string;                // YYYY-MM-DD
  startTime: string;           // HH:MM
  endTime: string;             // HH:MM — calculado automaticamente
  totalDurationMinutes: number;
  procedures: CustomProcedure[];
  notes?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  createdAt: number;
}

export interface ScheduleBlock {
  id: string;
  salonId: string;
  title: string;              // ex: "Treino da escolinha"
  professionalId: string;     // id da quadra/profissional, ou 'all'
  professionalName?: string;
  recurring: boolean;
  dayOfWeek?: number;         // 0=dom … 6=sáb (se recurring=true)
  date?: string;              // YYYY-MM-DD (se recurring=false)
  startTime: string;          // HH:MM
  endTime: string;            // HH:MM
  reason?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Eventos de Agenda ────────────────────────────────────────────────────────

export type SalonEventType = 'closure' | 'promotion';

/**
 * - closure: dia inteiro fechado (bloqueia toda a agenda + notifica clientes)
 * - promotion: horários em destaque com preço especial (notifica clientes)
 */
export interface SalonEvent {
  id: string;
  salonId: string;
  type: SalonEventType;
  title: string;              // ex: "Feriado — fechado amanhã"
  description?: string;
  // Para closure: pode ser um único dia ou período
  date?: string;              // YYYY-MM-DD (um dia só)
  startDate?: string;         // YYYY-MM-DD (início do período)
  endDate?: string;           // YYYY-MM-DD (fim do período)
  // Para promotion: pode restringir horário e serviços
  startTime?: string;         // HH:MM — início da promoção
  endTime?: string;           // HH:MM — fim da promoção
  discountPercent?: number;   // % de desconto (ex: 20)
  serviceIds?: string[];      // quais serviços estão em promoção ([] = todos)
  color: string;              // cor do badge: 'red' | 'amber' | 'green' | 'blue'
  notificationSent: boolean;  // push já enviado?
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Vales / Adiantamentos de Profissionais ───────────────────────────────────
export interface ProfessionalVale {
  id: string;
  salonId: string;
  professionalId: string;
  professionalName: string;
  amount: number;
  description: string;           // ex: "Adiantamento semanal"
  createdAt: number;
  paid: boolean;
  paidAt?: number;
}

// ─── Configuração do Bot WhatsApp ─────────────────────────────────────────────
export interface BotConfig {
  botEnabled: boolean;
  greetingText: string;          // saudação — cliente novo
  greetingTextReturning: string; // saudação — cliente recorrente
  menuText: string;              // opções do menu
  offlineMessage: string;        // fora do horário
  humanKeyword: string;          // palavra para transferir ao humano
  reminderMessage: string;       // lembrete D-1
  reminderHour: number;          // hora de envio do lembrete (0-23)
  confirmationMessage: string;   // confirmação de agendamento
  cancellationMessage: string;   // cancelamento
  audioReplyMessage: string;     // resposta para áudios
  fallbackMessage: string;       // mensagem não entendida
  birthdayMessage: string;       // aniversário (CRM proativo)
  reengagementMessage: string;   // reengajamento (CRM proativo)
  followUpMessage: string;       // follow-up pós-atendimento
  humanMaxAttempts: number;      // tentativas antes de transferir
  agendaHour: number;            // hora do resumo diário da agenda
}
