interface DisplayError {
  code: string
  message: string
  retryable: boolean
  requestId?: string
  retryAfterSeconds?: number
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function useApiError() {
  return (value: unknown): DisplayError => {
    const response = isRecord(value) && isRecord(value.data) ? value.data : value
    const body =
      isRecord(response) && isRecord(response.data) && isRecord(response.data.error)
        ? response.data
        : response
    if (isRecord(body) && isRecord(body.error)) {
      return {
        code: typeof body.error.code === 'string' ? body.error.code : 'REQUEST_FAILED',
        message:
          typeof body.error.message === 'string'
            ? body.error.message
            : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
        retryable: body.error.retryable === true,
        requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
        retryAfterSeconds:
          typeof body.error.retryAfterSeconds === 'number'
            ? body.error.retryAfterSeconds
            : undefined,
      }
    }
    return {
      code: 'REQUEST_FAILED',
      message: '서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.',
      retryable: true,
    }
  }
}
