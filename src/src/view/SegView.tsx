// @ts-nocheck
import React, { useState } from 'react'
import { ListItem, ItemRole } from '../path/SegList'
import SegList from '../path/SegList'
import { Refresh } from '@wwf971/react-comp-misc'
import { refreshChildren } from '../cache/refreshCache'
import './SegView.css'

interface SegViewProps {
  segmentId: string
  segmentName: string
  items: ListItem[]
  loading?: boolean
  error?: string | null
  onItemDoubleClick?: (itemId: string, itemType: 'segment' | 'content') => void
  onItemContextMenu?: (e: React.MouseEvent, itemId: string, itemType: 'segment' | 'content') => void
  renamingItemId?: string | null
  renamingClickPos?: { x: number; y: number } | null
  isRenamingInProgress?: boolean
  onRenameSubmit?: (itemId: string, newName: string) => void
  onRenameCancel?: () => void
  colWidthRatio?: Record<string, number>
  onUpdateColWidthRatio?: (ratios: Record<string, number>) => void
  onRefresh?: () => void
}

/**
 * SegView - Display segment details with its children
 */
const SegView: React.FC<SegViewProps> = ({
  segmentId,
  segmentName,
  items,
  loading = false,
  error = null,
  onItemDoubleClick,
  onItemContextMenu,
  renamingItemId,
  renamingClickPos,
  isRenamingInProgress,
  onRenameSubmit,
  onRenameCancel,
  colWidthRatio,
  onUpdateColWidthRatio,
  onRefresh
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Handle refresh button click
  const handleRefresh = async () => {
    if (isRefreshing || !segmentId) return
    
    setIsRefreshing(true)
    try {
      console.log('[SegView] Refreshing children for', segmentId)
      
      // Clear and re-fetch cache
      await refreshChildren(segmentId)
      
      // Trigger parent component to reload items
      if (onRefresh) {
        onRefresh()
      }
    } catch (err) {
      console.error('[SegView] Error refreshing:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Calculate stats
  const totalItems = items.length
  const segmentCount = items.filter(item => item.type === 'segment').length
  const contentCount = items.filter(item => item.type === 'content').length

  // Convert relationTypes array to ItemRole object for each item
  const itemRoles = React.useMemo(() => {
    const roles: Record<string, ItemRole> = {}
    items.forEach(item => {
      if (item.relationTypes && item.relationTypes.length > 0) {
        roles[item.id] = {
          isDirect: item.relationTypes.includes(0),
          isIndirect: item.relationTypes.includes(1),
          isBind: item.relationTypes.includes(2)
        }
      }
    })
    return roles
  }, [items])

  return (
    <div className="seg-view">
      <div className="seg-view-header">
        <div className="seg-view-header-left">
          <div className="seg-view-title">
            {segmentName || '(unnamed segment)'}/
          </div>
          <div className="seg-view-id">{segmentId}</div>
        </div>
        <div className="seg-view-meta">
          <span className="seg-stat-badge">
            {totalItems} item{totalItems !== 1 ? 's' : ''}
          </span>
          <span className="seg-stat-badge segment-badge">
            {segmentCount} segment{segmentCount !== 1 ? 's' : ''}
          </span>
          <span className="seg-stat-badge content-badge">
            {contentCount} content{contentCount !== 1 ? 's' : ''}
          </span>
          <button 
            className="refresh-button"
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            title="Refresh children"
          >
            <Refresh width={16} height={16} />
          </button>
        </div>
      </div>
      <div className="seg-view-body">
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
          columns={['name', 'path', 'type', 'rank']}
          colWidthRatio={colWidthRatio}
          onUpdateColWidthRatio={onUpdateColWidthRatio}
          showRoleSelection={true}
          itemRoles={itemRoles}
          roleSelectionReadOnly={true}
        />
      </div>
    </div>
  )
}

export default SegView

