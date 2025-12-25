// PostgreSQL function definitions for optimized queries

/**
 * Utility function to check if other functions exist
 * This function is used by the UI to verify function existence
 */
export const createCheckFunctionExistsFunction = () => `-- Function: Check if a function exists
-- Queries pg_proc system catalog to check if a function exists in public schema
-- This is the definitive way to check function existence
CREATE OR REPLACE FUNCTION check_function_exists(function_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = function_name
  );
END;
$$ LANGUAGE plpgsql STABLE;
`

/**
 * Get all root-level segments and content in one query
 * Returns all items that don't have a direct parent relationship
 */
export const createGetRootItemsFunction = () => `-- Function: Get all root-level segments and content
-- Returns all segments/content without direct parent relationships
-- Optimized to fetch all root items in a single query
CREATE OR REPLACE FUNCTION get_root_items()
RETURNS TABLE(
  id TEXT,
  name TEXT,
  type_code INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  is_content BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    c.type_code,
    s.created_at,
    s.updated_at,
    s."isContent" AS is_content
  FROM segment s
  LEFT JOIN content c ON c.id = s.id AND s."isContent" = true
  WHERE NOT EXISTS (
    SELECT 1 FROM segment_relation sr
    WHERE sr.segment_2 = s.id AND sr.type = 0
  )
  ORDER BY s.name, s.created_at;
END;
$$ LANGUAGE plpgsql STABLE;
`

/**
 * Get path to root for a segment in one query using recursive CTE
 * Much more efficient than multiple sequential queries
 */
export const createGetPathToRootFunction = () => `-- Function: Get path to root for a segment
-- Uses recursive CTE to traverse parent chain in a single query
-- Returns array of segment IDs from root to the given segment
CREATE OR REPLACE FUNCTION get_path_to_root(target_segment_id TEXT)
RETURNS TEXT[] AS $$
WITH RECURSIVE parent_chain AS (
  -- Base case: start with target segment
  SELECT 
    target_segment_id AS id,
    1 AS depth
  
  UNION ALL
  
  -- Recursive case: get direct parent
  SELECT 
    sr.segment_1 AS id,
    pc.depth + 1 AS depth
  FROM parent_chain pc
  INNER JOIN segment_relation sr ON sr.segment_2 = pc.id
  WHERE sr.type = 0  -- Direct parent relationship only
    AND pc.depth < 100  -- Prevent infinite loops
)
SELECT array_agg(id ORDER BY depth DESC)
FROM parent_chain;
$$ LANGUAGE sql STABLE;
`

export const createGetContentByPathFunction = () => `-- Function: Get content by path
-- Returns content data for a given path (e.g., ['name', 'en'])
-- New logic: Uses bind relationship (type=2) instead of empty name convention
-- Priority: bound content > direct child content > indirect child content
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
  content_id TEXT;
  is_root BOOLEAN := TRUE;
BEGIN
  -- Walk through path segments to find the target segment
  FOREACH seg_name IN ARRAY path_segments
  LOOP
    -- Find child segment/content with matching name
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
  
  -- Check if current_id is already content
  IF EXISTS (SELECT 1 FROM content WHERE content.id = current_id) THEN
    -- Return this content directly
    RETURN QUERY
    SELECT c.id, c.type_code, ct.type_name, c.value, c.created_at, c.updated_at, c.metadata
    FROM content c
    LEFT JOIN content_type ct ON ct.type_code = c.type_code
    WHERE c.id = current_id;
    RETURN;
  END IF;
  
  -- Current is segment, look for bound content (type=2, highest priority)
  SELECT sr.segment_2 INTO content_id
  FROM segment_relation sr
  INNER JOIN content c ON c.id = sr.segment_2
  WHERE sr.segment_1 = current_id
    AND sr.type = 2  -- parent_child_bind
  LIMIT 1;
  
  IF content_id IS NOT NULL THEN
    RETURN QUERY
    SELECT c.id, c.type_code, ct.type_name, c.value, c.created_at, c.updated_at, c.metadata
    FROM content c
    LEFT JOIN content_type ct ON ct.type_code = c.type_code
    WHERE c.id = content_id;
    RETURN;
  END IF;
  
  -- No bound content, look for direct child content (type=0, medium priority)
  SELECT sr.segment_2 INTO content_id
  FROM segment_relation sr
  INNER JOIN content c ON c.id = sr.segment_2
  WHERE sr.segment_1 = current_id
    AND sr.type = 0  -- parent_child_direct
  LIMIT 1;
  
  IF content_id IS NOT NULL THEN
    RETURN QUERY
    SELECT c.id, c.type_code, ct.type_name, c.value, c.created_at, c.updated_at, c.metadata
    FROM content c
    LEFT JOIN content_type ct ON ct.type_code = c.type_code
    WHERE c.id = content_id;
    RETURN;
  END IF;
  
  -- No direct child content, look for indirect child content (type=1, lowest priority)
  SELECT sr.segment_2 INTO content_id
  FROM segment_relation sr
  INNER JOIN content c ON c.id = sr.segment_2
  WHERE sr.segment_1 = current_id
    AND sr.type = 1  -- parent_child_indirect
  LIMIT 1;
  
  IF content_id IS NOT NULL THEN
    RETURN QUERY
    SELECT c.id, c.type_code, ct.type_name, c.value, c.created_at, c.updated_at, c.metadata
    FROM content c
    LEFT JOIN content_type ct ON ct.type_code = c.type_code
    WHERE c.id = content_id;
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

export const createDeleteSegmentFunction = () => `-- Function: Delete segment and all its relations
-- Deletes a segment and removes all relations where it appears as parent or child
-- Returns the number of relations deleted
CREATE OR REPLACE FUNCTION delete_segment_with_relations(segment_id_to_delete TEXT)
RETURNS TABLE(
  relations_deleted INTEGER,
  segment_deleted BOOLEAN
) AS $$
DECLARE
  rel_count INTEGER;
  seg_exists BOOLEAN;
BEGIN
  -- Check if segment exists
  SELECT EXISTS(SELECT 1 FROM segment WHERE id = segment_id_to_delete) INTO seg_exists;
  
  IF NOT seg_exists THEN
    RETURN QUERY SELECT 0, FALSE;
    RETURN;
  END IF;
  
  -- Delete all relations where this segment is segment_1 (parent) or segment_2 (child)
  DELETE FROM segment_relation 
  WHERE segment_1 = segment_id_to_delete OR segment_2 = segment_id_to_delete;
  
  GET DIAGNOSTICS rel_count = ROW_COUNT;
  
  -- Delete the segment itself
  DELETE FROM segment WHERE id = segment_id_to_delete;
  
  RETURN QUERY SELECT rel_count, TRUE;
END;
$$ LANGUAGE plpgsql;`

/**
 * Get tree structure recursively from a segment
 * Returns full tree with all descendants using direct parent-child relationships
 */
export const createGetSegmentTreeFunction = () => `-- Helper function to build tree for a node recursively
CREATE OR REPLACE FUNCTION build_node_tree(node_id TEXT)
RETURNS JSONB AS $$
DECLARE
  node_data RECORD;
  children_data JSONB;
BEGIN
  -- Get node info
  SELECT 
    s.id,
    s.name,
    CASE WHEN c.id IS NOT NULL THEN 'content' ELSE 'segment' END AS item_type,
    c.type_code,
    c.value,
    ct.type_name
  INTO node_data
  FROM segment s
  LEFT JOIN content c ON c.id = s.id
  LEFT JOIN content_type ct ON ct.type_code = c.type_code
  WHERE s.id = node_id;
  
  -- If node doesn't exist, return null
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get all direct children recursively
  SELECT COALESCE(
    jsonb_object_agg(
      child_id,
      build_node_tree(child_id)
    ),
    '{}'::jsonb
  )
  INTO children_data
  FROM (
    SELECT sr.segment_2 AS child_id
    FROM segment_relation sr
    WHERE sr.segment_1 = node_id AND sr.type = 0
  ) children;
  
  -- Build and return node JSON (order: type, name, content if applicable, children)
  IF node_data.item_type = 'content' THEN
    RETURN jsonb_build_object(
      'type', node_data.item_type,
      'name', node_data.name,
      'content', jsonb_build_object(
        'type_code', node_data.type_code,
        'type_name', node_data.type_name,
        'value', node_data.value
      ),
      'children', children_data
    );
  ELSE
    RETURN jsonb_build_object(
      'type', node_data.item_type,
      'name', node_data.name,
      'children', children_data
    );
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Main function: Get full tree structure from a segment
CREATE OR REPLACE FUNCTION get_segment_tree(root_segment_id TEXT)
RETURNS JSONB AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      sr.segment_2,
      build_node_tree(sr.segment_2)
    ),
    '{}'::jsonb
  )
  FROM segment_relation sr
  WHERE sr.segment_1 = root_segment_id AND sr.type = 0;
$$ LANGUAGE sql STABLE;
`

