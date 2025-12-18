/**
 * Cache for path segment and content information
 * Avoids repeated server queries
 */

import { getSupabaseClient } from './supabase'

export interface PathSegmentCache {
  id: string
  name: string
  created_at: string
  updated_at: string
  metadata: any
}

export interface ContentCache {
  id: string
  type_code: number
  value: string
  created_at?: string
  updated_at?: string
}

export interface ContentBinaryCache {
  id: string
  data: ArrayBuffer | Uint8Array | string // Supabase returns BYTEA as base64 string
  size_bytes: number
  created_at?: string
}

/**
 * Cache for segment children (stores child IDs by parent ID and relation type)
 */
export interface SegmentChildrenCache {
  parentId: string
  relationType: number
  childIds: string[]
  timestamp: number
}

class Cache<T extends { id: string }> {
  private cache: Map<string, T> = new Map()
  private tableName: string

  constructor(tableName: string) {
    this.tableName = tableName
  }

  /**
   * Get item from cache or fetch from server if not cached
   */
  async get(id: string): Promise<T | null> {
    const startTime = performance.now()
    
    // Check cache first
    if (this.cache.has(id)) {
      const cached = this.cache.get(id)!
      console.log(`[${this.tableName}] ✓ Cache HIT for ${id} (${(performance.now() - startTime).toFixed(2)}ms)`)
      return cached
    }

    // Fetch from server
    console.log(`[${this.tableName}] ⚠️ Cache MISS for ${id}, fetching from SERVER...`)
    const fetchStart = performance.now()
    
    try {
      const client = getSupabaseClient()
      if (!client) {
        console.error(`[${this.tableName}] Supabase client not available`)
        return null
      }

      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        console.log(`[${this.tableName}] ❌ Failed to fetch ${id}`)
        return null
      }

      this.cache.set(id, data)
      const fetchTime = (performance.now() - fetchStart).toFixed(2)
      console.log(`[${this.tableName}] ✅ Fetched and cached ${id} (SERVER: ${fetchTime}ms, Total: ${(performance.now() - startTime).toFixed(2)}ms)`)
      
      return data
    } catch (err) {
      console.error(`[${this.tableName}] Error fetching:`, err)
      return null
    }
  }

  /**
   * Get item synchronously from cache only (no fetch)
   */
  getSync(id: string): T | undefined {
    return this.cache.get(id)
  }

  /**
   * Set item in cache
   */
  set(id: string, item: T): void {
    this.cache.set(id, item)
  }

  /**
   * Set multiple items in cache
   */
  setMany(items: T[]): void {
    items.forEach(item => this.cache.set(item.id, item))
  }

  /**
   * Check if item exists in cache
   */
  has(id: string): boolean {
    return this.cache.has(id)
  }

  /**
   * Remove item from cache
   */
  delete(id: string): void {
    this.cache.delete(id)
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size
  }

  /**
   * Rename item (update name in database and cache)
   */
  async rename(id: string, newName: string): Promise<{ code: number; message?: string }> {
    const startTime = performance.now()
    console.log(`[${this.tableName}] 📝 Renaming ${id} to "${newName}"`)
    
    try {
      const client = getSupabaseClient()
      if (!client) {
        return { code: -1, message: 'Supabase client not available' }
      }

      // Update in database
      const { data, error } = await client
        .from(this.tableName)
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error || !data) {
        console.log(`[${this.tableName}] ❌ Rename failed: ${error?.message || 'Unknown error'}`)
        return { code: -2, message: error?.message || 'Failed to rename' }
      }

      // Update cache
      this.cache.set(id, data)
      console.log(`[${this.tableName}] ✅ Renamed successfully (${(performance.now() - startTime).toFixed(2)}ms)`)
      
      return { code: 0 }
    } catch (err: any) {
      console.log(`[${this.tableName}] ❌ Rename error: ${err.message}`)
      return { code: -3, message: err.message }
    }
  }
}

/**
 * Cache for segment path to root
 * Key: segment ID, Value: array of segment IDs from root to this segment
 */
class PathCache {
  private cache: Map<string, string[]> = new Map()

  /**
   * Get path from cache
   */
  get(segmentId: string): string[] | undefined {
    return this.cache.get(segmentId)
  }

  /**
   * Set path in cache
   */
  set(segmentId: string, path: string[]): void {
    this.cache.set(segmentId, path)
  }

  /**
   * Check if path exists in cache
   */
  has(segmentId: string): boolean {
    return this.cache.has(segmentId)
  }

  /**
   * Remove path from cache
   */
  delete(segmentId: string): void {
    this.cache.delete(segmentId)
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
  }
}

/**
 * Special cache for children relationships
 * Key format: `${parentId}_${relationType}`
 */
class ChildrenCache {
  private cache: Map<string, string[]> = new Map()

  /**
   * Get children IDs from cache
   */
  get(parentId: string, relationType: number): string[] | undefined {
    const key = `${parentId}_${relationType}`
    return this.cache.get(key)
  }

  /**
   * Set children IDs in cache
   */
  set(parentId: string, relationType: number, childIds: string[]): void {
    const key = `${parentId}_${relationType}`
    this.cache.set(key, childIds)
  }

  /**
   * Check if children exist in cache
   */
  has(parentId: string, relationType: number): boolean {
    const key = `${parentId}_${relationType}`
    return this.cache.has(key)
  }

  /**
   * Remove children from cache
   */
  delete(parentId: string, relationType: number): void {
    const key = `${parentId}_${relationType}`
    this.cache.delete(key)
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
  }
}

/**
 * Special cache for binary content data
 * Handles ArrayBuffer storage for images, PDFs, etc.
 */
class BinaryCache {
  private cache: Map<string, ContentBinaryCache> = new Map()
  private tableName = 'content_binary'

  /**
   * Get binary data from cache or fetch from server
   */
  async get(id: string): Promise<ContentBinaryCache | null> {
    const startTime = performance.now()
    
    // Check cache first
    if (this.cache.has(id)) {
      const cached = this.cache.get(id)!
      console.log(`[${this.tableName}] ✓ Cache HIT for ${id} (${(performance.now() - startTime).toFixed(2)}ms)`)
      return cached
    }

    // Fetch from server
    console.log(`[${this.tableName}] ⚠️ Cache MISS for ${id}, fetching from SERVER...`)
    const fetchStart = performance.now()
    
    try {
      const client = getSupabaseClient()
      if (!client) {
        console.error(`[${this.tableName}] Supabase client not available`)
        return null
      }

      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        console.log(`[${this.tableName}] ❌ Failed to fetch ${id}`)
        return null
      }

      this.cache.set(id, data)
      const fetchTime = (performance.now() - fetchStart).toFixed(2)
      console.log(`[${this.tableName}] ✅ Fetched and cached ${id} (SERVER: ${fetchTime}ms, Total: ${(performance.now() - startTime).toFixed(2)}ms)`)
      
      return data
    } catch (err) {
      console.error(`[${this.tableName}] Error fetching:`, err)
      return null
    }
  }

  /**
   * Get binary data synchronously from cache only
   */
  getSync(id: string): ContentBinaryCache | undefined {
    return this.cache.get(id)
  }

  /**
   * Set binary data in cache
   */
  set(id: string, item: ContentBinaryCache): void {
    this.cache.set(id, item)
  }

  /**
   * Upload binary data to server and cache it
   * Note: MIME type is determined from content.type_code, not stored in content_binary
   */
  async upload(id: string, binaryData: ArrayBuffer | Uint8Array): Promise<{ code: number; message?: string }> {
    const startTime = performance.now()
    const bytes = binaryData instanceof Uint8Array ? binaryData : new Uint8Array(binaryData)
    console.log(`[${this.tableName}] 📤 Uploading binary ${id} (${bytes.byteLength} bytes), first 10:`, Array.from(bytes.slice(0, 10)))
    
    try {
      const client = getSupabaseClient()
      if (!client) {
        return { code: -1, message: 'Supabase client not available' }
      }

      // Convert Uint8Array to base64 for BYTEA storage
      // Supabase JS client serializes Uint8Array as JSON, so we must use base64
      let binaryString = ''
      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i])
      }
      const base64Data = btoa(binaryString)
      console.log(`[${this.tableName}] 📤 Converted to base64, length: ${base64Data.length}`)

      const { data, error } = await client
        .from(this.tableName)
        .insert({
          id,
          data: base64Data, // Send as base64 string
          size_bytes: bytes.byteLength,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error || !data) {
        console.log(`[${this.tableName}] ❌ Upload failed: ${error?.message || 'Unknown error'}`)
        return { code: -2, message: error?.message || 'Failed to upload' }
      }

      console.log(`[${this.tableName}] 📥 Server returned data type:`, typeof data.data, 'constructor:', data.data?.constructor?.name)
      if (typeof data.data === 'string') {
        console.log(`[${this.tableName}] 📥 First 100 chars:`, data.data.substring(0, 100))
      }

      // Cache the uploaded data
      this.cache.set(id, data)
      console.log(`[${this.tableName}] ✅ Uploaded successfully (${(performance.now() - startTime).toFixed(2)}ms)`)
      
      return { code: 0 }
    } catch (err: any) {
      console.log(`[${this.tableName}] ❌ Upload error: ${err.message}`)
      return { code: -3, message: err.message }
    }
  }

  /**
   * Check if binary data exists in cache
   */
  has(id: string): boolean {
    return this.cache.has(id)
  }

  /**
   * Remove binary data from cache
   */
  delete(id: string): void {
    this.cache.delete(id)
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size
  }
}

// Export singleton instances
export const segmentCache = new Cache<PathSegmentCache>('segment')
export const contentCache = new Cache<ContentCache>('content')
export const contentBinaryCache = new BinaryCache()
export const segChildrenCache = new ChildrenCache()
export const segPathCache = new PathCache()

