import { getSupabaseClient } from '../backend/supabase'
import { segmentCache, segRelationCache } from '../cache/cache'
import { getPathToRoot, getPathToRootOptimized, getDirectParent } from '../backend/segment'

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
export async function createSegment(
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
  // Use optimized SQL function instead of multiple queries
  const pathResult = await getPathToRootOptimized(segmentId)
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
 * @param contentId - The content ID
 * @param contentName - The content name
 * @param parentSegmentId - The parent segment ID (optional, will be detected if not provided)
 * @returns Path string in format: /name1/name2/name3/contentName or /name1/name2/name3 (for bound content)
 */
export async function formatContentPath(
  contentId: string,
  contentName: string,
  parentSegmentId?: string
): Promise<string> {
  // Check if this content has a bind relationship using cache
  const bindParent = await segRelationCache.getBindParent(contentId)
  
  if (bindParent) {
    // Content is bound to a segment, path is segment path without trailing slash
    const segPath = await formatSegmentPath(bindParent)
    return segPath.endsWith('/') ? segPath.slice(0, -1) : segPath
  }
  
  // Not a bound content, handle as regular child content
  // Determine parent if not provided
  let effectiveParentId = parentSegmentId
  if (!effectiveParentId) {
    const directParent = await getDirectParent(contentId)
    if (directParent.code === 0 && directParent.data) {
      effectiveParentId = directParent.data
    }
  }
  
  // If content has a name, append it to parent's path
  if (contentName && effectiveParentId) {
    const parentSegPath = await formatSegmentPath(effectiveParentId)
    return parentSegPath + contentName
  }
  
  // Fallback cases
  if (contentName) {
    return '/' + contentName
  }
  
  // Content with no name and no bind relationship - shouldn't happen in new system
  // But keep for backward compatibility
  if (effectiveParentId) {
    const parentSegPath = await formatSegmentPath(effectiveParentId)
    return parentSegPath.endsWith('/') ? parentSegPath.slice(0, -1) : parentSegPath
  }
  
  return '/'
}

