import {
  AsaasConfig,
  AsaasCustomer,
  AsaasPayment,
  AsaasPaginatedResponse,
  AsaasSubscription,
  AsaasWebhook,
  CreateCustomerInput,
  CreateSubscriptionInput,
  CreateWebhookInput,
  UpdateSubscriptionInput,
} from './types.js'
import { AsaasError, AsaasNotFoundError, AsaasUnauthorizedError, AsaasValidationError } from './errors.js'

export class AsaasClient {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(private readonly config: AsaasConfig) {
    this.baseUrl = config.sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3'
    this.headers = {
      'Content-Type': 'application/json',
      'access_token': config.apiKey,
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401) throw new AsaasUnauthorizedError()
    if (response.status === 404) throw new AsaasNotFoundError(path)

    const data = await response.json() as Record<string, unknown>

    if (!response.ok) {
      if (data.errors && Array.isArray(data.errors)) {
        throw new AsaasValidationError(data.errors as Array<{ code: string; description: string }>)
      }
      throw new AsaasError(String(data.message ?? 'Asaas error'), response.status)
    }

    return data as T
  }

  // ── CUSTOMERS ──────────────────────────────────────────────────────────────

  async createCustomer(data: CreateCustomerInput): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>('POST', '/customers', data)
  }

  async getCustomer(customerId: string): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>('GET', `/customers/${customerId}`)
  }

  async updateCustomer(customerId: string, data: Partial<CreateCustomerInput>): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>('PUT', `/customers/${customerId}`, data)
  }

  // ── SUBSCRIPTIONS ──────────────────────────────────────────────────────────

  async createSubscription(data: CreateSubscriptionInput): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>('POST', '/subscriptions', data)
  }

  async getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>('GET', `/subscriptions/${subscriptionId}`)
  }

  async updateSubscription(subscriptionId: string, data: UpdateSubscriptionInput): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>('PUT', `/subscriptions/${subscriptionId}`, data)
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.request<{ deleted: boolean }>('DELETE', `/subscriptions/${subscriptionId}`)
  }

  async listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
    const result = await this.request<AsaasPaginatedResponse<AsaasPayment>>(
      'GET',
      `/subscriptions/${subscriptionId}/payments`,
    )
    return result.data
  }

  // ── WEBHOOKS ───────────────────────────────────────────────────────────────

  async createWebhook(data: CreateWebhookInput): Promise<AsaasWebhook> {
    return this.request<AsaasWebhook>('POST', '/webhooks', data)
  }

  async listWebhooks(): Promise<AsaasWebhook[]> {
    const result = await this.request<AsaasPaginatedResponse<AsaasWebhook>>('GET', '/webhooks')
    return result.data
  }
}
