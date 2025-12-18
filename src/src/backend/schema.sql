-- This file is for reference. Use sql.ts functions to generate SQL dynamically.
-- To initialize all tables, copy the output from: getInitializationSQL()

-- Universal ID 09ae (base-15 encoding: 0-9a-e)
CREATE TABLE IF NOT EXISTS id_09ae (
  id_string TEXT PRIMARY KEY,
  state SMALLINT NOT NULL DEFAULT 1,
  type_code INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_id_09ae_state ON id_09ae(state);
CREATE INDEX IF NOT EXISTS idx_id_09ae_type ON id_09ae(type_code);
CREATE INDEX IF NOT EXISTS idx_id_09ae_state_type ON id_09ae(state, type_code);

-- ID Type
CREATE TABLE IF NOT EXISTS id_type (
  type_code INTEGER PRIMARY KEY,
  type_name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO id_type (type_code, type_name, description) VALUES
  (1, 'segment', 'Path segment in content hierarchy'),
  (2, 'content', 'Content item (text, binary, etc)')
ON CONFLICT (type_code) DO NOTHING;

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_id_09ae_updated_at 
  BEFORE UPDATE ON id_09ae
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Path Segment
CREATE TABLE IF NOT EXISTS segment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  FOREIGN KEY (id) REFERENCES id_09ae(id_string) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_segment_name ON segment(name);

CREATE TRIGGER update_segment_updated_at 
  BEFORE UPDATE ON segment
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Path Segment Relation Types
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

-- Path Segment Relations
CREATE TABLE IF NOT EXISTS segment_relation (
  id SERIAL PRIMARY KEY,
  type INTEGER NOT NULL,
  segment_1 TEXT NOT NULL,
  segment_2 TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  FOREIGN KEY (type) REFERENCES segment_relation_type(type_code) ON DELETE CASCADE,
  UNIQUE(type, segment_1, segment_2)
);

CREATE INDEX IF NOT EXISTS idx_segment_relation_type ON segment_relation(type);
CREATE INDEX IF NOT EXISTS idx_segment_relation_1 ON segment_relation(segment_1);
CREATE INDEX IF NOT EXISTS idx_segment_relation_2 ON segment_relation(segment_2);
CREATE INDEX IF NOT EXISTS idx_segment_relation_type_1 ON segment_relation(type, segment_1);
CREATE INDEX IF NOT EXISTS idx_segment_relation_type_2 ON segment_relation(type, segment_2);
