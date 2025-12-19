// @ts-nocheck
import React, { useState, useEffect } from 'react'
import SegList, { ListItem } from './SegList'
import SegSelect, { SelectItem } from './SegSelect'
import { getSegments, getPathSegment } from './pathUtils'
import { issueId } from '../backend/id'
import { createSegment } from './pathUtils'
import { createRelation, SegmentRelationType } from '../backend/segment'
import { createContent } from '../backend/content'
import { SpinningCircle } from '@wwf971/react-comp-misc/src/icon/Icon'
import { segmentCache, segChildrenCache, contentBinaryCache, PathSegmentCache } from '../backend/cache'
import ContentUpload from '../view/ContentUpload'
import { detectFileType, isFileTypeSupported } from '../utils/type'
import './SegCreate.css'

interface SegCreateProps {
  onSegmentCreated?: () => void
  onCancel?: () => void
  presetType?: 'path' | 'content'
  presetContentType?: 'text' | 'image' | 'file'
  presetDirectParent?: string  // ID of the direct parent segment
}

const SegCreate: React.FC<SegCreateProps> = ({ 
  onSegmentCreated, 
  onCancel,
  presetType,
  presetContentType,
  presetDirectParent
}) => {
  const [segmentType, setSegmentType] = useState<'path' | 'content'>(presetType || 'path')
  const [name, setName] = useState('')
  const [contentTypeSelection, setContentTypeSelection] = useState<'text' | 'image' | 'file'>(
    presetContentType === 'image' ? 'image' : presetContentType === 'file' ? 'file' : 'text'
  )
  const [contentType, setContentType] = useState<number>(
    presetContentType === 'image' ? 10 : presetContentType === 'file' ? 21 : 1
  ) // 1 = text, 10 = image, 21 = PDF
  const [contentValue, setContentValue] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [detectedFileType, setDetectedFileType] = useState<string>('')
  const [isFileTypeSupported, setIsFileTypeSupported] = useState<boolean>(true)
  
  // Parent selection
  const [parentSearchQuery, setParentSearchQuery] = useState('')
  const [parentSearchResults, setParentSearchResults] = useState<ListItem[]>([])
  const [selectedParents, setSelectedParents] = useState<ListItem[]>([])
  const [directParentId, setDirectParentId] = useState<string | null>(null)
  const [loadingParentSearch, setLoadingParentSearch] = useState(false)
  const [showParentDropdown, setShowParentDropdown] = useState(false)
  
  // Children selection (for path segments only)
  const [childrenSearchQuery, setChildrenSearchQuery] = useState('')
  const [childrenSearchResults, setChildrenSearchResults] = useState<ListItem[]>([])
  const [selectedChildren, setSelectedChildren] = useState<ListItem[]>([])
  const [directChildId, setDirectChildId] = useState<string | null>(null)
  const [loadingChildrenSearch, setLoadingChildrenSearch] = useState(false)
  const [showChildrenDropdown, setShowChildrenDropdown] = useState(false)
  
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If preset parent is provided, add it to selected parents and set as direct
  useEffect(() => {
    if (presetDirectParent && selectedParents.length === 0) {
      console.log('[SegCreate] Loading preset direct parent:', presetDirectParent)
      // Load parent info from cache (automatically fetches if not cached)
      const loadPresetParent = async () => {
        const parentInfo = await segmentCache.get(presetDirectParent)
        
        if (parentInfo) {
          const parentItem: ListItem = {
            id: parentInfo.id,
            name: parentInfo.name,
            type: 'segment' as const
          }
          setSelectedParents([parentItem])
          setDirectParentId(parentInfo.id)
          console.log('[SegCreate] Preset parent set:', parentItem)
        }
      }
      loadPresetParent()
    }
  }, [presetDirectParent])

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

  // Search for children with debounce
  useEffect(() => {
    if (!childrenSearchQuery.trim()) {
      setChildrenSearchResults([])
      setShowChildrenDropdown(false)
      return
    }

    setShowChildrenDropdown(true)
    const searchChildren = async () => {
      setLoadingChildrenSearch(true)
      const result = await getSegments()
      
      if (result.code === 0 && result.data) {
        const filtered = result.data
          .filter(seg => seg.name.toLowerCase().includes(childrenSearchQuery.toLowerCase()))
          .map(seg => ({
            id: seg.id,
            name: seg.name,
            type: 'segment' as const
          }))
        setChildrenSearchResults(filtered)
      } else {
        setChildrenSearchResults([])
      }
      setLoadingChildrenSearch(false)
    }

    const timer = setTimeout(searchChildren, 200)
    return () => clearTimeout(timer)
  }, [childrenSearchQuery])

  const handleAddParent = (item: ListItem) => {
    if (!selectedParents.find(p => p.id === item.id)) {
      setSelectedParents([...selectedParents, item])
      // Set as direct parent if it's the first one
      if (selectedParents.length === 0) {
        setDirectParentId(item.id)
      }
    }
    setParentSearchQuery('')
    setParentSearchResults([])
    setShowParentDropdown(false)
  }

  const handleRemoveParent = (id: string) => {
    setSelectedParents(selectedParents.filter(p => p.id !== id))
    if (directParentId === id) {
      setDirectParentId(selectedParents.length > 1 ? selectedParents[0].id : null)
    }
  }

  const handleAddChild = (item: ListItem) => {
    if (!selectedChildren.find(c => c.id === item.id)) {
      setSelectedChildren([...selectedChildren, item])
      // Set as direct child if it's the first one
      if (selectedChildren.length === 0) {
        setDirectChildId(item.id)
      }
    }
    setChildrenSearchQuery('')
    setChildrenSearchResults([])
    setShowChildrenDropdown(false)
  }

  const handleRemoveChild = (id: string) => {
    setSelectedChildren(selectedChildren.filter(c => c.id !== id))
    if (directChildId === id) {
      setDirectChildId(selectedChildren.length > 1 ? selectedChildren[0].id : null)
    }
  }

  const handleCreate = async () => {
    // Allow empty name only for content type (special content bound to segment)
    if (!name.trim() && segmentType === 'path') {
      setError('Name is required for segments')
      return
    }

    if (selectedParents.length > 0 && !directParentId) {
      setError('Please select a direct parent')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // Issue new ID for this segment
      const idResult = await issueId(segmentType === 'path' ? 1 : 2) // type 1 = segment, type 2 = content
      if (idResult.code !== 0) {
        setError(idResult.message || 'Failed to issue ID')
        setIsCreating(false)
        return
      }

      const newId = idResult.data

      // Create the segment/content
      if (segmentType === 'path') {
        const createResult = await createSegment(newId, name)
        if (createResult.code !== 0) {
          setError(createResult.message || 'Failed to create segment')
          setIsCreating(false)
          return
        }
      } else {
        // Create content entry
        // Empty name is allowed for segment-bound content
        let finalValue = contentValue
        
        // For binary file uploads (image, pdf, etc.), upload to content_binary table
        const isBinaryType = [10, 21, 99].includes(contentType) // image, pdf, unknown binary
        if (isBinaryType && uploadFile) {
          // Read file as ArrayBuffer for binary storage
          const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as ArrayBuffer)
            reader.onerror = () => reject(new Error('Failed to read file'))
            reader.readAsArrayBuffer(uploadFile)
          })
          
          // Upload to content_binary table (MIME type determined from contentType)
          const binaryResult = await contentBinaryCache.upload(
            newId,
            new Uint8Array(arrayBuffer)
          )
          
          if (binaryResult.code !== 0) {
            setError(binaryResult.message || 'Failed to upload binary data')
            setIsCreating(false)
            return
          }
          
          // Store reference to binary ID in content.value
          finalValue = `binary:${newId}`
        }
        
        const createResult = await createContent(
          newId,
          name,  // Can be empty string
          contentType,     // type_code from file type detection
          finalValue  // Content value (text or binary reference)
        )
        if (createResult.code !== 0) {
          setError(createResult.message || 'Failed to create content')
          setIsCreating(false)
          return
        }
      }

      // Create parent relations
      for (const parent of selectedParents) {
        const relType = parent.id === directParentId 
          ? SegmentRelationType.PARENT_CHILD_DIRECT 
          : SegmentRelationType.PARENT_CHILD_INDIRECT
        await createRelation(parent.id, newId, relType)
        
        // Invalidate cache for parent's children
        segChildrenCache.delete(parent.id, relType)
        console.log(`[SegCreate] Invalidated children cache for parent ${parent.id}, type ${relType}`)
      }

      // Create child relations (for path segments)
      if (segmentType === 'path') {
        for (const child of selectedChildren) {
          const relType = child.id === directChildId 
            ? SegmentRelationType.PARENT_CHILD_DIRECT 
            : SegmentRelationType.PARENT_CHILD_INDIRECT
          await createRelation(newId, child.id, relType)
          
          // Invalidate cache for this segment's children
          segChildrenCache.delete(newId, relType)
          console.log(`[SegCreate] Invalidated children cache for new segment ${newId}, type ${relType}`)
        }
      }

      // Reset form
      setName('')
      setContentValue('')
      setUploadFile(null)
      setDetectedFileType('')
      setIsFileTypeSupported(true)
      setSelectedParents([])
      setSelectedChildren([])
      setDirectParentId(null)
      setDirectChildId(null)
      setIsCreating(false)

      // Notify parent
      onSegmentCreated?.()
    } catch (err: any) {
      setError(err.message || 'Failed to create segment')
      setIsCreating(false)
    }
  }

  return (
    <div className="seg-create-container">
      <h3>Create New Item</h3>
      
      {error && <div className="create-error">{error}</div>}

      {/* Segment Type Selection */}
      <div className="form-row">
        <label>Segment Type:</label>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              value="path"
              checked={segmentType === 'path'}
              onChange={(e) => setSegmentType(e.target.value as 'path' | 'content')}
            />
            Path Segment
          </label>
          <label>
            <input
              type="radio"
              value="content"
              checked={segmentType === 'content'}
              onChange={(e) => setSegmentType(e.target.value as 'path' | 'content')}
            />
            Content
          </label>
        </div>
      </div>

      {/* Name Input */}
      <div className="form-row">
        <label>Name:</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={segmentType === 'content' ? "Enter name (empty for segment-bound content)" : "Enter segment name"}
          className="name-input"
        />
      </div>

      {/* Content-specific fields */}
      {segmentType === 'content' && (
        <>
          <div className="form-row">
            <label>Content Type:</label>
            <select 
              value={contentTypeSelection} 
              onChange={(e) => {
                const newType = e.target.value as 'text' | 'image' | 'file'
                setContentTypeSelection(newType)
                if (newType === 'text') {
                  setContentType(1)
                  setUploadFile(null)
                } else if (newType === 'image') {
                  setContentType(10)
                } else {
                  // File mode - type will be auto-detected
                  setContentType(99)
                }
              }}
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="file">File (Auto-detect)</option>
            </select>
          </div>
          
          {contentTypeSelection === 'text' ? (
            <div className="form-row">
              <label>Content Value:</label>
              <textarea
                value={contentValue}
                onChange={(e) => setContentValue(e.target.value)}
                placeholder="Enter content value"
                className="content-textarea"
                rows={4}
              />
            </div>
          ) : contentTypeSelection === 'image' ? (
            <div className="form-row">
              <label>Image File:</label>
              <ContentUpload
                mode="image"
                onFileSelect={(file) => {
                  setUploadFile(file)
                  // Auto-populate name from filename if empty (preserve extension)
                  if (!name.trim()) {
                    setName(file.name)
                  }
                }}
                currentFile={uploadFile}
              />
            </div>
          ) : (
            <div className="form-row">
              <label>File:</label>
              <ContentUpload
                mode="file"
                onFileSelect={(file) => {
                  setUploadFile(file)
                  // Auto-populate name from filename if empty (preserve extension)
                  if (!name.trim()) {
                    setName(file.name)
                  }
                  
                  // Detect file type
                  const fileTypeInfo = detectFileType(file.name)
                  setDetectedFileType(fileTypeInfo.typeName)
                  setContentType(fileTypeInfo.typeCode)
                  setIsFileTypeSupported(fileTypeInfo.typeCode !== 99)
                }}
                currentFile={uploadFile}
              />
              <div className="file-type-info">
                <div>Detected type: <strong>{uploadFile ? (detectedFileType || 'Unknown') : '-'}</strong></div>
                {uploadFile && !isFileTypeSupported && (
                  <div className="file-type-warning">
                    ⚠️ File type not recognized. Upload as unknown type?
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Parent Selection */}
      <div className="form-row">
        <label>Parents:</label>
        <div className="search-container">
          <div className="search-input-wrapper">
            <input
              type="text"
              value={parentSearchQuery}
              onChange={(e) => setParentSearchQuery(e.target.value)}
              placeholder="Search for parent segments"
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

        <div className="selected-items-section">
          <h4>Selected Parents:</h4>
          {selectedParents.length > 0 ? (
            <SegList
              items={selectedParents}
              selectionMode={true}
              columns={['name']}
              showDirectParentRadio={true}
              selectedDirectParentId={directParentId}
              onDirectParentSelect={setDirectParentId}
              showRemoveButton={true}
              onItemRemove={handleRemoveParent}
              padding="0"
            />
          ) : (
            <div className="empty-selection">No parents selected</div>
          )}
        </div>
      </div>

      {/* Children Selection (for path segments only) */}
      {segmentType === 'path' && (
        <div className="form-row">
          <label>Children:</label>
          <div className="search-container">
            <div className="search-input-wrapper">
              <input
                type="text"
                value={childrenSearchQuery}
                onChange={(e) => setChildrenSearchQuery(e.target.value)}
                placeholder="Search for child segments"
                className="search-input"
              />
              {loadingChildrenSearch && (
                <div className="search-spinner">
                  <SpinningCircle width={16} height={16} />
                </div>
              )}
            </div>
          
          {showChildrenDropdown && (
            <div className="search-results-dropdown">
              <SegSelect
                items={childrenSearchResults.map(item => ({ id: item.id, name: item.name }))}
                onItemSelect={(item) => handleAddChild({ ...item, type: 'segment' })}
                loading={loadingChildrenSearch}
              />
            </div>
          )}
        </div>

        <div className="selected-items-section">
          <h4>Selected Children:</h4>
          {selectedChildren.length > 0 ? (
            <SegList
              items={selectedChildren}
              selectionMode={true}
              columns={['name']}
              showDirectParentRadio={true}
              selectedDirectParentId={directChildId}
              onDirectParentSelect={setDirectChildId}
              showRemoveButton={true}
              onItemRemove={handleRemoveChild}
              padding="0"
            />
          ) : (
            <div className="empty-selection">No children selected</div>
          )}
        </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="form-actions">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={isCreating}
            className="cancel-button"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleCreate}
          disabled={
            isCreating || 
            (segmentType === 'path' && !name.trim()) ||
            (contentTypeSelection === 'file' && !uploadFile) ||
            (contentTypeSelection === 'file' && uploadFile && !isFileTypeSupported)
          }
          className="create-button"
        >
          {isCreating ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <SpinningCircle width={16} height={16} />
              Creating...
            </span>
          ) : (
            `Create ${segmentType === 'path' ? 'Segment' : 'Content'}`
          )}
        </button>
      </div>
    </div>
  )
}

export default SegCreate
