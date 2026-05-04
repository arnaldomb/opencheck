export interface EzvizCredentials {
  appKey: string
  appSecret: string
}

export interface DeviceInfo {
  deviceSerial: string
  deviceName:   string
  status:       number   // 1 = online, 0 = offline
}

interface EzvizTokenResponse {
  accessToken: string
  expireTime:  number
}

export class EzvizClient {
  private accessToken: string | null = null
  private tokenExpiresAt = 0

  private apiUrl: string

  constructor(
    private readonly credentials: EzvizCredentials,
    private readonly authUrl = process.env.EZVIZ_AUTH_URL ?? 'https://open.ezvizlife.com',
    apiUrl = process.env.EZVIZ_API_URL ?? 'https://isaopen.ezvizlife.com',
  ) {
    this.apiUrl = apiUrl
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken
    }
    const body = new URLSearchParams({
      appKey:    this.credentials.appKey,
      appSecret: this.credentials.appSecret,
    })
    const res = await fetch(`${this.authUrl}/api/lapp/token/get`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    })
    if (!res.ok) throw new Error(`EZVIZ auth failed: ${res.status}`)
    const json = await res.json() as { code: string; data: EzvizTokenResponse & { areaDomain?: string }; msg?: string }
    if (json.code !== '200') throw new Error(`EZVIZ auth: ${json.msg ?? json.code}`)
    this.accessToken    = json.data.accessToken
    this.tokenExpiresAt = json.data.expireTime
    // Use the areaDomain returned by auth if available (overrides constructor default)
    if (json.data.areaDomain) this.apiUrl = json.data.areaDomain
    return this.accessToken
  }

  // Open Platform API (lapp) — form-urlencoded with accessToken in body
  private async requestForm<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const token = await this.ensureToken()
    const body  = new URLSearchParams({ accessToken: token, ...params })
    const res   = await fetch(`${this.apiUrl}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    })
    if (!res.ok) throw new Error(`EZVIZ API error ${res.status}: ${path}`)
    const json = await res.json() as { code: string; data: T; msg?: string }
    if (json.code !== '200') throw new Error(`EZVIZ: ${json.msg ?? json.code}`)
    return json.data
  }

  // Capture a snapshot — returns temporary picUrl from EZVIZ
  async captureSnapshot(deviceSerial: string, channelNo = 1): Promise<{ picUrl: string }> {
    return this.requestForm<{ picUrl: string }>('/api/lapp/device/capture', {
      deviceSerial, channelNo: String(channelNo),
    })
  }

  // List all devices with online/offline status
  async getDeviceList(): Promise<DeviceInfo[]> {
    const data = await this.requestForm<DeviceInfo[]>('/api/lapp/device/list')
    return Array.isArray(data) ? data : []
  }

  // Get live stream URL — protocol 3 = HLS (web-compatible), 2 = RTMP
  async getLiveStreamUrl(
    deviceSerial: string,
    channelNo = 1,
    protocol: '2' | '3' = '3',
  ): Promise<{ url: string; expireTime?: string }> {
    return this.requestForm<{ url: string; expireTime?: string }>('/api/lapp/v2/live/address/get', {
      deviceSerial, channelNo: String(channelNo), protocol, quality: '2',
    })
  }

  // Get playback URL for a time range — same endpoint with startTime/endTime
  async getPlaybackUrl(
    deviceSerial: string,
    channelNo = 1,
    startTime: string,
    endTime: string,
    protocol: '2' | '3' = '3',
  ): Promise<{ url: string; expireTime?: string }> {
    return this.requestForm<{ url: string; expireTime?: string }>('/api/lapp/v2/live/address/get', {
      deviceSerial, channelNo: String(channelNo), startTime, endTime, protocol,
    })
  }
}
