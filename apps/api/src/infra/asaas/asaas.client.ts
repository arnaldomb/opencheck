import { AsaasClient } from '@opencheck/asaas-sdk'

export const asaasClient = new AsaasClient({
  apiKey: process.env.ASAAS_API_KEY!,
  sandbox: process.env.ASAAS_SANDBOX === 'true',
})
