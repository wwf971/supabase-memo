/**
 * Helper functions for loading children items (segments and content)
 */

import { getSupabaseClient } from './supabase'
import { segmentCache, contentCache, segChildrenCache, segRelationCache } from '../cache/cache'
import { getChildren, getRootItems, getDirectParent, SegmentRelationType } from './segment'
import { formatSegmentPath, formatContentPath } from '../path/PathUtils'
import { ListItem } from '../path/SegList'

/**
 * Load all root-level items (segments and content)
 * Now uses optimized SQL function for better performance
 */
export async function loadRootItems(): Promise<{ code: number; data?: ListItem[]; message?: string }> {
  try {
    const startTime = performance.now()
    
    // Use optimized SQL function to get all root items in one query
    const result = await getRootItems()
    
    if (result.code !== 0 || !result.data) {
      return { code: result.code, message: result.message || 'Failed to load root items' }
    }
    
    const newItems: ListItem[] = []
    const client = getSupabaseClient()
    
    // Fetch content data for items marked as content
    const contentIds = result.data.filter(item => item.is_content).map(item => item.id)
    let contentDataMap = new Map<string, { id: string; type_code: number; value: string }>()
    
    if (contentIds.length > 0) {
      const { data: contentData } = await client
        .from('content')
        .select('id, type_code, value')
        .in('id', contentIds)
      
      if (contentData) {
        for (const c of contentData) {
          contentDataMap.set(c.id, c)
          contentCache.set(c.id, c)
        }
      }
    }
    
    // Process each root item
    for (const item of result.data) {
      const itemType = item.is_content ? 'content' : 'segment'
      
      // Get path
      let pathStr = '/'
      if (itemType === 'segment') {
        pathStr = await formatSegmentPath(item.id)
      } else {
        const directParentResult = await getDirectParent(item.id)
        const parentIdForPath = directParentResult.code === 0 && directParentResult.data ? directParentResult.data : undefined
        pathStr = await formatContentPath(item.id, item.name, parentIdForPath)
      }
      
      const contentData = contentDataMap.get(item.id)
      
      newItems.push({
        id: item.id,
        name: item.name,
        type: itemType,
        path: pathStr,
        value: contentData?.value || undefined,
        contentType: contentData?.type_code
      })
    }
    
    const totalTime = (performance.now() - startTime).toFixed(2)
    console.log(`[loadRootItems] ✅ Loaded ${newItems.length} root items (Total: ${totalTime}ms)`)

    return { code: 0, data: newItems }
  } catch (err: any) {
    console.error('[loadRootItems] Error:', err)
    return { code: -5, message: err.message || 'Failed to load root items' }
  }
}

/**
 * Load children of a specific parent segment
 */
export async function loadChildrenItems(parentId: string): Promise<{ code: number; data?: ListItem[]; message?: string }> {
  try {
    const client = getSupabaseClient()
    const newItems: ListItem[] = []
    const addedIds = new Set<string>() // Track which IDs we've already added to prevent duplicates
    const relationTypesMap = new Map<string, number[]>() // Track all relationship types per child
    const rankMap = new Map<string, number>() // Track rank for direct children

    // Fetch all relations with rank information for direct children
    const { data: directRelations } = await client
      .from('segment_relation')
      .select('segment_2, rank')
      .eq('segment_1', parentId)
      .eq('type', SegmentRelationType.PARENT_CHILD_DIRECT)
      .order('rank', { ascending: true, nullsFirst: false })
    
    const directIds: string[] = []
    if (directRelations) {
      for (const rel of directRelations) {
        directIds.push(rel.segment_2)
        if (rel.rank !== null) {
          rankMap.set(rel.segment_2, rel.rank)
        }
      }
    }
    segChildrenCache.set(parentId, SegmentRelationType.PARENT_CHILD_DIRECT, directIds)

    // Get bound content (check cache first) - highest priority
    let boundIds: string[] = []
    if (segChildrenCache.has(parentId, SegmentRelationType.PARENT_CHILD_BIND)) {
      boundIds = segChildrenCache.get(parentId, SegmentRelationType.PARENT_CHILD_BIND) || []
    } else {
      const boundResult = await getChildren(parentId, SegmentRelationType.PARENT_CHILD_BIND)
      boundIds = boundResult.code === 0 ? (boundResult.data || []) : []
      segChildrenCache.set(parentId, SegmentRelationType.PARENT_CHILD_BIND, boundIds)
    }
    
    // Get indirect children (check cache first)
    let indirectIds: string[] = []
    if (segChildrenCache.has(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT)) {
      indirectIds = segChildrenCache.get(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT) || []
    } else {
      const indirectResult = await getChildren(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT)
      indirectIds = indirectResult.code === 0 ? (indirectResult.data || []) : []
      segChildrenCache.set(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT, indirectIds)
    }

    // Build relationship types map
    for (const childId of boundIds) {
      if (!relationTypesMap.has(childId)) relationTypesMap.set(childId, [])
      relationTypesMap.get(childId)!.push(SegmentRelationType.PARENT_CHILD_BIND)
    }
    for (const childId of directIds) {
      if (!relationTypesMap.has(childId)) relationTypesMap.set(childId, [])
      relationTypesMap.get(childId)!.push(SegmentRelationType.PARENT_CHILD_DIRECT)
    }
    for (const childId of indirectIds) {
      if (!relationTypesMap.has(childId)) relationTypesMap.set(childId, [])
      relationTypesMap.get(childId)!.push(SegmentRelationType.PARENT_CHILD_INDIRECT)
    }

    // Process all children (bind has highest priority for display)
    // Priority order: bound > direct (ordered by rank) > indirect
    const allChildIds = [...boundIds, ...directIds, ...indirectIds]
    
    for (const childId of allChildIds) {
      // Skip if already added
      if (addedIds.has(childId)) continue
      
      const segData = await segmentCache.get(childId)
      if (!segData) continue
      
      // Determine relationship types
      const relationTypes = relationTypesMap.get(childId) || []
      const isBind = relationTypes.includes(SegmentRelationType.PARENT_CHILD_BIND)
      const rank = rankMap.get(childId) // Get rank for direct children
      
      // Only fetch content if:
      // 1. Child is bound (bind relationships are always to content), OR
      // 2. Child is already in content cache
      const shouldFetchContent = isBind || contentCache.has(childId)
      
      const contentData = shouldFetchContent ? await contentCache.get(childId) : null
      const itemType = contentData ? 'content' : 'segment'
      
      // Calculate path
      let pathStr = '/'
      if (itemType === 'segment') {
        pathStr = await formatSegmentPath(childId)
      } else if (isBind) {
        // Bound content uses parent's path (without trailing slash)
        pathStr = await formatContentPath(childId, segData.name, parentId)
      } else {
        const directParentResult = await getDirectParent(childId)
        const parentIdForPath = directParentResult.code === 0 && directParentResult.data ? directParentResult.data : undefined
        pathStr = await formatContentPath(childId, segData.name, parentIdForPath)
      }
      
      newItems.push({
        id: childId,
        name: segData.name,
        type: itemType,
        relationTypes,  // All relationship types (0=direct, 1=indirect, 2=bind)
        rank,  // Include rank for direct children
        path: pathStr,
        value: contentData?.value || undefined,
        contentType: contentData?.type_code || undefined
      })
      addedIds.add(childId)
    }

    // Sort items by rank for items that have rank (direct children)
    // Items without rank (only bind/indirect) stay at the beginning
    const itemsWithRank = newItems.filter(item => item.rank !== undefined)
    const itemsWithoutRank = newItems.filter(item => item.rank === undefined)
    
    itemsWithRank.sort((a, b) => (a.rank || 0) - (b.rank || 0))
    
    // Final order: items without rank (bind-only, indirect) + items with rank (sorted by rank)
    const sortedItems = [...itemsWithoutRank, ...itemsWithRank]

    return { code: 0, data: sortedItems }
  } catch (err: any) {
    console.error('[loadChildrenItems] Error:', err)
    return { code: -5, message: err.message || 'Failed to load children items' }
  }
}


/**
 * Calculate rank for inserting between two items
 * @param rankBefore - Rank of item before insertion point (or null if inserting at start)
 * @param rankAfter - Rank of item after insertion point (or null if inserting at end)
 * @param maxRank - Maximum rank among all children (used when inserting at end)
 * @returns Object with newRank (if possible) or needsReorder flag
 */
export function calcInsertRank(
  rankBefore: number | null,
  rankAfter: number | null,
  maxRank: number
): { newRank?: number; needsReorder: boolean } {
  // Max safe value for 32-bit signed int: 2^30 = 1,073,741,824
  const MAX_SAFE_RANK = 1073741824  // 2^30
  
  // Inserting at the end
  if (rankAfter === null) {
    // Find next power of 2 greater than maxRank
    let nextPowerOf2 = 1024
    while (nextPowerOf2 <= maxRank && nextPowerOf2 < MAX_SAFE_RANK) {
      nextPowerOf2 *= 2
    }
    
    // Check for overflow
    if (nextPowerOf2 >= MAX_SAFE_RANK || nextPowerOf2 <= maxRank) {
      return { needsReorder: true }  // Rank space exhausted
    }
    
    return { newRank: nextPowerOf2, needsReorder: false }
  }
  
  // Inserting at the start
  if (rankBefore === null) {
    // Use half of rankAfter, minimum 512
    const newRank = Math.floor(rankAfter / 2)
    if (newRank >= 512) {
      return { newRank, needsReorder: false }
    }
    // Too small, need reorder
    return { needsReorder: true }
  }
  
  // Inserting in the middle
  const gap = rankAfter - rankBefore
  if (gap <= 1) {
    // No space, need reorder
    return { needsReorder: true }
  }
  
  // Use integer in the middle
  const newRank = Math.floor((rankBefore + rankAfter) / 2)
  return { newRank, needsReorder: false }
}

/**
 * Reorder all direct children of a parent to use powers of 2
 * Call this when ranks become too fragmented (adjacent ranks differ by only 1)
 * Reassigns ranks to: 1024, 2048, 4096, 8192, etc.
 */
export async function reorderChildrenRank(parentId: string): Promise<{ code: number; message?: string }> {
  try {
    const client = getSupabaseClient()
    
    // Get all direct children ordered by current rank
    const { data: relations, error: fetchError } = await client
      .from('segment_relation')
      .select('id, segment_2, rank')
      .eq('segment_1', parentId)
      .eq('type', SegmentRelationType.PARENT_CHILD_DIRECT)
      .order('rank', { ascending: true, nullsFirst: false })
    
    if (fetchError) {
      return { code: -1, message: fetchError.message }
    }
    
    if (!relations || relations.length === 0) {
      return { code: 0, message: 'No children to reorder' }
    }
    
    console.log(`[reorderChildrenRank] Reordering ${relations.length} children of ${parentId}`)
    
    // Reassign ranks to powers of 2: 1024, 2048, 4096, etc.
    let newRank = 1024
    for (const rel of relations) {
      const { error: updateError } = await client
        .from('segment_relation')
        .update({ rank: newRank })
        .eq('id', rel.id)
      
      if (updateError) {
        console.error(`[reorderChildrenRank] Failed to update rank for ${rel.segment_2}:`, updateError)
        return { code: -2, message: updateError.message }
      }
      
      console.log(`[reorderChildrenRank] ${rel.segment_2}: ${rel.rank} → ${newRank}`)
      newRank *= 2
    }
    
    // Invalidate caches - need to reload children to get new ranks
    segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_DIRECT)
    // Force reload by removing from parent cache
    const parentCache = (segRelationCache as any).parentToChildren
    if (parentCache && parentCache.has(parentId)) {
      const childrenByType = parentCache.get(parentId)
      if (childrenByType) {
        childrenByType.delete(SegmentRelationType.PARENT_CHILD_DIRECT)
      }
    }
    const completeAsParent = (segRelationCache as any).completeAsParent
    if (completeAsParent) {
      completeAsParent.delete(parentId)
    }
    
    console.log(`[reorderChildrenRank] ✅ Successfully reordered ${relations.length} children`)
    return { code: 0, message: `Reordered ${relations.length} children` }
  } catch (err: any) {
    console.error('[reorderChildrenRank] Error:', err)
    return { code: -5, message: err.message || 'Failed to reorder children' }
  }
}

/**
 * Move a direct child one step up in rank order (swap with previous sibling)
 * @param parentId - Parent segment ID
 * @param childId - Child segment/content ID
 * @returns Success/error code
 */
export async function moveDirectChildUp(parentId: string, childId: string): Promise<{ code: number; message?: string }> {
  try {
    const supabase = getSupabaseClient()
    
    // Get all direct children with ranks from database
    const { data: relations, error: fetchError } = await supabase
      .from('segment_relation')
      .select('segment_2, rank')
      .eq('segment_1', parentId)
      .eq('type', 0)
      .order('rank', { ascending: true })
    
    if (fetchError) {
      console.error('[moveUp] Failed to fetch children:', fetchError)
      return { code: -1, message: fetchError.message }
    }
    
    if (!relations || relations.length === 0) {
      return { code: -1, message: 'No children found' }
    }
    
    // Sort by rank
    const sortedChildren = relations.map(r => ({ id: r.segment_2, rank: r.rank ?? 0 }))
    
    // Find current position
    const currentIndex = sortedChildren.findIndex(c => c.id === childId)
    if (currentIndex === -1) {
      return { code: -2, message: 'Child not found in direct children' }
    }
    if (currentIndex === 0) {
      return { code: -3, message: 'Already at the top' }
    }
    
    // Swap ranks with previous sibling
    const currentRank = sortedChildren[currentIndex].rank
    const prevRank = sortedChildren[currentIndex - 1].rank
    const prevId = sortedChildren[currentIndex - 1].id
    
    // Update in database
    const { error: error1 } = await supabase
      .from('segment_relation')
      .update({ rank: prevRank })
      .eq('segment_1', parentId)
      .eq('segment_2', childId)
      .eq('type', 0)
    
    if (error1) {
      console.error('[moveUp] Failed to update child rank:', error1)
      return { code: -4, message: error1.message }
    }
    
    const { error: error2 } = await supabase
      .from('segment_relation')
      .update({ rank: currentRank })
      .eq('segment_1', parentId)
      .eq('segment_2', prevId)
      .eq('type', 0)
    
    if (error2) {
      console.error('[moveUp] Failed to update sibling rank:', error2)
      // Rollback first update
      await supabase
        .from('segment_relation')
        .update({ rank: currentRank })
        .eq('segment_1', parentId)
        .eq('segment_2', childId)
        .eq('type', 0)
      return { code: -5, message: error2.message }
    }
    
    // Invalidate cache - need to reload children to reflect new order
    segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_DIRECT)
    segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_BIND)
    segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT)
    const parentCache = (segRelationCache as any).parentToChildren
    if (parentCache && parentCache.has(parentId)) {
      const childrenByType = parentCache.get(parentId)
      if (childrenByType) {
        childrenByType.clear()
      }
    }
    const completeAsParent = (segRelationCache as any).completeAsParent
    if (completeAsParent) {
      completeAsParent.delete(parentId)
    }
    
    console.log(`[moveUp] ✅ Swapped ranks: ${childId} (${currentRank}→${prevRank}) with ${prevId} (${prevRank}→${currentRank})`)
    return { code: 0 }
    
  } catch (error) {
    console.error('[moveUp] Error:', error)
    return { code: -99, message: String(error) }
  }
}

/**
 * Move a direct child one step down in rank order (swap with next sibling)
 * @param parentId - Parent segment ID
 * @param childId - Child segment/content ID
 * @returns Success/error code
 */
export async function moveDirectChildDown(parentId: string, childId: string): Promise<{ code: number; message?: string }> {
  try {
    const supabase = getSupabaseClient()
    
    // Get all direct children with ranks from database
    const { data: relations, error: fetchError } = await supabase
      .from('segment_relation')
      .select('segment_2, rank')
      .eq('segment_1', parentId)
      .eq('type', 0)
      .order('rank', { ascending: true })
    
    if (fetchError) {
      console.error('[moveDown] Failed to fetch children:', fetchError)
      return { code: -1, message: fetchError.message }
    }
    
    if (!relations || relations.length === 0) {
      return { code: -1, message: 'No children found' }
    }
    
    // Sort by rank
    const sortedChildren = relations.map(r => ({ id: r.segment_2, rank: r.rank ?? 0 }))
    
    // Find current position
    const currentIndex = sortedChildren.findIndex(c => c.id === childId)
    if (currentIndex === -1) {
      return { code: -2, message: 'Child not found in direct children' }
    }
    if (currentIndex === sortedChildren.length - 1) {
      return { code: -3, message: 'Already at the bottom' }
    }
    
    // Swap ranks with next sibling
    const currentRank = sortedChildren[currentIndex].rank
    const nextRank = sortedChildren[currentIndex + 1].rank
    const nextId = sortedChildren[currentIndex + 1].id
    
    // Update in database
    const { error: error1 } = await supabase
      .from('segment_relation')
      .update({ rank: nextRank })
      .eq('segment_1', parentId)
      .eq('segment_2', childId)
      .eq('type', 0)
    
    if (error1) {
      console.error('[moveDown] Failed to update child rank:', error1)
      return { code: -4, message: error1.message }
    }
    
    const { error: error2 } = await supabase
      .from('segment_relation')
      .update({ rank: currentRank })
      .eq('segment_1', parentId)
      .eq('segment_2', nextId)
      .eq('type', 0)
    
    if (error2) {
      console.error('[moveDown] Failed to update sibling rank:', error2)
      // Rollback first update
      await supabase
        .from('segment_relation')
        .update({ rank: currentRank })
        .eq('segment_1', parentId)
        .eq('segment_2', childId)
        .eq('type', 0)
      return { code: -5, message: error2.message }
    }
    
    // Invalidate cache - need to reload children to reflect new order
    segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_DIRECT)
    segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_BIND)
    segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT)
    const parentCache = (segRelationCache as any).parentToChildren
    if (parentCache && parentCache.has(parentId)) {
      const childrenByType = parentCache.get(parentId)
      if (childrenByType) {
        childrenByType.clear()
      }
    }
    const completeAsParent = (segRelationCache as any).completeAsParent
    if (completeAsParent) {
      completeAsParent.delete(parentId)
    }
    
    console.log(`[moveDown] ✅ Swapped ranks: ${childId} (${currentRank}→${nextRank}) with ${nextId} (${nextRank}→${currentRank})`)
    return { code: 0 }
    
  } catch (error) {
    console.error('[moveDown] Error:', error)
    return { code: -99, message: String(error) }
  }
}

/**
 * Move a direct child to a specific position (0-based index) in rank order
 * @param parentId - Parent segment ID
 * @param childId - Child segment/content ID
 * @param targetIndex - Target position (0-based, 0 = first)
 * @returns Success/error code
 */
export async function moveDirectChildToPosition(
  parentId: string, 
  childId: string, 
  targetIndex: number
): Promise<{ code: number; message?: string }> {
  try {
    const supabase = getSupabaseClient()
    
    // Get all direct children with ranks from database
    const { data: relations, error: fetchError } = await supabase
      .from('segment_relation')
      .select('segment_2, rank')
      .eq('segment_1', parentId)
      .eq('type', 0)
      .order('rank', { ascending: true })
    
    if (fetchError) {
      console.error('[moveToPosition] Failed to fetch children:', fetchError)
      return { code: -1, message: fetchError.message }
    }
    
    if (!relations || relations.length === 0) {
      return { code: -1, message: 'No children found' }
    }
    
    // Sort by rank
    const sortedChildren = relations.map(r => ({ id: r.segment_2, rank: r.rank ?? 0 }))
    
    // Validate target index
    if (targetIndex < 0 || targetIndex >= sortedChildren.length) {
      return { code: -2, message: `Invalid target index: ${targetIndex} (valid range: 0-${sortedChildren.length - 1})` }
    }
    
    // Find current position
    const currentIndex = sortedChildren.findIndex(c => c.id === childId)
    if (currentIndex === -1) {
      return { code: -3, message: 'Child not found in direct children' }
    }
    if (currentIndex === targetIndex) {
      return { code: 0, message: 'Already at target position' }
    }
    
    // Calculate new rank for target position
    let newRank: number
    
    if (targetIndex === 0) {
      // Moving to first position
      const firstRank = sortedChildren[0].rank
      const result = calcInsertRank(null, firstRank, 0)
      if (result.needsReorder) {
        return { code: -4, message: 'Rank space exhausted, need to reorder all children' }
      }
      newRank = result.newRank!
      
    } else if (targetIndex === sortedChildren.length - 1) {
      // Moving to last position
      const lastRank = sortedChildren[sortedChildren.length - 1].rank
      const maxRank = Math.max(...sortedChildren.map(c => c.rank))
      const result = calcInsertRank(lastRank, null, maxRank)
      if (result.needsReorder) {
        return { code: -4, message: 'Rank space exhausted, need to reorder all children' }
      }
      newRank = result.newRank!
      
    } else {
      // Moving to middle position
      // Need to calculate based on whether moving up or down
      let rankBefore: number, rankAfter: number
      
      if (currentIndex < targetIndex) {
        // Moving down: insert after targetIndex
        rankBefore = sortedChildren[targetIndex].rank
        rankAfter = targetIndex + 1 < sortedChildren.length ? sortedChildren[targetIndex + 1].rank : 0
      } else {
        // Moving up: insert before targetIndex
        rankBefore = targetIndex > 0 ? sortedChildren[targetIndex - 1].rank : 0
        rankAfter = sortedChildren[targetIndex].rank
      }
      
      const result = calcInsertRank(
        rankBefore || null, 
        rankAfter || null, 
        Math.max(...sortedChildren.map(c => c.rank))
      )
      
      if (result.needsReorder) {
        return { code: -4, message: 'Rank space exhausted, need to reorder all children' }
      }
      newRank = result.newRank!
    }
    
    // Update in database
    const { error } = await supabase
      .from('segment_relation')
      .update({ rank: newRank })
      .eq('segment_1', parentId)
      .eq('segment_2', childId)
      .eq('type', 0)
    
    if (error) {
      console.error('[moveToPosition] Failed to update rank:', error)
      return { code: -5, message: error.message }
    }
    
    // Cache doesn't store ranks, no need to update
    console.log(`[moveToPosition] ✅ Moved ${childId} from index ${currentIndex} to ${targetIndex}, rank: ${sortedChildren[currentIndex].rank}→${newRank}`)
    return { code: 0 }
    
  } catch (error) {
    console.error('[moveToPosition] Error:', error)
    return { code: -99, message: String(error) }
  }
}