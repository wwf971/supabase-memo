import { getUnixStampUs, IdState } from '../utils/id'

// ========================================
// Pure ID Transformation Functions
// Matches service_id/id_64.py naming
// ========================================

// Base-15 encoding using 0-9 and a-e
const CHARSET_09AE = '0123456789abcde'
const BASE_09AE = 15

/**
 * Convert BigInt ID to base-15 string (0-9a-e)
 * Matches: id_int_to_09ae() from id_64.py
 */
export function id_int_to_09ae(id_int: bigint): string {
  if (id_int === BigInt(0)) {
    return '0'
  }

  const chars: string[] = []
  let num = id_int

  while (num > BigInt(0)) {
    const remainder = Number(num % BigInt(BASE_09AE))
    chars.unshift(CHARSET_09AE[remainder])
    num = num / BigInt(BASE_09AE)
  }

  return chars.join('')
}

/**
 * Convert base-15 string (0-9a-e) to BigInt ID
 * Matches: id_09ae_to_int() from id_64.py
 */
export function id_09ae_to_int(id_str: string): bigint {
  let result = BigInt(0)
  const base = BigInt(BASE_09AE)

  for (let i = 0; i < id_str.length; i++) {
    const char = id_str[i]
    const value = CHARSET_09AE.indexOf(char)
    
    if (value === -1) {
      throw new Error(`Invalid character '${char}' in ID string (expected 0-9a-e)`)
    }

    result = result * base + BigInt(value)
  }

  return result
}

/**
 * Generate a new ID string based on current timestamp
 */
export function generateIdString(): string {
  const timestampUs = getUnixStampUs()
  return id_int_to_09ae(BigInt(timestampUs))
}

// Re-export backend API functions from ../backend/id.ts
export { issueId, markIdInUse, abortId, getIds, getIdTypes, getIdStats } from '../backend/id'
export type { IdRecord, IdTypeRecord } from '../backend/id'
