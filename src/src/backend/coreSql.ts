/**
 * SQL Generation Functions
 * Each function returns SQL commands for specific operations
 */

/**
 * Get SQL to create update_updated_at_column function
 */
export function createUpdateFunction(): string {
  return `
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
`.trim()
}

/**
 * Get SQL to create id_09ae table
 */
export function createId09aeTable(): string {
  return `
-- Universal ID 09ae
-- Stores all issued IDs with their state and type (base-15 encoding: 0-9a-e)

CREATE TABLE IF NOT EXISTS id_09ae (
  id_string TEXT PRIMARY KEY,          -- Base-15 encoded ID (0-9a-e)
  state SMALLINT NOT NULL DEFAULT 1,   -- -128 to 127: <0=aborted, 0=in use, 1=issued but not used
  type_code INTEGER NOT NULL,          -- 32-bit integer for ID type
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb   -- Additional info (optional)
);

-- Index for querying by state and type
CREATE INDEX IF NOT EXISTS idx_id_09ae_state ON id_09ae(state);
CREATE INDEX IF NOT EXISTS idx_id_09ae_type ON id_09ae(type_code);
CREATE INDEX IF NOT EXISTS idx_id_09ae_state_type ON id_09ae(state, type_code);

-- Trigger for updated_at
CREATE TRIGGER update_id_09ae_updated_at 
  BEFORE UPDATE ON id_09ae
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
`.trim()
}

/**
 * Get SQL to create id_type table
 */
export function createIdTypeTable(): string {
  return `
-- ID Type Descriptions
-- Auxiliary table for human-readable type information

CREATE TABLE IF NOT EXISTS id_type (
  type_code INTEGER PRIMARY KEY,       -- Matches type_code in id_09ae
  type_name TEXT NOT NULL UNIQUE,      -- e.g., "segment", "content"
  description TEXT,                    -- Human-readable description
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default ID types
INSERT INTO id_type (type_code, type_name, description) VALUES
  (1, 'segment', 'Path segment in content hierarchy'),
  (2, 'content', 'Content item (text, binary, etc)')
ON CONFLICT (type_code) DO NOTHING;
`.trim()
}


/**
 * Get SQL to create segment table
 */
export function createPathSegmentTable(): string {
  return `
-- Path Segment for hierarchical content structure
-- Example: /aa/bb/cc/dd has 4 segments: aa, bb, cc, dd
-- Relationships are stored in segment_relation table

CREATE TABLE IF NOT EXISTS segment (
  id TEXT PRIMARY KEY,                 -- ID from id_09ae
  name TEXT NOT NULL,                  -- Current name (can be renamed)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  FOREIGN KEY (id) REFERENCES id_09ae(id_string) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_segment_name ON segment(name);

-- Trigger for updated_at
CREATE TRIGGER update_segment_updated_at 
  BEFORE UPDATE ON segment
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
`.trim()
}

/**
 * Get SQL to create segment_relation_type table
 */
export function createPathSegmentRelationTypeTable(): string {
  return `
-- Path segment relation types
CREATE TABLE IF NOT EXISTS segment_relation_type (
  type_code INTEGER PRIMARY KEY,
  type_name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO segment_relation_type (type_code, type_name, description) VALUES
  (0, 'parent_child_direct', 'Direct parent-child relationship (segment_1 is parent, segment_2 is child). Each segment has ONE direct parent.'),
  (1, 'parent_child_indirect', 'Indirect parent-child relationship (many-to-many). For organization and alternative paths.')
ON CONFLICT (type_code) DO NOTHING;
`.trim()
}

/**
 * Get SQL to create segment_relation table
 */
export function createPathSegmentRelationTable(): string {
  return `
-- Segment relationships (many-to-many)
-- Supports relationships between path segments and content segments
-- segment_1 and segment_2 can reference either segment table OR content table
CREATE TABLE IF NOT EXISTS segment_relation (
  id SERIAL PRIMARY KEY,
  type INTEGER NOT NULL,               -- Relationship type (0=direct parent/child, 1=indirect)
  segment_1 TEXT NOT NULL,             -- First entity (parent in type 0)
  segment_2 TEXT NOT NULL,             -- Second entity (child in type 0)
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  FOREIGN KEY (type) REFERENCES segment_relation_type(type_code) ON DELETE CASCADE,
  UNIQUE(type, segment_1, segment_2)  -- Prevent duplicate relations
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_segment_relation_type ON segment_relation(type);
CREATE INDEX IF NOT EXISTS idx_segment_relation_1 ON segment_relation(segment_1);
CREATE INDEX IF NOT EXISTS idx_segment_relation_2 ON segment_relation(segment_2);
CREATE INDEX IF NOT EXISTS idx_segment_relation_type_1 ON segment_relation(type, segment_1);
CREATE INDEX IF NOT EXISTS idx_segment_relation_type_2 ON segment_relation(type, segment_2);
`.trim()
}

/**
 * Get complete SQL to initialize all tables
 */
export function getInitializationSQL(): string {
  return [
    createUpdateFunction(),
    '',
    createId09aeTable(),
    '',
    createIdTypeTable(),
    '',
    createPathSegmentTable(),
    '',
    createPathSegmentRelationTypeTable(),
    '',
    createPathSegmentRelationTable()
  ].join('\n\n')
}

/**
 * Get SQL to drop all tables (for testing/reset)
 */
export function getCleanupSQL(): string {
  return `
-- Drop all tables and functions
DROP TABLE IF EXISTS segment_relation CASCADE;
DROP TABLE IF EXISTS segment_relation_type CASCADE;
DROP TABLE IF EXISTS segment CASCADE;
DROP TABLE IF EXISTS id_09ae CASCADE;
DROP TABLE IF EXISTS id_type CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
`.trim()
}
