import { getSupabaseClient } from '../backend/supabase'
import { segmentCache } from '../backend/cache'
import { getPathToRoot } from '../backend/segment'

export interface PathSegment {
  id: string
  name: string
  created_at: string
  updated_at: string
  metadata?: Record<string, any>
}

/**
 * Get all path segments
 */
export async function getSegments(): Promise<{ code: number; message?: string; data?: PathSegment[] }> {
  try {
    const client = getSupabaseClient()

    const { data, error } = await client
      .from('segment')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0, data: data || [] }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured. Please set up connection first.' }
    }
    return { code: -5, message: err.message || 'Failed to fetch path segments' }
  }
}

/**
 * Create a new path segment
 */
export async function createPathSegment(
  id: string,
  name: string
): Promise<{ code: number; message?: string; data?: PathSegment }> {
  try {
    const client = getSupabaseClient()

    const { data, error } = await client
      .from('segment')
      .insert({
        id,
        name
      })
      .select()
      .single()

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0, data }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to create path segment' }
  }
}

/**
 * Update path segment
 */
export async function updatePathSegment(
  id: string,
  updates: { name?: string; metadata?: Record<string, any> }
): Promise<{ code: number; message?: string }> {
  try {
    const client = getSupabaseClient()

    const { error } = await client
      .from('segment')
      .update(updates)
      .eq('id', id)

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0 }
  } catch (err: any) {
    return { code: -5, message: err.message || 'Failed to update path segment' }
  }
}

/**
 * Get a single path segment by ID
 */
export async function getPathSegment(
  id: string
): Promise<{ code: number; message?: string; data?: PathSegment }> {
  try {
    const client = getSupabaseClient()

    const { data, error } = await client
      .from('segment')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0, data }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to get path segment' }
  }
}

/**
 * Delete path segment
 */
export async function deletePathSegment(id: string): Promise<{ code: number; message?: string }> {
  try {
    const client = getSupabaseClient()

    const { error } = await client
      .from('segment')
      .delete()
      .eq('id', id)

    if (error) {
      return { code: -5, message: error.message }
    }

    return { code: 0 }
  } catch (err: any) {
    return { code: -5, message: err.message || 'Failed to delete path segment' }
  }
}

/**
 * Format path for a segment
 * @param segmentId - The segment ID
 * @returns Path string in format: /name1/name2/name3/
 */
export async function formatSegmentPath(segmentId: string): Promise<string> {
  const pathResult = await getPathToRoot(segmentId)
  let pathStr = '/'
  
  if (pathResult.code === 0 && pathResult.data && pathResult.data.length > 0) {
    // pathResult.data is array of segment IDs, need to get names
    const pathNames: string[] = []
    for (const segId of pathResult.data) {
      // Use cache.get() - automatically fetches if not cached
      const segData = await segmentCache.get(segId)
      if (segData) {
        pathNames.push(segData.name)
      }
    }
    pathStr = '/' + pathNames.join('/') + '/'
  }
  
  return pathStr
}

/**
 * Format path for a content item
 * @param _contentId - The content ID (unused, kept for API consistency)
 * @param contentName - The content name (empty string for segment-bound content)
 * @param parentSegmentId - The parent segment ID (required for content)
 * @returns Path string in format: /name1/name2/name3/contentName or /name1/name2/name3 (for empty name)
 */
export async function formatContentPath(
  _contentId: string,
  contentName: string,
  parentSegmentId?: string
): Promise<string> {
  // If content has empty name, it's bound to its parent segment
  // Path should be parent's path without trailing slash: /name1/name2/name3
  if (contentName === '' && parentSegmentId) {
    const parentPath = await formatSegmentPath(parentSegmentId)
    // Remove trailing slash
    return parentPath.endsWith('/') ? parentPath.slice(0, -1) : parentPath
  }
  
  // If content has a name, append it to parent's path
  // Path format: /name1/name2/name3/contentName (no trailing slash)
  if (parentSegmentId) {
    const parentPath = await formatSegmentPath(parentSegmentId)
    return parentPath + contentName
  }
  
  // Fallback: content at root with name
  return '/' + contentName
}

