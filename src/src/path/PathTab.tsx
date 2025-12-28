// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { segmentCache, segChildrenCache, contentCache, PathSegmentCache, segRelationCache } from '../cache/cache'
import { getSupabaseClient } from '../backend/supabase'
import { getChildren, getRootItems, SegmentRelationType, getPathToRoot, getDirectParent, deleteRelation } from '../backend/segment'
import { getPathSegment, getSegments, formatSegmentPath, formatContentPath } from './PathUtils'
import PathBar from './PathBar'
import { ListItem } from './SegList'
import SegList from './SegList'
import SegView from '../view/SegView'
import SegCreate from '../panel/SegCreate'
import SegAdd from '../panel/SegAdd'
import ModifyParent from '../panel/ModifyParent'
import PathTabRoot from './PathTabRoot'
import ContentView from '../view/ContentView'
import { Menu, SpinningCircle } from '@wwf971/react-comp-misc'
import type { MenuItem, MenuItemSingle, PathSegment } from '@wwf971/react-comp-misc'
import './PathTab.css'

/**
 * Helper: Get item type from cache (segment or content)
 */
function getItemType(id: string): 'segment' | 'content' | null {
  // Must be in segment cache to exist
  const segment = segmentCache.getSync(id)
  if (!segment) {
    return null
  }
  
  // Use isContent field from segment cache
  const type = segment.isContent ? 'content' : 'segment'
  return type
}

/**
 * Helper: Get item name from cache (sync only, no fetch)
 */
function getItemName(id: string): string | null {
  const segment = segmentCache.getSync(id)
  return segment ? segment.name : null
}

/**
 * Helper: Check if content has bind relationship with any segment
 */
async function hasBindRelationship(contentId: string): Promise<boolean> {
  const client = getSupabaseClient()
  const { data } = await client
    .from('segment_relation')
    .select('segment_1')
    .eq('segment_2', contentId)
    .eq('type', 2)  // parent_child_bind
    .limit(1)
  
  return !!(data && data.length > 0)
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId?: string; multiSelection?: Set<string> } | null>(null)
  const [menuCounter, setMenuCounter] = useState(0) // Counter to force menu remount
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [createType, setCreateType] = useState<'path' | 'content'>('path')
  const [contentTypeForCreate, setContentTypeForCreate] = useState<'text' | 'image' | 'file'>('text')
  const [showAddContentPanel, setShowAddContentPanel] = useState(false)
  const [addContentParent, setAddContentParent] = useState<{ id: string; name: string } | null>(null)
  const [showModifyParentPanel, setShowModifyParentPanel] = useState(false)
  const [modifyParentContent, setModifyParentContent] = useState<{ id: string; name: string } | null>(null)

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
        // For bound content: skip this element (path ends at parent)
        if (itemType === 'segment') {
          loadedSegments.push({
            id: segment.id,
            name: segment.name + '/'
          })
        } else if (itemType === 'content') {
          // Check if this content is bound to a segment
          const isBound = await hasBindRelationship(id)
          if (!isBound && segment.name) {
            // Regular content with a name - show it
            loadedSegments.push({
              id: segment.id,
              name: segment.name
            })
          }
          // If bound content - don't add to path display
        }
      }
    }

    // If last item was bound content, remove trailing / from previous segment
    const lastId = data.currentPath[data.currentPath.length - 1]
    if (lastId) {
      const lastType = getItemType(lastId)
      if (lastType === 'content') {
        const isBound = await hasBindRelationship(lastId)
        if (isBound && loadedSegments.length > 0) {
          // Remove trailing slash from the last displayed segment
          const lastDisplayed = loadedSegments[loadedSegments.length - 1]
          if (lastDisplayed.name.endsWith('/')) {
            lastDisplayed.name = lastDisplayed.name.slice(0, -1)
          }
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
      
      // Reset panel states when path changes
      if (pathActuallyChanged) {
        setShowCreatePanel(false)
        setShowAddContentPanel(false)
        setShowModifyParentPanel(false)
        setAddContentParent(null)
        setModifyParentContent(null)
      }
      
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
    console.log(`[PathTab] 🖱️ Double-clicked ${itemType}: ${itemId}`)
    
    // Content items should open in ContentView, segments should navigate
    if (itemType === 'content') {
      console.log(`[PathTab] Opening content in ContentView`)
      // Navigate to content view directly
      const contentItem = items.find(i => i.id === itemId)
      const itemName = contentItem?.name || getItemName(itemId) || '(unnamed)'
      
      // Get path to root for the content
      const pathResult = await getPathToRoot(itemId)
      if (pathResult.code === 0 && pathResult.data) {
        onNavi?.(pathResult.data, itemName)
      } else {
        // Fallback: use current path + itemId
        onNavi?.([...data.currentPath, itemId], itemName)
      }
      return
    }
    
    console.log(`[PathTab] 🖱️ NAVIGATION START - Navigating into segment: ${itemId}`)
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
    
    // Always increment counter to force menu remount with new context
    setMenuCounter(prev => prev + 1)
    setContextMenu({ x: e.clientX, y: e.clientY, itemId })
  }

  /**
   * Handle right-click context menu on background
   */
  const handleContextMenu = (e: React.MouseEvent) => {
    // Only show menu when not at root (we have a parent to create children for)
    if (data.currentPath.length === 0) return
    
    e.preventDefault()
    
    // If menu is currently open, we need to temporarily hide it to detect what's underneath
    if (contextMenu) {
      // Temporarily hide the menu to detect what's underneath
      const menuElements = document.querySelectorAll('.context-menu, .menu-backdrop')
      menuElements.forEach(el => (el as HTMLElement).style.pointerEvents = 'none')
      
      // Now detect what's underneath
      const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY)
      const targetRow = elementUnderCursor?.closest('tr') as HTMLTableRowElement | null
      
      // Restore pointer events
      menuElements.forEach(el => (el as HTMLElement).style.pointerEvents = '')
      
      // If there's a table row under the cursor, find the item and trigger item context menu
      if (targetRow && (targetRow.classList.contains('segment-row') || targetRow.classList.contains('content-row'))) {
        // Find the item by looking at the row's data
        const tbody = targetRow.parentElement
        if (tbody) {
          const rowIndex = Array.from(tbody.children).indexOf(targetRow)
          if (rowIndex >= 0 && rowIndex < items.length) {
            const item = items[rowIndex]
            // Dispatch event to update selection in SegView
            window.dispatchEvent(new CustomEvent('segview-update-selection', { detail: { itemId: item.id } }))
            // Small delay to let selection update before showing menu
            setTimeout(() => {
              handleItemContextMenu(e, item.id, item.type)
            }, 0)
            return
          }
        }
      }
    }
    
    // Background context menu - also notify SegView to clear selection
    window.dispatchEvent(new CustomEvent('segview-update-selection', { detail: { itemId: null } }))
    
    // Always increment counter to force menu remount with new context
    setMenuCounter(prev => prev + 1)
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  /**
   * Close context menu
   */
  const handleCloseContextMenu = () => {
    setContextMenu(null)
    // Reset counter periodically to prevent overflow (every 100 closes)
    setMenuCounter(prev => prev >= 100 ? 0 : prev)
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
   * Handle multi-item context menu
   */
  const handleMultiItemContextMenu = (e: React.MouseEvent, selectedIds: Set<string>) => {
    e.preventDefault()
    e.stopPropagation()
    const newCounter = menuCounter + 1
    setMenuCounter(newCounter)
    setContextMenu({ x: e.clientX, y: e.clientY, multiSelection: selectedIds })
  }

  /**
   * Get context menu items based on context
   */
  const getContextMenuItems = (): MenuItem[] => {
    // Multi-selection context menu
    if (contextMenu?.multiSelection && contextMenu.multiSelection.size > 1) {
      return [
        {
          type: 'item',
          name: 'Test',
          data: { action: 'testMulti', selectedIds: Array.from(contextMenu.multiSelection) }
        }
      ]
    }
    
    if (contextMenu?.itemId) {
      // Context menu for an item - check its type from cache
      const itemType = getItemType(contextMenu.itemId)
      const item = items.find(i => i.id === contextMenu.itemId)
      const isDirectChild = item?.relationTypes?.includes(0) || false
      
      if (itemType === 'content') {
      // Context menu for content item
      const menuItems: MenuItem[] = [
        {
          type: 'item',
          name: 'View Details',
          data: { action: 'viewDetails', itemId: contextMenu.itemId, itemType: 'content' }
        },
        {
          type: 'item',
          name: 'Rename',
          data: { action: 'rename', itemId: contextMenu.itemId, itemType: 'content' }
        }
      ]
      
      // Add Move Up/Down for direct children
      if (isDirectChild) {
        menuItems.push(
          {
            type: 'item',
            name: 'Move Up',
            data: { action: 'moveUp', itemId: contextMenu.itemId, itemType: 'content' }
          },
          {
            type: 'item',
            name: 'Move Down',
            data: { action: 'moveDown', itemId: contextMenu.itemId, itemType: 'content' }
          }
        )
      }
      
      menuItems.push(
        {
          type: 'item',
          name: 'Modify Parent',
          data: { action: 'modifyParent', itemId: contextMenu.itemId, itemType: 'content' }
        },
        {
          type: 'item',
          name: 'Remove From Parent',
          data: { action: 'removeFromParent', itemId: contextMenu.itemId, itemType: 'content' }
        },
        {
          type: 'item',
          name: 'Delete',
          data: { action: 'delete', itemId: contextMenu.itemId, itemType: 'content' }
        }
      )
      
      return menuItems
      } else {
        // Context menu for segment - could add segment-specific actions here
        const menuItems: MenuItem[] = [
          {
            type: 'item',
            name: 'Open',
            data: { action: 'open', itemId: contextMenu.itemId, itemType: 'segment' }
          },
          {
            type: 'item',
            name: 'Add Content',
            data: { action: 'addContent', itemId: contextMenu.itemId, itemType: 'segment' }
          },
          {
            type: 'item',
            name: 'Rename',
            data: { action: 'rename', itemId: contextMenu.itemId, itemType: 'segment' }
          }
        ]
        
        // Add Move Up/Down for direct children
        if (isDirectChild) {
          menuItems.push(
            {
              type: 'item',
              name: 'Move Up',
              data: { action: 'moveUp', itemId: contextMenu.itemId, itemType: 'segment' }
            },
            {
              type: 'item',
              name: 'Move Down',
              data: { action: 'moveDown', itemId: contextMenu.itemId, itemType: 'segment' }
            }
          )
        }
        
        menuItems.push(
          {
            type: 'item',
            name: 'Modify Parent',
            data: { action: 'modifyParent', itemId: contextMenu.itemId, itemType: 'segment' }
          },
          {
            type: 'item',
            name: 'Delete',
            data: { action: 'delete', itemId: contextMenu.itemId, itemType: 'segment' }
          }
        )
        
        return menuItems
      }
    } else {
      // Context menu for background (create new items / add content to current segment)
      const currentSegmentId = data.currentPath[data.currentPath.length - 1]
      const menuItems: MenuItem[] = []
      
      // Add "Add Content" if we have a current segment
      if (currentSegmentId) {
        const segment = segmentCache.getSync(currentSegmentId)
        if (segment) {
          menuItems.push({
            type: 'item',
            name: 'Add Content',
            data: { action: 'addContent', itemId: currentSegmentId }
          })
        }
      }
      
      // Add "New" menu
      menuItems.push({
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
      })
      
      // Add "New (Quick)" menu
      menuItems.push({
        type: 'menu',
        name: 'New (Quick)',
        children: [
          {
            type: 'item',
            name: 'Segment',
            data: { action: 'createSegmentQuick' }
          }
        ]
      })
      
      return menuItems
    }
  }

  /**
   * Handle move up (move item one position up in ranking)
   */
  const handleMoveUp = async (itemId: string) => {
    console.log(`[PathTab] handleMoveUp called for ${itemId}`)
    
    // Get current parent segment
    const currentParentId = data.currentPath[data.currentPath.length - 1]
    if (!currentParentId) {
      console.error('[PathTab] No current parent segment')
      setErrorMessage('Cannot move: no parent segment')
      handleCloseContextMenu()
      return
    }
    
    try {
      const { moveDirectChildUp } = await import('../backend/children')
      const result = await moveDirectChildUp(currentParentId, itemId)
      
      if (result.code === 0) {
        console.log(`[PathTab] ✅ Moved up ${itemId}`)
        // Reload items to reflect new order
        await loadItems()
      } else {
        console.error(`[PathTab] ❌ Failed to move up: ${result.message}`)
        setErrorMessage(result.message || 'Failed to move up')
      }
    } catch (err: any) {
      console.error('[PathTab] Error moving up:', err)
      setErrorMessage(err.message || 'Failed to move up')
    } finally {
      handleCloseContextMenu()
    }
  }

  /**
   * Handle move down (move item one position down in ranking)
   */
  const handleMoveDown = async (itemId: string) => {
    console.log(`[PathTab] handleMoveDown called for ${itemId}`)
    
    // Get current parent segment
    const currentParentId = data.currentPath[data.currentPath.length - 1]
    if (!currentParentId) {
      console.error('[PathTab] No current parent segment')
      setErrorMessage('Cannot move: no parent segment')
      handleCloseContextMenu()
      return
    }
    
    try {
      const { moveDirectChildDown } = await import('../backend/children')
      const result = await moveDirectChildDown(currentParentId, itemId)
      
      if (result.code === 0) {
        console.log(`[PathTab] ✅ Moved down ${itemId}`)
        // Reload items to reflect new order
        await loadItems()
      } else {
        console.error(`[PathTab] ❌ Failed to move down: ${result.message}`)
        setErrorMessage(result.message || 'Failed to move down')
      }
    } catch (err: any) {
      console.error('[PathTab] Error moving down:', err)
      setErrorMessage(err.message || 'Failed to move down')
    } finally {
      handleCloseContextMenu()
    }
  }

  /**
   * Handle menu item click
   */
  const handleMenuItemClick = (item: MenuItemSingle) => {
    const { action, itemId, itemType, contentType, selectedIds } = item.data || {}
    console.log(`[PathTab] Menu item clicked:`, { action, itemId, itemType, contentType, selectedIds })
    
    // Handle multi-selection actions
    if (action === 'testMulti' && selectedIds) {
      console.log(`[PathTab] Test action for ${selectedIds.length} selected items:`, selectedIds)
      handleCloseContextMenu()
      return
    }
    
    if (action === 'view' && itemId) {
      // View content - get item info and navigate to show ContentView
      const contentItem = items.find(i => i.id === itemId)
      const itemName = contentItem?.name || getItemName(itemId) || '(unnamed)'
      console.log(`[PathTab] Viewing content: ${itemName} (${itemId})`)
      
      // Get path to root for the content
      getPathToRoot(itemId).then(pathResult => {
        if (pathResult.code === 0 && pathResult.data) {
          onNavi?.(pathResult.data, itemName)
        } else {
          // Fallback: use current path + itemId
          onNavi?.([...data.currentPath, itemId], itemName)
        }
      })
    } else if (action === 'viewDetails' && itemId) {
      handleItemDoubleClick(itemId, 'content')
    } else if (action === 'open' && itemId) {
      handleItemDoubleClick(itemId, 'segment')
    } else if (action === 'addContent' && itemId) {
      // Get segment name from cache
      const segment = segmentCache.getSync(itemId)
      if (segment) {
        setAddContentParent({ id: itemId, name: segment.name })
        setShowAddContentPanel(true)
      }
    } else if (action === 'modifyParent' && itemId) {
      // Get item name from cache
      const item = items.find(i => i.id === itemId)
      const itemName = item?.name || getItemName(itemId) || '(unnamed)'
      setModifyParentContent({ id: itemId, name: itemName })
      setShowModifyParentPanel(true)
    } else if (action === 'createSegment') {
      handleCreateFromMenu('path')
    } else if (action === 'createContent') {
      handleCreateFromMenu('content', contentType || 'text')
    } else if (action === 'createSegmentQuick') {
      handleQuickCreateSegment()
    } else if (action === 'rename' && itemId) {
      setRenamingItemId(itemId)
      setRenamingClickPos(contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null)
    } else if (action === 'moveUp' && itemId) {
      console.log(`[PathTab] Moving up ${itemId}`)
      handleMoveUp(itemId)
      return
    } else if (action === 'moveDown' && itemId) {
      console.log(`[PathTab] Moving down ${itemId}`)
      handleMoveDown(itemId)
      return
    } else if (action === 'removeFromParent' && itemId) {
      console.log(`[PathTab] Triggering remove from parent for ${itemId}`)
      handleRemoveFromParent(itemId)
      return
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
   * Handle remove from parent (removes all relationships with current parent)
   */
  const handleRemoveFromParent = async (contentId: string) => {
    console.log(`[PathTab] handleRemoveFromParent called for ${contentId}`)
    
    // Get current parent segment
    const currentParentId = data.currentPath[data.currentPath.length - 1]
    if (!currentParentId) {
      console.error('[PathTab] No current parent segment')
      setErrorMessage('Cannot remove: no parent segment')
      handleCloseContextMenu()
      return
    }
    
    const item = items.find(item => item.id === contentId)
    const itemName = item?.name || 'this item'
    
    // Confirm removal
    if (!confirm(`Remove "${itemName}" from current parent?\n\nThis will remove all relationships (direct, indirect, bind) with the current parent segment, but the content itself will not be deleted.`)) {
      handleCloseContextMenu()
      return
    }
    
    try {
      setIsDeleting(true)
      
      // Load all relationships to find what exists
      await segRelationCache.loadAsChild(contentId)
      
      // Check and delete each relationship type with current parent
      const directParents = segRelationCache.getParents(contentId, SegmentRelationType.PARENT_CHILD_DIRECT) || []
      const indirectParents = segRelationCache.getParents(contentId, SegmentRelationType.PARENT_CHILD_INDIRECT) || []
      const bindParents = segRelationCache.getParents(contentId, SegmentRelationType.PARENT_CHILD_BIND) || []
      
      let deletedCount = 0
      
      if (directParents.includes(currentParentId)) {
        await deleteRelation(currentParentId, contentId, SegmentRelationType.PARENT_CHILD_DIRECT)
        deletedCount++
        console.log('[PathTab] ✅ Removed direct relationship')
      }
      
      if (indirectParents.includes(currentParentId)) {
        await deleteRelation(currentParentId, contentId, SegmentRelationType.PARENT_CHILD_INDIRECT)
        deletedCount++
        console.log('[PathTab] ✅ Removed indirect relationship')
      }
      
      if (bindParents.includes(currentParentId)) {
        await deleteRelation(currentParentId, contentId, SegmentRelationType.PARENT_CHILD_BIND)
        deletedCount++
        console.log('[PathTab] ✅ Removed bind relationship')
      }
      
      if (deletedCount === 0) {
        setErrorMessage('No relationships found with current parent')
      } else {
        console.log(`[PathTab] ✅ Removed ${deletedCount} relationship(s) with parent ${currentParentId}`)
        // Reload items to reflect changes
        await loadItems()
      }
    } catch (err: any) {
      console.error('[PathTab] Error removing from parent:', err)
      setErrorMessage(err.message || 'Failed to remove from parent')
    } finally {
      setIsDeleting(false)
      handleCloseContextMenu()
    }
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
      // Delete all relations first (handles cache invalidation)
      const relResult = await segRelationCache.removeAllRelations(itemId)
      if (relResult.code !== 0) {
        console.error(`[PathTab] ❌ Failed to delete relations: ${relResult.message}`)
        setErrorMessage(`Failed to delete relations: ${relResult.message}`)
        return
      }
      
      // Delete segment using cache method
      result = await segmentCache.deleteSegment(itemId)
      
      if (result.code === 0) {
        console.log(`[PathTab] ✅ Deleted segment ${itemId} with all relations`)
        
        // Check if deleted segment is in current path
        const deletedIndex = data.currentPath.indexOf(itemId)
        if (deletedIndex !== -1) {
          // We're viewing the deleted segment or its children - navigate to parent
          console.log(`[PathTab] Deleted segment is in current path, navigating to parent`)
          const newPath = data.currentPath.slice(0, deletedIndex)
          setData({ ...data, currentPath: newPath })
        } else {
          // Just reload items in current view
          await loadItems()
        }
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
   * Handle modify parent from ContentView
   */
  const handleModifyParentFromContentView = async (contentId: string) => {
    const itemName = lastItemName || '(unnamed content)'
    setModifyParentContent({ id: contentId, name: itemName })
    setShowModifyParentPanel(true)
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
            {showModifyParentPanel && modifyParentContent ? (
              <>
                <div className="path-tab-description">
                  Modify Parent Relationships for: <strong>{modifyParentContent.name}</strong>
                </div>
                <ModifyParent
                  itemId={modifyParentContent.id}
                  itemName={modifyParentContent.name}
                  itemType="content"
                  onModified={() => {
                    setShowModifyParentPanel(false)
                    setModifyParentContent(null)
                    loadPath()  // Reload path in case relationships changed
                    loadItems()  // Reload items
                  }}
                  onCancel={() => {
                    setShowModifyParentPanel(false)
                    setModifyParentContent(null)
                  }}
                />
              </>
            ) : (
              <ContentView 
                contentId={lastId}
                contentName={lastItemName || ''}
                onDelete={handleDeleteFromContentView}
                onModifyParent={handleModifyParentFromContentView}
              />
            )}
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
        <PathTabRoot
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
          onItemCreated={loadItems}
        />
        
        {/* Context Menu */}
        {contextMenu && (
          <Menu
            key={`menu-${menuCounter}-${contextMenu.itemId || 'background'}`}
            items={getContextMenuItems()}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={handleCloseContextMenu}
            onItemClick={handleMenuItemClick}
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
        ) : showAddContentPanel && addContentParent ? (
          <>
            <div className="path-tab-description">
              Add existing content as children to "{addContentParent.name}".
            </div>
            <SegAdd
              parentSegmentId={addContentParent.id}
              parentSegmentName={addContentParent.name}
              onContentAdded={() => {
                setShowAddContentPanel(false)
                setAddContentParent(null)
                loadItems()
              }}
              onCancel={() => {
                setShowAddContentPanel(false)
                setAddContentParent(null)
              }}
            />
          </>
        ) : showModifyParentPanel && modifyParentContent ? (
          <>
            <div className="path-tab-description">
              Modify Parent Relationships for: <strong>{modifyParentContent.name}</strong>
            </div>
            <ModifyParent
              itemId={modifyParentContent.id}
              itemName={modifyParentContent.name}
              itemType={getItemType(modifyParentContent.id) || 'content'}
              onModified={() => {
                setShowModifyParentPanel(false)
                setModifyParentContent(null)
                loadPath()  // Reload path in case relationships changed
                loadItems()  // Reload items
              }}
              onCancel={() => {
                setShowModifyParentPanel(false)
                setModifyParentContent(null)
              }}
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
            onMultiItemContextMenu={handleMultiItemContextMenu}
            renamingItemId={renamingItemId}
            renamingClickPos={renamingClickPos}
            isRenamingInProgress={isRenamingInProgress}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={handleRenameCancel}
            colWidthRatio={data.colWidthRatio}
            onUpdateColWidthRatio={(ratios) => {
              onDataChange({ ...data, colWidthRatio: ratios })
            }}
            onRefresh={loadItems}
          />
        )}
        
        {/* Context Menu */}
        {contextMenu && (
          <Menu
            key={`menu-${menuCounter}-${contextMenu.itemId || 'background'}`}
            items={getContextMenuItems()}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={handleCloseContextMenu}
            onItemClick={handleMenuItemClick}
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

