export class AsaasError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errors?: Array<{ code: string; description: string }>,
  ) {
    super(message)
    this.name = 'AsaasError'
  }
}

export class AsaasValidationError extends AsaasError {
  constructor(errors: Array<{ code: string; description: string }>) {
    super('Asaas validation error', 400, errors)
    this.name = 'AsaasValidationError'
  }
}

export class AsaasUnauthorizedError extends AsaasError {
  constructor() {
    super('Asaas unauthorized — verifique o ASAAS_API_KEY', 401)
    this.name = 'AsaasUnauthorizedError'
  }
}

export class AsaasNotFoundError extends AsaasError {
  constructor(resource: string) {
    super(`Asaas resource not found: ${resource}`, 404)
    this.name = 'AsaasNotFoundError'
  }
}
