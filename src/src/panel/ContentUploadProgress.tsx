// @ts-nocheck
import React, { useEffect, useState } from 'react'
import './ContentUploadProgress.css'
import { SpinningCircle } from '@wwf971/react-comp-misc/src/icon/Icon'

interface ContentUploadProgressProps {
  currentStep: number
  totalSteps: number
  stepLabel: string
  status: 'uploading' | 'success' | 'error'
}

/**
 * ContentUploadProgress - Progress bar for upload status
 * Displays step progress with icon and text overlay
 * Shows spinning circle during upload, check/cross on completion
 */
const ContentUploadProgress: React.FC<ContentUploadProgressProps> = ({ 
  currentStep, 
  totalSteps, 
  stepLabel, 
  status 
}) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (status === 'success' && currentStep === totalSteps) {
      // Stay visible for 0.3s after success
      const timer = setTimeout(() => {
        setVisible(false)
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setVisible(true)
    }
  }, [status, currentStep, totalSteps])

  if (!visible) return null

  const progress = (currentStep / totalSteps) * 100

  const getColor = () => {
    if (status === 'error') return '#dc3545'
    if (status === 'success') return '#28a745'
    return '#0066cc'
  }

  const getIcon = () => {
    if (status === 'error') {
      return <span className="status-icon error">✗</span>
    }
    if (status === 'success') {
      return <span className="status-icon success">✓</span>
    }
    return <SpinningCircle width={14} height={14} color="#fff" />
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
      <div className="upload-progress-overlay">
        <span className="progress-icon">{getIcon()}</span>
        <span className="progress-text">
          {stepLabel} <span className="progress-step">{currentStep}/{totalSteps}</span>
        </span>
      </div>
    </div>
  )
}

export default ContentUploadProgress

