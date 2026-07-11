// Cliente Z-API (https://developer.z-api.io)
// Cada tenant informa as credenciais da própria instância: instanceId + token
// (do painel Z-API) e o Client-Token de segurança da conta.

export interface ZapiConfig {
  instanceId: string
  token: string
  clientToken?: string | null
}

export interface ZapiGrupo {
  id: string      // ex.: "120363019502650977-group"
  nome: string
}

// Monta a config a partir do registro ConfigNotificacao do tenant.
// O Client-Token pode ser por tenant ou global (env ZAPI_CLIENT_TOKEN),
// já que as instâncias são da conta Z-API do administrador da plataforma.
export function zapiConfigFrom(cfg: {
  zapiInstanceId?: string | null
  zapiToken?: string | null
  zapiClientToken?: string | null
} | null | undefined): ZapiConfig | null {
  if (!cfg?.zapiInstanceId || !cfg?.zapiToken) return null
  return {
    instanceId:  cfg.zapiInstanceId,
    token:       cfg.zapiToken,
    clientToken: cfg.zapiClientToken ?? process.env.ZAPI_CLIENT_TOKEN ?? null,
  }
}

const BASE = 'https://api.z-api.io'

function baseUrl(cfg: ZapiConfig): string {
  return `${BASE}/instances/${cfg.instanceId}/token/${cfg.token}`
}

async function zapiFetch(cfg: ZapiConfig, path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(cfg.clientToken ? { 'Client-Token': cfg.clientToken } : {}),
    ...(options.headers as Record<string, string> ?? {}),
  }
  return fetch(`${baseUrl(cfg)}${path}`, { ...options, headers })
}

async function zapiJson<T>(cfg: ZapiConfig, path: string, options: RequestInit = {}): Promise<T> {
  const res = await zapiFetch(cfg, path, options)
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`Z-API ${path} ${res.status}: ${text.slice(0, 300)}`)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Z-API ${path}: resposta inválida`)
  }
}

// ─── Instância ────────────────────────────────────────────────────────────────

export interface ZapiStatus {
  connected: boolean
  smartphoneConnected?: boolean
  error?: string
}

export async function getStatus(cfg: ZapiConfig): Promise<ZapiStatus> {
  const raw = await zapiJson<Record<string, unknown>>(cfg, '/status')
  return {
    connected: raw.connected === true,
    smartphoneConnected: raw.smartphoneConnected === true,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  }
}

// QR code em base64 (data URI) para exibir no painel.
// Só retorna QR enquanto a instância não estiver conectada.
export async function getQrCodeImage(cfg: ZapiConfig): Promise<string | null> {
  const raw = await zapiJson<Record<string, unknown>>(cfg, '/qr-code/image')
  let value = typeof raw.value === 'string' ? raw.value : null
  if (!value && typeof raw.qrcode === 'string') value = raw.qrcode
  if (!value) return null
  // Algumas versões retornam só o base64, sem o prefixo data URI
  if (!value.startsWith('data:')) value = `data:image/png;base64,${value}`
  return value
}

export async function disconnect(cfg: ZapiConfig): Promise<void> {
  await zapiFetch(cfg, '/disconnect').catch(() => {})
}

// ─── Grupos ───────────────────────────────────────────────────────────────────

function normalizeGrupo(item: unknown): ZapiGrupo | null {
  if (!item || typeof item !== 'object') return null
  const obj = item as Record<string, unknown>
  const id = (obj.phone as string | undefined) ?? (obj.id as string | undefined)
  if (!id) return null
  const isGroup = obj.isGroup === true || String(id).includes('-group')
  if (!isGroup) return null
  const nome = (obj.name as string | undefined) ?? (obj.subject as string | undefined) ?? id
  return { id: String(id), nome }
}

async function listAllPages(cfg: ZapiConfig, path: string): Promise<ZapiGrupo[]> {
  const grupos: ZapiGrupo[] = []
  for (let page = 1; page <= 5; page++) {
    const raw = await zapiJson<unknown>(cfg, `${path}?page=${page}&pageSize=100`)
    const arr = Array.isArray(raw) ? raw : []
    grupos.push(...(arr.map(normalizeGrupo).filter(Boolean) as ZapiGrupo[]))
    if (arr.length < 100) break // última página (conta itens brutos, não só grupos)
  }
  return grupos
}

export async function listGroups(cfg: ZapiConfig): Promise<ZapiGrupo[]> {
  // Endpoint dedicado /groups; fallback em /chats filtrando grupos
  let grupos: ZapiGrupo[]
  try {
    grupos = await listAllPages(cfg, '/groups')
  } catch {
    grupos = await listAllPages(cfg, '/chats')
  }
  const seen = new Set<string>()
  return grupos.filter(g => {
    if (seen.has(g.id)) return false
    seen.add(g.id)
    return true
  })
}

// ─── Envio ────────────────────────────────────────────────────────────────────

// Número individual: só dígitos com DDI (5511999999999).
// Grupo: usa o id como veio da listagem (ex.: "1203...-group").
function resolvePhone(dest: string): string {
  if (dest.includes('-group') || dest.includes('@')) return dest.replace('@g.us', '-group')
  return dest.replace(/[^\d]/g, '').replace(/^0+/, '')
}

export async function sendWhatsAppText(cfg: ZapiConfig, to: string, message: string): Promise<void> {
  const phone = resolvePhone(to)
  await zapiJson(cfg, '/send-text', {
    method: 'POST',
    body: JSON.stringify({ phone, message }),
  })
}
