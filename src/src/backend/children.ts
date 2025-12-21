/**
 * Helper functions for loading children items (segments and content)
 */

import { getSupabaseClient } from './supabase'
import { segmentCache, contentCache, segChildrenCache, PathSegmentCache } from '../cache/cache'
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
    let contentDataMap = new Map()
    
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
    const newItems: ListItem[] = []
    const addedIds = new Set<string>() // Track which IDs we've already added to prevent duplicates
    const relationTypesMap = new Map<string, number[]>() // Track all relationship types per child

    // Get bound content (check cache first) - highest priority
    let boundIds: string[] = []
    if (segChildrenCache.has(parentId, SegmentRelationType.PARENT_CHILD_BIND)) {
      boundIds = segChildrenCache.get(parentId, SegmentRelationType.PARENT_CHILD_BIND) || []
    } else {
      const boundResult = await getChildren(parentId, SegmentRelationType.PARENT_CHILD_BIND)
      boundIds = boundResult.code === 0 ? (boundResult.data || []) : []
      segChildrenCache.set(parentId, SegmentRelationType.PARENT_CHILD_BIND, boundIds)
    }

    // Get direct children (check cache first)
    let directIds: string[] = []
    if (segChildrenCache.has(parentId, SegmentRelationType.PARENT_CHILD_DIRECT)) {
      directIds = segChildrenCache.get(parentId, SegmentRelationType.PARENT_CHILD_DIRECT) || []
    } else {
      const directResult = await getChildren(parentId, SegmentRelationType.PARENT_CHILD_DIRECT)
      directIds = directResult.code === 0 ? (directResult.data || []) : []
      segChildrenCache.set(parentId, SegmentRelationType.PARENT_CHILD_DIRECT, directIds)
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
    // Priority order: bound > direct > indirect
    const allChildIds = [...boundIds, ...directIds, ...indirectIds]
    
    for (const childId of allChildIds) {
      // Skip if already added
      if (addedIds.has(childId)) continue
      
      const segData = await segmentCache.get(childId)
      if (!segData) continue
      
      // Determine relationship types
      const relationTypes = relationTypesMap.get(childId) || []
      const isBind = relationTypes.includes(SegmentRelationType.PARENT_CHILD_BIND)
      
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
        path: pathStr,
        value: contentData?.value || undefined,
        contentType: contentData?.type_code || undefined
      })
      addedIds.add(childId)
    }

    return { code: 0, data: newItems }
  } catch (err: any) {
    console.error('[loadChildrenItems] Error:', err)
    return { code: -5, message: err.message || 'Failed to load children items' }
  }
}

