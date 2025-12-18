import { getSupabaseClient } from './supabase'
import {
  createUpdateFunction,
  createId09aeTable,
  createIdTypeTable,
  createPathSegmentTable,
  createPathSegmentRelationTypeTable,
  createPathSegmentRelationTable,
  getCleanupSQL
} from './coreSql'

/**
 * Check if a table exists
 */
export async function checkTableExists(tableName: string): Promise<{ code: number; message?: string; data?: boolean }> {
  try {
    const client = getSupabaseClient()
    
    // Try to query the table with limit 0
    const { error } = await client.from(tableName).select('*').limit(0)
    
    if (error) {
      // If error contains "does not exist" or "schema cache", table doesn't exist
      if (error.message.includes('does not exist') || error.message.includes('schema cache')) {
        return { code: 0, data: false }
      }
      // Other errors
      return { code: -5, message: error.message, data: false }
    }
    
    // No error means table exists
    return { code: 0, data: true }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured. Please set up connection first.' }
    }
    return { code: -5, message: err.message || 'Failed to check table' }
  }
}

/**
 * Check status of all required tables
 */
export async function checkAllTables(): Promise<{
  code: number
  message?: string
  data?: {
    id_09ae: boolean
    id_type: boolean
    segment: boolean
    segment_relation_type: boolean
    segment_relation: boolean
    content_type: boolean
    content: boolean
    content_binary: boolean
  }
}> {
  try {
    const tables = [
      'id_09ae',
      'id_type',
      'segment',
      'segment_relation_type',
      'segment_relation',
      'content_type',
      'content',
      'content_binary'
    ]
    const results: Record<string, boolean> = {}
    
    for (const table of tables) {
      const result = await checkTableExists(table)
      if (result.code !== 0) {
        return { code: result.code, message: result.message }
      }
      results[table] = result.data || false
    }
    
    return {
      code: 0,
      data: {
        id_09ae: results.id_09ae,
        id_type: results.id_type,
        segment: results.segment,
        segment_relation_type: results.segment_relation_type,
        segment_relation: results.segment_relation,
        content_type: results.content_type,
        content: results.content,
        content_binary: results.content_binary
      }
    }
  } catch (err: any) {
    return { code: -5, message: err.message || 'Failed to check tables' }
  }
}

/**
 * Note: Supabase client does not support DDL operations (CREATE TABLE, DROP TABLE, etc.)
 * These operations must be done via Supabase SQL Editor
 * We can only use the client for DML operations (SELECT, INSERT, UPDATE, DELETE)
 */

/**
 * Create all tables (returns SQL to run manually)
 */
export async function initializeDatabase(): Promise<{ code: number; message?: string; data?: string }> {
  try {
    // Check which tables are missing
    const check = await checkAllTables()
    if (check.code !== 0) {
      return { code: check.code, message: check.message }
    }
    
    const missing = []
    if (!check.data?.id_09ae) missing.push('id_09ae')
    if (!check.data?.id_type) missing.push('id_type')
    if (!check.data?.segment) missing.push('segment')
    
    if (missing.length === 0) {
      return { code: 0, message: 'All tables already exist!' }
    }
    
    // Generate SQL for missing tables
    const sqlParts: string[] = []
    
    // Always include the update function first
    sqlParts.push(createUpdateFunction())
    
    if (!check.data?.id_09ae) {
      sqlParts.push(createId09aeTable())
    }
    
    if (!check.data?.id_type) {
      sqlParts.push(createIdTypeTable())
    }
    
    if (!check.data?.segment) {
      sqlParts.push(createPathSegmentTable())
    }
    
    const sql = sqlParts.join('\n\n')
    
    return {
      code: 0,
      message: `Missing tables: ${missing.join(', ')}. Please run the provided SQL.`,
      data: sql
    }
  } catch (err: any) {
    return { code: -5, message: err.message || 'Failed to initialize database' }
  }
}

/**
 * Drop all tables (returns SQL to run manually)
 */
export async function dropAllTables(): Promise<{ code: number; message?: string; data?: string }> {
  try {
    const sql = getCleanupSQL()
    return {
      code: 0,
      message: 'Please run the provided SQL to drop all tables.',
      data: sql
    }
  } catch (err: any) {
    return { code: -5, message: err.message || 'Failed to generate cleanup SQL' }
  }
}

