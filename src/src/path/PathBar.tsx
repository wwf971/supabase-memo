// @ts-nocheck
import React from 'react'
import _PathBar, { PathSegment } from '@wwf971/react-comp-misc/src/path/PathBar'

/**
 * PathBar - Simple wrapper around imported PathBar
 */

interface PathBarProps {
  segments: PathSegment[]
  onPathSegClicked: (segmentIndex: number) => void
}

const PathBar: React.FC<PathBarProps> = ({ segments, onPathSegClicked }) => {
  return (
    <_PathBar
      pathData={{ segments }}
      onPathSegClicked={onPathSegClicked}
      addSlashBeforeFirstSeg={true}
      allowEditText={false}
      height={26}
      separator=""
    />
  )
}

export default PathBar
