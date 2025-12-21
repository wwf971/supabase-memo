import { getSupabaseClient } from './supabase'
import { segmentCache, contentCache, segPathCache, segChildrenCache, segRelationCache } from '../cache/cache'

/**
 * Get all root-level segments and content using SQL function
 * Much more efficient than fetching all items and filtering client-side
 */
export const getRootItems = async (): Promise<{ 
  code: number; 
  data?: Array<{ id: string; name: string; type_code: number; created_at: string; updated_at: string; is_content: boolean }>; 
  message?: string 
}> => {
  const startTime = performance.now()
  
  try {
    const client = getSupabaseClient()
    
    // Call SQL function
    const { data, error } = await client.rpc('get_root_items')
    
    if (error) {
      console.error('[segment] Error getting root items:', error)
      return { code: -1, message: error.message }
    }
    
    const totalTime = (performance.now() - startTime).toFixed(2)
    console.log(`[segment] ✅ Got ${data?.length || 0} root items (DB: ${totalTime}ms)`)
    
    // Update caches for all returned items
    if (data && data.length > 0) {
      for (const item of data) {
        // Always add to segment cache
        segmentCache.set(item.id, {
          id: item.id,
          name: item.name,
          type_code: item.type_code,
          created_at: item.created_at,
          updated_at: item.updated_at
        })
        
        // If it's content, we need to fetch full content data separately
        // (The SQL function only returns basic segment data)
        if (item.is_content && !contentCache.has(item.id)) {
          // Mark that we know it's content, but don't fetch yet
          // It will be fetched on-demand when needed
        }
      }
    }
    
    return { code: 0, data: data || [] }
  } catch (err: any) {
    console.error('[segment] Failed to get root items:', err)
    return { code: -1, message: err.message || 'Failed to get root items' }
  }
}

/**
 * Get path to root using SQL function (single query with recursive CTE)
 * Much more efficient than multiple sequential queries
 */
export const getPathToRootOptimized = async (segmentId: string): Promise<{ code: number; data?: string[]; message?: string }> => {
  const startTime = performance.now()
  
  try {
    // Check cache first
    if (segPathCache.has(segmentId)) {
      const cachedPath = segPathCache.get(segmentId)!
      console.log(`[segment] ✓ Path to root found in CACHE for ${segmentId}: ${cachedPath.length} segments (${(performance.now() - startTime).toFixed(2)}ms)`)
      return { code: 0, data: cachedPath }
    }

    console.log(`[segment] ⚠️ Path to root NOT in cache for ${segmentId}, using SQL function...`)
    
    const client = getSupabaseClient()
    
    // Call SQL function - returns array of segment IDs from root to target
    const { data, error } = await client.rpc('get_path_to_root', { target_segment_id: segmentId })
    
    if (error) {
      console.error(`[segment] Error getting path to root:`, error)
      return { code: -1, message: error.message }
    }
    
    const path = data || []
    
    // Cache the path
    segPathCache.set(segmentId, path)
    const totalTime = (performance.now() - startTime).toFixed(2)
    console.log(`[segment] ✅ Got and cached path for ${segmentId}: ${path.length} segments (DB: ${totalTime}ms)`)
    
    return { code: 0, data: path }
  } catch (err: any) {
    console.error(`[segment] Failed to get path to root:`, err)
    return { code: -1, message: err.message || 'Failed to get path to root' }
  }
}

/**
 * Segment relation types
 */
export enum SegmentRelationType {
  PARENT_CHILD_DIRECT = 0,
  PARENT_CHILD_INDIRECT = 1,
  PARENT_CHILD_BIND = 2
}

export interface SegmentRelation {
  id: number
  type: number
  segment_1: string
  segment_2: string
  created_at: string
  metadata: any
}

/**
 * Get all parents of a segment or content
 * @param id - ID of segment or content
 * @param relationType - Relation type (default: PARENT_CHILD_DIRECT)
 */
export async function getParents(
  id: string,
  relationType: SegmentRelationType = SegmentRelationType.PARENT_CHILD_DIRECT
): Promise<{ code: number; message?: string; data?: string[] }> {
  try {
    const startTime = performance.now()
    
    // Check cache first
    if (segRelationCache.hasParents(id, relationType)) {
      const parents = segRelationCache.getParents(id, relationType) || []
      console.log(`[segment] ✓ Parents found in CACHE for ${id} (relation: ${relationType}): ${parents.length} parents (${(performance.now() - startTime).toFixed(2)}ms)`)
      return { code: 0, data: parents }
    }
    
    // Not in cache, load all relations as child
    console.log(`[segment] 🔍 Cache MISS for parents of ${id}, loading from DB...`)
    const loadResult = await segRelationCache.loadAsChild(id)
    if (loadResult.code !== 0) {
      return { code: loadResult.code, message: loadResult.message }
    }
    
    const parents = segRelationCache.getParents(id, relationType) || []
    console.log(`[segment] ✅ Got ${parents.length} parents (DB + Cache, Total: ${(performance.now() - startTime).toFixed(2)}ms)`)
    
    return { code: 0, data: parents }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to get parents' }
  }
}

/**
 * Get all children of a segment or content
 * @param id - ID of segment or content
 * @param relationType - Relation type (default: PARENT_CHILD_DIRECT)
 */
export async function getChildren(
  id: string,
  relationType: SegmentRelationType = SegmentRelationType.PARENT_CHILD_DIRECT
): Promise<{ code: number; message?: string; data?: string[] }> {
  try {
    const startTime = performance.now()
    
    // Check cache first
    if (segRelationCache.hasChildren(id, relationType)) {
      const children = segRelationCache.getChildren(id, relationType) || []
      console.log(`[segment] ✓ Children found in CACHE for ${id} (relation: ${relationType}): ${children.length} children (${(performance.now() - startTime).toFixed(2)}ms)`)
      return { code: 0, data: children }
    }
    
    // Not in cache, load all relations as parent
    console.log(`[segment] 🔍 Cache MISS for children of ${id}, loading from DB...`)
    const loadResult = await segRelationCache.loadAsParent(id)
    if (loadResult.code !== 0) {
      return { code: loadResult.code, message: loadResult.message }
    }
    
    const children = segRelationCache.getChildren(id, relationType) || []
    console.log(`[segment] ✅ Got ${children.length} children (DB + Cache, Total: ${(performance.now() - startTime).toFixed(2)}ms)`)
    
    return { code: 0, data: children }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to get children' }
  }
}

/**
 * Create a parent-child relationship
 * @param parentId - Parent ID (segment or content)
 * @param childId - Child ID (segment or content)
 * @param relationType - Relation type (default: PARENT_CHILD_DIRECT)
 */
export async function createRelation(
  parentId: string,
  childId: string,
  relationType: SegmentRelationType = SegmentRelationType.PARENT_CHILD_DIRECT
): Promise<{ code: number; message?: string; data?: SegmentRelation }> {
  try {
    const client = getSupabaseClient()

    const { data, error } = await client
      .from('segment_relation')
      .insert({
        type: relationType,
        segment_1: parentId,
        segment_2: childId
      })
      .select()
      .single()

    if (error) {
      return { code: -5, message: error.message }
    }

    // Add to relation cache (also invalidates path cache internally)
    segRelationCache.addRelation(parentId, childId, relationType)
    
    // Invalidate old children cache (for backward compatibility)
    segChildrenCache.delete(parentId, relationType)
    console.log(`[segment] Created relation and updated caches: ${parentId} -> ${childId} (type ${relationType})`)

    return { code: 0, data }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to create relation' }
  }
}

/**
 * Delete a relationship
 * @param parentId - Parent ID
 * @param childId - Child ID
 * @param relationType - Relation type (default: PARENT_CHILD_DIRECT)
 */
export async function deleteRelation(
  parentId: string,
  childId: string,
  relationType: SegmentRelationType = SegmentRelationType.PARENT_CHILD_DIRECT
): Promise<{ code: number; message?: string }> {
  try {
    const client = getSupabaseClient()

    const { error } = await client
      .from('segment_relation')
      .delete()
      .eq('type', relationType)
      .eq('segment_1', parentId)
      .eq('segment_2', childId)

    if (error) {
      return { code: -5, message: error.message }
    }

    // Remove from relation cache (also invalidates path cache internally)
    segRelationCache.removeRelation(parentId, childId, relationType)
    
    // Invalidate old children cache (for backward compatibility)
    segChildrenCache.delete(parentId, relationType)
    console.log(`[segment] Deleted relation and updated caches: ${parentId} -> ${childId} (type ${relationType})`)

    return { code: 0 }
  } catch (err: any) {
    if (err.message && err.message.includes('not configured')) {
      return { code: -1, message: 'Supabase not configured.' }
    }
    return { code: -5, message: err.message || 'Failed to delete relation' }
  }
}

/**
 * Get all relations for a given ID (both as parent and child)
 * @param id - ID of segment or content
 * @param relationType - Optional relation type filter
 */
export async function getAllRelations(
  id: string,
  relationType?: SegmentRelationType
): Promise<{ code: number; message?: string; data?: SegmentRelation[] }> {
  try {
    const client = getSupabaseClient()

    let query = client
      .from('segment_relation')
      .select('*')
      .or(`segment_1.eq.${id},segment_2.eq.${id}`)

    if (relationType !== undefined) {
      query = query.eq('type', relationType)
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
    return { code: -5, message: err.message || 'Failed to get relations' }
  }
}

/**
 * Get the direct parent of a segment (type 0 relationship)
 * @param id - ID of segment
 */
export async function getDirectParent(
  id: string
): Promise<{ code: number; message?: string; data?: string | null }> {
  const result = await getParents(id, SegmentRelationType.PARENT_CHILD_DIRECT)
  
  if (result.code !== 0) {
    return { code: result.code, message: result.message, data: null }
  }

  const parents = result.data || []
  return { code: 0, data: parents.length > 0 ? parents[0] : null }
}

/**
 * Get path to root for a segment (following direct parent relationships)
 * Returns array of segment IDs from root to the given segment
 * @param segmentId - The segment to get path for
 * @returns { code, data: string[] } - Array of segment IDs [root, ..., segment]
 */
export const getPathToRoot = async (segmentId: string): Promise<{ code: number; data?: string[]; message?: string }> => {
  const startTime = performance.now()
  
  try {
    // Check cache first
    if (segPathCache.has(segmentId)) {
      const cachedPath = segPathCache.get(segmentId)!
      console.log(`[segment] ✓ Path to root found in CACHE for ${segmentId}: ${cachedPath.length} segments (${(performance.now() - startTime).toFixed(2)}ms)`)
      return { code: 0, data: cachedPath }
    }

    console.log(`[segment] ⚠️ Path to root NOT in cache for ${segmentId}, computing with SERVER requests...`)
    
    const client = getSupabaseClient()
    const path: string[] = []
    let currentId: string | null = segmentId
    const visited = new Set<string>() // Prevent infinite loops
    let dbRequestCount = 0
    
    // Traverse up to root following direct parent relationships
    while (currentId) {
      // Prevent infinite loops
      if (visited.has(currentId)) {
        console.error(`[segment] Cycle detected in parent chain for ${segmentId}`)
        return { code: -2, message: 'Cycle detected in parent relationships' }
      }
      visited.add(currentId)
      
      path.unshift(currentId) // Add to beginning of array
      
      // Get direct parent
      const dbStart = performance.now()
      const { data: relations, error } = await client
        .from('segment_relation')
        .select('segment_1')
        .eq('segment_2', currentId)
        .eq('type', SegmentRelationType.PARENT_CHILD_DIRECT)
        .limit(1)
      
      dbRequestCount++
      console.log(`[segment] 🔍 DB request #${dbRequestCount} for parent of ${currentId}: ${(performance.now() - dbStart).toFixed(2)}ms`)
      
      if (error) {
        console.error(`[segment] Error getting parent for ${currentId}:`, error)
        return { code: -1, message: error.message }
      }
      
      // If no direct parent, we've reached root
      if (!relations || relations.length === 0) {
        currentId = null
      } else {
        currentId = relations[0].segment_1
      }
    }
    
    // Cache the path
    segPathCache.set(segmentId, path)
    const totalTime = (performance.now() - startTime).toFixed(2)
    console.log(`[segment] ✅ Computed and cached path for ${segmentId}: ${path.length} segments, ${dbRequestCount} DB requests, TOTAL: ${totalTime}ms`)
    
    return { code: 0, data: path }
  } catch (err: any) {
    console.error(`[segment] Failed to get path to root:`, err)
    return { code: -1, message: err.message || 'Failed to get path to root' }
  }
}

