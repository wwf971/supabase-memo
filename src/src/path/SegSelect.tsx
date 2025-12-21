// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { segmentCache, segPathCache } from '../cache/cache'
import { getPathToRoot } from '../backend/segment'
import { formatSegmentPath } from './pathUtils'
import { SpinningCircle } from '@wwf971/react-comp-misc'
import './SegSelect.css'

export interface SelectItem {
  id: string
  name: string
}

interface SegSelectProps {
  items: SelectItem[]
  onItemSelect: (item: SelectItem) => void
  loading?: boolean
}

/**
 * Dropdown component for selecting segments with path display
 */
const SegSelect: React.FC<SegSelectProps> = ({ items, onItemSelect, loading = false }) => {
  const [itemPaths, setItemPaths] = useState<Record<string, string>>({})
  const [loadingPaths, setLoadingPaths] = useState(false)

  // Load paths for all items
  useEffect(() => {
    const loadPaths = async () => {
      setLoadingPaths(true)
      const paths: Record<string, string> = {}
      
      for (const item of items) {
        // Format: /name1/name2/name3/ (segments end with /)
        paths[item.id] = await formatSegmentPath(item.id)
      }
      
      setItemPaths(paths)
      setLoadingPaths(false)
    }

    if (items.length > 0) {
      loadPaths()
    }
  }, [items])

  if (loading || loadingPaths) {
    return (
      <div className="seg-select-loading">
        <SpinningCircle width={16} height={16} />
      </div>
    )
  }

  if (items.length === 0) {
    return <div className="seg-select-empty">No matched items</div>
  }

  return (
    <div className="seg-select-dropdown">
      {items.map(item => (
        <div
          key={item.id}
          className="seg-select-item"
          onClick={() => onItemSelect(item)}
        >
          <span className="seg-select-name">{item.name}</span>
          {itemPaths[item.id] && (
            <span className="seg-select-path">{itemPaths[item.id]}</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default SegSelect

