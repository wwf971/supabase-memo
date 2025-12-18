/**
 * Backend APIs for content management
 */

import { getSupabaseClient } from './supabase'
import { contentCache } from './cache'

/**
 * Create a new content entry
 * @param id - Content ID (from id_09ae)
 * @param name - Content name (can be empty string for segment-bound content)
 * @param typeCode - Content type code (1 = text/plain, 2 = text/html, etc.)
 * @param value - Content value
 * @returns { code: 0 (success) | <0 (error), message?, data? }
 */
export async function createContent(
  id: string,
  name: string,
  typeCode: number = 1,
  value: string = ''
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
    
    // Cache the content
    contentCache.set(id, { id, type_code: typeCode, value })
    console.log(`[content] Created content: ${id} (name: "${name}", type: ${typeCode})`)
    
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
 * Delete content
 * @param id - Content ID
 * @returns { code: 0 (success) | <0 (error), message? }
 */
export async function deleteContent(
  id: string
): Promise<{ code: number; message?: string }> {
  try {
    const client = getSupabaseClient()
    
    // Delete content entry
    const { error: contentError } = await client
      .from('content')
      .delete()
      .eq('id', id)
    
    if (contentError) {
      return { code: -1, message: contentError.message }
    }
    
    // Delete segment entry (for the name)
    const { error: segError } = await client
      .from('segment')
      .delete()
      .eq('id', id)
    
    if (segError) {
      return { code: -1, message: segError.message }
    }
    
    // Remove from cache
    contentCache.delete(id)
    
    console.log(`[content] Deleted content: ${id}`)
    return { code: 0 }
  } catch (err: any) {
    console.error('[content] Error deleting content:', err)
    return { code: -5, message: err.message || 'Failed to delete content' }
  }
}

