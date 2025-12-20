// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react'
import ContentUploadProgress from './ContentUploadProgress'
import './ContentUpload.css'

interface ContentUploadProps {
  mode: 'image' | 'file'
  accept?: string  // e.g., "image/*" or ".pdf,.doc"
  onFileSelect: (file: File) => void
  currentFile?: File | null
  uploadCurrentStep?: number
  uploadTotalSteps?: number
  uploadStepLabel?: string
  uploadStatus?: 'uploading' | 'success' | 'error'
}

/**
 * ContentUpload - Upload area supporting drag-and-drop, paste, and file selection
 */
const ContentUpload: React.FC<ContentUploadProps> = ({
  mode,
  accept = mode === 'image' ? 'image/*' : '*',
  onFileSelect,
  currentFile,
  uploadCurrentStep = 0,
  uploadTotalSteps = 1,
  uploadStepLabel = 'Uploading',
  uploadStatus
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Update preview when currentFile changes
  useEffect(() => {
    if (currentFile && mode === 'image' && currentFile.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => setPreview(reader.result as string)
      reader.readAsDataURL(currentFile)
    } else {
      setPreview(null)
    }
  }, [currentFile, mode])

  // Handle paste events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only handle if this component is in focus or if the dropzone is visible
      if (!dropZoneRef.current) return
      
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        
        if (mode === 'image' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            onFileSelect(file)
            return
          }
        } else if (mode === 'file' && item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            onFileSelect(file)
            return
          }
        }
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [mode, onFileSelect])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      // Check file type matches mode
      if (mode === 'image' && !file.type.startsWith('image/')) {
        alert('Please drop an image file')
        return
      }
      onFileSelect(file)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div
      ref={dropZoneRef}
      className={`content-upload ${isDragging ? 'dragging' : ''} ${currentFile ? 'has-file' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      {uploadStatus && uploadCurrentStep > 0 && (
        <ContentUploadProgress 
          currentStep={uploadCurrentStep} 
          totalSteps={uploadTotalSteps}
          stepLabel={uploadStepLabel}
          status={uploadStatus} 
        />
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />
      
      {preview ? (
        <div className="upload-preview">
          <img src={preview} alt="Preview" />
        </div>
      ) : currentFile ? (
        <div className="upload-file-info">
          <div className="file-name">{currentFile.name}</div>
          <div className="file-size">{(currentFile.size / 1024).toFixed(1)} KB</div>
        </div>
      ) : (
        <div className="upload-placeholder">
          <div className="upload-icon">↑</div>
          <div className="upload-text">
            {mode === 'image' ? 'Drop image, paste (Ctrl+V), or click to select' : 'Drop file, paste (Ctrl+V), or click to select'}
          </div>
        </div>
      )}
    </div>
  )
}

export default ContentUpload

