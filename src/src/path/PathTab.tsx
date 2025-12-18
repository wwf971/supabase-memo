// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { segmentCache, segChildrenCache, contentCache, PathSegmentCache } from '../backend/cache'
import { getSupabaseClient } from '../backend/supabase'
import { getChildren, SegmentRelationType, getPathToRoot, getDirectParent } from '../backend/segment'
import { getPathSegment, getSegments, formatSegmentPath, formatContentPath } from './pathUtils'
import PathBar from './PathBar'
import { ListItem } from './SegList'
import SegList from './SegList'
import SegView from './SegView'
import SegCreate from './SegCreate'
import PathTabAllItem from './PathTabAllItem'
import ContentView from './ContentView'
import Menu, { MenuItem } from './Menu'
import { PathSegment } from '@wwf971/react-comp-misc/src/path/PathBar'
import { SpinningCircle } from '@wwf971/react-comp-misc/src/icon/Icon'
import './PathTab.css'

/**
 * Helper: Get item type from cache (segment or content)
 */
function getItemType(id: string): 'segment' | 'content' | null {
  // Must be in segment cache to exist
  if (!segmentCache.has(id)) return null
  
  // If also in content cache, it's content; otherwise segment
  return contentCache.has(id) ? 'content' : 'segment'
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
  
  // Track previous path to detect actual changes (not just reference changes)
  const prevPathRef = React.useRef<string[]>([])
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId?: string } | null>(null)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [createType, setCreateType] = useState<'path' | 'content'>('path')

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
      const newItems: ListItem[] = []
      const client = getSupabaseClient()

      if (data.currentPath.length === 0) {
        // Load all segments
        const segmentsResult = await getSegments()
        
        if (segmentsResult.code !== 0) {
          setError(segmentsResult.message || 'Failed to load segments')
          setLoading(false)
          return
        }

        const allSegments = segmentsResult.data || []
        // Cache all segments for faster lookups
        console.log(`[PathTab] Caching ${allSegments.length} segments from root query`)
        
        // Also load all content items
        const { data: allContent } = await client
          .from('content')
          .select('id, type_code, value')
        
        const contentIds = new Set((allContent || []).map(c => c.id))
        
        for (const seg of allSegments) {
          segmentCache.set(seg.id, seg as PathSegmentCache)
          
          const isContent = contentIds.has(seg.id)
          const itemType = isContent ? 'content' : 'segment'
          
          // Get path
          let pathStr = '/'
          if (itemType === 'segment') {
            pathStr = await formatSegmentPath(seg.id)
          } else {
            const directParentResult = await getDirectParent(seg.id)
            const parentId = directParentResult.code === 0 && directParentResult.data ? directParentResult.data : null
            pathStr = await formatContentPath(seg.id, seg.name, parentId)
          }
          
          const contentData = isContent ? allContent.find(c => c.id === seg.id) : null
          
          // Cache content data
          if (contentData) {
            const { contentCache } = await import('../backend/cache')
            contentCache.set(seg.id, contentData)
          }
          
          newItems.push({
            id: seg.id,
            name: seg.name,
            type: itemType,
            path: pathStr,
            value: contentData?.value || undefined,
            contentType: contentData?.type_code
          })
        }
      } else {
        // Load children of current parent (both direct and indirect)
        const parentId = data.currentPath[data.currentPath.length - 1]
        
        // Get direct children (check cache first)
        let directIds: string[] = []
        if (segChildrenCache.has(parentId, SegmentRelationType.PARENT_CHILD_DIRECT)) {
          directIds = segChildrenCache.get(parentId, SegmentRelationType.PARENT_CHILD_DIRECT) || []
          console.log(`[PathTab] ✓ Direct children found in cache: ${directIds.length} items`)
        } else {
          console.log(`[PathTab] ✗ Direct children not in cache, fetching from server...`)
          const directResult = await getChildren(parentId, SegmentRelationType.PARENT_CHILD_DIRECT)
          directIds = directResult.code === 0 ? (directResult.data || []) : []
          segChildrenCache.set(parentId, SegmentRelationType.PARENT_CHILD_DIRECT, directIds)
          console.log(`[PathTab] ✓ Fetched and cached ${directIds.length} direct children`)
        }
        
        // Get indirect children (check cache first)
        let indirectIds: string[] = []
        if (segChildrenCache.has(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT)) {
          indirectIds = segChildrenCache.get(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT) || []
          console.log(`[PathTab] ✓ Indirect children found in cache: ${indirectIds.length} items`)
        } else {
          console.log(`[PathTab] ✗ Indirect children not in cache, fetching from server...`)
          const indirectResult = await getChildren(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT)
          indirectIds = indirectResult.code === 0 ? (indirectResult.data || []) : []
          segChildrenCache.set(parentId, SegmentRelationType.PARENT_CHILD_INDIRECT, indirectIds)
          console.log(`[PathTab] ✓ Fetched and cached ${indirectIds.length} indirect children`)
        }

        // Load direct children details (can be segments or content)
        for (const childId of directIds) {
          // Use cache.get() - automatically fetches if not cached
          const segData = await segmentCache.get(childId)
          
          if (segData) {
            // Check if this child is also a content item
            const contentData = await contentCache.get(childId)
            
            const itemType = contentData ? 'content' : 'segment'
            
            // Calculate path
            let pathStr = '/'
            if (itemType === 'segment') {
              pathStr = await formatSegmentPath(childId)
            } else {
              // Content path: if empty name, use parent path without trailing /; otherwise append name
              const directParentResult = await getDirectParent(childId)
              const parentId = directParentResult.code === 0 && directParentResult.data ? directParentResult.data : null
              pathStr = await formatContentPath(childId, segData.name, parentId)
            }
            
            newItems.push({
              id: childId,
              name: segData.name,
              type: itemType,
              relationToDirect: true,
              path: pathStr,
              value: contentData?.value || undefined,
              contentType: contentData?.type_code || undefined
            })
          }
        }

        // Load indirect children details (can be segments or content)
        for (const childId of indirectIds) {
          // Use cache.get() - automatically fetches if not cached
          const segData = await segmentCache.get(childId)
          
          if (segData) {
            // Check if this child is also a content item
            const contentData = await contentCache.get(childId)
            
            const itemType = contentData ? 'content' : 'segment'
            
            // Calculate path
            let pathStr = '/'
            if (itemType === 'segment') {
              pathStr = await formatSegmentPath(childId)
            } else {
              const directParentResult = await getDirectParent(childId)
              const parentId = directParentResult.code === 0 && directParentResult.data ? directParentResult.data : null
              pathStr = await formatContentPath(childId, segData.name, parentId)
            }
            
            newItems.push({
              id: childId,
              name: segData.name,
              type: itemType,
              relationToDirect: false,
              path: pathStr,
              value: contentData?.value || undefined,
              contentType: contentData?.type_code
            })
          }
        }
      }

      setItems(newItems)
      console.log(`[PathTab] ✅ loadItems() COMPLETE - ${(performance.now() - startTime).toFixed(2)}ms - Loaded ${newItems.length} items`)
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
  const handleCreateFromMenu = (type: 'path' | 'content') => {
    setCreateType(type)
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
   * Get context menu items based on context
   */
  const getContextMenuItems = (): MenuItem[] => {
    if (contextMenu?.itemId) {
      // Context menu for an item - check its type from cache
      const itemType = getItemType(contextMenu.itemId)
      
      if (itemType === 'content') {
      // Context menu for content item
      return [
        {
          label: 'View Details',
          onClick: () => {
              handleItemDoubleClick(contextMenu.itemId!, 'content')
            handleCloseContextMenu()
          }
        }
      ]
      } else {
        // Context menu for segment - could add segment-specific actions here
        return [
          {
            label: 'Open',
            onClick: () => {
              handleItemDoubleClick(contextMenu.itemId!, 'segment')
              handleCloseContextMenu()
            }
          }
        ]
      }
    } else {
      // Context menu for background (create new items)
      return [
        {
          label: 'Create new segment',
          onClick: () => handleCreateFromMenu('path')
        },
        {
          label: 'Create new content',
          onClick: () => handleCreateFromMenu('content')
        }
      ]
    }
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
  
  // If viewing content, show ContentView
  if (lastType === 'content' && lastId) {
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
        <div className="path-tab-content">
          <ContentView 
            contentId={lastId}
            contentName={lastItemName || ''}
          />
        </div>
      </div>
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
      <PathTabAllItem
        items={items}
        loading={loading}
        error={error}
        onItemDoubleClick={handleItemDoubleClick}
        onItemContextMenu={handleItemContextMenu}
        onRetry={loadItems}
      />
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
          />
        )}
      </div>
    </div>
  )
}

export default PathTab

