/**
 * Cache refresh utilities
 * Provides functions to clear and refresh cache data for specific segments/content
 * Important: Refreshing means CLEARING first, then fetching - especially important after deleting/changing relations
 */

import { segmentCache, contentCache, segPathCache, segRelationCache } from './cache'
import { getSupabaseClient } from '../backend/supabase'

/**
 * Refresh all cache data related to a specific segment or content item
 * This includes:
 * - Segment/content metadata
 * - Relations (as parent and as child)
 * - Path cache
 * 
 * @param itemId - The segment or content ID to refresh
 * @returns Promise with success/error info
 */
export async function refreshItem(itemId: string): Promise<{ code: number; message?: string }> {
  try {
    console.log(`[refreshCache] 🔄 Refreshing cache for ${itemId}`)
    
    // Step 1: Fetch fresh segment data from server
    const client = getSupabaseClient()
    if (!client) {
      return { code: -1, message: 'Supabase client not available' }
    }
    
    const { data: segData, error: segError } = await client
      .from('segment')
      .select('*')
      .eq('id', itemId)
      .single()
    
    if (segError || !segData) {
      console.error(`[refreshCache] ❌ Failed to fetch segment ${itemId}:`, segError)
      return { code: -2, message: `Failed to fetch segment: ${segError?.message || 'Not found'}` }
    }
    
    // Step 2: If it's content, fetch content data
    let contentData = null
    if (segData.isContent) {
      const { data: cData, error: contentError } = await client
        .from('content')
        .select('*')
        .eq('id', itemId)
        .single()
      
      if (!contentError && cData) {
        contentData = cData
      }
    }
    
    // Step 3: Only after successful fetch, clear and update cache
    segmentCache.delete(itemId)
    contentCache.delete(itemId)
    segPathCache.delete(itemId)
    
    segmentCache.set(itemId, segData)
    if (contentData) {
      contentCache.set(itemId, contentData)
    }
    
    console.log(`[refreshCache] ✅ Refreshed cache for ${itemId}`)
    return { code: 0 }
  } catch (err: any) {
    console.error('[refreshCache] ❌ Error:', err)
    return { code: -5, message: err.message || 'Failed to refresh cache' }
  }
}

/**
 * Refresh relations for a segment (both as parent and as child)
 * This clears and re-fetches ALL relations for the segment
 * 
 * @param segmentId - The segment ID to refresh relations for
 * @returns Promise with success/error info
 */
export async function refreshRelations(segmentId: string): Promise<{ code: number; message?: string }> {
  try {
    console.log(`[refreshCache] 🔄 Refreshing relations for ${segmentId}`)
    
    const client = getSupabaseClient()
    if (!client) {
      return { code: -1, message: 'Supabase client not available' }
    }
    
    // Step 1: Fetch fresh relations from server (both as parent and child)
    const { error: parentError } = await client
      .from('segment_relation')
      .select('segment_2, type')
      .eq('segment_1', segmentId)
    
    if (parentError) {
      console.error(`[refreshCache] ❌ Failed to fetch parent relations for ${segmentId}:`, parentError)
      return { code: -2, message: `Failed to fetch parent relations: ${parentError.message}` }
    }
    
    const { error: childError } = await client
      .from('segment_relation')
      .select('segment_1, type')
      .eq('segment_2', segmentId)
    
    if (childError) {
      console.error(`[refreshCache] ❌ Failed to fetch child relations for ${segmentId}:`, childError)
      return { code: -3, message: `Failed to fetch child relations: ${childError.message}` }
    }
    
    // Step 2: Only after successful fetch, clear and update relation cache
    const cache = segRelationCache as any // Access private properties
    
    // Clear from parent->child map
    cache.parentToChildren.delete(segmentId)
    cache.completeAsParent.delete(segmentId)
    
    // Clear from child->parent map
    cache.childToParents.delete(segmentId)
    cache.completeAsChild.delete(segmentId)
    
    // Step 3: Re-load relations (this will use our freshly cleared cache)
    await segRelationCache.loadAll(segmentId)
    
    console.log(`[refreshCache] ✅ Refreshed relations for ${segmentId}`)
    return { code: 0 }
  } catch (err: any) {
    console.error('[refreshCache] ❌ Error refreshing relations:', err)
    return { code: -5, message: err.message || 'Failed to refresh relations' }
  }
}

/**
 * Refresh children cache for a parent segment
 * This clears the parent's relation cache and re-fetches it
 * Use this after adding/removing/modifying children
 * 
 * @param parentId - The parent segment ID
 * @returns Promise with success/error info
 */
export async function refreshChildren(parentId: string): Promise<{ code: number; message?: string }> {
  try {
    console.log(`[refreshCache] 🔄 Refreshing children for parent ${parentId}`)
    
    // Step 1: Fetch fresh relations from server
    const client = getSupabaseClient()
    if (!client) {
      return { code: -1, message: 'Supabase client not available' }
    }
    
    const { error } = await client
      .from('segment_relation')
      .select('segment_2, type')
      .eq('segment_1', parentId)
    
    if (error) {
      console.error(`[refreshCache] ❌ Failed to fetch children for ${parentId}:`, error)
      return { code: -2, message: `Failed to fetch children: ${error.message}` }
    }
    
    // Step 2: Only after successful fetch, clear and update cache
    const cache = segRelationCache as any
    
    // Clear parent->child mappings only (keep child->parent)
    cache.parentToChildren.delete(parentId)
    cache.completeAsParent.delete(parentId)
    
    // Re-fetch as parent (this will use our freshly cleared cache)
    await segRelationCache.loadAsParent(parentId)
    
    console.log(`[refreshCache] ✅ Refreshed children for ${parentId}`)
    return { code: 0 }
  } catch (err: any) {
    console.error('[refreshCache] ❌ Error refreshing children:', err)
    return { code: -5, message: err.message || 'Failed to refresh children' }
  }
}

/**
 * Comprehensive refresh for a segment - refreshes metadata, relations, and children
 * Use this when you want to ensure all data is fresh
 * 
 * @param segmentId - The segment ID to fully refresh
 * @returns Promise with success/error info
 */
export async function refreshSegmentComplete(segmentId: string): Promise<{ code: number; message?: string }> {
  try {
    console.log(`[refreshCache] 🔄 Complete refresh for ${segmentId}`)
    
    // Refresh item metadata
    const itemResult = await refreshItem(segmentId)
    if (itemResult.code !== 0) {
      return itemResult
    }
    
    // Refresh all relations
    const relResult = await refreshRelations(segmentId)
    if (relResult.code !== 0) {
      return relResult
    }
    
    console.log(`[refreshCache] ✅ Complete refresh done for ${segmentId}`)
    return { code: 0 }
  } catch (err: any) {
    console.error('[refreshCache] ❌ Error in complete refresh:', err)
    return { code: -5, message: err.message || 'Failed to complete refresh' }
  }
}

