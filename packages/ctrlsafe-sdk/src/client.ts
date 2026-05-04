export interface CtrlSafeConfig {
  apiUrl?: string
  agentToken: string
  installId: string
}

export interface CtrlSafeEventInput {
  account: string
  partition: string
  zone: string
  receiver: string
  line: string
  code: string
}

export class CtrlSafeClient {
  private readonly baseUrl: string

  constructor(private readonly config: CtrlSafeConfig) {
    this.baseUrl = config.apiUrl ?? process.env.CTRLSAFE_API_URL ?? 'https://api.ctrlsafe.com.br/api/functions/v1'
  }

  async sendEvent(event: CtrlSafeEventInput): Promise<void> {
    const response = await fetch(`${this.baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.agentToken}`,
        'X-Install-Id': this.config.installId,
      },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      throw new Error(`CTRL+SAFE error ${response.status}: ${await response.text()}`)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${this.config.agentToken}` },
      })
      return response.ok
    } catch {
      return false
    }
  }
}
