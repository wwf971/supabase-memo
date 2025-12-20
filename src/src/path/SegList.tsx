// @ts-nocheck
import React, { useState, useRef } from 'react'
import { FolderIcon, InfoIcon, CrossIcon, SpinningCircle, PdfIcon } from '@wwf971/react-comp-misc'
import { getContentTypeLabel } from '../utils/type'
import './SegList.css'

export interface ListItem {
  id: string
  name: string
  type: 'segment' | 'content'
  relationTypes?: number[]  // All relationship types (0=direct, 1=indirect, 2=bind)
  value?: string  // Only for content
  contentType?: number  // Only for content
  path?: string  // Path to root (e.g., "root > parent > current")
}

export interface ItemRole {
  isDirect: boolean   // whether this is a direct parent-child relationship
  isIndirect: boolean // whether this is an indirect parent-child relationship
  isBind: boolean     // whether this is a bind parent-child lationship
  // Note: isDirect and isIndirect are mutually exclusive (can't both be true)
  // But both can be false (only bind relationship)
}

export type SegListColumn = 'name' | 'path' | 'type' | 'value'

interface SegListProps {
  items: ListItem[]
  loading?: boolean
  error?: string | null
  onItemDoubleClick?: (itemId: string, itemType: 'segment' | 'content') => void
  onItemContextMenu?: (e: React.MouseEvent, itemId: string, itemType: 'segment' | 'content') => void
  renamingItemId?: string | null  // ID of item being renamed
  renamingClickPos?: { x: number; y: number } | null  // Click position for cursor placement
  isRenamingInProgress?: boolean  // Whether rename is in progress
  onRenameSubmit?: (itemId: string, newName: string) => void  // Callback when rename is submitted
  onRenameCancel?: () => void  // Callback when rename is cancelled
  // Customization props
  selectionMode?: boolean
  columns?: SegListColumn[]  // Which columns to display
  showDirectParentRadio?: boolean  // Show radio button for direct parent selection
  selectedDirectParentId?: string | null
  onDirectParentSelect?: (id: string) => void
  padding?: string  // Custom padding (e.g. '0', '8px', '16px')
  showRemoveButton?: boolean  // Show remove button column
  onItemRemove?: (itemId: string) => void  // Callback when remove button is clicked
  colWidthRatio?: Record<string, number>  // Column width ratios (e.g., { name: 0.4, path: 0.3, type: 0.3 })
  onUpdateColWidthRatio?: (ratios: Record<string, number>) => void  // Callback when column widths change
  // Role selection props (for AddContent panel)
  showRoleSelection?: boolean  // Show role selection columns (direct/indirect radio + bind checkbox)
  itemRoles?: Record<string, ItemRole>  // Current role for each item { [itemId]: { isDirect, isBind } }
  onRoleChange?: (itemId: string, role: ItemRole) => void  // Callback when role changes
}


/**
 * SegList - Pure presentational component
 * Just displays items, no data fetching
 */
const SegList: React.FC<SegListProps> = ({ 
  items, 
  loading = false, 
  error = null,
  onItemDoubleClick,
  onItemContextMenu,
  renamingItemId,
  renamingClickPos,
  isRenamingInProgress = false,
  onRenameSubmit,
  onRenameCancel,
  selectionMode = false,
  columns = ['name', 'type', 'value'],
  showDirectParentRadio = false,
  selectedDirectParentId = null,
  onDirectParentSelect,
  padding,
  showRemoveButton = false,
  onItemRemove,
  colWidthRatio = {},
  onUpdateColWidthRatio,
  showRoleSelection = false,
  itemRoles = {},
  onRoleChange
}) => {
  const [editingName, setEditingName] = useState<string>('')
  // Column widths state (in pixels)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [resizing, setResizing] = useState<string | null>(null)
  const [resizingColIndex, setResizingColIndex] = useState<number>(-1)
  
  // Resize tracking refs (all positions relative to TR's top-left corner)
  const trRef = useRef<HTMLTableRowElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const resizeStartMouseX = useRef<number>(0)
  const initialEdgePositions = useRef<number[]>([]) // Initial edge positions at resize start
  const currentEdgePositions = useRef<number[]>([]) // Current edge positions during resize
  const lastUpdateTime = useRef<number>(0)

  const handleDoubleClick = (item: ListItem) => {
    if (onItemDoubleClick) {
      onItemDoubleClick(item.id, item.type)
    }
  }

  const handleResizeStart = (e: React.MouseEvent, column: string, columnIndex: number) => {
    e.preventDefault()
    
    if (!trRef.current) return
    
    const trRect = trRef.current.getBoundingClientRect()
    const ths = trRef.current.querySelectorAll('th')
    
    // Capture all edge positions relative to TR
    const edges: number[] = []
    let currentLeft = 0
    ths.forEach((th) => {
      currentLeft += (th as HTMLElement).offsetWidth
      edges.push(currentLeft)
    })
    
    // Store both initial and current edge positions
    initialEdgePositions.current = [...edges]
    currentEdgePositions.current = [...edges]
    resizeStartMouseX.current = e.clientX - trRect.left
    lastUpdateTime.current = performance.now()
    
    setResizing(column)
    setResizingColIndex(columnIndex)
    
    // Set initial widths to prevent reflow
    const currentWidths: Record<string, number> = {}
    ths.forEach((th, index) => {
      const colName = columns[index]
      if (colName) {
        currentWidths[colName] = (th as HTMLElement).offsetWidth
      }
    })
    setColumnWidths(currentWidths)
  }

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizing || resizingColIndex < 0 || !trRef.current) return
    
    // Throttle updates to 100ms
    const now = performance.now()
    if (now - lastUpdateTime.current < 50) return
    lastUpdateTime.current = now
    
    const trRect = trRef.current.getBoundingClientRect()
    const currentMouseX = e.clientX - trRect.left
    const mouseDelta = currentMouseX - resizeStartMouseX.current
    
    // Calculate new edge position from INITIAL position (not current)
    // This prevents the edge from moving faster than the mouse
    const initialEdgePos = initialEdgePositions.current[resizingColIndex]
    let newEdgePos = initialEdgePos + mouseDelta
    
    // Get adjacent edge positions from INITIAL positions to prevent crossing
    const leftEdge = resizingColIndex > 0 ? initialEdgePositions.current[resizingColIndex - 1] : 0
    const rightEdge = resizingColIndex < initialEdgePositions.current.length - 1 
      ? initialEdgePositions.current[resizingColIndex + 1] 
      : trRect.width
    
    // Constrain to prevent crossing edges (with minimum 50px column width)
    const minPos = leftEdge + 50
    const maxPos = rightEdge - 50
    newEdgePos = Math.max(minPos, Math.min(maxPos, newEdgePos))
    
    // Update current edge positions (copy initial and modify only the dragged edge)
    const newEdges = [...initialEdgePositions.current]
    newEdges[resizingColIndex] = newEdgePos
    currentEdgePositions.current = newEdges
    
    // Calculate new widths from edge positions
    const ths = trRef.current.querySelectorAll('th')
    const newWidths: Record<string, number> = {}
    let prevEdge = 0
    ths.forEach((th, index) => {
      const colName = columns[index]
      if (colName) {
        const currentEdge = newEdges[index]
        newWidths[colName] = currentEdge - prevEdge
        prevEdge = currentEdge
      }
    })
    
    setColumnWidths(newWidths)
  }

  const handleResizeEnd = () => {
    // Calculate ratios when resize ends
    if (tableRef.current && onUpdateColWidthRatio) {
      const table = tableRef.current
      const totalWidth = table.offsetWidth
      const ratios: Record<string, number> = {}
      
      const ths = table.querySelectorAll('thead th')
      ths.forEach((th, index) => {
        const colName = columns[index]
        if (colName) {
          ratios[colName] = (th as HTMLElement).offsetWidth / totalWidth
        }
      })
      
      onUpdateColWidthRatio(ratios)
      console.log('[SegList] Updated column width ratios:', ratios)
    }
    
    setResizing(null)
    setResizingColIndex(-1)
    initialEdgePositions.current = []
    currentEdgePositions.current = []
  }

  // Apply initial width ratios from props
  React.useEffect(() => {
    if (tableRef.current && Object.keys(colWidthRatio).length > 0) {
      const totalWidth = tableRef.current.offsetWidth
      const newWidths: Record<string, number> = {}
      for (const [col, ratio] of Object.entries(colWidthRatio)) {
        newWidths[col] = totalWidth * ratio
      }
      setColumnWidths(newWidths)
    }
  }, [colWidthRatio])

  // Add/remove mouse event listeners for column resizing
  React.useEffect(() => {
    if (resizing) {
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', handleResizeEnd)
      return () => {
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeEnd)
      }
    }
  }, [resizing])

  if (loading) {
    return <div className="seg-list-loading">Loading...</div>
  }

  if (error) {
    return <div className="seg-list-error">Error: {error}</div>
  }

  if (items.length === 0) {
    return <div className="seg-list-empty">No items</div>
  }

  return (
    <div className="seg-list" style={padding !== undefined ? { padding } : undefined}>
      <table className="seg-list-table" ref={tableRef}>
        <thead>
          <tr ref={trRef}>
            {columns.includes('name') && (
              <th style={columnWidths['name'] ? { width: columnWidths['name'] } : undefined}>
                <div className="th-content">
                  Name
                  <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'name', columns.indexOf('name'))} />
                </div>
              </th>
            )}
            {columns.includes('path') && (
              <th style={columnWidths['path'] ? { width: columnWidths['path'] } : undefined}>
                <div className="th-content">
                  Path
                  <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'path', columns.indexOf('path'))} />
                </div>
              </th>
            )}
            {columns.includes('type') && (
              <th style={columnWidths['type'] ? { width: columnWidths['type'] } : undefined}>
                <div className="th-content">
                  Type
                  <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'type', columns.indexOf('type'))} />
                </div>
              </th>
            )}
            {columns.includes('value') && (
              <th style={columnWidths['value'] ? { width: columnWidths['value'] } : undefined}>
                <div className="th-content">
                  Value
                  <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'value', columns.indexOf('value'))} />
                </div>
              </th>
            )}
            {showDirectParentRadio && (
              <th className="radio-header" style={columnWidths['direct'] ? { width: columnWidths['direct'] } : undefined}>
                <div className="th-content">
                  <span className="radio-header-content">
                    <span className="radio-header-text">Direct</span>
                    <span className="info-icon-wrapper" title="Set as direct parent">
                      <InfoIcon width={14} height={14} />
                    </span>
                  </span>
                  <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'direct', columns.length)} />
                </div>
              </th>
            )}
            {showRoleSelection && (
              <>
                <th className="role-header" style={columnWidths['direct'] ? { width: columnWidths['direct'] } : undefined}>
                  <div className="th-content">
                    <span className="role-header-content">
                      <span className="role-header-text">Direct</span>
                      <span className="info-icon-wrapper" title="Direct parent-child relationship">
                        <InfoIcon width={14} height={14} />
                      </span>
                    </span>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'direct', columns.length)} />
                  </div>
                </th>
                <th className="role-header" style={columnWidths['indirect'] ? { width: columnWidths['indirect'] } : undefined}>
                  <div className="th-content">
                    <span className="role-header-content">
                      <span className="role-header-text">Indirect</span>
                      <span className="info-icon-wrapper" title="Indirect parent-child relationship">
                        <InfoIcon width={14} height={14} />
                      </span>
                    </span>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'indirect', columns.length + 1)} />
                  </div>
                </th>
                <th className="role-header" style={columnWidths['bind'] ? { width: columnWidths['bind'] } : undefined}>
                  <div className="th-content">
                    <span className="role-header-content">
                      <span className="role-header-text">Bind</span>
                      <span className="info-icon-wrapper" title="Bind content to segment">
                        <InfoIcon width={14} height={14} />
                      </span>
                    </span>
                    <div className="resize-handle" onMouseDown={(e) => handleResizeStart(e, 'bind', columns.length + 2)} />
                  </div>
                </th>
              </>
            )}
            {showRemoveButton && <th className="remove-header"></th>}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr
              key={item.id}
              onDoubleClick={() => handleDoubleClick(item)}
              className={`${item.type === 'segment' ? 'segment-row' : 'content-row'} ${selectionMode ? 'selection-mode' : ''}`}
            >
              {columns.includes('name') && (
                <td 
                  className="name-cell"
                  onContextMenu={(e) => {
                    if (onItemContextMenu) {
                      e.preventDefault()
                      e.stopPropagation()
                      onItemContextMenu(e, item.id, item.type)
                    }
                  }}
                >
                  {renamingItemId === item.id ? (
                    <span className="name-cell-rename-wrapper">
                      <span
                        className="name-editable"
                        contentEditable={!isRenamingInProgress}
                        suppressContentEditableWarning
                        onFocus={(e) => {
                          setEditingName(item.name)
                          
                          // Set cursor position based on click location
                          if (renamingClickPos) {
                            const rect = e.target.getBoundingClientRect()
                            const clickX = renamingClickPos.x - rect.left
                            const text = e.target.textContent || ''
                            
                            // Create a temporary span to measure character positions
                            const tempSpan = document.createElement('span')
                            tempSpan.style.visibility = 'hidden'
                            tempSpan.style.position = 'absolute'
                            tempSpan.style.whiteSpace = 'pre'
                            tempSpan.style.font = window.getComputedStyle(e.target).font
                            document.body.appendChild(tempSpan)
                            
                            let closestIndex = text.length
                            let minDistance = Math.abs(clickX - rect.width)
                            
                            for (let i = 0; i <= text.length; i++) {
                              tempSpan.textContent = text.substring(0, i)
                              const charX = tempSpan.offsetWidth
                              const distance = Math.abs(clickX - charX)
                              
                              if (distance < minDistance) {
                                minDistance = distance
                                closestIndex = i
                              }
                            }
                            
                            document.body.removeChild(tempSpan)
                            
                            // Set cursor at calculated position
                            const range = document.createRange()
                            const sel = window.getSelection()
                            const textNode = e.target.firstChild
                            
                            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                              range.setStart(textNode, Math.min(closestIndex, textNode.textContent?.length || 0))
                              range.collapse(true)
                              sel?.removeAllRanges()
                              sel?.addRange(range)
                            }
                          } else {
                            // No click position provided - select all text
                            const range = document.createRange()
                            const sel = window.getSelection()
                            const textNode = e.target.firstChild
                            
                            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                              range.selectNodeContents(e.target)
                              sel?.removeAllRanges()
                              sel?.addRange(range)
                            }
                          }
                        }}
                        onBlur={(e) => {
                          if (isRenamingInProgress) return
                          
                          const newName = e.target.textContent?.trim() || ''
                          if (newName && newName !== item.name && onRenameSubmit) {
                            onRenameSubmit(item.id, newName)
                          } else if (onRenameCancel) {
                            onRenameCancel()
                          }
                        }}
                        onKeyDown={(e) => {
                          if (isRenamingInProgress) {
                            e.preventDefault()
                            return
                          }
                          
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            e.currentTarget.blur()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            if (onRenameCancel) {
                              onRenameCancel()
                            }
                          }
                        }}
                        ref={(el) => {
                          if (el && renamingItemId === item.id && !isRenamingInProgress) {
                            el.textContent = item.name
                            el.focus()
                          }
                        }}
                      >
                        {item.name}
                      </span>
                      {isRenamingInProgress && (
                        <span className="rename-spinner">
                          <SpinningCircle width={14} height={14} />
                        </span>
                      )}
                    </span>
                  ) : (
                    <>
                      {item.name}
                      {item.relationTypes && item.relationTypes.includes(1) && !item.relationTypes.includes(0) && (
                        <span className="indirect-badge"> (indirect)</span>
                      )}
                    </>
                  )}
                </td>
              )}
              {columns.includes('path') && (
                <td className="path-cell">
                  {item.path || '-'}
                </td>
              )}
              {columns.includes('type') && (
                <td className="type-cell">
                  {item.type === 'segment' ? (
                    <span className="type-icon-label">
                      <FolderIcon width={16} height={16} /> Segment
                    </span>
                  ) : item.contentType === 21 ? (
                    <span className="type-icon-label">
                      <PdfIcon width={16} height={16} /> {getContentTypeLabel(item.contentType)}
                    </span>
                  ) : (
                    <span className="type-icon-label">
                      📄 {item.contentType ? getContentTypeLabel(item.contentType) : 'Content'}
                    </span>
                  )}
                </td>
              )}
              {columns.includes('value') && (
                <td className="value-cell">
                  {item.type === 'content' ? (item.value || '') : '-'}
                </td>
              )}
              {showDirectParentRadio && (
                <td className="radio-cell">
                  <input
                    type="radio"
                    name="directParent"
                    checked={selectedDirectParentId === item.id}
                    onChange={() => onDirectParentSelect?.(item.id)}
                  />
                </td>
              )}
              {showRoleSelection && (
                <>
                  <td className="role-cell">
                    <input
                      type="checkbox"
                      checked={itemRoles[item.id]?.isDirect || false}
                      onChange={(e) => onRoleChange?.(item.id, { 
                        isDirect: e.target.checked,
                        isIndirect: e.target.checked ? false : itemRoles[item.id]?.isIndirect || false, // Uncheck indirect if direct is checked
                        isBind: itemRoles[item.id]?.isBind || false
                      })}
                    />
                  </td>
                  <td className="role-cell">
                    <input
                      type="checkbox"
                      checked={itemRoles[item.id]?.isIndirect || false}
                      onChange={(e) => onRoleChange?.(item.id, { 
                        isDirect: e.target.checked ? false : itemRoles[item.id]?.isDirect || false, // Uncheck direct if indirect is checked
                        isIndirect: e.target.checked,
                        isBind: itemRoles[item.id]?.isBind || false
                      })}
                    />
                  </td>
                  <td className="role-cell">
                    <input
                      type="checkbox"
                      checked={itemRoles[item.id]?.isBind || false}
                      onChange={(e) => onRoleChange?.(item.id, { 
                        isDirect: itemRoles[item.id]?.isDirect || false,
                        isIndirect: itemRoles[item.id]?.isIndirect || false,
                        isBind: e.target.checked 
                      })}
                    />
                  </td>
                </>
              )}
              {showRemoveButton && (
                <td className="remove-cell">
                  <button
                    className="remove-button"
                    onClick={() => onItemRemove?.(item.id)}
                    title="Remove"
                  >
                    <CrossIcon width={14} height={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default SegList
