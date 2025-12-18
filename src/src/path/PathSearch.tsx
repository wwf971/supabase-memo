import React, { useState, useRef, useEffect } from 'react'
import PathList from './PathList'
import './PathSearch.css'

interface PathSearchProps {
  onSelect: (segmentId: string) => void
  onCancel: () => void
}

const PathSearch: React.FC<PathSearchProps> = ({ onSelect, onCancel }) => {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="path-search">
      <div className="path-search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="path-search-input"
          placeholder="Search segments and content..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button onClick={onCancel} className="path-search-cancel">
          ×
        </button>
      </div>
      <PathList
        mode="search"
        query={query}
        onItemDoubleClick={onSelect}
      />
    </div>
  )
}

export default PathSearch

