// @ts-nocheck
import React, { useState } from 'react'
import SegList, { ListItem } from './SegList'
import SegCreate from '../panel/SegCreate'
import { Menu } from '@wwf971/react-comp-misc'
import type { MenuItem, MenuItemSingle } from '@wwf971/react-comp-misc'

interface PathTabRootProps {
  items: ListItem[]
  loading: boolean
  error: string | null
  onItemDoubleClick: (itemId: string, itemType: 'segment' | 'content') => void
  onItemContextMenu?: (e: React.MouseEvent, itemId: string, itemType: 'segment' | 'content') => void
  renamingItemId?: string | null
  renamingClickPos?: { x: number; y: number } | null
  isRenamingInProgress?: boolean
  onRenameSubmit?: (itemId: string, newName: string) => void
  onRenameCancel?: () => void
  onRetry?: () => void
  onItemCreated?: () => void  // Callback when item is created
}

/**
 * Component for displaying all segments/content at root level
 */
const PathTabRoot: React.FC<PathTabRootProps> = ({
  items,
  loading,
  error,
  onItemDoubleClick,
  onItemContextMenu,
  renamingItemId,
  renamingClickPos,
  isRenamingInProgress,
  onRenameSubmit,
  onRenameCancel,
  onRetry,
  onItemCreated
}) => {
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [emptySpaceMenuPosition, setEmptySpaceMenuPosition] = useState<{ x: number; y: number } | null>(null)

  const handleEmptySpaceContextMenu = (e: React.MouseEvent) => {
    // Only handle if click is on the empty space div or path-tab-content itself
    const target = e.target as HTMLElement
    if (!target.classList.contains('path-tab-empty-space') && 
        !target.classList.contains('path-tab-content')) {
      return
    }
    
    e.preventDefault()
    e.stopPropagation()
    setEmptySpaceMenuPosition({ x: e.clientX, y: e.clientY })
  }

  const handleItemContextMenuWrapper = (e: React.MouseEvent, itemId: string, itemType: 'segment' | 'content') => {
    // Close empty space menu when right-clicking on an item
    setEmptySpaceMenuPosition(null)
    // Call the original handler
    onItemContextMenu?.(e, itemId, itemType)
  }

  const handleMenuItemClick = (item: any) => {
    if (item.name === 'Create') {
      setEmptySpaceMenuPosition(null)
      setShowCreatePanel(true)
    }
  }

  const emptySpaceMenuItems: MenuItem[] = [
    {
      type: 'item',
      name: 'Create'
    }
  ]
  if (error) {
    return (
      <div className="path-tab">
        <div className="path-tab-content">
          <div className="path-tab-error">
            <p className="error-message">Error: {error}</p>
            {onRetry && (
              <button className="retry-button" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="path-tab">
      <div className="path-tab-content" onContextMenu={handleEmptySpaceContextMenu}>
        <div className="path-tab-description">
          Root-level segments and content (items without direct parents). Double-click to navigate into a segment.
        </div>
        
        {/* Show either the create panel or the segment list */}
        {showCreatePanel ? (
          <SegCreate
            onSegmentCreated={() => {
              setShowCreatePanel(false)
              onItemCreated?.()
            }}
            onCancel={() => setShowCreatePanel(false)}
          />
        ) : (
          <>
            <SegList
              items={items}
              loading={loading}
              error={error}
              onItemDoubleClick={onItemDoubleClick}
              onItemContextMenu={handleItemContextMenuWrapper}
              renamingItemId={renamingItemId}
              renamingClickPos={renamingClickPos}
              isRenamingInProgress={isRenamingInProgress}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              columns={['name', 'path', 'type']}
            />
            
            {/* Empty space for right-click menu */}
            <div className="path-tab-empty-space" onContextMenu={handleEmptySpaceContextMenu} />
          </>
        )}
      </div>

      {/* Empty Space Context Menu */}
      {emptySpaceMenuPosition && (
        <Menu
          items={emptySpaceMenuItems}
          position={emptySpaceMenuPosition}
          onClose={() => setEmptySpaceMenuPosition(null)}
          onItemClick={handleMenuItemClick}
          onContextMenu={handleEmptySpaceContextMenu}
        />
      )}
    </div>
  )
}

export default PathTabRoot

