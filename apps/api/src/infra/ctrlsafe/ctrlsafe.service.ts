const BASE_URL = process.env.CTRLSAFE_API_URL ?? 'https://api.ctrlsafe.com.br/api/functions/v1'

export const CTRLSAFE_EVENT_TYPE: Record<string, string> = {
  PANICO:            'panic',
  PANICO_SILENCIOSO: 'panic',
  COACAO:            'duress',
  FALHA:             'failure',
  CHECKIN:           'checkin',
  ALERTA:            'alert',
}

export interface ContactIdPayload {
  receiver:  string
  line:      string
  account:   string
  event:     string
  partition: string
  zone:      string
}

interface ActivateResponse {
  agentToken: string
  companyId: string
  licenseId: string
  licenseStatus: string
  nextHeartbeatSeconds: number
}

export async function activateCtrlSafe(
  licenseKey: string,
  installationId: string,
  machineName: string,
  machineFingerprint: string,
): Promise<ActivateResponse> {
  const res = await fetch(`${BASE_URL}/hh-agent-activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey, installationId, machineName, machineFingerprint }),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error((data.message ?? data.error ?? res.status) as string)
  return data as unknown as ActivateResponse
}

export async function sendCtrlSafeEvent(
  agentToken: string,
  installationId: string,
  type: string,
  payload: ContactIdPayload,
  occurredAt?: string,
): Promise<{ accepted: boolean; forwarded: boolean }> {
  const body: Record<string, unknown> = { installationId, type, payload }
  if (occurredAt) body.occurredAt = occurredAt

  const res = await fetch(`${BASE_URL}/hh-agent-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-token': agentToken },
    body: JSON.stringify(body),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error((data.message ?? data.error ?? res.status) as string)
  return data as { accepted: boolean; forwarded: boolean }
}
