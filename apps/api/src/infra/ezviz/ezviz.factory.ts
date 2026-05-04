import { EzvizClient } from '@alerta-vigia/ezviz-sdk'

export function getEzvizClient(): EzvizClient {
  const appKey    = process.env.EZVIZ_APP_KEY
  const appSecret = process.env.EZVIZ_APP_SECRET
  if (!appKey || !appSecret) throw new Error('EZVIZ_APP_KEY / EZVIZ_APP_SECRET não configurados no servidor')
  return new EzvizClient({ appKey, appSecret })
}
