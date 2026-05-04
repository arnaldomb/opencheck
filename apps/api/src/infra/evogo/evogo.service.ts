// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EvoGoServerConfig {
  url: string
  apiKey: string
}

export interface EvoGoInstanceConfig extends EvoGoServerConfig {
  instance: string
}

export interface EvoGoGrupo {
  id: string
  subject: string
  // campos extras que a API pode retornar
  [key: string]: unknown
}

// ─── Config global (env vars) ─────────────────────────────────────────────────

export function getEvoGoServerConfig(): EvoGoServerConfig | null {
  const url    = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!url || !apiKey) return null
  return { url: url.replace(/\/$/, ''), apiKey }
}

/** Compatibilidade retroativa — usa instância global de env vars. */
export function getEvoGoConfig(): EvoGoInstanceConfig | null {
  const server   = getEvoGoServerConfig()
  const instance = process.env.EVOLUTION_INSTANCE
  if (!server || !instance) return null
  return { ...server, instance }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

/** Gera o nome da instância a partir do nome da empresa do tenant. */
export function buildInstanceName(tenantNome: string): string {
  return `av-${slugify(tenantNome)}`
}

function normalizeNumber(raw: string): string {
  return raw.replace(/[^\d]/g, '').replace(/^0+/, '')
}

/** Para grupo JID (termina em @g.us) retorna como está; para número normaliza. */
function resolveRecipient(dest: string): string {
  return dest.includes('@') ? dest : normalizeNumber(dest)
}

async function evoFetch(
  server: EvoGoServerConfig,
  path: string,
  options: RequestInit & { instanceName?: string } = {},
): Promise<Response> {
  const { instanceName, ...fetchOptions } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': server.apiKey,
    ...(instanceName ? { 'instance': instanceName } : {}),
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  }
  return fetch(`${server.url}${path}`, { ...fetchOptions, headers })
}

// ─── Gestão de instância ──────────────────────────────────────────────────────

export async function createInstance(
  server: EvoGoServerConfig,
  instanceName: string,
  token: string,
): Promise<{ instanceId?: string; name?: string }> {
  const res = await evoFetch(server, '/instance/create', {
    method: 'POST',
    body: JSON.stringify({ name: instanceName, token }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EvoGo create instance ${res.status}: ${body}`)
  }
  return res.json()
}

export async function connectInstance(
  server: EvoGoServerConfig,
  instanceName: string,
): Promise<{ qrCode?: string; qrURL?: string; [key: string]: unknown }> {
  const res = await evoFetch(server, '/instance/connect', {
    method: 'POST',
    instanceName,
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EvoGo connect ${res.status}: ${body}`)
  }
  return res.json()
}

export async function getInstanceQR(
  server: EvoGoServerConfig,
  instanceName: string,
): Promise<{ qrCode?: string; qrURL?: string; [key: string]: unknown }> {
  const res = await evoFetch(server, '/instance/qr', {
    method: 'GET',
    instanceName,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EvoGo QR ${res.status}: ${body}`)
  }
  return res.json()
}

export async function getInstanceStatus(
  server: EvoGoServerConfig,
  instanceName: string,
): Promise<{ state: string; [key: string]: unknown }> {
  const res = await evoFetch(server, '/instance/status', {
    method: 'GET',
    instanceName,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EvoGo status ${res.status}: ${body}`)
  }
  return res.json()
}

export async function listGroups(
  server: EvoGoServerConfig,
  instanceName: string,
): Promise<EvoGoGrupo[]> {
  const res = await evoFetch(server, '/group/myall', {
    method: 'GET',
    instanceName,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EvoGo grupos ${res.status}: ${body}`)
  }
  const data = await res.json()
  return Array.isArray(data) ? data : (data.groups ?? data.data ?? [])
}

export async function logoutInstance(
  server: EvoGoServerConfig,
  instanceName: string,
): Promise<void> {
  const res = await evoFetch(server, '/instance/logout', {
    method: 'DELETE',
    instanceName,
  })
  if (!res.ok && res.status !== 404) {
    console.warn(`[evogo] logout retornou ${res.status}`)
  }
}

export async function deleteInstance(
  server: EvoGoServerConfig,
  instanceName: string,
): Promise<void> {
  const res = await evoFetch(server, `/instance/delete/${instanceName}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '')
    console.warn(`[evogo] delete retornou ${res.status}: ${body}`)
  }
}

// ─── Envio de mensagens ───────────────────────────────────────────────────────

export async function sendWhatsAppText(
  config: EvoGoInstanceConfig,
  to: string,
  text: string,
): Promise<void> {
  const number = resolveRecipient(to)
  const res = await evoFetch(
    config,
    '/send/text',
    {
      method: 'POST',
      instanceName: config.instance,
      body: JSON.stringify({ number, text }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EvoGo send/text ${res.status}: ${body}`)
  }
}

export async function sendWhatsAppMedia(
  config: EvoGoInstanceConfig,
  to: string,
  url: string,
  caption?: string,
): Promise<void> {
  const number = resolveRecipient(to)
  const res = await evoFetch(
    config,
    '/send/media',
    {
      method: 'POST',
      instanceName: config.instance,
      body: JSON.stringify({ number, url, type: 'image', caption: caption ?? '' }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EvoGo send/media ${res.status}: ${body}`)
  }
}
