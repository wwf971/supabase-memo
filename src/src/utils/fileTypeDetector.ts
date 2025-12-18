/**
 * File type detection utilities
 */

export interface FileTypeInfo {
  typeCode: number
  typeName: string
  category: 'text' | 'image' | 'pdf' | 'unknown'
}

/**
 * Detect file type by extension
 */
export function detectFileType(filename: string): FileTypeInfo {
  const ext = filename.split('.').pop()?.toLowerCase()
  
  const typeMap: Record<string, FileTypeInfo> = {
    // Text
    'txt': { typeCode: 1, typeName: 'text/plain', category: 'text' },
    'html': { typeCode: 2, typeName: 'text/html', category: 'text' },
    'md': { typeCode: 3, typeName: 'text/markdown', category: 'text' },
    'markdown': { typeCode: 3, typeName: 'text/markdown', category: 'text' },
    
    // Images
    'png': { typeCode: 10, typeName: 'image/png', category: 'image' },
    'jpg': { typeCode: 11, typeName: 'image/jpeg', category: 'image' },
    'jpeg': { typeCode: 11, typeName: 'image/jpeg', category: 'image' },
    'svg': { typeCode: 12, typeName: 'image/svg+xml', category: 'image' },
    'gif': { typeCode: 13, typeName: 'image/gif', category: 'image' },
    'webp': { typeCode: 14, typeName: 'image/webp', category: 'image' },
    
    // PDF
    'pdf': { typeCode: 21, typeName: 'application/pdf', category: 'pdf' },
    
    // JSON
    'json': { typeCode: 20, typeName: 'application/json', category: 'text' },
  }
  
  if (ext && typeMap[ext]) {
    return typeMap[ext]
  }
  
  // Unknown type
  return { typeCode: 99, typeName: 'application/octet-stream', category: 'unknown' }
}

/**
 * Check if file type is supported
 */
export function isFileTypeSupported(filename: string): boolean {
  const info = detectFileType(filename)
  return info.typeCode !== 99
}

