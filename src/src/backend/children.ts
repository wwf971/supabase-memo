/**
 * Helper functions for loading children items (segments and content)
 */

import { getSupabaseClient } from './supabase'
import { segmentCache, contentCache, segChildrenCache, PathSegmentCache } from './cache'
import { getChildren, getDirectParent, SegmentRelationType } from './segment'
import { formatSegmentPath, formatContentPath } from '../path/PathUtils'
import { ListItem } from '../path/SegList'

/**
 * Load all root-level items (segments and content)
 */
export async function loadRootItems(): Promise<{ code: number; data?: ListItem[]; message?: string }> {
  try {
    const newItems: ListItem[] = []
    const client = getSupabaseClient()

    if (!client) {
      return { code: -1, message: 'Supabase client not available' }
    }

    // Load all segments
    const { data: allSegments, error: segmentsError } = await client
      .from('segment')
      .select('*')
    
    if (segmentsError || !allSegments) {
      return { code: -1, message: segmentsError?.message || 'Failed to load segments' }
    }

    console.log(`[loadRootItems] Caching ${allSegments.length} segments from root query`)
    
    // Also load all content items
    const { data: allContent } = await client
      .from('content')
      .select('id, type_code, value')
    
    const contentIds = new Set((allContent || []).map(c => c.id))
    
    for (const seg of allSegments) {
      segmentCache.set(seg.id, seg as PathSegmentCache)
      
      const isContent = contentIds.has(seg.id)
      const itemType = isContent ? 'content' : 'segment'
      
      // Get path
      let pathStr = '/'
      if (itemType === 'segment') {
        pathStr = await formatSegmentPath(seg.id)
      } else {
        const directParentResult = await getDirectParent(seg.id)
        const parentIdForPath = directParentResult.code === 0 && directParentResult.data ? directParentResult.data : undefined
        pathStr = await formatContentPath(seg.id, seg.name, parentIdForPath)
      }
      
      const contentData = isContent ? (allContent || []).find(c => c.id === seg.id) : null
      
      // Cache content data
      if (contentData) {
        contentCache.set(seg.id, contentData)
      }
      
      newItems.push({
        id: seg.id,
        name: seg.name,
        type: itemType,
        path: pathStr,
        value: contentData?.value || undefined,
        contentType: contentData?.type_code
      })
    }

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

    // Load direct children details (can be segments or content)
    for (const childId of directIds) {
      const segData = await segmentCache.get(childId)
      
      if (segData) {
        const contentData = await contentCache.get(childId)
        const itemType = contentData ? 'content' : 'segment'
        
        // Calculate path
        let pathStr = '/'
        if (itemType === 'segment') {
          pathStr = await formatSegmentPath(childId)
        } else {
          const directParentResult = await getDirectParent(childId)
          const parentIdForPath = directParentResult.code === 0 && directParentResult.data ? directParentResult.data : undefined
          pathStr = await formatContentPath(childId, segData.name, parentIdForPath)
        }
        
        newItems.push({
          id: childId,
          name: segData.name,
          type: itemType,
          relationToDirect: true,
          path: pathStr,
          value: contentData?.value || undefined,
          contentType: contentData?.type_code || undefined
        })
      }
    }

    // Load indirect children details (can be segments or content)
    for (const childId of indirectIds) {
      const segData = await segmentCache.get(childId)
      
      if (segData) {
        const contentData = await contentCache.get(childId)
        const itemType = contentData ? 'content' : 'segment'
        
        // Calculate path
        let pathStr = '/'
        if (itemType === 'segment') {
          pathStr = await formatSegmentPath(childId)
        } else {
          const directParentResult = await getDirectParent(childId)
          const parentIdForPath = directParentResult.code === 0 && directParentResult.data ? directParentResult.data : undefined
          pathStr = await formatContentPath(childId, segData.name, parentIdForPath)
        }
        
        newItems.push({
          id: childId,
          name: segData.name,
          type: itemType,
          relationToDirect: false,
          path: pathStr,
          value: contentData?.value || undefined,
          contentType: contentData?.type_code
        })
      }
    }

    return { code: 0, data: newItems }
  } catch (err: any) {
    console.error('[loadChildrenItems] Error:', err)
    return { code: -5, message: err.message || 'Failed to load children items' }
  }
}

