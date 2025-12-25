import json
import os
from pathlib import Path
from typing import Optional, List
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from supabase import create_client, Client

app = Flask(__name__)

# CORS configuration - allow ALL origins with credentials
# Using a custom response handler instead of origins parameter
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    return response

# Configuration
CONFIG = {}
GET_TOKEN = None
POST_TOKEN = None
# supase = None # not thread-safe. even if supabase don't maintain active network connection with server.

def load_config():
    """Load configuration from config.json and config.0.json files"""
    global CONFIG, GET_TOKEN, POST_TOKEN
    
    config_path = Path(__file__).parent.parent / 'src' / 'public' / 'config.json'
    config_0_path = Path(__file__).parent.parent / 'src' / 'public' / 'config.0.json'
    
    # Load config.json
    if config_path.exists():
        try:
            with open(config_path, 'r') as f:
                CONFIG.update(json.load(f))
        except Exception as e:
            print(f"Warning: Failed to load config.json: {e}")
    
    # Load config.0.json (overwrites config.json)
    if config_0_path.exists():
        try:
            with open(config_0_path, 'r') as f:
                CONFIG.update(json.load(f))
        except Exception as e:
            print(f"Warning: Failed to load config.0.json: {e}")
    
    # Set tokens
    GET_TOKEN = os.getenv('GET_TOKEN', 'example_token')
    POST_TOKEN = os.getenv('POST_TOKEN', 'example_post_token')
    
    # Verify Supabase configuration
    if CONFIG.get('project_url') and CONFIG.get('anon_key'):
        print(f"✓ Supabase configuration loaded: {CONFIG['project_url']}")
    else:
        print(f"✗ Supabase configuration incomplete")

def get_supabase_client() -> Optional[Client]:
    """Create a new Supabase client for this request"""
    if not CONFIG.get('project_url') or not CONFIG.get('anon_key'):
        return None
    
    try:
        return create_client(CONFIG['project_url'], CONFIG['anon_key'])
    except Exception as e:
        print(f"✗ Failed to create Supabase client: {e}")
        return None

def verify_token(token_type='GET'):
    """Verify token from request parameters"""
    token = request.args.get('token', '')
    expected = GET_TOKEN if token_type == 'GET' else POST_TOKEN
    
    if expected and token != expected:
        return False
    return True

def parse_path(path_str: str):
    """Parse a path string into segment IDs, handling trailing slash"""
    # Remove leading slash
    if path_str.startswith('/'):
        path_str = path_str[1:]
    
    # Check for trailing slash
    has_trailing_slash = path_str.endswith('/')
    
    # Remove trailing slash for parsing
    if has_trailing_slash:
        path_str = path_str[:-1]
    
    # Split by /
    segments = [s for s in path_str.split('/') if s]
    
    return segments, has_trailing_slash

# ============================================================================
# MULTI-QUERY METHODS (Fallback approach - multiple round trips)
# ============================================================================

def is_content(supabase: Client, item_id: str) -> bool:
    """Check if an ID represents content (vs segment)"""
    if not supabase:
        return False
    
    result = supabase.table('content').select('id').eq('id', item_id).execute()
    return result.data and len(result.data) > 0

def get_children_ids(supabase: Client, parent_id: Optional[str]) -> List[str]:
    """Get all direct children IDs of a parent (or root if parent_id is None)"""
    if not supabase:
        return []
    
    if parent_id is None:
        # Root level: find all segments without a parent relation
        # Get all segment IDs
        all_segments = supabase.table('segment').select('id').execute()
        all_ids = set([seg['id'] for seg in (all_segments.data or [])])
        
        # Get all segments that have a parent (appear as segment_2 in relations with type=0)
        with_parent = supabase.table('segment_relation').select('segment_2').eq('type', 0).execute()
        child_ids = set([rel['segment_2'] for rel in (with_parent.data or [])])
        
        # Root = all segments - segments with parents
        root_ids = list(all_ids - child_ids)
        return root_ids
    else:
        # Get children via segment_relation where parent is segment_1, type=0
        result = supabase.table('segment_relation').select('segment_2').eq('type', 0).eq('segment_1', parent_id).execute()
        return [rel['segment_2'] for rel in (result.data or [])]

def resolve_path_to_id(supabase: Client, segments: List[str]) -> Optional[str]:
    """Resolve a path of segment names to the final segment/content ID"""
    if not supabase or not segments:
        return None
    
    current_parent = None
    
    for seg_name in segments:
        # Get children of current parent
        child_ids = get_children_ids(supabase, current_parent)
        
        # Find which child has the matching name
        for child_id in child_ids:
            # Get name from segment table
            result = supabase.table('segment').select('name').eq('id', child_id).execute()
            if result.data and len(result.data) > 0:
                if result.data[0]['name'] == seg_name:
                    current_parent = child_id
                    break
        else:
            # No matching child found
            return None
    
    return current_parent

def get_children_multi_query(supabase: Client, segments: List[str]):
    """Get segment children using multiple queries (fallback method)"""
    print("[METHOD] Using multi-query approach for get_children")
    
    if not segments:
        # Root level
        root_ids = get_children_ids(supabase, None)
        items = []
        
        for item_id in root_ids:
            seg_data = supabase.table('segment').select('id, name').eq('id', item_id).execute()
            if seg_data.data and len(seg_data.data) > 0:
                item = seg_data.data[0]
                item['item_type'] = 'content' if is_content(supabase, item_id) else 'segment'
                items.append(item)
        
        return {'code': 0, 'data': {'items': items}}
    
    # Resolve path
    item_id = resolve_path_to_id(supabase, segments)
    if not item_id:
        return {'code': -1, 'message': 'Path does not exist'}
    
    # Get children
    child_ids = get_children_ids(supabase, item_id)
    items = []
    
    for child_id in child_ids:
        seg_data = supabase.table('segment').select('id, name').eq('id', child_id).execute()
        if seg_data.data and len(seg_data.data) > 0:
            item = seg_data.data[0]
            item['item_type'] = 'content' if is_content(supabase, child_id) else 'segment'
            items.append(item)
    
    return {'code': 0, 'data': {'items': items, 'segment_id': item_id}}

def get_content_multi_query(supabase: Client, segments: List[str]):
    """Get content using multiple queries (fallback method)
    New logic: Uses bind relationship (type=2) instead of empty name convention
    Priority: bound content > direct child content > indirect child content"""
    print("[METHOD] Using multi-query approach for get_content")
    
    item_id = resolve_path_to_id(supabase, segments)
    
    if not item_id:
        return {'code': -1, 'message': 'Path does not exist'}
    
    # Check if the resolved ID itself is content
    if is_content(supabase, item_id):
        content_id = item_id
    else:
        # Item is a segment, look for associated content
        # Priority: bound (type=2) > direct child (type=0) > indirect child (type=1)
        content_id = None
        
        # Try bound content first (type=2, highest priority)
        bind_result = supabase.table('segment_relation').select('segment_2').eq('segment_1', item_id).eq('type', 2).limit(1).execute()
        if bind_result.data and len(bind_result.data) > 0:
            candidate_id = bind_result.data[0]['segment_2']
            if is_content(supabase, candidate_id):
                content_id = candidate_id
        
        # If no bound content, try direct child content (type=0)
        if not content_id:
            direct_result = supabase.table('segment_relation').select('segment_2').eq('segment_1', item_id).eq('type', 0).execute()
            if direct_result.data:
                for rel in direct_result.data:
                    candidate_id = rel['segment_2']
                    if is_content(supabase, candidate_id):
                        content_id = candidate_id
                        break
        
        # If no direct child content, try indirect child content (type=1)
        if not content_id:
            indirect_result = supabase.table('segment_relation').select('segment_2').eq('segment_1', item_id).eq('type', 1).execute()
            if indirect_result.data:
                for rel in indirect_result.data:
                    candidate_id = rel['segment_2']
                    if is_content(supabase, candidate_id):
                        content_id = candidate_id
                        break
        
        if not content_id:
            return {'code': -2, 'message': 'Content not found (no bound, direct, or indirect child content)'}
    
    # Get content data
    content_result = supabase.table('content').select('*').eq('id', content_id).execute()
    
    if not content_result.data:
        return {'code': -3, 'message': 'Content not found'}
    
    content = content_result.data[0]
    type_code = content.get('type_code', 1)
    value = content.get('value', '')
    
    # Check if this is a binary reference
    if value.startswith('binary:'):
        binary_id = value[7:]  # Remove "binary:" prefix
        binary_result = supabase.table('content_binary').select('*').eq('id', binary_id).execute()
        
        if not binary_result.data:
            return {'code': -4, 'message': f'Binary data not found for ID {binary_id}'}
        
        binary_data = binary_result.data[0]
        # Determine content type from type_code (should query content_type table)
        content_type = 'application/octet-stream'
        if type_code == 10:
            content_type = 'image/png'
        elif type_code == 21:
            content_type = 'application/pdf'
        
        return {
            'code': 0,
            'data': {
                'content': content,
                'content_type': content_type,
                'value': binary_data.get('data'),
                'is_binary': True
            }
        }
    
    # Map type_code to content type (should query content_type table)
    content_type_map = {
        1: 'text/plain',
        2: 'text/html',
        3: 'text/markdown',
        10: 'image/png',  # Legacy base64 images
        21: 'application/pdf',  # Legacy base64 PDFs
    }
    content_type = content_type_map.get(type_code, 'text/plain')
    
    return {'code': 0, 'data': {'content': content, 'content_type': content_type, 'value': value, 'is_binary': False}}

# ============================================================================
# POSTGRESQL FUNCTION METHODS (Primary approach - single query)
# ============================================================================

def get_children_pg_function(supabase: Client, segments: List[str]):
    """Get segment children using PostgreSQL function (single query)"""
    print("[METHOD] Using PostgreSQL function for get_children")
    
    try:
        result = supabase.rpc('get_segment_children', {'path_segments': segments}).execute()
        if result.data is not None:
            items = [{'id': row['id'], 'name': row['name'], 'item_type': row['item_type']} for row in result.data]
            return {'code': 0, 'data': {'items': items}}
        return {'code': -1, 'message': 'No data returned'}
    except Exception as e:
        return {'code': -5, 'message': str(e)}

def get_content_pg_function(supabase: Client, segments: List[str]):
    """Get content using PostgreSQL function (single query)"""
    print("[METHOD] Using PostgreSQL function for get_content")
    
    try:
        result = supabase.rpc('get_content_by_path', {'path_segments': segments}).execute()
        if result.data and len(result.data) > 0:
            content = result.data[0]
            type_code = content.get('type_code', 1)
            value = content.get('value', '')
            
            # Check if this is a binary reference
            if value.startswith('binary:'):
                binary_id = value[7:]  # Remove "binary:" prefix
                binary_result = supabase.table('content_binary').select('*').eq('id', binary_id).execute()
                
                if not binary_result.data:
                    return {'code': -4, 'message': f'Binary data not found for ID {binary_id}'}
                
                binary_data = binary_result.data[0]
                # Determine content type from type_code (should query content_type table)
                content_type = 'application/octet-stream'
                if type_code == 10:
                    content_type = 'image/png'
                elif type_code == 21:
                    content_type = 'application/pdf'
                
                return {
                    'code': 0,
                    'data': {
                        'content': content,
                        'content_type': content_type,
                        'value': binary_data.get('data'),
                        'is_binary': True
                    }
                }
            
            # Map type_code to content type (should query content_type table)
            content_type_map = {
                1: 'text/plain',
                2: 'text/html',
                3: 'text/markdown',
                10: 'image/png',  # Legacy base64 images
                21: 'application/pdf',  # Legacy base64 PDFs
            }
            content_type = content_type_map.get(type_code, 'text/plain')
            
            return {
                'code': 0,
                'data': {
                    'content': content,
                    'content_type': content_type,
                    'value': value,
                    'is_binary': False
                }
            }
        return {'code': -1, 'message': 'Content not found'}
    except Exception as e:
        return {'code': -5, 'message': str(e)}

def fetch_tree(supabase: Client, segment_id: str):
    """
    Fetch full tree structure for a segment using PostgreSQL function
    Returns nested JSON with all direct children recursively
    """
    try:
        print(f"[fetch_tree] Fetching tree for segment_id: {segment_id}")
        response = supabase.rpc('get_segment_tree', {'root_segment_id': segment_id}).execute()
        
        if response.data is not None:
            print(f"[fetch_tree] Successfully fetched tree for segment_id: {segment_id}")
            return {
                'code': 0,
                'message': 'Tree fetched successfully',
                'data': response.data
            }
        print(f"[fetch_tree] No data returned for segment_id: {segment_id}")
        return {'code': -1, 'message': 'Failed to fetch tree'}
    except Exception as e:
        print(f"[fetch_tree] Exception for segment_id {segment_id}: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return {'code': -5, 'message': str(e)}

    

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def handle_path(path):
    """Handle all path requests"""
    if not verify_token('GET'):
        return jsonify({'code': -2, 'message': 'Invalid or missing token'}), 401
    
    # Create a new Supabase client for this request
    supabase = get_supabase_client()
    if not supabase:
        return jsonify({'code': -3, 'message': 'Supabase client not initialized'}), 500
    
    full_path = '/' + path if path else '/'
    segments, has_trailing_slash = parse_path(full_path)
    
    # Check for fetch_type parameter
    fetch_type = request.args.get('fetch_type', 'normal')
    
    print(f"[GET] {full_path} → segments={segments}, trailing_slash={has_trailing_slash}, fetch_type={fetch_type}")
    
    try:
        # Handle tree fetch request
        if fetch_type == 'tree' and has_trailing_slash:
            # Get segment ID by resolving path
            if len(segments) == 0:
                return jsonify({'code': -1, 'message': 'Cannot fetch tree for root'}), 400
            
            # Resolve path to get segment ID
            segment_id = resolve_path_to_id(supabase, segments)
            if not segment_id:
                print(f"[ERROR] Segment not found for path: {segments}")
                return jsonify({'code': -1, 'message': 'Segment not found'}), 404
            
            print(f"[DEBUG] Resolved path {segments} to segment_id: {segment_id}")
            
            # Fetch tree structure
            tree_result = fetch_tree(supabase, segment_id)
            if tree_result['code'] < 0:
                print(f"[ERROR] fetch_tree failed with code {tree_result['code']}: {tree_result.get('message')}")
                return jsonify({'code': tree_result['code'], 'message': tree_result.get('message', 'Failed to fetch tree')}), 500
            
            return jsonify({
                'code': 0,
                'message': 'Tree fetched successfully',
                'data': {
                    'type': 'segment_tree',
                    'path': full_path,
                    'segment_id': segment_id,
                    'tree': tree_result.get('data', {})
                }
            })
        
        # Trailing slash → treat as segment, return children
        if has_trailing_slash:
            # Try PostgreSQL function first
            result = get_children_pg_function(supabase, segments)
            
            if result['code'] < 0:
                print(f"[FALLBACK] PG function failed (code={result['code']}): {result.get('message', 'Unknown error')}, using multi-query")
                result = get_children_multi_query(supabase, segments)
            
            if result['code'] < 0:
                return jsonify({'code': result['code'], 'message': result.get('message', 'Path does not exist')}), 404
            
            data = result.get('data', {})
            response_data = {
                'code': 0,
                'message': 'Children fetched successfully',
                'data': {
                    'type': 'segment_list',
                    'path': full_path,
                    'items': data.get('items', [])
                }
            }
            if 'segment_id' in data:
                response_data['data']['segment_id'] = data['segment_id']
            
            return jsonify(response_data)
        
        # No trailing slash → treat as content
        else:
            # Try PostgreSQL function first
            result = get_content_pg_function(supabase, segments)
            
            if result['code'] < 0:
                print(f"[FALLBACK] PG function failed (code={result['code']}): {result.get('message', 'Unknown error')}, using multi-query")
                result = get_content_multi_query(supabase, segments)
            
            if result['code'] < 0:
                return jsonify({'code': result['code'], 'message': result.get('message', 'Content not found')}), 404
            
            data = result.get('data', {})
            content_type = data.get('content_type', 'text/plain')
            value = data.get('value', '')
            is_binary = data.get('is_binary', False)
            
            # Handle binary data (images, PDFs, etc.)
            if is_binary:
                # Supabase returns BYTEA as hex-encoded string with \x prefix
                # Storage format: Uint8Array → base64 → BYTEA (hex-encoded by Supabase)
                if isinstance(value, str) and value.startswith('\\x'):
                    import base64
                    # Decode: hex → UTF-8 string (base64) → bytes
                    hex_str = value[2:]  # Remove \x prefix
                    base64_str = bytes.fromhex(hex_str).decode('utf-8')
                    byte_data = base64.b64decode(base64_str)
                    return Response(byte_data, mimetype=content_type)
                else:
                    return Response(value, mimetype=content_type)
            
            # Return content based on content type
            if content_type.startswith('application/json'):
                try:
                    json_value = json.loads(value) if isinstance(value, str) else value
                    return jsonify(json_value)
                except:
                    return Response(value, mimetype=content_type)
            elif content_type.startswith('text/'):
                return Response(value, mimetype=content_type)
            else:
                return Response(value, mimetype=content_type)
    
    except Exception as e:
        print(f"[ERROR] Exception processing request: {e}")
        return jsonify({'error': 'Server error', 'message': str(e)}), 500

@app.route('/ping')
def ping():
    """Ping endpoint to test server connection and token validity"""
    token_valid = verify_token('GET')
    
    if not token_valid:
        return jsonify({
            'code': 1,
            'message': 'Server is reachable but token is invalid'
        })
    
    # Test Supabase client creation
    supabase_configured = CONFIG.get('project_url') and CONFIG.get('anon_key')
    
    return jsonify({
        'code': 0,
        'message': 'Connection successful',
        'data': {
            'supabase_configured': supabase_configured
        }
    })

@app.route('/api/test', methods=['POST'])
def test_post():
    """Test POST endpoint"""
    if not verify_token('POST'):
        return jsonify({'error': 'Unauthorized', 'message': 'Invalid or missing token'}), 401
    
    data = request.get_json() or {}
    print(f"[POST] /api/test → {data}")
    
    return jsonify({
        'status': 'success',
        'message': 'POST request received',
        'received_data': data,
        'token_valid': True
    })

if __name__ == '__main__':
    load_config()
    print(f"GET_TOKEN: {GET_TOKEN}")
    print(f"POST_TOKEN: {POST_TOKEN}")
    print(f"Supabase configured: {CONFIG.get('project_url') and CONFIG.get('anon_key')}")
    # Enable threaded mode to handle concurrent requests
    app.run(host='0.0.0.0', port=18100, debug=True, threaded=True)
