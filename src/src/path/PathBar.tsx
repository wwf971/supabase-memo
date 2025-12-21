// @ts-nocheck
import React from 'react'
import { PathBar as _PathBar } from '@wwf971/react-comp-misc'
import type { PathSegment } from '@wwf971/react-comp-misc'

/**
 * PathBar - Simple wrapper around imported PathBar
 */

interface PathBarProps {
  segments: PathSegment[]
  onPathSegClicked: (segmentIndex: number) => void
}

const PathBar: React.FC<PathBarProps> = ({ segments, onPathSegClicked }) => {
  // Handle empty segments (orphan/bind-only content) - show single root segment
  // This prevents the library from rendering both separator "/" and empty placeholder "/"
  const displaySegments = segments.length === 0 
    ? [{ id: '', name: '/' }] 
    : segments
  
  // Don't add leading slash for root-only display (it already contains "/")
  const shouldAddLeadingSlash = segments.length > 0
  
  return (
    <_PathBar
      pathData={{ segments: displaySegments }}
      onPathSegClicked={onPathSegClicked}
      addSlashBeforeFirstSeg={shouldAddLeadingSlash}
      allowEditText={false}
      height={26}
      separator=""
    />
  )
}

export default PathBar
