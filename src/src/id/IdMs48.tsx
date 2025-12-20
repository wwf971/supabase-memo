/**
 * 64-bit ID system based on Unix timestamp (milliseconds) + offset
 * 
 * ID Format (64-bit):
 * high |-------48bit------|---16bit---| low
 * high |---unix_stamp_ms--|---offset--| low
 * 
 * - High 48 bits: Unix timestamp in milliseconds (supports dates until ~8900 AD)
 * - Low 16 bits: Offset/counter (0-65535, allows 65536 IDs per millisecond)
 * 
 * String encoding: Base-36 (0-9a-z) for compact representation
 */

// Base-36 encoding using 0-9 and a-z
const CHARSET_09AZ = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE_09AZ = 36

// Constants for ID structure
const OFFSET_MAX = 2 ** 16 - 1  // 65535
// const MS_BITS = 48      // For documentation: high 48 bits for millisecond timestamp
// const OFFSET_BITS = 16  // For documentation: low 16 bits for offset/counter

/**
 * Get current Unix timestamp in milliseconds
 */
export function getUnixStampMs(): number {
  return Date.now()
}

/**
 * Generate 64-bit ID from timestamp and offset
 * 
 * @param unixStampMs - Unix timestamp in milliseconds (optional, defaults to now)
 * @param offset - Counter/offset value 0-65535 (optional, defaults to random)
 * @returns 64-bit ID as BigInt
 */
export function getIdInt(unixStampMs?: number, offset: number = 0): bigint {
  if (unixStampMs === undefined) {
    unixStampMs = getUnixStampMs()
  }
  
  // Ensure offset is within valid range
  if (offset > OFFSET_MAX) {
    offset = offset % (OFFSET_MAX + 1)
  }
  
  // Combine: ms_int * 2^16 + offset
  const msInt = Math.floor(unixStampMs)
  const idInt = BigInt(msInt) * BigInt(2 ** 16) + BigInt(offset)
  
  return idInt
}

/**
 * Generate random 64-bit ID
 */
export function getRandomIdInt(): bigint {
  const randOffset = Math.floor(Math.random() * (2 ** 16))
  return getIdInt(undefined, randOffset)
}

/**
 * Extract timestamp (milliseconds) from 64-bit ID
 */
export function extractTimestampMs(idInt: bigint): number {
  // Extract high 48 bits: id_int / 2^16
  const msInt = idInt / BigInt(2 ** 16)
  return Number(msInt)
}

/**
 * Extract offset from 64-bit ID
 */
export function extractOffset(idInt: bigint): number {
  // Extract low 16 bits: id_int % 2^16
  const offset = idInt % BigInt(2 ** 16)
  return Number(offset)
}

/**
 * Convert 64-bit ID to base-36 string (0-9a-z)
 */
export function idIntTo09az(idInt: bigint): string {
  if (idInt === BigInt(0)) {
    return '0'
  }

  const chars: string[] = []
  let num = idInt

  while (num > BigInt(0)) {
    const remainder = Number(num % BigInt(BASE_09AZ))
    chars.unshift(CHARSET_09AZ[remainder])
    num = num / BigInt(BASE_09AZ)
  }

  return chars.join('')
}

/**
 * Convert base-36 string (0-9a-z) to 64-bit ID
 */
export function id09azToInt(idStr: string): bigint {
  let result = BigInt(0)
  const base = BigInt(BASE_09AZ)

  for (let i = 0; i < idStr.length; i++) {
    const char = idStr[i]
    const value = CHARSET_09AZ.indexOf(char)
    
    if (value === -1) {
      throw new Error(`Invalid character '${char}' in ID string (expected 0-9a-z)`)
    }

    result = result * base + BigInt(value)
  }

  return result
}

/**
 * Generate a new ID string with optional offset
 */
export function genIdStr(offset?: number): string {
  const idInt = offset !== undefined ? getIdInt(undefined, offset) : getRandomIdInt()
  return idIntTo09az(idInt)
}

/**
 * Format ID info for display
 */
export function formatIdInfo(idStr: string) {
  try {
    const idInt = id09azToInt(idStr)
    const timestampMs = extractTimestampMs(idInt)
    const offset = extractOffset(idInt)
    const date = new Date(timestampMs)
    
    return {
      idString: idStr,
      idInt: idInt.toString(),
      timestampMs,
      offset,
      dateISO: date.toISOString(),
      dateLocal: date.toLocaleString(),
      valid: true
    }
  } catch (err) {
    return {
      idString: idStr,
      idInt: null,
      timestampMs: null,
      offset: null,
      dateISO: null,
      dateLocal: null,
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid ID'
    }
  }
}

/**
 * Counter for generating sequential IDs within the same millisecond
 */
let _offsetCounter = 0
let _lastTimestampMs = 0

/**
 * Generate sequential ID with auto-incrementing offset
 * Ensures unique IDs even when called multiple times in the same millisecond
 */
export function generateSequentialId(): string {
  const nowMs = getUnixStampMs()
  
  // Reset counter if we're in a new millisecond
  if (nowMs !== _lastTimestampMs) {
    _offsetCounter = 0
    _lastTimestampMs = nowMs
  } else {
    // Increment counter within same millisecond
    _offsetCounter = (_offsetCounter + 1) % (OFFSET_MAX + 1)
  }
  
  const idInt = getIdInt(nowMs, _offsetCounter)
  return idIntTo09az(idInt)
}

