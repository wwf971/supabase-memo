// @ts-nocheck
import React from 'react'
import SegList, { ListItem } from './SegList'

interface PathTabAllItemProps {
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
}

/**
 * Component for displaying all segments/content at root level
 */
const PathTabAllItem: React.FC<PathTabAllItemProps> = ({
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
  onRetry
}) => {
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
      <div className="path-tab-content">
        <div className="path-tab-description">
          All segment and content nodes. Double-click to navigate into a segment.
        </div>
        <SegList
          items={items}
          loading={loading}
          error={error}
          onItemDoubleClick={onItemDoubleClick}
          onItemContextMenu={onItemContextMenu}
          renamingItemId={renamingItemId}
          renamingClickPos={renamingClickPos}
          isRenamingInProgress={isRenamingInProgress}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
          columns={['name', 'path', 'type']}
        />
      </div>
    </div>
  )
}

export default PathTabAllItem

