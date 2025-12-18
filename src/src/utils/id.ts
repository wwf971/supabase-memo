/**
 * Universal ID system based on Unix timestamp in microseconds
 * Encodes to base-26 (a-z) for safe string storage in JavaScript
 * 
 * Format:
 * - Integer: Unix timestamp in microseconds (64-bit)
 * - String: Base-26 encoding using a-z (most significant digit first)
 * - Readable: YYYYMMDD_HHMMSSμs±HH (e.g., 20251217_153800240900+09)
 */

const BASE = 26;
const CHARSET = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Get current timestamp in microseconds
 * Note: JavaScript Date.now() gives milliseconds, we multiply by 1000
 */
export function getUnixStampUs(): bigint {
  // Use performance.now() for higher precision if available
  if (typeof performance !== 'undefined' && performance.now) {
    const ms = performance.timeOrigin + performance.now();
    return BigInt(Math.floor(ms * 1000));
  }
  // Fallback to Date.now() * 1000
  return BigInt(Date.now()) * BigInt(1000);
}

/**
 * Convert BigInt timestamp to base-26 string (a-z)
 * Most significant digit comes first (left to right)
 */
export function timestampToString(timestamp: bigint): string {
  if (timestamp === BigInt(0)) {
    return 'a'; // 'a' represents 0
  }

  const chars: string[] = [];
  let num = timestamp;

  while (num > BigInt(0)) {
    const remainder = Number(num % BigInt(BASE));
    chars.unshift(CHARSET[remainder]); // unshift = most significant first
    num = num / BigInt(BASE);
  }

  return chars.join('');
}

/**
 * Convert base-26 string back to BigInt timestamp
 */
export function stringToTimestamp(str: string): bigint {
  let result = BigInt(0);
  const base = BigInt(BASE);

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const value = CHARSET.indexOf(char);
    
    if (value === -1) {
      throw new Error(`Invalid character '${char}' in ID string`);
    }

    result = result * base + BigInt(value);
  }

  return result;
}

/**
 * Convert timestamp (microseconds) to readable format
 * Format: YYYYMMDD_HHMMSSμs±HH
 * Example: 20251217_153800240900+09
 */
export function timestampToReadable(timestamp: bigint, timezoneOffset?: number): string {
  // Convert microseconds to milliseconds for Date object
  const ms = Number(timestamp / BigInt(1000));
  const date = new Date(ms);

  // Get timezone offset (default to local)
  const tzOffset = timezoneOffset ?? -date.getTimezoneOffset();
  const tzSign = tzOffset >= 0 ? '+' : '-';
  const tzHours = Math.abs(Math.floor(tzOffset / 60)).toString().padStart(2, '0');

  // Extract date/time components
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  // Microseconds component (last 6 digits)
  const microseconds = (Number(timestamp) % 1000000).toString().padStart(6, '0');

  return `${year}${month}${day}_${hours}${minutes}${seconds}${microseconds}${tzSign}${tzHours}`;
}

/**
 * Parse readable format back to timestamp
 * Format: YYYYMMDD_HHMMSSμs±HH
 */
export function readableToTimestamp(readable: string): bigint {
  // Parse: YYYYMMDD_HHMMSSμs±HH
  const match = readable.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(\d{6})([+-])(\d{2})$/);
  
  if (!match) {
    throw new Error(`Invalid readable format: ${readable}`);
  }

  const [, year, month, day, hours, minutes, seconds, microseconds, tzSign, tzHours] = match;
  
  // Create date in UTC
  const date = new Date(Date.UTC(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hours),
    parseInt(minutes),
    parseInt(seconds)
  ));

  // Adjust for timezone
  const tzOffset = (tzSign === '+' ? 1 : -1) * parseInt(tzHours) * 60 * 60 * 1000;
  const ms = date.getTime() - tzOffset;

  // Convert to microseconds and add microsecond component
  const timestamp = BigInt(ms) * BigInt(1000) + BigInt(parseInt(microseconds));
  
  return timestamp;
}

/**
 * Generate a new ID string
 */
export function generateIdString(): string {
  const timestamp = getUnixStampUs();
  return timestampToString(timestamp);
}

/**
 * ID state enum
 */
export enum IdState {
  ABORTED = -1,
  IN_USE = 0,
  ISSUED = 1
}

/**
 * ID type codes
 */
export enum IdType {
  PATH_SEGMENT = 1,
  CONTENT = 2,
  MEDIA = 3,
  USER = 4,
  PROJECT = 5
}

/**
 * Format functions for display
 */
export function formatIdInfo(idString: string, timezoneOffset?: number) {
  try {
    const timestamp = stringToTimestamp(idString);
    const readable = timestampToReadable(timestamp, timezoneOffset);
    return {
      idString,
      timestamp: timestamp.toString(),
      readable,
      valid: true
    };
  } catch (err) {
    return {
      idString,
      timestamp: null,
      readable: null,
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid ID'
    };
  }
}

