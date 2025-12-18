/**
 * SQL for content-related tables
 */

/**
 * Get SQL to create content_type table
 */
export function createContentTypeTable(): string {
  return `
-- Content Type Table
-- Maps content type codes to MIME-like type strings

CREATE TABLE IF NOT EXISTS content_type (
  type_code INTEGER PRIMARY KEY,
  type_name TEXT NOT NULL UNIQUE,      -- e.g., "text/plain", "image/png", "image/svg+xml"
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default content types
INSERT INTO content_type (type_code, type_name, description) VALUES
  (1, 'text/plain', 'Plain text content'),
  (2, 'text/html', 'HTML content'),
  (3, 'text/markdown', 'Markdown content'),
  (10, 'image/png', 'PNG image'),
  (11, 'image/jpeg', 'JPEG image'),
  (12, 'image/svg+xml', 'SVG image'),
  (13, 'image/gif', 'GIF image'),
  (14, 'image/webp', 'WebP image'),
  (20, 'application/json', 'JSON data'),
  (21, 'application/pdf', 'PDF document'),
  (99, 'application/octet-stream', 'Unknown binary type')
ON CONFLICT (type_code) DO NOTHING;
`.trim()
}

/**
 * Get SQL to create content table
 */
export function createContentTable(): string {
  return `
-- Content Table
-- Stores content items with type and value

CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY,                  -- ID from id_09ae
  type_code INTEGER NOT NULL,           -- Content type from content_type
  value TEXT,                           -- For text types: direct content; For binary: reference ID to content_binary
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  FOREIGN KEY (id) REFERENCES id_09ae(id_string) ON DELETE CASCADE,
  FOREIGN KEY (type_code) REFERENCES content_type(type_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_type ON content(type_code);

-- Trigger for updated_at
CREATE TRIGGER update_content_updated_at 
  BEFORE UPDATE ON content
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
`.trim()
}

/**
 * Get SQL to create content_binary table
 */
export function createContentBinaryTable(): string {
  return `
-- Content Binary Table
-- Stores binary data (images, files, etc.)

CREATE TABLE IF NOT EXISTS content_binary (
  id TEXT PRIMARY KEY,                  -- ID from id_09ae, referenced by content.value
  data BYTEA NOT NULL,                  -- Binary data
  size_bytes INTEGER NOT NULL,          -- Size in bytes
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (id) REFERENCES id_09ae(id_string) ON DELETE CASCADE
);

-- Index for size queries
CREATE INDEX IF NOT EXISTS idx_content_binary_size ON content_binary(size_bytes);
`.trim()
}

