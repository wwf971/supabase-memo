// @ts-nocheck
import React from 'react'
import AddContent from './AddContent'

interface SegAddProps {
  parentSegmentId: string
  parentSegmentName: string
  onContentAdded?: () => void
  onCancel?: () => void
}

/**
 * SegAdd - Panel for adding content to a segment
 * Wraps AddContent component
 */
const SegAdd: React.FC<SegAddProps> = (props) => {
  return <AddContent {...props} />
}

export default SegAdd

