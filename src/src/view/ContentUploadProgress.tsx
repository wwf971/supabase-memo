// @ts-nocheck
import React, { useEffect, useState } from 'react'
import './ContentUploadProgress.css'

interface ContentUploadProgressProps {
  progress: number  // 0-100
  status: 'uploading' | 'success' | 'error'
}

/**
 * ContentUploadProgress - Progress bar for upload status
 * Displays as a green bar at the top edge of upload area
 * Turns red on error, stays for 0.3s extra on success
 */
const ContentUploadProgress: React.FC<ContentUploadProgressProps> = ({ progress, status }) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (status === 'success' && progress === 100) {
      // Stay visible for 0.3s after success
      const timer = setTimeout(() => {
        setVisible(false)
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setVisible(true)
    }
  }, [status, progress])

  if (!visible) return null

  const getColor = () => {
    if (status === 'error') return '#dc3545'
    if (status === 'success') return '#28a745'
    return '#28a745'
  }

  return (
    <div className="upload-progress-bar">
      <div
        className="upload-progress-fill"
        style={{
          width: `${progress}%`,
          backgroundColor: getColor()
        }}
      />
    </div>
  )
}

export default ContentUploadProgress

