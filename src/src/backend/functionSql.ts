// PostgreSQL function definitions for optimized queries

export const createGetContentByPathFunction = () => `-- Function: Get content by path
-- Returns content data for a given path (e.g., ['name', 'en'])
-- Handles both direct content and content with empty name under a segment
CREATE OR REPLACE FUNCTION get_content_by_path(path_segments TEXT[])
RETURNS TABLE(
  id TEXT,
  type_code INTEGER,
  type_name TEXT,
  value TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  metadata JSONB
) AS $$
DECLARE
  current_id TEXT := NULL;
  seg_name TEXT;
  child_id TEXT;
  is_root BOOLEAN := TRUE;
BEGIN
  -- Walk through path segments
  FOREACH seg_name IN ARRAY path_segments
  LOOP
    -- Find child with matching name
    IF is_root THEN
      -- Root level: find segment without parent relation
      SELECT s.id INTO current_id
      FROM segment s
      WHERE s.name = seg_name
        AND NOT EXISTS (
          SELECT 1 FROM segment_relation sr
          WHERE sr.segment_2 = s.id AND sr.type = 0
        )
      LIMIT 1;
      is_root := FALSE;
    ELSE
      -- Find child of current segment
      SELECT s.id INTO current_id
      FROM segment s
      INNER JOIN segment_relation sr ON sr.segment_2 = s.id
      WHERE sr.segment_1 = current_id
        AND sr.type = 0
        AND s.name = seg_name
      LIMIT 1;
    END IF;
    
    -- If not found, return empty
    IF current_id IS NULL THEN
      RETURN;
    END IF;
  END LOOP;
  
  -- Check if current_id is content
  IF EXISTS (SELECT 1 FROM content WHERE content.id = current_id) THEN
    -- Return this content
    RETURN QUERY
    SELECT c.id, c.type_code, ct.type_name, c.value, c.created_at, c.updated_at, c.metadata
    FROM content c
    LEFT JOIN content_type ct ON ct.type_code = c.type_code
    WHERE c.id = current_id;
  ELSE
    -- Current is segment, look for content with empty name
    SELECT s.id INTO child_id
    FROM segment s
    INNER JOIN segment_relation sr ON sr.segment_2 = s.id
    INNER JOIN content c ON c.id = s.id
    WHERE sr.segment_1 = current_id
      AND sr.type = 0
      AND s.name = ''
    LIMIT 1;
    
    IF child_id IS NOT NULL THEN
      RETURN QUERY
      SELECT c.id, c.type_code, ct.type_name, c.value, c.created_at, c.updated_at, c.metadata
      FROM content c
      LEFT JOIN content_type ct ON ct.type_code = c.type_code
      WHERE c.id = child_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;`

export const createGetSegmentChildrenFunction = () => `-- Function: Get segment children by path
-- Returns list of children (segments and content) for a given path
-- Empty array means root level
CREATE OR REPLACE FUNCTION get_segment_children(path_segments TEXT[])
RETURNS TABLE(
  id TEXT,
  name TEXT,
  item_type TEXT
) AS $$
DECLARE
  current_id TEXT := NULL;
  seg_name TEXT;
  is_root BOOLEAN := TRUE;
BEGIN
  -- If path is empty, we're at root
  IF array_length(path_segments, 1) IS NULL OR array_length(path_segments, 1) = 0 THEN
    -- Return root level items (segments/content without parent relation)
    RETURN QUERY
    SELECT 
      s.id,
      s.name,
      CASE WHEN EXISTS (SELECT 1 FROM content c WHERE c.id = s.id) 
        THEN 'content'::TEXT
        ELSE 'segment'::TEXT
      END as item_type
    FROM segment s
    WHERE NOT EXISTS (
      SELECT 1 FROM segment_relation sr
      WHERE sr.segment_2 = s.id AND sr.type = 0
    );
    RETURN;
  END IF;
  
  -- Walk through path segments to find the target
  FOREACH seg_name IN ARRAY path_segments
  LOOP
    IF is_root THEN
      -- Root level
      SELECT s.id INTO current_id
      FROM segment s
      WHERE s.name = seg_name
        AND NOT EXISTS (
          SELECT 1 FROM segment_relation sr
          WHERE sr.segment_2 = s.id AND sr.type = 0
        )
      LIMIT 1;
      is_root := FALSE;
    ELSE
      -- Find child of current segment
      SELECT s.id INTO current_id
      FROM segment s
      INNER JOIN segment_relation sr ON sr.segment_2 = s.id
      WHERE sr.segment_1 = current_id
        AND sr.type = 0
        AND s.name = seg_name
      LIMIT 1;
    END IF;
    
    -- If not found, return empty
    IF current_id IS NULL THEN
      RETURN;
    END IF;
  END LOOP;
  
  -- Return children of current_id
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    CASE WHEN EXISTS (SELECT 1 FROM content c WHERE c.id = s.id) 
      THEN 'content'::TEXT
      ELSE 'segment'::TEXT
    END as item_type
  FROM segment s
  INNER JOIN segment_relation sr ON sr.segment_2 = s.id
  WHERE sr.segment_1 = current_id AND sr.type = 0;
END;
$$ LANGUAGE plpgsql;`

