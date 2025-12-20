// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { contentBinaryCache } from '../cache/cache'
import Header from './Header'
import './ImageView.css'

interface ImageViewProps {
  contentId: string
  contentName: string
  imageData: string  // Either "binary:id" or base64 data URL
  contentType?: string  // MIME type like 'image/png', 'image/jpeg', etc.
}

/**
 * ImageView - Display image content
 * Supports both binary storage (content_binary table) and legacy base64 storage
 */
const ImageView: React.FC<ImageViewProps> = ({ contentId, contentName, imageData, contentType = 'image/png' }) => {
  const [imageSrc, setImageSrc] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadImage = async () => {
      try {
        setLoading(true)
        setError(null)

        // Check if this is a binary reference
        if (imageData.startsWith('binary:')) {
          const binaryId = imageData.substring(7) // Remove "binary:" prefix
          console.log(`[ImageView] Loading binary data for ${binaryId}`)
          
          const binaryData = await contentBinaryCache.get(binaryId)
          if (!binaryData) {
            setError('Failed to load image data')
            setLoading(false)
            return
          }

          // Convert to Uint8Array
          let binaryArray: Uint8Array
          if (binaryData.data instanceof Uint8Array) {
            binaryArray = binaryData.data
          } else if (binaryData.data instanceof ArrayBuffer) {
            binaryArray = new Uint8Array(binaryData.data)
          } else if (typeof binaryData.data === 'string') {
            const str = binaryData.data
            
            // Supabase returns BYTEA as hex-encoded string with \x prefix
            // Storage format: Uint8Array → base64 → BYTEA (hex-encoded by Supabase)
            if (str.charCodeAt(0) === 92 && str.charCodeAt(1) === 120) { // '\x'
              // Decode: hex → UTF-8 string (base64) → bytes
              const hexStr = str.substring(2) // Remove \x prefix
              const base64Bytes = new Uint8Array(hexStr.length / 2)
              for (let i = 0; i < hexStr.length; i += 2) {
                base64Bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16)
              }
              const base64Str = new TextDecoder().decode(base64Bytes)
              
              // Decode base64 to binary
              const binaryString = atob(base64Str)
              binaryArray = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                binaryArray[i] = binaryString.charCodeAt(i)
              }
              console.log('[ImageView] ✅ Decoded to', binaryArray.length, 'bytes')
            } else {
              setError('Unexpected data format')
              setLoading(false)
              return
            }
          } else {
            setError(`Unexpected data type: ${typeof binaryData.data}`)
            setLoading(false)
            return
          }

          // Convert to Blob URL
          const blob = new Blob([binaryArray], { type: contentType })
          const url = URL.createObjectURL(blob)
          setImageSrc(url)
        } else {
          // Legacy base64 format
          setImageSrc(imageData)
        }

        setLoading(false)
      } catch (err: any) {
        console.error('[ImageView] Error loading image:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    loadImage()

    // Cleanup blob URL on unmount
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc)
      }
    }
  }, [imageData, contentId])

  return (
    <div className="image-view">
      <Header
        title={contentName || '(unnamed image)'}
        badge="image"
      />
      <div className="image-view-body">
        {loading && <div className="loading-message">Loading image...</div>}
        {error && <div className="error-message">Error: {error}</div>}
        {!loading && !error && (
          <div className="image-container">
            <img src={imageSrc} alt={contentName || 'Image'} />
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageView

