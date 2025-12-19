// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { segmentCache, segChildrenCache, contentCache, PathSegmentCache } from '../backend/cache'
import { getSupabaseClient } from '../backend/supabase'
import { getChildren, SegmentRelationType, getPathToRoot, getDirectParent } from '../backend/segment'
import { getPathSegment, getSegments, formatSegmentPath, formatContentPath } from './PathUtils'
import PathBar from './PathBar'
import { ListItem } from './SegList'
import SegList from './SegList'
import SegView from '../view/SegView'
import SegCreate from './SegCreate'
import PathTabAllItem from './PathTabAllItem'
import ContentView from '../view/ContentView'
import Menu, { MenuItem, MenuItemSingle } from '@wwf971/react-comp-misc/src/menu/Menu'
import { PathSegment } from '@wwf971/react-comp-misc/src/path/PathBar'
import { SpinningCircle } from '@wwf971/react-comp-misc/src/icon/Icon'
import './PathTab.css'

/**
 * Helper: Get item type from cache (segment or content)
 */
function getItemType(id: string): 'segment' | 'content' | null {
  // Must be in segment cache to exist
  if (!segmentCache.has(id)) {
    console.log(`[getItemType] ${id} not in segment cache`)
    return null
  }
  
  // If also in content cache, it's content; otherwise segment
  const isContent = contentCache.has(id)
  console.log(`[getItemType] ${id}: segmentCache=${true}, contentCache=${isContent} → ${isContent ? 'content' : 'segment'}`)
  return isContent ? 'content' : 'segment'
}

/**
 * Helper: Get item name from cache (sync only, no fetch)
 */
function getItemName(id: string): string | null {
  const segment = segmentCache.getSync(id)
  return segment ? segment.name : null
}

/**
 * PathTab - Single tab in the path explorer
 * Each tab maintains its own current path (list of segment IDs)
 */

export interface PathTabData {
  tabId: string
  tabLabel: string  // Tab display name
  currentPath: string[]  // Array of segment/content IDs (mixed)
  history: string[][]  // Navigation history (array of paths)
  historyPointer: number  // Current position in history
  canNaviBack: boolean
  canNaviForward: boolean
  colWidthRatio?: Record<string, number>  // Column width ratios for SegList
}

interface PathTabProps {
  data: PathTabData
  onDataChange: (data: PathTabData) => void
  onNavi?: (path: string[], label?: string) => void
  onNaviBack?: () => void
  onNaviForward?: () => void
}

const PathTab: React.FC<PathTabProps> = ({
  data, onDataChange, onNavi, onNaviBack, onNaviForward,
}) => {
  const [segments, setSegments] = useState<PathSegment[]>([])
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)
  const [switchingReason, setSwitchingReason] = useState<string>('')
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null)
  const [renamingClickPos, setRenamingClickPos] = useState<{ x: number; y: number } | null>(null)
  const [isRenamingInProgress, setIsRenamingInProgress] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ itemId: string; itemName: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  // Track previous path to detect actual changes (not just reference changes)
  const prevPathRef = React.useRef<string[]>([])
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId?: string } | null>(null)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [createType, setCreateType] = useState<'path' | 'content'>('path')
  const [contentTypeForCreate, setContentTypeForCreate] = useState<'text' | 'image' | 'file'>('text')

  /**
   * Load segment information from cache or server
   */
  const loadSegment = async (id: string): Promise<PathSegmentCache | null> => {
    return await segmentCache.get(id)
  }

  /**
   * Load path segments for display in PathBar
   */
  const loadPath = async () => {
    const startTime = performance.now()
    setLoading(true)
    const loadedSegments: PathSegment[] = []

    console.log(`[PathTab] 📍 loadPath() START - Loading ${data.currentPath.length} items:`, data.currentPath)
    
    for (let i = 0; i < data.currentPath.length; i++) {
      const id = data.currentPath[i]
      const segment = await loadSegment(id)
      if (segment) {
        const itemType = getItemType(id)
        console.log(`[PathTab] loadPath() - Loaded item ${i}: ${segment.name} (${itemType})`)
        
        // For segments: add trailing /
        // For content with name: show name without trailing /
        // For content with empty name: skip this element (path ends at parent)
        if (itemType === 'segment') {
          loadedSegments.push({
            id: segment.id,
            name: segment.name + '/'
          })
        } else if (itemType === 'content' && segment.name) {
          // Content with a name - show it
          loadedSegments.push({
            id: segment.id,
            name: segment.name
          })
        }
        // If content with empty name - don't add to path display
      }
    }

    // If last item was content with empty name, remove trailing / from previous segment
    const lastId = data.currentPath[data.currentPath.length - 1]
    if (lastId) {
      const lastType = getItemType(lastId)
      const lastSeg = await loadSegment(lastId)
      if (lastType === 'content' && lastSeg && !lastSeg.name && loadedSegments.length > 0) {
        // Remove trailing slash from the last displayed segment
        const lastDisplayed = loadedSegments[loadedSegments.length - 1]
        if (lastDisplayed.name.endsWith('/')) {
          lastDisplayed.name = lastDisplayed.name.slice(0, -1)
        }
      }
    }

    console.log(`[PathTab] ✅ loadPath() COMPLETE - ${(performance.now() - startTime).toFixed(2)}ms`)
    setSegments(loadedSegments)
    setLoading(false)
  }

  /**
   * Load items for display in PathList
   */
  const loadItems = async () => {
    const startTime = performance.now()
    console.log(`[PathTab] 📍 loadItems() START`)
    
    setLoading(true)
    setError(null)

    try {
      const { loadRootItems, loadChildrenItems } = await import('../backend/children')
      
      let result
      if (data.currentPath.length === 0) {
        result = await loadRootItems()
      } else {
        const parentId = data.currentPath[data.currentPath.length - 1]
        result = await loadChildrenItems(parentId)
      }

      if (result.code === 0 && result.data) {
        setItems(result.data)
        console.log(`[PathTab] ✅ loadItems() COMPLETE - ${(performance.now() - startTime).toFixed(2)}ms - Loaded ${result.data.length} items`)
      } else {
        setError(result.message || 'Failed to load items')
        console.log(`[PathTab] ❌ loadItems() FAILED - ${(performance.now() - startTime).toFixed(2)}ms`)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load items')
      console.log(`[PathTab] ❌ loadItems() FAILED - ${(performance.now() - startTime).toFixed(2)}ms`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      const effectStartTime = performance.now()
      console.log(`[PathTab] 🔄 useEffect START - currentPath:`, data.currentPath)
      
      // Check if path actually changed (not just reference)
      const pathActuallyChanged = 
        prevPathRef.current.length !== data.currentPath.length ||
        prevPathRef.current.some((id, idx) => id !== data.currentPath[idx])
      
      console.log(`[PathTab] Path actually changed: ${pathActuallyChanged}`)
      
      // Update the previous path reference
      prevPathRef.current = data.currentPath
      
      // Always load path for PathBar
      await loadPath()
      
      // Check if we should load items (only if last item is segment or at root)
      const lastId = data.currentPath.length > 0 ? data.currentPath[data.currentPath.length - 1] : null
      const lastType = lastId ? getItemType(lastId) : null
      
      console.log(`[PathTab] Last item type: ${lastType}`)
      
      if (lastType === 'segment' || data.currentPath.length === 0) {
        await loadItems()
      }
      
      setIsSwitching(false)
      setSwitchingReason('')
      
      console.log(`[PathTab] 🏁 useEffect COMPLETE - Total time: ${(performance.now() - effectStartTime).toFixed(2)}ms`)
    }
    load()
  }, [data.currentPath])

  /**
   * Handle path segment click in PathBar
   */
  const handlePathSegClick = (segmentIndex: number) => {
    // Navigate to clicked segment (truncate path)
    const newPath = data.currentPath.slice(0, segmentIndex + 1)
    
    // Get the label for this segment
    let label: string | undefined
    if (newPath.length > 0) {
      const segmentId = newPath[newPath.length - 1]
      const cached = segmentCache.getSync(segmentId)
      label = cached?.name
    }
    
    onNavi?.(newPath, label)
  }

  /**
   * Handle navigate up (go to parent)
   */
  const handleNaviUp = () => {
    if (data.currentPath.length === 0) return
    
    // Remove last element from path
    const newPath = data.currentPath.slice(0, -1)
    
    // Get label for the new location
    let label: string | undefined
    if (newPath.length === 0) {
      label = 'All segment/content'
    } else {
      const segmentId = newPath[newPath.length - 1]
      const cached = segmentCache.getSync(segmentId)
      label = cached?.name
    }
    
    onNavi?.(newPath, label)
  }

  /**
   * Handle double-click on item (segment or content)
   */
  const handleItemDoubleClick = async (itemId: string, itemType: 'segment' | 'content') => {
    const navStartTime = performance.now()
    console.log(`[PathTab] 🖱️ NAVIGATION START - Double-clicked ${itemType}: ${itemId}`)
    
    setIsSwitching(true)
    console.log(`[PathTab] Current path BEFORE navigation:`, data.currentPath)
    
    // Get item name using cache.get()
    const segData = await segmentCache.get(itemId)
    const itemName = segData?.name
    
    setSwitchingReason(`Navigating to ${itemType}: ${itemName || itemId}`)
    
    // Get the full path to root for this item
    console.log(`[PathTab] Getting path to root...`)
    const pathToRootStart = performance.now()
    const pathToRootResult = await getPathToRoot(itemId)
    console.log(`[PathTab] getPathToRoot took ${(performance.now() - pathToRootStart).toFixed(2)}ms`)
    
    let newPath: string[]
    
    if (pathToRootResult.code === 0 && pathToRootResult.data && pathToRootResult.data.length > 0) {
      // Use the full path (getPathToRoot returns [root, ..., item] already in correct order)
      newPath = pathToRootResult.data
      console.log(`[PathTab] Using full path to root:`, newPath)
    } else {
      // Fallback: just append to current path (for items without parents)
      newPath = [...data.currentPath, itemId]
      console.log(`[PathTab] No path to root, appending to current:`, newPath)
    }
    
    console.log(`[PathTab] ⏱️ Pre-navigation took ${(performance.now() - navStartTime).toFixed(2)}ms, calling onNavi()`)
    
    // Navigate (which will update history and tab label)
    onNavi?.(newPath, itemName)
  }

  /**
   * Handle right-click context menu on an item
   */
  const handleItemContextMenu = (e: React.MouseEvent, itemId: string, itemType: 'segment' | 'content') => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, itemId })
  }

  /**
   * Handle right-click context menu on background
   */
  const handleContextMenu = (e: React.MouseEvent) => {
    // Only show menu when not at root (we have a parent to create children for)
    if (data.currentPath.length === 0) return
    
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  /**
   * Close context menu
   */
  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  /**
   * Handle context menu item click
   */
  const handleCreateFromMenu = (type: 'path' | 'content', contentType?: 'text' | 'image' | 'file') => {
    setCreateType(type)
    setContentTypeForCreate(contentType || 'text')
    setShowCreatePanel(true)
    setContextMenu(null)
  }

  /**
   * Handle creation complete
   */
  const handleCreationComplete = () => {
    setShowCreatePanel(false)
    loadItems()
  }

  /**
   * Handle quick segment creation
   */
  const handleQuickCreateSegment = async () => {
    console.log(`[PathTab] Quick creating segment`)
    
    // Import necessary functions
    const { issueId } = await import('../backend/id')
    const { createSegment } = await import('./PathUtils')
    const { createRelation } = await import('../backend/segment')
    
    // Generate new ID (type_code 1 for segment)
    const idResult = await issueId(1)
    if (idResult.code !== 0 || !idResult.data) {
      setErrorMessage(`Failed to generate ID: ${idResult.message || 'Unknown error'}`)
      return
    }
    
    const newId = idResult.data
    const defaultName = 'new_segment'
    
    const createResult = await createSegment(newId, defaultName)
    
    if (createResult.code !== 0) {
      setErrorMessage(`Failed to create segment: ${createResult.message || 'Unknown error'}`)
      return
    }
    
    // Create relation to parent (current segment)
    const parentId = data.currentPath[data.currentPath.length - 1]
    const relationResult = await createRelation(parentId, newId, 0) // 0 = direct relation
    
    if (relationResult.code !== 0) {
      setErrorMessage(`Failed to create relation: ${relationResult.message || 'Unknown error'}`)
      return
    }
    
    console.log(`[PathTab] ✅ Quick created segment ${newId}`)
    
    // Reload items to show the new segment
    await loadItems()
    
    // Enter rename mode for the new item with full text selection
    setRenamingItemId(newId)
    setRenamingClickPos(null) // null means select all text
  }

  /**
   * Get context menu items based on context
   */
  const getContextMenuItems = (): MenuItem[] => {
    if (contextMenu?.itemId) {
      // Context menu for an item - check its type from cache
      const itemType = getItemType(contextMenu.itemId)
      console.log(`[PathTab] Context menu for item ${contextMenu.itemId}, detected type: ${itemType}`)
      
      if (itemType === 'content') {
      // Context menu for content item
      return [
        {
          type: 'item',
          name: 'View Details',
          data: { action: 'viewDetails', itemId: contextMenu.itemId, itemType: 'content' }
        },
        {
          type: 'item',
          name: 'Rename',
          data: { action: 'rename', itemId: contextMenu.itemId, itemType: 'content' }
        },
        {
          type: 'item',
          name: 'Delete',
          data: { action: 'delete', itemId: contextMenu.itemId, itemType: 'content' }
        }
      ]
      } else {
        // Context menu for segment - could add segment-specific actions here
        return [
          {
            type: 'item',
            name: 'Open',
            data: { action: 'open', itemId: contextMenu.itemId, itemType: 'segment' }
          },
          {
            type: 'item',
            name: 'Rename',
            data: { action: 'rename', itemId: contextMenu.itemId, itemType: 'segment' }
          },
          {
            type: 'item',
            name: 'Delete',
            data: { action: 'delete', itemId: contextMenu.itemId, itemType: 'segment' }
          }
        ]
      }
    } else {
      // Context menu for background (create new items)
      return [
        {
          type: 'menu',
          name: 'New',
          children: [
            {
              type: 'item',
              name: 'Segment',
              data: { action: 'createSegment' }
            },
            {
              type: 'item',
              name: 'Text Content',
              data: { action: 'createContent', contentType: 'text' }
            },
            {
              type: 'item',
              name: 'Image Content',
              data: { action: 'createContent', contentType: 'image' }
            },
            {
              type: 'item',
              name: 'PDF Content',
              data: { action: 'createContent', contentType: 'file' }
            }
          ]
        },
        {
          type: 'menu',
          name: 'New (Quick)',
          children: [
            {
              type: 'item',
              name: 'Segment',
              data: { action: 'createSegmentQuick' }
            }
          ]
        }
      ]
    }
  }

  /**
   * Handle menu item click
   */
  const handleMenuItemClick = (item: MenuItemSingle) => {
    const { action, itemId, contentType } = item.data || {}
    console.log(`[PathTab] Menu item clicked:`, { action, itemId, contentType })
    
    if (action === 'viewDetails' && itemId) {
      handleItemDoubleClick(itemId, 'content')
    } else if (action === 'open' && itemId) {
      handleItemDoubleClick(itemId, 'segment')
    } else if (action === 'createSegment') {
      handleCreateFromMenu('path')
    } else if (action === 'createContent') {
      handleCreateFromMenu('content', contentType || 'text')
    } else if (action === 'createSegmentQuick') {
      handleQuickCreateSegment()
    } else if (action === 'rename' && itemId) {
      setRenamingItemId(itemId)
      setRenamingClickPos(contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null)
    } else if (action === 'delete' && itemId) {
      console.log(`[PathTab] Triggering delete for ${itemId}`)
      handleDelete(itemId)
      // Don't close context menu yet - modal will handle it
      return
    }
    handleCloseContextMenu()
  }

  /**
   * Handle delete (content or segment)
   */
  const handleDelete = (itemId: string) => {
    console.log(`[PathTab] handleDelete called for ${itemId}`)
    const item = items.find(item => item.id === itemId)
    const itemName = item?.name || 'this item'
    const itemType = item?.type || 'content'
    console.log(`[PathTab] Setting delete confirm modal for ${itemType}: "${itemName}"`)
    setDeleteConfirm({ itemId, itemName })
    handleCloseContextMenu()
  }

  /**
   * Confirm and execute delete (for list view)
   */
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    
    const { itemId } = deleteConfirm
    const item = items.find(item => item.id === itemId)
    const itemType = item?.type || 'content'
    
    setDeleteConfirm(null)
    setIsDeleting(true)
    
    console.log(`[PathTab] Deleting ${itemType} ${itemId}`)
    
    let result
    if (itemType === 'segment') {
      // Delete segment using cache method
      result = await segmentCache.deleteSegment(itemId)
      
      if (result.code === 0) {
        console.log(`[PathTab] ✅ Deleted segment ${itemId}, ${result.data?.relationsDeleted || 0} relations removed`)
        
        // Invalidate caches for all affected parents
        // Since we deleted all relations, we need to invalidate all parent caches
        // For now, just reload items
        await loadItems()
      }
    } else {
      // Delete content
      const { deleteContent } = await import('../backend/content')
      result = await deleteContent(itemId)
      
      if (result.code === 0) {
        console.log(`[PathTab] ✅ Deleted content ${itemId}`)
        await loadItems()
      }
    }
    
    if (result.code !== 0) {
      console.error(`[PathTab] ❌ Failed to delete: ${result.message}`)
      setErrorMessage(`Failed to delete: ${result.message}`)
    }
    
    setIsDeleting(false)
  }

  /**
   * Handle rename submit
   */
  const handleRenameSubmit = async (itemId: string, newName: string) => {
    console.log(`[PathTab] Renaming ${itemId} to "${newName}"`)
    
    setIsRenamingInProgress(true)
    const startTime = performance.now()
    
    const result = await segmentCache.rename(itemId, newName)
    
    // Ensure at least 0.2s display time for loading state
    const elapsed = performance.now() - startTime
    const remainingTime = Math.max(0, 200 - elapsed)
    
    await new Promise(resolve => setTimeout(resolve, remainingTime))
    
    if (result.code === 0) {
      // Update local items list
      setItems(prevItems => 
        prevItems.map(item => 
          item.id === itemId ? { ...item, name: newName } : item
        )
      )
      console.log(`[PathTab] ✅ Rename successful`)
    } else {
      setErrorMessage(`Failed to rename: ${result.message || 'Unknown error'}`)
    }
    
    setIsRenamingInProgress(false)
    setRenamingItemId(null)
    setRenamingClickPos(null)
  }

  /**
   * Handle rename cancel
   */
  const handleRenameCancel = () => {
    setRenamingItemId(null)
    setRenamingClickPos(null)
  }

  /**
   * Close context menu when clicking outside
   */
  React.useEffect(() => {
    if (contextMenu) {
      const handleClick = () => handleCloseContextMenu()
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  // Render based on current state
  
  // Check if we're viewing content (last item in path is content)
  const lastId = data.currentPath.length > 0 ? data.currentPath[data.currentPath.length - 1] : null
  const lastType = lastId ? getItemType(lastId) : null
  const lastItemName = lastId ? getItemName(lastId) : null
  
  /**
   * Handle delete from ContentView
   */
  const handleDeleteFromContentView = async (contentId: string) => {
    const itemName = lastItemName || '(unnamed content)'
    setDeleteConfirm({ itemId: contentId, itemName })
  }

  /**
   * Handle delete confirm - extended to handle navigation history cleanup
   */
  const handleDeleteConfirmFromContentView = async () => {
    if (!deleteConfirm) return
    
    const { itemId } = deleteConfirm
    const isContentView = lastType === 'content' && lastId === itemId
    
    setDeleteConfirm(null)
    
    console.log(`[PathTab] Deleting content ${itemId}`)
    
    const { deleteContent } = await import('../backend/content')
    const result = await deleteContent(itemId)
    
    if (result.code === 0) {
      console.log(`[PathTab] ✅ Deleted content ${itemId}`)
      
      // If deleted from ContentView, handle navigation history cleanup
      if (isContentView) {
        console.log(`[PathTab] Cleaning up navigation history after ContentView delete`)
        
        // Remove current path from history
        const newHistory = data.history.filter((_, idx) => idx !== data.historyPointer)
        
        // Determine new history pointer and path
        let newPointer: number
        let newPath: string[]
        
        if (newHistory.length === 0) {
          // No history left, go to root
          newHistory.push([])
          newPointer = 0
          newPath = []
          console.log(`[PathTab] No history left, navigating to root`)
        } else if (data.historyPointer > 0) {
          // Go to previous path in history
          newPointer = data.historyPointer - 1
          newPath = newHistory[newPointer]
          console.log(`[PathTab] Navigating to previous path in history (pointer: ${newPointer})`)
        } else {
          // We were at the first item, stay at first (which is now the old second)
          newPointer = 0
          newPath = newHistory[0]
          console.log(`[PathTab] Staying at first history item`)
        }
        
        // Navigate to the new path
        onDataChange({
          ...data,
          currentPath: newPath,
          history: newHistory,
          historyPointer: newPointer,
          canNaviBack: newPointer > 0,
          canNaviForward: newPointer < newHistory.length - 1
        })
      } else {
        // Regular delete from list view
        await loadItems()
      }
    } else {
      console.error(`[PathTab] ❌ Failed to delete: ${result.message}`)
      setErrorMessage(`Failed to delete: ${result.message}`)
    }
  }

  // If viewing content, show ContentView
  if (lastType === 'content' && lastId) {
    return (
      <>
        <div className="path-tab">
          <div className="path-tab-header">
            <div className="path-tab-nav-btns">
              <button
                onClick={onNaviBack}
                disabled={!data.canNaviBack}
                className="nav-btn"
                title="Go back"
              >
                ◀
              </button>
              <button
                onClick={onNaviForward}
                disabled={!data.canNaviForward}
                className="nav-btn"
                title="Go forward"
              >
                ▶
              </button>
              <button
                onClick={handleNaviUp}
                disabled={data.currentPath.length === 0}
                className="nav-btn nav-btn-up"
                title="Go up"
              >
                ▲
              </button>
            </div>
            <PathBar
              segments={segments}
              onPathSegClicked={handlePathSegClick}
            />
          </div>
          <div className="path-tab-content">
            <ContentView 
              contentId={lastId}
              contentName={lastItemName || ''}
              onDelete={handleDeleteFromContentView}
            />
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">Confirm Delete</div>
              <div className="modal-body">
                Are you sure you want to delete <strong>"{deleteConfirm.itemName || '(unnamed item)'}"</strong>?
                <br />
                This action cannot be undone.
              </div>
              <div className="modal-footer">
                <button type="button" className="modal-btn modal-btn-cancel" onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </button>
                <button type="button" className="modal-btn modal-btn-danger" onClick={handleDeleteConfirmFromContentView}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Message Modal */}
        {errorMessage && (
          <div className="modal-overlay" onClick={() => setErrorMessage(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">Error</div>
              <div className="modal-body">{errorMessage}</div>
              <div className="modal-footer">
                <button type="button" className="modal-btn modal-btn-primary" onClick={() => setErrorMessage(null)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }
  
  // Root level: show all segments/content, or PathCreate if empty
  if (data.currentPath.length === 0) {
    if (isSwitching) {
      return (
        <div className="path-tab">
          <div className="path-tab-content">
            <div className="path-tab-switching">
              <SpinningCircle width={24} height={24} />
              {switchingReason && <span style={{ marginLeft: '12px' }}>{switchingReason}</span>}
            </div>
          </div>
        </div>
      )
    }
    
    if (items.length === 0 && !loading && !error) {
      return (
        <div className="path-tab">
          <div className="path-tab-content">
            <div className="path-tab-description">
              No segments or content found. Create your first item below.
            </div>
            <SegCreate onSegmentCreated={loadItems} />
          </div>
        </div>
      )
    }
    
    return (
      <>
        <PathTabAllItem
          items={items}
          loading={loading}
          error={error}
          onItemDoubleClick={handleItemDoubleClick}
          onItemContextMenu={handleItemContextMenu}
          renamingItemId={renamingItemId}
          renamingClickPos={renamingClickPos}
          isRenamingInProgress={isRenamingInProgress}
          onRenameSubmit={handleRenameSubmit}
          onRenameCancel={handleRenameCancel}
          onRetry={loadItems}
        />
        
        {/* Context Menu */}
        {contextMenu && (
          <Menu
            items={getContextMenuItems()}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={handleCloseContextMenu}
            onItemClick={handleMenuItemClick}
            onContextMenu={handleContextMenu}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">Confirm Delete</div>
              <div className="modal-body">
                Are you sure you want to delete <strong>"{deleteConfirm.itemName || '(unnamed item)'}"</strong>?
                <br />
                This action cannot be undone.
              </div>
              <div className="modal-footer">
                <button type="button" className="modal-btn modal-btn-cancel" onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </button>
                <button type="button" className="modal-btn modal-btn-danger" onClick={handleDeleteConfirm}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Message Modal */}
        {errorMessage && (
          <div className="modal-overlay" onClick={() => setErrorMessage(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">Error</div>
              <div className="modal-body">{errorMessage}</div>
              <div className="modal-footer">
                <button type="button" className="modal-btn modal-btn-primary" onClick={() => setErrorMessage(null)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Non-root: show navigation buttons + PathBar + children
  return (
    <div className="path-tab">
      <div className="path-tab-header">
        <div className="path-tab-nav-btns">
          <button
            onClick={onNaviBack}
            disabled={!data.canNaviBack}
            className="nav-btn"
            title="Go back"
          >
            ◀
          </button>
          <button
            onClick={onNaviForward}
            disabled={!data.canNaviForward}
            className="nav-btn"
            title="Go forward"
          >
            ▶
          </button>
          <button
            onClick={handleNaviUp}
            disabled={data.currentPath.length === 0}
            className="nav-btn nav-btn-up"
            title="Go up"
          >
            ▲
          </button>
        </div>
        <PathBar
          segments={segments}
          onPathSegClicked={handlePathSegClick}
        />
      </div>

      <div className="path-tab-content" onContextMenu={handleContextMenu}>
        {isSwitching ? (
          <div className="path-tab-switching">
            <SpinningCircle width={24} height={24} />
            {switchingReason && <span style={{ marginLeft: '12px' }}>{switchingReason}</span>}
          </div>
        ) : showCreatePanel ? (
          <>
            <div className="path-tab-description">
              Create a new {createType === 'path' ? 'segment' : 'content'} as child of current segment.
            </div>
            <SegCreate 
              presetType={createType}
              presetContentType={contentTypeForCreate}
              presetDirectParent={data.currentPath[data.currentPath.length - 1]}
              onSegmentCreated={handleCreationComplete}
              onCancel={() => setShowCreatePanel(false)}
            />
          </>
        ) : (
          <SegView
            segmentId={data.currentPath[data.currentPath.length - 1]}
            segmentName={getItemName(data.currentPath[data.currentPath.length - 1]) || ''}
            items={items}
            loading={loading}
            error={error}
            onItemDoubleClick={handleItemDoubleClick}
            onItemContextMenu={handleItemContextMenu}
            renamingItemId={renamingItemId}
            renamingClickPos={renamingClickPos}
            isRenamingInProgress={isRenamingInProgress}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={handleRenameCancel}
            colWidthRatio={data.colWidthRatio}
            onUpdateColWidthRatio={(ratios) => {
              onDataChange({ ...data, colWidthRatio: ratios })
            }}
          />
        )}
        
        {/* Context Menu */}
        {contextMenu && (
          <Menu
            items={getContextMenuItems()}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={handleCloseContextMenu}
            onItemClick={handleMenuItemClick}
            onContextMenu={handleContextMenu}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">Confirm Delete</div>
              <div className="modal-body">
                Are you sure you want to delete <strong>"{deleteConfirm.itemName || '(unnamed item)'}"</strong>?
                <br />
                This action cannot be undone.
              </div>
              <div className="modal-footer">
                <button type="button" className="modal-btn modal-btn-cancel" onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </button>
                <button type="button" className="modal-btn modal-btn-danger" onClick={handleDeleteConfirm}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Message Modal */}
        {errorMessage && (
          <div className="modal-overlay" onClick={() => setErrorMessage(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">Error</div>
              <div className="modal-body">{errorMessage}</div>
              <div className="modal-footer">
                <button type="button" className="modal-btn modal-btn-primary" onClick={() => setErrorMessage(null)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PathTab

