// @ts-nocheck
import React, { useEffect, useState, useRef } from 'react'
import { getContent, updateContent } from '../backend/content'
import { SpinningCircle } from '@wwf971/react-comp-misc/src/icon/Icon'
import ImageView from './ImageView'
import PdfView from './PdfView'
import Header from './Header'
import './ContentView.css'

interface ContentViewProps {
  contentId: string
  contentName: string
}

/**
 * ContentView - Display and edit content details based on content type
 */
const ContentView: React.FC<ContentViewProps> = ({ contentId, contentName }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contentData, setContentData] = useState<any>(null)
  const [contentTypeName, setContentTypeName] = useState<string>('')
  const [editedValue, setEditedValue] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadContent()
  }, [contentId])

  /**
   * Handle save/update content
   */
  const handleSave = async () => {
    if (isSaving) return
    
    setIsSaving(true)
    setError(null)
    
    try {
      const result = await updateContent(contentId, editedValue)
      
      if (result.code === 0) {
        // Update local state
        setContentData({ ...contentData, value: editedValue })
        console.log('[ContentView] ✅ Content updated successfully')
      } else {
        setError(result.message || 'Failed to update content')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Handle keyboard events in textarea
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter key (without Shift) triggers save
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (hasChanges()) {
        handleSave()
      }
    }
    
    // Tab key indents current line
    if (e.key === 'Tab') {
      e.preventDefault()
      
      const textarea = textareaRef.current
      if (!textarea) return
      
      const { selectionStart, selectionEnd } = textarea
      
      // Only handle when cursor is collapsed (not selecting text)
      if (selectionStart !== selectionEnd) return
      
      // Find the start of current line
      const textBefore = editedValue.substring(0, selectionStart)
      const lastNewline = textBefore.lastIndexOf('\n')
      const lineStart = lastNewline + 1
      
      // Insert tab at the beginning of the line
      const newValue = 
        editedValue.substring(0, lineStart) + 
        '\t' + 
        editedValue.substring(lineStart)
      
      setEditedValue(newValue)
      
      // Restore cursor position (shifted by 1 for the tab)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + 1
      }, 0)
    }
  }

  /**
   * Check if there are unsaved changes
   */
  const hasChanges = () => {
    return editedValue !== (contentData?.value || '')
  }

  const loadContent = async () => {
    const startTime = performance.now()
    console.log(`[ContentView] 📍 Loading content: ${contentId}`)
    
    setLoading(true)
    setError(null)

    try {
      const result = await getContent(contentId)
      
      if (result.code === 0 && result.data) {
        setContentData(result.data)
        setEditedValue(result.data.value || '')
        
        // Map type_code to type name (matches content_type table)
        const typeMap: Record<number, string> = {
          1: 'text/plain',
          2: 'text/html',
          3: 'text/markdown',
          10: 'image/png',
          11: 'image/jpeg',
          12: 'image/svg+xml',
          13: 'image/gif',
          14: 'image/webp',
          20: 'application/json',
          21: 'application/pdf',
          99: 'application/octet-stream',
        }
        setContentTypeName(typeMap[result.data.type_code] || 'unknown')
        console.log(`[ContentView] ✅ Content loaded successfully (${(performance.now() - startTime).toFixed(2)}ms)`)
      } else {
        setError(result.message || 'Failed to load content')
        console.log(`[ContentView] ❌ Failed to load content (${(performance.now() - startTime).toFixed(2)}ms)`)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      console.log(`[ContentView] ❌ Error loading content (${(performance.now() - startTime).toFixed(2)}ms)`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="content-view-loading">
        <SpinningCircle size={32} />
        <div>Loading content...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="content-view-error">
        <div className="error-message">Error: {error}</div>
        <button type="button" className="retry-button" onClick={loadContent}>
          Retry
        </button>
      </div>
    )
  }

  if (!contentData) {
    return (
      <div className="content-view-error">
        <div className="error-message">No content data found</div>
      </div>
    )
  }

  // For image type, use ImageView
  if (contentData.type_code >= 10 && contentData.type_code <= 14) {
    return (
      <div style={{ height: '100%' }}>
        <ImageView
          contentId={contentId}
          contentName={contentName}
          imageData={contentData.value}
          contentType={contentTypeName}
        />
      </div>
    )
  }
  
  // For PDF type, use PdfView
  if (contentData.type_code === 21) {
    return (
      <div style={{ height: '100%' }}>
        <PdfView
          contentId={contentId}
          contentName={contentName}
          pdfData={contentData.value}
          contentType={contentTypeName}
        />
      </div>
    )
  }

  // Render editable content for text types
  const renderContent = () => {
    // For now, all content types use textarea (we can enhance later for HTML/markdown)
    return (
      <div className="content-editor">
        <textarea
          ref={textareaRef}
          className="content-textarea"
          value={editedValue}
          onChange={(e) => setEditedValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter content..."
        />
      </div>
    )
  }

  return (
    <div className="content-view">
      <Header
        title={contentName || '(unnamed content)'}
        badge={contentTypeName}
        actions={[
          {
            label: 'Update',
            onClick: handleSave,
            disabled: !hasChanges() || isSaving,
            loading: isSaving
          }
        ]}
      />
      <div className="content-view-body">
        {renderContent()}
      </div>
    </div>
  )
}

export default ContentView

