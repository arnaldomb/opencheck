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
}

/** Gera o nome da instância a partir do nome da empresa do tenant. */
export function buildInstanceName(tenantNome: string, tenantId?: string): string {
  const base = slugify(tenantNome)
  if (!tenantId) return `av-${base}`.slice(0, 40)

  const suffix = tenantId.replace(/-/g, '').slice(0, 8).toLowerCase()
  const reserved = 'av-'.length + 1 + suffix.length
  const maxBaseLen = Math.max(0, 40 - reserved)
  const trimmedBase = base.slice(0, maxBaseLen).replace(/-+$/g, '')

  return trimmedBase ? `av-${trimmedBase}-${suffix}` : `av-${suffix}`
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

function extractQrCode(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const anyRaw = raw as Record<string, unknown>
  const data = (anyRaw.data && typeof anyRaw.data === 'object') ? (anyRaw.data as Record<string, unknown>) : undefined

  const fromData =
    (data?.Qrcode as string | undefined) ??
    (data?.qrcode as string | undefined) ??
    (data?.qrCode as string | undefined) ??
    (data?.qrURL as string | undefined)

  const fromRoot =
    (anyRaw.qrCode as string | undefined) ??
    (anyRaw.qrURL as string | undefined)

  return fromData ?? fromRoot
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
  return res.json() as Promise<{ instanceId?: string; name?: string }>
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
  const raw = await res.json() as { [key: string]: unknown }
  const qrCode = extractQrCode(raw)
  return { ...raw, qrCode }
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
  const raw = await res.json() as { [key: string]: unknown }
  const qrCode = extractQrCode(raw)
  return { ...raw, qrCode }
}

export async function getInstanceStatus(
  server: EvoGoServerConfig,
  instanceName: string,
): Promise<{ state: string; connected?: boolean; [key: string]: unknown }> {
  const res = await evoFetch(server, '/instance/status', {
    method: 'GET',
    instanceName,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EvoGo status ${res.status}: ${body}`)
  }
  const raw = await res.json() as {
    data?: {
      Connected?: boolean
      LoggedIn?: boolean
      connected?: boolean
      loggedIn?: boolean
      state?: string
    }
    state?: string
    [key: string]: unknown
  }
  // Normaliza: EvoGo retorna { data: { Connected, LoggedIn } } ou { state }
  const connected =
    raw.data?.LoggedIn ??
    raw.data?.Connected ??
    raw.data?.loggedIn ??
    raw.data?.connected

  const state = raw.state ?? raw.data?.state ?? ((connected ?? false) ? 'open' : 'close')
  return { ...raw, state, connected }
}

export async function listGroups(
  server: EvoGoServerConfig,
  instanceName: string,
): Promise<EvoGoGrupo[]> {
  const cacheKey = `${server.url}|${instanceName}`
  const cached = groupCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.groups

  function normalizeGroup(item: unknown): EvoGoGrupo | null {
    if (!item || typeof item !== 'object') return null
    const obj = item as Record<string, unknown>
    const id =
      (obj.id as string | undefined) ??
      (obj.jid as string | undefined) ??
      (obj.JID as string | undefined) ??
      (obj.Jid as string | undefined) ??
      (obj.chatId as string | undefined)
    const subject =
      (obj.subject as string | undefined) ??
      (obj.name as string | undefined) ??
      (obj.Name as string | undefined) ??
      (obj.Subject as string | undefined) ??
      (obj.title as string | undefined)
    if (!id) return null
    return { id, subject: subject ?? id, ...obj }
  }

  async function fetchGroups(path: string): Promise<EvoGoGrupo[]> {
    const res = await evoFetch(server, path, {
      method: 'GET',
      instanceName,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 429 || body.includes('rate-overlimit')) {
        throw new Error(`EvoGo rate limit ${res.status}: ${body}`)
      }
      throw new Error(`EvoGo grupos ${res.status}: ${body}`)
    }

    const raw = await res.json() as unknown
    if (Array.isArray(raw)) {
      return raw.map(normalizeGroup).filter(Boolean) as EvoGoGrupo[]
    }
    if (!raw || typeof raw !== 'object') return []

    const obj = raw as Record<string, unknown>
    const data = obj.data
    if (Array.isArray(data)) return data.map(normalizeGroup).filter(Boolean) as EvoGoGrupo[]
    if (Array.isArray(obj.groups)) return (obj.groups as unknown[]).map(normalizeGroup).filter(Boolean) as EvoGoGrupo[]
    if (Array.isArray(obj.data)) return (obj.data as unknown[]).map(normalizeGroup).filter(Boolean) as EvoGoGrupo[]

    if (data && typeof data === 'object') {
      const dataObj = data as Record<string, unknown>
      if (Array.isArray(dataObj.groups)) return (dataObj.groups as unknown[]).map(normalizeGroup).filter(Boolean) as EvoGoGrupo[]
      if (Array.isArray(dataObj.data)) return (dataObj.data as unknown[]).map(normalizeGroup).filter(Boolean) as EvoGoGrupo[]
    }

    return []
  }

  try {
    const list = await fetchGroups('/group/list')
    if (list.length > 0) {
      groupCache.set(cacheKey, { expiresAt: Date.now() + GROUP_CACHE_TTL_MS, groups: list })
      return list
    }

    const myAll = await fetchGroups('/group/myall')
    if (myAll.length > 0) groupCache.set(cacheKey, { expiresAt: Date.now() + GROUP_CACHE_TTL_MS, groups: myAll })
    return myAll
  } catch (err) {
    const msg = String(err)
    const rateLimited = msg.includes('rate-overlimit') || msg.includes('429')
    if (rateLimited) {
      await new Promise(r => setTimeout(r, 2500))
      try {
        const list = await fetchGroups('/group/list')
        if (list.length > 0) {
          groupCache.set(cacheKey, { expiresAt: Date.now() + GROUP_CACHE_TTL_MS, groups: list })
          return list
        }
        const myAll = await fetchGroups('/group/myall')
        if (myAll.length > 0) groupCache.set(cacheKey, { expiresAt: Date.now() + GROUP_CACHE_TTL_MS, groups: myAll })
        return myAll
      } catch {
        if (cached?.groups?.length) return cached.groups
      }
    }
    throw err
  }
}

const GROUP_CACHE_TTL_MS = 30_000
const groupCache = new Map<string, { expiresAt: number; groups: EvoGoGrupo[] }>()

export async function listInstances(
  server: EvoGoServerConfig,
): Promise<Array<{ id: string; name: string; token: string; connected: boolean }>> {
  const res = await evoFetch(server, '/instance/all', { method: 'GET' })
  if (!res.ok) return []
  const raw = await res.json() as { data?: Array<{ id: string; name: string; token: string; connected: boolean }> }
  return raw.data ?? []
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
  // EvoGo DELETE /instance/delete/{uuid} — precisa do UUID, não do nome
  const instances = await listInstances(server).catch(() => [])
  const inst = instances.find(i => i.name === instanceName)
  if (!inst) return
  const res = await evoFetch(server, `/instance/delete/${inst.id}`, {
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
  const formatJid = !number.includes('@')
  const res = await evoFetch(
    config,
    '/send/text',
    {
      method: 'POST',
      instanceName: config.instance,
      body: JSON.stringify({ number, text, formatJid }),
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
  const formatJid = !number.includes('@')
  const res = await evoFetch(
    config,
    '/send/media',
    {
      method: 'POST',
      instanceName: config.instance,
      body: JSON.stringify({ number, url, type: 'image', caption: caption ?? '', formatJid }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EvoGo send/media ${res.status}: ${body}`)
  }
}
