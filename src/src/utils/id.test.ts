/**
 * Test file for ID utility functions
 * Run with: node --loader ts-node/esm id.test.ts
 */

import {
  timestampToString,
  stringToTimestamp,
  timestampToReadable,
  readableToTimestamp,
  genIdStr,
  formatIdInfo
} from './id'

console.log('=== ID Utility Tests ===\n')

// Test 1: Basic conversion
console.log('Test 1: Basic timestamp conversion')
const timestamp1 = BigInt(1734422400000000) // 2024-12-17 12:00:00 UTC in microseconds
const str1 = timestampToString(timestamp1)
const back1 = stringToTimestamp(str1)
console.log(`  Original: ${timestamp1}`)
console.log(`  String:   ${str1}`)
console.log(`  Back:     ${back1}`)
console.log(`  Match:    ${timestamp1 === back1 ? '✓' : '✗'}`)
console.log()

// Test 2: Current timestamp
console.log('Test 2: Current timestamp')
const idString = genIdStr()
const info = formatIdInfo(idString, 540) // +09:00 JST
console.log(`  ID String: ${info.idString}`)
console.log(`  Timestamp: ${info.timestamp}`)
console.log(`  Readable:  ${info.readable}`)
console.log()

// Test 3: Readable format round-trip
console.log('Test 3: Readable format conversion')
const timestamp3 = BigInt(1734422400240900) // With microseconds
const readable3 = timestampToReadable(timestamp3, 540)
console.log(`  Original timestamp: ${timestamp3}`)
console.log(`  Readable format:    ${readable3}`)
try {
  const back3 = readableToTimestamp(readable3)
  console.log(`  Back to timestamp:  ${back3}`)
  console.log(`  Match: ${timestamp3 === back3 ? '✓' : '✗'}`)
} catch (err: any) {
  console.log(`  Error: ${err.message}`)
}
console.log()

// Test 4: Zero and small numbers
console.log('Test 4: Edge cases')
const zero = BigInt(0)
const zeroStr = timestampToString(zero)
const zeroBack = stringToTimestamp(zeroStr)
console.log(`  Zero: ${zero} → "${zeroStr}" → ${zeroBack} ${zero === zeroBack ? '✓' : '✗'}`)

const small = BigInt(25)
const smallStr = timestampToString(small)
const smallBack = stringToTimestamp(smallStr)
console.log(`  Small: ${small} → "${smallStr}" → ${smallBack} ${small === smallBack ? '✓' : '✗'}`)
console.log()

// Test 5: Base-26 verification
console.log('Test 5: Base-26 encoding verification')
console.log('  First few mappings:')
for (let i = 0; i < 30; i++) {
  const ts = BigInt(i)
  const str = timestampToString(ts)
  console.log(`    ${i.toString().padStart(2)} → "${str}"`)
}
console.log()

console.log('=== All Tests Complete ===')

