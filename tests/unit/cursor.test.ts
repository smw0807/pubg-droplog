import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { decodeCursor, encodeCursor } from '../../server/utils/cursor'

describe('bounded signed pagination cursors', () => {
  const schema = z.object({ offset: z.number().int().max(20000) })
  it('round-trips an issued cursor and rejects a modified offset', () => {
    const original = encodeCursor({ offset: 20 })
    expect(decodeCursor(original, schema)).toEqual({ offset: 20 })
    const signature = original.split('.')[1]
    const tampered = `${Buffer.from(JSON.stringify({ offset: 9980 })).toString('base64url')}.${signature}`
    expect(() => decodeCursor(tampered, schema)).toThrow(
      expect.objectContaining({ code: 'SNAPSHOT_EXPIRED' }),
    )
  })
  it('rejects oversized, unstructured and schema-invalid values', () => {
    for (const value of ['x'.repeat(2049), 'bad-cursor', encodeCursor({ offset: 20001 })]) {
      expect(() => decodeCursor(value, schema)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' }),
      )
    }
  })
})
