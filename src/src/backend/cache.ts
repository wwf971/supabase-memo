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

// Export singleton instances
export const segmentCache = new Cache<PathSegmentCache>('segment')
export const contentCache = new Cache<ContentCache>('content')
export const segChildrenCache = new ChildrenCache()
export const segPathCache = new PathCache()

