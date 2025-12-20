// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { contentBinaryCache } from '../cache/cache'
import Header from './Header'
import './PdfView.css'

interface PdfViewProps {
  contentId: string
  contentName: string
  pdfData: string  // Either "binary:id" or base64 data URL
  contentType?: string  // MIME type, should be 'application/pdf'
}

/**
 * PdfView - Display PDF content
 * Supports both binary storage (content_binary table) and legacy base64 storage
 */
const PdfView: React.FC<PdfViewProps> = ({ contentId, contentName, pdfData, contentType = 'application/pdf' }) => {
  const [pdfUrl, setPdfUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPdf = async () => {
      try {
        setLoading(true)
        setError(null)

        // Check if this is a binary reference
        if (pdfData.startsWith('binary:')) {
          const binaryId = pdfData.substring(7) // Remove "binary:" prefix
          console.log(`[PdfView] Loading binary data for ${binaryId}`)
          
          const binaryData = await contentBinaryCache.get(binaryId)
          if (!binaryData) {
            setError('Failed to load PDF data')
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
              console.log('[PdfView] ✅ Decoded to', binaryArray.length, 'bytes')
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
          setPdfUrl(url)
        } else {
          // Legacy base64 format
          if (pdfData.startsWith('data:application/pdf')) {
            setPdfUrl(pdfData)
          } else if (pdfData.startsWith('http')) {
            setPdfUrl(pdfData)
          } else {
            // Assume it's base64
            setPdfUrl(`data:application/pdf;base64,${pdfData}`)
          }
        }

        setLoading(false)
      } catch (err: any) {
        console.error('[PdfView] Error loading PDF:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    loadPdf()

    // Cleanup blob URL on unmount
    return () => {
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [pdfData, contentId])

  return (
    <div className="pdf-view">
      <Header
        title={contentName || '(unnamed PDF)'}
        badge="PDF"
      />
      <div className="pdf-view-body">
        {loading && <div className="loading-message">Loading PDF...</div>}
        {error && <div className="error-message">Error: {error}</div>}
        {!loading && !error && (
          <iframe
            src={pdfUrl}
            className="pdf-iframe"
            title={contentName || 'PDF Document'}
          />
        )}
      </div>
    </div>
  )
}

export default PdfView

