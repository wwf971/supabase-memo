import { getSupabaseClient } from './supabase'
import { getUnixStampUs, IdState } from '../utils/id'

export interface IdRecord {
  id_string: string
  state: number
  type_code: number
  created_at: string
  updated_at: string
  metadata: any
}

export interface IdTypeRecord {
  type_code: number
  type_name: string
  description: string | null
  created_at: string
}

/**
 * Issue a new ID using ms48 format (48-bit millisecond timestamp + 16-bit offset)
 */
export async function issueId(typeCode: number): Promise<{ code: number; message?: string; data?: string }> {
  try {
    // Use new ms48 ID system
    const { generateSequentialId } = await import('../id/IdMs48')
    
    const client = getSupabaseClient()
    const idString = generateSequentialId()

    const { error } = await client
      .from('id_09ae')
      .insert({
        id_string: idString,
        state: IdState.ISSUED,
        type_code: typeCode
      })

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0, data: idString }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to issue ID' }
  }
}

/**
 * BACKUP: Old ID issuing logic using microseconds
 * Kept for reference, do not use
 */
/*
export async function issueId_OLD_MICROSECONDS(typeCode: number): Promise<{ code: number; message?: string; data?: string }> {
  try {
    // Import dynamically to avoid circular dependency
    const { id_int_to_09ae } = await import('../id/idUtils')
    
    const client = getSupabaseClient()
    const timestampUs = getUnixStampUs()
    const idString = id_int_to_09ae(BigInt(timestampUs))

    const { error } = await client
      .from('id_09ae')
      .insert({
        id_string: idString,
        state: IdState.ISSUED,
        type_code: typeCode
      })

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0, data: idString }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to issue ID' }
  }
}
*/

/**
 * Mark an ID as in use
 */
export async function markIdInUse(idString: string): Promise<{ code: number; message?: string }> {
  try {
    const client = getSupabaseClient()

    const { error } = await client
      .from('id_09ae')
      .update({ state: IdState.IN_USE })
      .eq('id_string', idString)

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0 }
  } catch (err: any) {
    return { code: -5, message: err.message || 'Failed to mark ID as in use' }
  }
}

/**
 * Abort an ID
 */
export async function abortId(idString: string): Promise<{ code: number; message?: string }> {
  try {
    const client = getSupabaseClient()

    const { error } = await client
      .from('id_09ae')
      .update({ state: IdState.ABORTED })
      .eq('id_string', idString)

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0 }
  } catch (err: any) {
    return { code: -5, message: err.message || 'Failed to abort ID' }
  }
}

/**
 * Get all IDs with optional filters
 */
export async function getIds(filters?: {
  state?: number
  typeCode?: number
  limit?: number
  offset?: number
}): Promise<{ code: number; message?: string; data?: IdRecord[] }> {
  try {
    const client = getSupabaseClient()
    let query = client.from('id_09ae').select('*').order('created_at', { ascending: false })

    if (filters?.state !== undefined) {
      query = query.eq('state', filters.state)
    }

    if (filters?.typeCode !== undefined) {
      query = query.eq('type_code', filters.typeCode)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1)
    }

    const { data, error } = await query

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0, data: data || [] }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to fetch IDs' }
  }
}

/**
 * Get all ID types
 */
export async function getIdTypes(): Promise<{ code: number; message?: string; data?: IdTypeRecord[] }> {
  try {
    const client = getSupabaseClient()

    const { data, error } = await client
      .from('id_type')
      .select('*')
      .order('type_code', { ascending: true })

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0, data: data || [] }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to fetch ID types' }
  }
}

/**
 * Get ID statistics
 */
export async function getIdStats(): Promise<{
  code: number
  message?: string
  data?: {
    total: number
    inUse: number
    issued: number
    aborted: number
    byType: Record<number, number>
  }
}> {
  try {
    const client = getSupabaseClient()

    // Get all IDs
    const { data: allIds, error } = await client.from('id_09ae').select('state, type_code')

    if (error) {
      return { code: -5, message: error.message }
    }

    const stats = {
      total: allIds?.length || 0,
      inUse: allIds?.filter(id => id.state === IdState.IN_USE).length || 0,
      issued: allIds?.filter(id => id.state === IdState.ISSUED).length || 0,
      aborted: allIds?.filter(id => id.state < 0).length || 0,
      byType: {} as Record<number, number>
    }

    // Count by type
    allIds?.forEach(id => {
      stats.byType[id.type_code] = (stats.byType[id.type_code] || 0) + 1
    })

    return { code: 0, data: stats }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to fetch ID stats' }
  }
}

