// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { contentBinaryCache } from '../backend/cache'
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
            console.log('[PdfView] String format check:')
            console.log('  - Length:', str.length)
            console.log('  - First 2 char codes:', str.charCodeAt(0), str.charCodeAt(1))
            console.log('  - First 20 chars:', str.substring(0, 20))
            console.log('  - Is hex encoded?', str.charCodeAt(0) === 92 && str.charCodeAt(1) === 120)
            
            // Try base64 decode first (new format)
            try {
              const binaryString = atob(str)
              binaryArray = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                binaryArray[i] = binaryString.charCodeAt(i)
              }
              console.log('[PdfView] ✅ Decoded base64 to', binaryArray.length, 'bytes, first 10:', Array.from(binaryArray.slice(0, 10)))
            } catch (base64Error) {
              console.log('[PdfView] ❌ Base64 decode failed:', base64Error)
              // Fallback: Supabase hex-encodes BYTEA data
              if (str.charCodeAt(0) === 92 && str.charCodeAt(1) === 120) { // '\x'
                console.log('[PdfView] ⚠️ Base64 failed, hex-encoded format detected')
                const hexStr = str.substring(2) // Remove \x prefix
                
                // Hex decode to get the actual string
                const decodedBytes = new Uint8Array(hexStr.length / 2)
                for (let i = 0; i < hexStr.length; i += 2) {
                  decodedBytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16)
                }
                
                // Convert to string
                const decodedStr = new TextDecoder().decode(decodedBytes)
                console.log('[PdfView] Hex-decoded string first 100 chars:', decodedStr.substring(0, 100))
                
                // Check if it's base64 (new format) or JSON (old corrupted format)
                if (decodedStr.startsWith('{') && decodedStr.includes('"0"')) {
                  // Old corrupted JSON format: {"0":37,"1":80,...}
                  console.log('[PdfView] Detected old JSON format')
                  try {
                    const jsonObj = JSON.parse(decodedStr)
                    const byteCount = Object.keys(jsonObj).length
                    binaryArray = new Uint8Array(byteCount)
                    for (let i = 0; i < byteCount; i++) {
                      binaryArray[i] = jsonObj[i.toString()]
                    }
                    console.log('[PdfView] ✅ Decoded from JSON to', binaryArray.length, 'bytes')
                  } catch (jsonError) {
                    setError(`Failed to parse JSON: ${jsonError}`)
                    setLoading(false)
                    return
                  }
                } else {
                  // New format: hex-encoded base64
                  console.log('[PdfView] Detected base64 inside hex')
                  try {
                    const binaryString = atob(decodedStr)
                    binaryArray = new Uint8Array(binaryString.length)
                    for (let i = 0; i < binaryString.length; i++) {
                      binaryArray[i] = binaryString.charCodeAt(i)
                    }
                    console.log('[PdfView] ✅ Decoded hex→base64 to', binaryArray.length, 'bytes, first 10:', Array.from(binaryArray.slice(0, 10)))
                  } catch (atobError) {
                    setError(`Failed to decode base64 from hex: ${atobError}`)
                    setLoading(false)
                    return
                  }
                }
              } else {
                setError(`Failed to decode binary data: ${base64Error}`)
                setLoading(false)
                return
              }
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

