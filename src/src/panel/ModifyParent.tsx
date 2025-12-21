// @ts-nocheck
import React, { useState, useEffect } from 'react'
import SegList, { ListItem, ItemRole } from '../path/SegList'
import SegSelect, { SelectItem } from '../path/SegSelect'
import { SpinningCircle } from '@wwf971/react-comp-misc'
import { createRelation, deleteRelation, SegmentRelationType, getParents } from '../backend/segment'
import { getSupabaseClient } from '../backend/supabase'
import { segChildrenCache, segmentCache, contentCache, segPathCache, segRelationCache } from '../cache/cache'
import { getSegments } from '../path/PathUtils'
import './AddContent.css'  // Reuse AddContent styles

interface ModifyParentProps {
  itemId: string  // The segment/content whose parents we're modifying
  itemName: string
  itemType?: 'segment' | 'content'  // Optional, for display purposes
  onModified?: () => void
  onCancel?: () => void
  // Legacy props for backward compatibility
  contentId?: string
  contentName?: string
}

const ModifyParent: React.FC<ModifyParentProps> = ({
  itemId: propsItemId,
  itemName: propsItemName,
  itemType,
  onModified,
  onCancel,
  // Legacy props
  contentId,
  contentName
}) => {
  // Support both new and legacy props
  const itemId = propsItemId || contentId || ''
  const itemName = propsItemName || contentName || ''
  // Parent search and selection
  const [parentSearchQuery, setParentSearchQuery] = useState('')
  const [parentSearchResults, setParentSearchResults] = useState<ListItem[]>([])
  const [selectedParents, setSelectedParents] = useState<ListItem[]>([])
  const [loadingParentSearch, setLoadingParentSearch] = useState(false)
  const [showParentDropdown, setShowParentDropdown] = useState(false)

  // Role assignments for selected parents
  const [parentRoles, setParentRoles] = useState<Record<string, ItemRole>>({})

  // Track original relationships for comparison
  const [originalRelations, setOriginalRelations] = useState<Record<string, ItemRole>>({})

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing parents on mount
  useEffect(() => {
    loadExistingParents()
  }, [itemId])

  const loadExistingParents = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const client = getSupabaseClient()
      
      // Fetch all parent relationships
      const { data: relations, error: relError } = await client
        .from('segment_relation')
        .select('segment_1, type')
        .eq('segment_2', itemId)
        .in('type', [0, 1, 2])  // direct, indirect, bind

      if (relError) throw relError

      if (relations && relations.length > 0) {
        // Group relations by parent ID
        const parentRelMap: Record<string, { direct: boolean; indirect: boolean; bind: boolean }> = {}
        
        for (const rel of relations) {
          if (!parentRelMap[rel.segment_1]) {
            parentRelMap[rel.segment_1] = { direct: false, indirect: false, bind: false }
          }
          if (rel.type === 0) parentRelMap[rel.segment_1].direct = true
          if (rel.type === 1) parentRelMap[rel.segment_1].indirect = true
          if (rel.type === 2) parentRelMap[rel.segment_1].bind = true
        }

        // Load parent segment data
        const parentIds = Object.keys(parentRelMap)
        const parents: ListItem[] = []
        const roles: Record<string, ItemRole> = {}

        for (const parentId of parentIds) {
          const segData = await segmentCache.get(parentId)
          if (segData) {
            parents.push({
              id: parentId,
              name: segData.name,
              type: 'segment'
            })
            roles[parentId] = {
              isDirect: parentRelMap[parentId].direct,
              isIndirect: parentRelMap[parentId].indirect,
              isBind: parentRelMap[parentId].bind
            }
          }
        }

        setSelectedParents(parents)
        setParentRoles(roles)
        setOriginalRelations(JSON.parse(JSON.stringify(roles)))  // Deep copy
        console.log('[ModifyParent] Loaded existing parents:', parents, roles)
      }
    } catch (err: any) {
      console.error('[ModifyParent] Error loading parents:', err)
      setError(err.message || 'Failed to load existing parents')
    } finally {
      setIsLoading(false)
    }
  }

  // Search for parents with debounce
  useEffect(() => {
    if (!parentSearchQuery.trim()) {
      setParentSearchResults([])
      setShowParentDropdown(false)
      return
    }

    setShowParentDropdown(true)
    const searchParents = async () => {
      setLoadingParentSearch(true)
      const result = await getSegments()
      
      if (result.code === 0 && result.data) {
        const filtered = result.data
          .filter(seg => seg.name.toLowerCase().includes(parentSearchQuery.toLowerCase()))
          .map(seg => ({
            id: seg.id,
            name: seg.name,
            type: 'segment' as const
          }))
        setParentSearchResults(filtered)
      } else {
        setParentSearchResults([])
      }
      setLoadingParentSearch(false)
    }

    const timer = setTimeout(searchParents, 200)
    return () => clearTimeout(timer)
  }, [parentSearchQuery])

  const handleAddParent = (item: ListItem) => {
    if (!selectedParents.find(p => p.id === item.id)) {
      setSelectedParents([...selectedParents, item])
      // Default to indirect relationship for newly added parents
      setParentRoles({
        ...parentRoles,
        [item.id]: { isDirect: false, isIndirect: true, isBind: false }
      })
    }
    setParentSearchQuery('')
    setParentSearchResults([])
    setShowParentDropdown(false)
  }

  const handleRemoveParent = (id: string) => {
    setSelectedParents(selectedParents.filter(p => p.id !== id))
    const newRoles = { ...parentRoles }
    delete newRoles[id]
    setParentRoles(newRoles)
  }

  const handleRoleChange = (itemId: string, role: ItemRole) => {
    setParentRoles({
      ...parentRoles,
      [itemId]: role
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const client = getSupabaseClient()

      // Determine what needs to be added, removed, or updated
      const currentParentIds = Object.keys(parentRoles)
      const originalParentIds = Object.keys(originalRelations)

      // Parents that were removed
      const removedParentIds = originalParentIds.filter(id => !currentParentIds.includes(id))
      
      // Delete all relations for removed parents
      for (const parentId of removedParentIds) {
        // Get existing relations for this parent
        const originalRole = originalRelations[parentId]
        if (originalRole) {
          // Delete each relation type that existed
          if (originalRole.isDirect) {
            await deleteRelation(parentId, itemId, SegmentRelationType.PARENT_CHILD_DIRECT)
            console.log('[ModifyParent] ✅ Deleted direct relation:', parentId)
          }
          if (originalRole.isIndirect) {
            await deleteRelation(parentId, itemId, SegmentRelationType.PARENT_CHILD_INDIRECT)
            console.log('[ModifyParent] ✅ Deleted indirect relation:', parentId)
          }
          if (originalRole.isBind) {
            await deleteRelation(parentId, itemId, SegmentRelationType.PARENT_CHILD_BIND)
            console.log('[ModifyParent] ✅ Deleted bind relation:', parentId)
          }
        }
      }

      // Process each current parent
      for (const parentId of currentParentIds) {
        const currentRole = parentRoles[parentId]
        const originalRole = originalRelations[parentId]

        // If parent is new or relationship changed, delete old relations and create new ones
        if (!originalRole || 
            originalRole.isDirect !== currentRole.isDirect ||
            originalRole.isIndirect !== currentRole.isIndirect ||
            originalRole.isBind !== currentRole.isBind) {
          
          // Delete existing relations for this parent
          if (originalRole) {
            if (originalRole.isDirect) {
              await deleteRelation(parentId, itemId, SegmentRelationType.PARENT_CHILD_DIRECT)
            }
            if (originalRole.isIndirect) {
              await deleteRelation(parentId, itemId, SegmentRelationType.PARENT_CHILD_INDIRECT)
            }
            if (originalRole.isBind) {
              await deleteRelation(parentId, itemId, SegmentRelationType.PARENT_CHILD_BIND)
            }
            console.log('[ModifyParent] Deleted old relations for parent:', parentId)
          }

          // Handle direct parent logic (only one item can have this parent as direct)
          if (currentRole.isDirect) {
            const existingDirectResult = await getParents(itemId, SegmentRelationType.PARENT_CHILD_DIRECT)
            
            if (existingDirectResult.code === 0 && existingDirectResult.data && existingDirectResult.data.length > 0) {
              for (const oldParentId of existingDirectResult.data) {
                if (oldParentId !== parentId) {
                  // Convert old direct parent to indirect
                  const { data: oldRelations } = await client
                    .from('segment_relation')
                    .select('id')
                    .eq('segment_1', oldParentId)
                    .eq('segment_2', itemId)
                    .eq('type', SegmentRelationType.PARENT_CHILD_DIRECT)

                  if (oldRelations && oldRelations.length > 0) {
                    await client
                      .from('segment_relation')
                      .update({ type: SegmentRelationType.PARENT_CHILD_INDIRECT })
                      .eq('id', oldRelations[0].id)
                    
                    console.log('[ModifyParent] Converted old direct parent to indirect:', oldParentId)
                    segChildrenCache.delete(oldParentId, SegmentRelationType.PARENT_CHILD_DIRECT)
                    segChildrenCache.delete(oldParentId, SegmentRelationType.PARENT_CHILD_INDIRECT)
                  }
                }
              }
            }
          }

          // Create direct relation if checked
          if (currentRole.isDirect) {
            const result = await createRelation(parentId, itemId, SegmentRelationType.PARENT_CHILD_DIRECT)
            if (result.code !== 0) {
              setError(`Failed to create direct relation: ${result.message}`)
              setIsSaving(false)
              return
            }
            segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_DIRECT)
            console.log('[ModifyParent] ✅ Created direct relation:', parentId)
          }

          // Create indirect relation if checked
          if (currentRole.isIndirect) {
            const result = await createRelation(parentId, itemId, SegmentRelationType.PARENT_CHILD_INDIRECT)
            if (result.code !== 0) {
              setError(`Failed to create indirect relation: ${result.message}`)
              setIsSaving(false)
              return
            }
            segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT)
            console.log('[ModifyParent] ✅ Created indirect relation:', parentId)
          }

          // Create bind relation if checked
          if (currentRole.isBind) {
            const result = await createRelation(parentId, itemId, SegmentRelationType.PARENT_CHILD_BIND)
            if (result.code !== 0) {
              setError(`Failed to create bind relation: ${result.message}`)
              setIsSaving(false)
              return
            }
            segChildrenCache.delete(parentId, SegmentRelationType.PARENT_CHILD_BIND)
            console.log('[ModifyParent] ✅ Created bind relation:', parentId)
          }
        }
      }

      // Invalidate path cache for this item
      segPathCache.delete(itemId)

      console.log('[ModifyParent] ✅ Successfully modified parent relationships')
      onModified?.()
    } catch (err: any) {
      console.error('[ModifyParent] Error saving:', err)
      setError(err.message || 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="add-content-panel">
        <div className="panel-header">
          <h3>Modify Parent Relationships</h3>
        </div>
        <div className="panel-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px' }}>
            <SpinningCircle width={24} height={24} />
            <span>Loading existing parents...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="add-content-panel">
      <div className="panel-header">
        <h3>Modify Parent Relationships</h3>
        <p className="panel-subtitle">{itemType === 'segment' ? 'Segment' : 'Item'}: {itemName || '(unnamed)'}</p>
      </div>

      <div className="panel-body">
        {error && <div className="error-message">{error}</div>}

        {/* Search for segments to add as parents */}
        <div className="form-row">
          <label style={{paddingTop: '0px'}}>Add Parent Segment:</label>
          <div className="search-container">
            <div className="search-input-wrapper">
              <input
                type="text"
                value={parentSearchQuery}
                onChange={(e) => setParentSearchQuery(e.target.value)}
                placeholder="Search for segments..."
                className="search-input"
              />
              {loadingParentSearch && (
                <div className="search-spinner">
                  <SpinningCircle width={16} height={16} />
                </div>
              )}
            </div>
            
            {showParentDropdown && (
              <div className="search-results-dropdown">
                <SegSelect
                  items={parentSearchResults.map(item => ({ id: item.id, name: item.name }))}
                  onItemSelect={(item) => handleAddParent({ ...item, type: 'segment' })}
                  loading={loadingParentSearch}
                />
              </div>
            )}
          </div>
        </div>

        {/* Selected parents with role selection */}
        <div className="selected-items-section">
          <h4>Parent Segments:</h4>
          {selectedParents.length > 0 ? (
            <SegList
              items={selectedParents}
              selectionMode={true}
              columns={['name']}
              showRoleSelection={true}
              itemRoles={parentRoles}
              onRoleChange={handleRoleChange}
              showRemoveButton={true}
              onItemRemove={handleRemoveParent}
              padding="0"
            />
          ) : (
            <div className="empty-selection">No parents (orphan content)</div>
          )}
        </div>
      </div>

      <div className="panel-footer">
        <button 
          className="cancel-button" 
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button 
          className="create-button" 
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <SpinningCircle width={16} height={16} />
              Saving...
            </span>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </div>
  )
}

export default ModifyParent

