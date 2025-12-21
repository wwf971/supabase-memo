// @ts-nocheck
import React, { useState, useEffect } from 'react'
import SegList, { ListItem, ItemRole } from '../path/SegList'
import SegSelect, { SelectItem } from '../path/SegSelect'
import { SpinningCircle } from '@wwf971/react-comp-misc'
import { createRelation, SegmentRelationType, getParents } from '../backend/segment'
import { getSupabaseClient } from '../backend/supabase'
import { segChildrenCache, segmentCache, contentCache, segPathCache } from '../cache/cache'
import './AddContent.css'

interface AddContentProps {
  parentSegmentId: string  // The segment to add content children to
  parentSegmentName: string
  onContentAdded?: () => void
  onCancel?: () => void
}

const AddContent: React.FC<AddContentProps> = ({
  parentSegmentId,
  parentSegmentName,
  onContentAdded,
  onCancel
}) => {
  // Content search and selection
  const [contentSearchQuery, setContentSearchQuery] = useState('')
  const [contentSearchResults, setContentSearchResults] = useState<ListItem[]>([])
  const [selectedContent, setSelectedContent] = useState<ListItem[]>([])
  const [loadingContentSearch, setLoadingContentSearch] = useState(false)
  const [showContentDropdown, setShowContentDropdown] = useState(false)

  // Role assignments for selected content
  const [itemRoles, setItemRoles] = useState<Record<string, ItemRole>>({})

  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search for content with debounce
  useEffect(() => {
    if (!contentSearchQuery.trim()) {
      setContentSearchResults([])
      setShowContentDropdown(false)
      return
    }

    setShowContentDropdown(true)
    const searchContent = async () => {
      setLoadingContentSearch(true)
      
      try {
        const client = getSupabaseClient()
        
        // Search segments where isContent=true and name matches
        const { data: segments, error: segError } = await client
          .from('segment')
          .select('id, name')
          .eq('isContent', true)
          .ilike('name', `%${contentSearchQuery}%`)
          .limit(20)
        
        if (segError || !segments || segments.length === 0) {
          if (segError) console.error('[AddContent] Search error:', segError)
          setContentSearchResults([])
          setLoadingContentSearch(false)
          return
        }
        
        // Get content details for these IDs
        const segmentIds = segments.map(s => s.id)
        const { data: contentItems, error: contentError } = await client
          .from('content')
          .select('id, type_code, value')
          .in('id', segmentIds)
        
        if (!contentError && contentItems) {
          // Combine segment names with content data
          const filtered: ListItem[] = contentItems.map(content => {
            const segment = segments.find(s => s.id === content.id)
            return {
              id: content.id,
              name: segment?.name || '(unnamed)',
              type: 'content' as const,
              contentType: content.type_code,
              value: content.value
            }
          })
          
          setContentSearchResults(filtered)
        } else {
          console.error('[AddContent] Content fetch error:', contentError)
          setContentSearchResults([])
        }
      } catch (err) {
        console.error('[AddContent] Search error:', err)
        setContentSearchResults([])
      }
      
      setLoadingContentSearch(false)
    }

    const timer = setTimeout(searchContent, 200)
    return () => clearTimeout(timer)
  }, [contentSearchQuery])

  const handleAddContent = (item: ListItem) => {
    if (!selectedContent.find(c => c.id === item.id)) {
      setSelectedContent([...selectedContent, item])
      // Default to direct relationship, no bind
      setItemRoles({
        ...itemRoles,
        [item.id]: { isDirect: true, isIndirect: false, isBind: false }
      })
    }
    setContentSearchQuery('')
    setContentSearchResults([])
    setShowContentDropdown(false)
  }

  const handleRemoveContent = (id: string) => {
    setSelectedContent(selectedContent.filter(c => c.id !== id))
    const newRoles = { ...itemRoles }
    delete newRoles[id]
    setItemRoles(newRoles)
  }

  const handleRoleChange = (itemId: string, role: ItemRole) => {
    setItemRoles({
      ...itemRoles,
      [itemId]: role
    })
  }

  const handleAdd = async () => {
    if (selectedContent.length === 0) {
      setError('Please select at least one content item')
      return
    }

    setIsAdding(true)
    setError(null)

    try {
      // Process each selected content
      for (const content of selectedContent) {
        const role = itemRoles[content.id]
        if (!role) continue

        console.log(`[AddContent] Processing ${content.id}: direct=${role.isDirect}, indirect=${role.isIndirect}, bind=${role.isBind}`)

        // If this content should be a direct child, check if it already has a direct parent
        if (role.isDirect) {
          const existingParentsResult = await getParents(content.id, SegmentRelationType.PARENT_CHILD_DIRECT)
          
          if (existingParentsResult.code === 0 && existingParentsResult.data && existingParentsResult.data.length > 0) {
            const oldParentId = existingParentsResult.data[0]
            console.log(`[AddContent] Content ${content.id} already has direct parent ${oldParentId}, converting to indirect`)
            
            // Get the relation ID to update
            const client = getSupabaseClient()
            const { data: relations, error: fetchError } = await client
              .from('segment_relation')
              .select('id')
              .eq('segment_1', oldParentId)
              .eq('segment_2', content.id)
              .eq('type', SegmentRelationType.PARENT_CHILD_DIRECT)
              .limit(1)
            
            if (!fetchError && relations && relations.length > 0) {
              // Update the relation type to indirect
              const { error: updateError } = await client
                .from('segment_relation')
                .update({ type: SegmentRelationType.PARENT_CHILD_INDIRECT })
                .eq('id', relations[0].id)
              
              if (updateError) {
                console.error(`[AddContent] Failed to update old parent relation:`, updateError)
              } else {
                console.log(`[AddContent] ✅ Converted old direct parent ${oldParentId} to indirect`)
                // Invalidate cache for old parent
                segChildrenCache.delete(oldParentId, SegmentRelationType.PARENT_CHILD_DIRECT)
                segChildrenCache.delete(oldParentId, SegmentRelationType.PARENT_CHILD_INDIRECT)
              }
            }
          }
        }

        // If this should be a bind child, check if parent already has a bind child
        if (role.isBind) {
          const client = getSupabaseClient()
          const { data: existingBinds, error: bindFetchError } = await client
            .from('segment_relation')
            .select('segment_2')
            .eq('segment_1', parentSegmentId)
            .eq('type', SegmentRelationType.PARENT_CHILD_BIND)
          
          if (!bindFetchError && existingBinds && existingBinds.length > 0) {
            console.log(`[AddContent] Parent ${parentSegmentId} already has bind children, removing old binds`)
            
            // Remove all existing bind relations for this parent
            for (const bind of existingBinds) {
              const { error: deleteError } = await client
                .from('segment_relation')
                .delete()
                .eq('segment_1', parentSegmentId)
                .eq('segment_2', bind.segment_2)
                .eq('type', SegmentRelationType.PARENT_CHILD_BIND)
              
              if (deleteError) {
                console.error(`[AddContent] Failed to delete old bind:`, deleteError)
              }
            }
            
            // Invalidate cache
            segChildrenCache.delete(parentSegmentId, SegmentRelationType.PARENT_CHILD_BIND)
          }
        }

        // Create direct relation if checked
        if (role.isDirect) {
          const directRelResult = await createRelation(parentSegmentId, content.id, SegmentRelationType.PARENT_CHILD_DIRECT)
          if (directRelResult.code !== 0) {
            setError(`Failed to create direct relation for ${content.name}: ${directRelResult.message}`)
            setIsAdding(false)
            return
          }
          console.log(`[AddContent] ✅ Created direct relation`)
        }

        // Create indirect relation if checked
        if (role.isIndirect) {
          const indirectRelResult = await createRelation(parentSegmentId, content.id, SegmentRelationType.PARENT_CHILD_INDIRECT)
          if (indirectRelResult.code !== 0) {
            setError(`Failed to create indirect relation for ${content.name}: ${indirectRelResult.message}`)
            setIsAdding(false)
            return
          }
          console.log(`[AddContent] ✅ Created indirect relation`)
        }
        
        // Create bind relation if needed
        if (role.isBind) {
          const bindRelResult = await createRelation(parentSegmentId, content.id, SegmentRelationType.PARENT_CHILD_BIND)
          if (bindRelResult.code !== 0) {
            setError(`Failed to create bind relation for ${content.name}: ${bindRelResult.message}`)
            setIsAdding(false)
            return
          }
          console.log(`[AddContent] ✅ Created bind relation`)
        }

        // Invalidate cache for parent's children based on created relations
        if (role.isDirect) {
          segChildrenCache.delete(parentSegmentId, SegmentRelationType.PARENT_CHILD_DIRECT)
        }
        if (role.isIndirect) {
          segChildrenCache.delete(parentSegmentId, SegmentRelationType.PARENT_CHILD_INDIRECT)
        }
        if (role.isBind) {
          segChildrenCache.delete(parentSegmentId, SegmentRelationType.PARENT_CHILD_BIND)
        }
      }

      // Reset form
      setSelectedContent([])
      setItemRoles({})
      setIsAdding(false)

      // Notify parent
      onContentAdded?.()
    } catch (err: any) {
      setError(err.message || 'Failed to add content')
      setIsAdding(false)
    }
  }

  return (
    <div className="add-content-container">
      <h3>Add Content to "{parentSegmentName}"</h3>
      
      {error && <div className="add-content-error">{error}</div>}

      {/* Content Search */}
      <div className="form-row">
        <label>Search Content:</label>
        <div className="search-container">
          <div className="search-input-wrapper">
            <input
              type="text"
              value={contentSearchQuery}
              onChange={(e) => setContentSearchQuery(e.target.value)}
              placeholder="Search for content items"
              className="search-input"
            />
            {loadingContentSearch && (
              <div className="search-spinner">
                <SpinningCircle width={16} height={16} />
              </div>
            )}
          </div>
          
          {showContentDropdown && (
            <div className="search-results-dropdown">
              <SegSelect
                items={contentSearchResults.map(item => ({ id: item.id, name: item.name }))}
                onItemSelect={(item) => handleAddContent({ ...item, type: 'content', contentType: contentSearchResults.find(c => c.id === item.id)?.contentType })}
                loading={loadingContentSearch}
              />
            </div>
          )}
        </div>
      </div>

      {/* Selected Content */}
      <div className="selected-items-section">
        <h4>Selected Content:</h4>
        {selectedContent.length > 0 ? (
          <SegList
            items={selectedContent}
            selectionMode={true}
            columns={['name', 'type']}
            showRoleSelection={true}
            itemRoles={itemRoles}
            onRoleChange={handleRoleChange}
            showRemoveButton={true}
            onItemRemove={handleRemoveContent}
            padding="0"
          />
        ) : (
          <div className="empty-selection">No content selected</div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="form-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-cancel" disabled={isAdding}>
            Cancel
          </button>
        )}
        <button 
          type="button" 
          onClick={handleAdd} 
          className="btn-add"
          disabled={isAdding || selectedContent.length === 0}
        >
          {isAdding ? (
            <>
              <SpinningCircle width={16} height={16} />
              Adding...
            </>
          ) : (
            `Add ${selectedContent.length} Content`
          )}
        </button>
      </div>
    </div>
  )
}

export default AddContent

