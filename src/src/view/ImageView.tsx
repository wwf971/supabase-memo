// @ts-nocheck
import React from 'react'
import Header from './Header'
import './ImageView.css'

interface ImageViewProps {
  contentId: string
  contentName: string
  imageData: string  // base64 or URL
}

/**
 * ImageView - Display image content
 */
const ImageView: React.FC<ImageViewProps> = ({ contentId, contentName, imageData }) => {
  return (
    <div className="image-view">
      <Header
        title={contentName || '(unnamed image)'}
        badge="image"
      />
      <div className="image-view-body">
        <div className="image-container">
          <img src={imageData} alt={contentName || 'Image'} />
        </div>
      </div>
    </div>
  )
}

export default ImageView

