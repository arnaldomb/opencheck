export type BillingType = 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED'

export type AsaasPaymentStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'CANCELED'

export type AsaasWebhookEvent =
  | 'PAYMENT_CREATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_CANCELED'
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_UPDATED'
  | 'SUBSCRIPTION_INACTIVATED'
  | 'SUBSCRIPTION_DELETED'

export interface AsaasConfig {
  apiKey: string
  sandbox?: boolean
}

export interface AsaasCustomer {
  id: string
  name: string
  email: string
  cpfCnpj?: string
  phone?: string
  mobilePhone?: string
  address?: string
  addressNumber?: string
  province?: string
  postalCode?: string
  dateCreated: string
  deleted: boolean
}

export interface CreateCustomerInput {
  name: string
  email: string
  cpfCnpj?: string
  phone?: string
  mobilePhone?: string
  address?: string
  addressNumber?: string
  province?: string
  postalCode?: string
}

export interface AsaasSubscription {
  id: string
  customer: string
  billingType: BillingType
  value: number
  cycle: string
  nextDueDate: string
  status: 'ACTIVE' | 'INACTIVE'
  description: string
  externalReference?: string
  deleted: boolean
  dateCreated: string
}

export interface CreateSubscriptionInput {
  customer: string
  billingType: BillingType
  nextDueDate: string
  value: number
  cycle: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'BIWEEKLY' | 'QUARTERLY' | 'SEMIANNUAL'
  description: string
  externalReference?: string
  creditCard?: {
    holderName: string
    number: string
    expiryMonth: string
    expiryYear: string
    ccv: string
  }
  creditCardHolderInfo?: {
    name: string
    email: string
    cpfCnpj: string
    postalCode: string
    addressNumber: string
    phone?: string
    mobilePhone?: string
  }
  discount?: { value: number; dueDateLimitDays: number; type: 'PERCENTAGE' | 'FIXED' }
  fine?: { value: number; type: 'PERCENTAGE' | 'FIXED' }
  interest?: { value: number; type: 'PERCENTAGE' }
}

export interface UpdateSubscriptionInput {
  value?: number
  billingType?: BillingType
  cycle?: string
  nextDueDate?: string
  description?: string
  updatePendingPayments?: boolean
}

export interface AsaasPayment {
  id: string
  subscription?: string
  customer: string
  value: number
  netValue: number
  status: AsaasPaymentStatus
  billingType: BillingType
  dueDate: string
  paymentDate?: string
  description: string
  externalReference?: string
  invoiceUrl?: string
  bankSlipUrl?: string
  nossoNumero?: string
}

export interface CreateWebhookInput {
  url: string
  email?: string
  apiVersion?: string
  enabled?: boolean
  interrupted?: boolean
  authToken?: string
  events: AsaasWebhookEvent[]
}

export interface AsaasWebhook {
  id: string
  url: string
  email?: string
  enabled: boolean
  interrupted: boolean
  authToken?: string
  events: AsaasWebhookEvent[]
}

export interface AsaasWebhookPayload {
  id: string
  event: AsaasWebhookEvent
  dateCreated: string
  payment?: AsaasPayment
  subscription?: AsaasSubscription
}

export interface AsaasPaginatedResponse<T> {
  object: 'list'
  hasMore: boolean
  totalCount: number
  limit: number
  offset: number
  data: T[]
}
