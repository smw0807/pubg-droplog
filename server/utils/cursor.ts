import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { z } from 'zod'
import { ApiError } from './errors'

// Single-process cursors expire after a restart; stored reports remain readable.
// Sign offsets so clients cannot fabricate a page that scans thousands of DB rows.
const cursorKey = randomBytes(32)
export function encodeCursor(value: object): string {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url')
  const signature = createHmac('sha256', cursorKey).update(body).digest('base64url')
  return `${body}.${signature}`
}
export function decodeCursor<T>(input: string, schema: z.ZodType<T>): T {
  try {
    if (input.length > 2048) throw new Error('length')
    const [body, signature, extra] = input.split('.')
    if (!body || !signature || extra) throw new Error('shape')
    const expected = createHmac('sha256', cursorKey).update(body).digest()
    const supplied = Buffer.from(signature, 'base64url')
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ApiError('SNAPSHOT_EXPIRED', 409, '페이지 정보가 만료됐어요. 첫 페이지부터 다시 조회해 주세요.', true)
    return schema.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')))
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('INVALID_INPUT', 400, '페이지 커서가 올바르지 않아요. 처음부터 다시 조회해 주세요.')
  }
}
export function filterSignature(value: object): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20) }
