/**
 * Backend APIs for content management
 */

import { getSupabaseClient } from './supabase'
import { contentCache, contentBinaryCache, segmentCache, segChildrenCache } from './cache'

/**
 * Create a new content entry
 * @param id - Content ID (from id_09ae)
 * @param name - Content name (can be empty string for segment-bound content)
 * @param typeCode - Content type code (1 = text/plain, 2 = text/html, etc.)
 * @param value - Content value
 * @param updateCache - Whether to store in cache after creation (default: true)
 * @returns { code: 0 (success) | <0 (error), message?, data? }
 */
export async function createContent(
  id: string,
  name: string,
  typeCode: number = 1,
  value: string = '',
  updateCache: boolean = true
): Promise<{ code: number; message?: string; data?: any }> {
  try {
    const client = getSupabaseClient()
    
    // Note: content.name is stored in segment table for consistency
    // Create a segment entry with the name
    const { error: segError } = await client
      .from('segment')
      .insert({
        id: id,
        name: name  // Empty string allowed for segment-bound content
      })
    
    if (segError) {
      return { code: -1, message: `Failed to create segment entry: ${segError.message}` }
    }
    
    // Create content entry
    const { data, error } = await client
      .from('content')
      .insert({
        id: id,
        type_code: typeCode,
        value: value
      })
      .select()
      .single()
    
    if (error) {
      return { code: -1, message: error.message }
    }
    
    // Cache the content if requested
    if (updateCache) {
      contentCache.set(id, { id, type_code: typeCode, value })
      console.log(`[content] Created content: ${id} (name: "${name}", type: ${typeCode}) - cached`)
    } else {
      console.log(`[content] Created content: ${id} (name: "${name}", type: ${typeCode}) - not cached`)
    }
    
    return { code: 0, data }
  } catch (err: any) {
    console.error('[content] Error creating content:', err)
    return { code: -5, message: err.message || 'Failed to create content' }
  }
}

/**
 * Get content by ID
 * @param id - Content ID
 * @returns { code: 0 (success) | <0 (error), message?, data? }
 */
export async function getContent(
  id: string
): Promise<{ code: number; message?: string; data?: any }> {
  try {
    // Use cache.get() - automatically fetches from server if not cached
    const data = await contentCache.get(id)
    
    if (data) {
      return { code: 0, data }
    }
    
    return { code: -1, message: 'Content not found' }
  } catch (err: any) {
    console.error('[content] Error getting content:', err)
    return { code: -5, message: err.message || 'Failed to get content' }
  }
}

/**
 * Update content value
 * @param id - Content ID
 * @param value - New content value
 * @returns { code: 0 (success) | <0 (error), message? }
 */
export async function updateContent(
  id: string,
  value: string
): Promise<{ code: number; message?: string }> {
  try {
    const client = getSupabaseClient()
    
    const { error } = await client
      .from('content')
      .update({ value })
      .eq('id', id)
    
    if (error) {
      return { code: -1, message: error.message }
    }
    
    // Update cache
    const cached = await contentCache.get(id)
    if (cached) {
      contentCache.set(id, { ...cached, value })
    }
    
    console.log(`[content] Updated content: ${id}`)
    return { code: 0 }
  } catch (err: any) {
    console.error('[content] Error updating content:', err)
    return { code: -5, message: err.message || 'Failed to update content' }
  }
}

/**
 * Delete content and all related data
 * @param id - Content ID
 * @returns { code: 0 (success) | <0 (error), message? }
 */
export async function deleteContent(
  id: string
): Promise<{ code: number; message?: string }> {
  const startTime = performance.now()
  console.log(`[content] 🗑️  Deleting content: ${id}`)
  
  try {
    const client = getSupabaseClient()
    
    // First, get content info to check if it's binary
    const content = await contentCache.get(id)
    let isBinary = false
    let binaryId: string | null = null
    
    if (content && content.value.startsWith('binary:')) {
      isBinary = true
      binaryId = content.value.substring(7)
      console.log(`[content] ↳ Detected binary content, binary_id: ${binaryId}`)
    }
    
    // Get parent relationships before deletion (to invalidate cache)
    const { data: parentRelations } = await client
      .from('segment_relation')
      .select('segment_1, type')
      .eq('segment_2', id)
    
    // Delete from segment_relation (both as segment_1 and segment_2)
    const { error: relationError } = await client
      .from('segment_relation')
      .delete()
      .or(`segment_1.eq.${id},segment_2.eq.${id}`)
    
    if (relationError) {
      console.log(`[content] ❌ Failed to delete relations: ${relationError.message}`)
      return { code: -1, message: `Failed to delete relations: ${relationError.message}` }
    }
    console.log(`[content] ✓ Deleted relations`)
    
    // Delete binary data if exists
    if (isBinary && binaryId) {
      const { error: binaryError } = await client
        .from('content_binary')
        .delete()
        .eq('id', binaryId)
      
      if (binaryError) {
        console.log(`[content] ⚠️  Failed to delete binary data: ${binaryError.message}`)
        // Continue anyway - might not exist
      } else {
        console.log(`[content] ✓ Deleted binary data`)
      }
      
      // Remove from binary cache
      contentBinaryCache.delete(binaryId)
    }
    
    // Delete content entry
    const { error: contentError } = await client
      .from('content')
      .delete()
      .eq('id', id)
    
    if (contentError) {
      console.log(`[content] ❌ Failed to delete content: ${contentError.message}`)
      return { code: -2, message: `Failed to delete content: ${contentError.message}` }
    }
    console.log(`[content] ✓ Deleted content entry`)
    
    // Delete segment entry (for the name)
    const { error: segError } = await client
      .from('segment')
      .delete()
      .eq('id', id)
    
    if (segError) {
      console.log(`[content] ❌ Failed to delete segment: ${segError.message}`)
      return { code: -3, message: `Failed to delete segment: ${segError.message}` }
    }
    console.log(`[content] ✓ Deleted segment entry`)
    
    // Remove from all caches
    contentCache.delete(id)
    segmentCache.delete(id)
    
    // Invalidate parent children caches
    if (parentRelations && parentRelations.length > 0) {
      for (const rel of parentRelations) {
        segChildrenCache.delete(rel.segment_1, rel.type)
        console.log(`[content] ✓ Invalidated children cache for parent ${rel.segment_1}, type ${rel.type}`)
      }
    }
    
    const duration = (performance.now() - startTime).toFixed(2)
    console.log(`[content] ✅ Deleted content ${id} successfully (${duration}ms)`)
    return { code: 0 }
  } catch (err: any) {
    console.error('[content] Error deleting content:', err)
    return { code: -5, message: err.message || 'Failed to delete content' }
  }
}

