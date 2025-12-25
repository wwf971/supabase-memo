/**
 * Segment Relation Cache
 * Caches all segment-to-segment and segment-to-content relationships
 * 
 * Key invariant: If we have any relation for a segment/content, we have ALL relations
 * This is maintained by:
 * 1. Always loading all relations together on first access
 * 2. Updating cache on every create/delete operation
 */

import { getSupabaseClient } from '../backend/supabase'
import { SegmentRelationType } from '../backend/segment'
import { segPathCache } from './cache'

class SegmentRelationCache {
  // Cache structure: Map<parentId, Map<relationType, Set<childIds>>>
  private parentToChildren: Map<string, Map<number, Set<string>>> = new Map()
  
  // Reverse index: Map<childId, Map<relationType, Set<parentIds>>>
  private childToParents: Map<string, Map<number, Set<string>>> = new Map()
  
  // Track which segments have ALL their relations loaded (as parent)
  private completeAsParent: Set<string> = new Set()
  
  // Track which segments have ALL their relations loaded (as child)
  private completeAsChild: Set<string> = new Set()

  /**
   * Get children of a parent by relation type
   */
  getChildren(parentId: string, relationType: number): string[] | undefined {
    const childrenByType = this.parentToChildren.get(parentId)
    if (!childrenByType) return undefined
    
    const childSet = childrenByType.get(relationType)
    return childSet ? Array.from(childSet) : undefined
  }

  /**
   * Get parents of a child by relation type
   */
  getParents(childId: string, relationType: number): string[] | undefined {
    const parentsByType = this.childToParents.get(childId)
    if (!parentsByType) return undefined
    
    const parentSet = parentsByType.get(relationType)
    return parentSet ? Array.from(parentSet) : undefined
  }

  /**
   * Check if we have children cached for this parent and relation type
   */
  hasChildren(parentId: string, relationType: number): boolean {
    return this.parentToChildren.get(parentId)?.has(relationType) ?? false
  }

  /**
   * Check if we have parents cached for this child and relation type
   */
  hasParents(childId: string, relationType: number): boolean {
    return this.childToParents.get(childId)?.has(relationType) ?? false
  }

  /**
   * Check if we have ALL relations loaded for a segment as parent
   */
  isCompleteAsParent(segmentId: string): boolean {
    return this.completeAsParent.has(segmentId)
  }

  /**
   * Check if we have ALL relations loaded for a segment as child
   */
  isCompleteAsChild(segmentId: string): boolean {
    return this.completeAsChild.has(segmentId)
  }

  /**
   * Load all relations where segmentId is the parent
   */
  async loadAsParent(segmentId: string): Promise<{ code: number; message?: string }> {
    if (this.completeAsParent.has(segmentId)) {
      return { code: 0 } // Already loaded
    }

    try {
      const client = getSupabaseClient()
      const { data: relations, error } = await client
        .from('segment_relation')
        .select('segment_2, type')
        .eq('segment_1', segmentId)

      if (error) {
        return { code: -1, message: error.message }
      }

      // Initialize maps for all relation types
      const childrenByType = new Map<number, Set<string>>()
      childrenByType.set(SegmentRelationType.PARENT_CHILD_DIRECT, new Set())
      childrenByType.set(SegmentRelationType.PARENT_CHILD_INDIRECT, new Set())
      childrenByType.set(SegmentRelationType.PARENT_CHILD_BIND, new Set())

      // Populate from query results
      for (const rel of relations || []) {
        const childSet = childrenByType.get(rel.type)
        if (childSet) {
          childSet.add(rel.segment_2)
        }
      }

      this.parentToChildren.set(segmentId, childrenByType)
      this.completeAsParent.add(segmentId)

      console.log(`[segRelationCache] ✅ Loaded as parent for ${segmentId}: ${relations?.length || 0} relations`)
      return { code: 0 }
    } catch (err: any) {
      console.error('[segRelationCache] Error loading as parent:', err)
      return { code: -5, message: err.message || 'Failed to load relations' }
    }
  }

  /**
   * Load all relations where segmentId is the child
   */
  async loadAsChild(segmentId: string): Promise<{ code: number; message?: string }> {
    if (this.completeAsChild.has(segmentId)) {
      return { code: 0 } // Already loaded
    }

    try {
      const client = getSupabaseClient()
      const { data: relations, error } = await client
        .from('segment_relation')
        .select('segment_1, type')
        .eq('segment_2', segmentId)

      if (error) {
        return { code: -1, message: error.message }
      }

      // Initialize maps for all relation types
      const parentsByType = new Map<number, Set<string>>()
      parentsByType.set(SegmentRelationType.PARENT_CHILD_DIRECT, new Set())
      parentsByType.set(SegmentRelationType.PARENT_CHILD_INDIRECT, new Set())
      parentsByType.set(SegmentRelationType.PARENT_CHILD_BIND, new Set())

      // Populate from query results
      for (const rel of relations || []) {
        const parentSet = parentsByType.get(rel.type)
        if (parentSet) {
          parentSet.add(rel.segment_1)
        }
      }

      this.childToParents.set(segmentId, parentsByType)
      this.completeAsChild.add(segmentId)

      console.log(`[segRelationCache] ✅ Loaded as child for ${segmentId}: ${relations?.length || 0} relations`)
      return { code: 0 }
    } catch (err: any) {
      console.error('[segRelationCache] Error loading as child:', err)
      return { code: -5, message: err.message || 'Failed to load relations' }
    }
  }

  /**
   * Load all relations for a segment (both as parent and child)
   */
  async loadAll(segmentId: string): Promise<{ code: number; message?: string }> {
    const parentResult = await this.loadAsParent(segmentId)
    if (parentResult.code !== 0) return parentResult

    const childResult = await this.loadAsChild(segmentId)
    return childResult
  }

  /**
   * Add a relation to cache (after creating in DB)
   * Updates both forward and reverse indices
   * Note: rank parameter is optional and not stored in cache (rank is only used for ordering during fetch)
   */
  addRelation(parentId: string, childId: string, relationType: number, rank?: number): void {
    // Update parent -> child mapping
    if (!this.parentToChildren.has(parentId)) {
      this.parentToChildren.set(parentId, new Map())
    }
    const childrenByType = this.parentToChildren.get(parentId)!
    if (!childrenByType.has(relationType)) {
      childrenByType.set(relationType, new Set())
    }
    childrenByType.get(relationType)!.add(childId)

    // Update child -> parent mapping
    if (!this.childToParents.has(childId)) {
      this.childToParents.set(childId, new Map())
    }
    const parentsByType = this.childToParents.get(childId)!
    if (!parentsByType.has(relationType)) {
      parentsByType.set(relationType, new Set())
    }
    parentsByType.get(relationType)!.add(parentId)

    // Invalidate path cache for affected segments
    segPathCache.delete(childId)
    
    const rankInfo = rank !== undefined ? `, rank ${rank}` : ''
    console.log(`[segRelationCache] ➕ Added relation: ${parentId} -> ${childId} (type ${relationType}${rankInfo})`)
  }

  /**
   * Remove a relation from cache (after deleting from DB)
   * Updates both forward and reverse indices
   */
  removeRelation(parentId: string, childId: string, relationType: number): void {
    // Update parent -> child mapping
    const childrenByType = this.parentToChildren.get(parentId)
    if (childrenByType) {
      const childSet = childrenByType.get(relationType)
      if (childSet) {
        childSet.delete(childId)
      }
    }

    // Update child -> parent mapping
    const parentsByType = this.childToParents.get(childId)
    if (parentsByType) {
      const parentSet = parentsByType.get(relationType)
      if (parentSet) {
        parentSet.delete(parentId)
      }
    }

    // Invalidate path cache for affected segments
    segPathCache.delete(childId)
    
    console.log(`[segRelationCache] ➖ Removed relation: ${parentId} -> ${childId} (type ${relationType})`)
  }

  /**
   * Remove ALL relations for a segment (when deleting segment/content)
   * This includes relations where it's the parent AND where it's the child
   */
  async removeAllRelations(segmentId: string): Promise<{ code: number; message?: string }> {
    try {
      // Ensure we have all relations loaded
      await this.loadAll(segmentId)

      const client = getSupabaseClient()
      const affectedSegments = new Set<string>()

      // Remove all relations where segmentId is parent
      const childrenByType = this.parentToChildren.get(segmentId)
      if (childrenByType) {
        for (const [relationType, childSet] of Array.from(childrenByType.entries())) {
          for (const childId of Array.from(childSet)) {
            affectedSegments.add(childId)
            
            // Remove from reverse index
            const parentsByType = this.childToParents.get(childId)
            if (parentsByType) {
              parentsByType.get(relationType)?.delete(segmentId)
            }
          }
        }
      }

      // Remove all relations where segmentId is child
      const parentsByType = this.childToParents.get(segmentId)
      if (parentsByType) {
        for (const [relationType, parentSet] of Array.from(parentsByType.entries())) {
          for (const parentId of Array.from(parentSet)) {
            affectedSegments.add(parentId)
            
            // Remove from forward index
            const childrenByType = this.parentToChildren.get(parentId)
            if (childrenByType) {
              childrenByType.get(relationType)?.delete(segmentId)
            }
          }
        }
      }

      // Delete from database
      const { error } = await client
        .from('segment_relation')
        .delete()
        .or(`segment_1.eq.${segmentId},segment_2.eq.${segmentId}`)

      if (error) {
        return { code: -1, message: error.message }
      }

      // Remove from cache
      this.parentToChildren.delete(segmentId)
      this.childToParents.delete(segmentId)
      this.completeAsParent.delete(segmentId)
      this.completeAsChild.delete(segmentId)

      // Invalidate path cache for all affected segments
      for (const affectedId of Array.from(affectedSegments)) {
        segPathCache.delete(affectedId)
      }
      segPathCache.delete(segmentId)

      console.log(`[segRelationCache] 🗑️ Removed all relations for ${segmentId}, affected ${affectedSegments.size} segments`)
      return { code: 0 }
    } catch (err: any) {
      console.error('[segRelationCache] Error removing all relations:', err)
      return { code: -5, message: err.message || 'Failed to remove relations' }
    }
  }

  /**
   * Get bind parent for a content (used by formatContentPath)
   * Returns the parent segment ID if content is bound, undefined otherwise
   */
  async getBindParent(contentId: string): Promise<string | undefined> {
    // Ensure we have all parent relations loaded
    if (!this.completeAsChild.has(contentId)) {
      await this.loadAsChild(contentId)
    }

    const bindParents = this.getParents(contentId, SegmentRelationType.PARENT_CHILD_BIND)
    return bindParents && bindParents.length > 0 ? bindParents[0] : undefined
  }

  /**
   * Get direct parent for a segment/content
   * Returns the parent segment ID if exists, undefined otherwise
   */
  async getDirectParent(segmentId: string): Promise<string | undefined> {
    // Ensure we have all parent relations loaded
    if (!this.completeAsChild.has(segmentId)) {
      await this.loadAsChild(segmentId)
    }

    const directParents = this.getParents(segmentId, SegmentRelationType.PARENT_CHILD_DIRECT)
    return directParents && directParents.length > 0 ? directParents[0] : undefined
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.parentToChildren.clear()
    this.childToParents.clear()
    this.completeAsParent.clear()
    this.completeAsChild.clear()
    console.log('[segRelationCache] 🧹 Cache cleared')
  }

  /**
   * Get cache statistics
   */
  getStats(): { parents: number; children: number; completeAsParent: number; completeAsChild: number } {
    return {
      parents: this.parentToChildren.size,
      children: this.childToParents.size,
      completeAsParent: this.completeAsParent.size,
      completeAsChild: this.completeAsChild.size
    }
  }
}

// Export singleton instance
export const segRelationCache = new SegmentRelationCache()

