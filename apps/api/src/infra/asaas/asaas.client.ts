import { AsaasClient } from '@alerta-vigia/asaas-sdk'

export const asaasClient = new AsaasClient({
  apiKey: process.env.ASAAS_API_KEY!,
  sandbox: process.env.ASAAS_SANDBOX === 'true',
})
