import React, { useState, useEffect } from 'react'
import {
  createUpdateFunction,
  createId09aeTable,
  createIdTypeTable,
  createSegmentTable,
  createSegmentRelationTypeTable,
  createSegmentRelationTable
} from '../backend/coreSql'
import {
  createContentTypeTable,
  createContentTable,
  createContentBinaryTable
} from '../backend/contentSql'
import {
  createGetContentByPathFunction,
  createGetSegmentChildrenFunction,
  createDeleteSegmentFunction
} from '../backend/functionSql'
import { getSupabaseClient } from '../backend/supabase'
import TableManage from './TableManage'
import FunctionManage from './FunctionManage'
import TabsOnTop from '@wwf971/react-comp-misc/src/layout/tab/TabsOnTop'
import '@wwf971/react-comp-misc/src/layout/tab/TabsOnTop.css'
import './TablesStatus.css'

// Table configuration
const tableConfigs = [
  {
    name: 'id_09ae',
    description: 'Universal ID storage with base-15 encoding (0-9a-e) for all issued IDs with state and type',
    createSQL: () => `${createUpdateFunction()}\n\n${createId09aeTable()}`
  },
  {
    name: 'id_type',
    description: 'ID type descriptions mapping type codes to human-readable names',
    createSQL: () => createIdTypeTable()
  },
  {
    name: 'segment',
    description: 'Hierarchical path segment for content organization (e.g., /aa/bb/cc/dd)',
    createSQL: () => `${createUpdateFunction()}\n\n${createSegmentTable()}`
  },
  {
    name: 'segment_relation_type',
    description: 'Segment relation type mappings (0=direct parent/child, 1=indirect)',
    createSQL: () => createSegmentRelationTypeTable()
  },
  {
    name: 'segment_relation',
    description: 'Many-to-many relationships between path segments and content',
    createSQL: () => createSegmentRelationTable()
  },
  {
    name: 'content_type',
    description: 'Content type mappings (MIME-like types: text/plain, image/png, etc.)',
    createSQL: () => createContentTypeTable()
  },
  {
    name: 'content',
    description: 'Content items with type and value (text inline, binary by reference)',
    createSQL: () => `${createUpdateFunction()}\n\n${createContentTable()}`
  },
  {
    name: 'content_binary',
    description: 'Binary content storage (images, files, etc.)',
    createSQL: () => createContentBinaryTable()
  }
]

// Function configurations
const functionConfigs = [
  {
    name: 'get_content_by_path',
    description: 'Get content by path array - returns content data for a given path (handles empty name content)',
    createSQL: createGetContentByPathFunction(),
    dropSQL: 'DROP FUNCTION IF EXISTS get_content_by_path(TEXT[]);'
  },
  {
    name: 'get_segment_children',
    description: 'Get segment children by path array - returns list of children (segments and content) for a given path',
    createSQL: createGetSegmentChildrenFunction(),
    dropSQL: 'DROP FUNCTION IF EXISTS get_segment_children(TEXT[]);'
  },
  {
    name: 'delete_segment_with_relations',
    description: 'Delete segment and all its relations - removes segment and all relations where it appears as parent or child',
    createSQL: createDeleteSegmentFunction(),
    dropSQL: 'DROP FUNCTION IF EXISTS delete_segment_with_relations(TEXT);'
  }
]

interface SQLModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  sql: string
  dropSQL?: string
}

const SQLModal: React.FC<SQLModalProps> = ({ isOpen, onClose, title, sql, dropSQL }) => {
  const [copied, setCopied] = useState(false)
  const [copiedDrop, setCopiedDrop] = useState(false)

  if (!isOpen) return null

  const handleCopy = (text: string, setFunc: (v: boolean) => void) => {
    navigator.clipboard.writeText(text)
    setFunc(true)
    setTimeout(() => setFunc(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="sql-section">
            <div className="sql-section-header">
              <span>Create SQL:</span>
              <button 
                className="copy-btn"
                onClick={() => handleCopy(sql, setCopied)}
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
            <pre className="sql-code">{sql}</pre>
          </div>

          {dropSQL && (
            <div className="sql-section">
              <div className="sql-section-header">
                <span>Drop SQL:</span>
                <button 
                  className="copy-btn"
                  onClick={() => handleCopy(dropSQL, setCopiedDrop)}
                >
                  {copiedDrop ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
              <pre className="sql-code">{dropSQL}</pre>
            </div>
          )}

          <div className="sql-instructions">
            <strong>Instructions:</strong>
            <ol>
              <li>Copy the SQL above</li>
              <li>Open Supabase Dashboard → SQL Editor</li>
              <li>Paste and run the SQL</li>
              <li>Click refresh to verify</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

const TablesStatus: React.FC = () => {
  const [tableStatus, setTableStatus] = useState<Record<string, boolean | null>>(
    Object.fromEntries(tableConfigs.map(config => [config.name, null]))
  )
  const [functionStatus, setFunctionManage] = useState<Record<string, boolean | null>>(
    Object.fromEntries(functionConfigs.map(config => [config.name, null]))
  )
  const [error, setError] = useState<string | null>(null)
  const [modalData, setModalData] = useState<{name: string; sql: string; dropSQL?: string} | null>(null)

  const handleRefreshSingle = async (tableName: string) => {
    setTableStatus(prev => ({ ...prev, [tableName]: null }))
    const { checkTableExists } = await import('../backend/dbInit')
    const startTime = Date.now()
    const result = await checkTableExists(tableName)
    const elapsed = Date.now() - startTime
    if (elapsed < 200) {
      await new Promise(resolve => setTimeout(resolve, 200 - elapsed))
    }
    if (result.code === 0) {
      setTableStatus(prev => ({ ...prev, [tableName]: result.data || false }))
    }
  }

  const checkFunctionExists = async (functionName: string): Promise<boolean> => {
    try {
      const client = getSupabaseClient()
      
      // Try calling the function with minimal/no parameters
      // The goal is to check the error response
      try {
        // Try with empty object (works for most functions)
        await client.rpc(functionName, {})
      } catch (error: any) {
        // Check the error to determine if function exists
        const errorMsg = error?.message || ''
        const errorCode = error?.code || ''
        
        // 404 or PGRST202 means function doesn't exist
        if (errorCode === 'PGRST202' || errorCode === '404' || errorMsg.includes('not found')) {
          console.log(`[checkFunctionExists] Function ${functionName} does not exist`)
          return false
        }
        
        // Any other error (parameter mismatch, etc.) means function exists but we called it wrong
        console.log(`[checkFunctionExists] Function ${functionName} exists (got error: ${errorCode})`)
        return true
      }
      
      // If no error, function exists and executed successfully
      return true
    } catch (err) {
      console.error(`[checkFunctionExists] Error checking ${functionName}:`, err)
      return false
    }
  }

  const handleRefreshSingleFunction = async (functionName: string) => {
    setFunctionManage(prev => ({ ...prev, [functionName]: null }))
    
    const startTime = Date.now()
    const exists = await checkFunctionExists(functionName)
    const elapsed = Date.now() - startTime
    
    if (elapsed < 200) {
      await new Promise(resolve => setTimeout(resolve, 200 - elapsed))
    }
    
    setFunctionManage(prev => ({ ...prev, [functionName]: exists }))
  }

  const checkAllTables = async () => {
    setError(null)
    // Reset to loading state
    setTableStatus(Object.fromEntries(tableConfigs.map(config => [config.name, null])))
    setFunctionManage(Object.fromEntries(functionConfigs.map(config => [config.name, null])))
    
    const { checkTableExists } = await import('../backend/dbInit')
    
    // Check all tables in parallel
    const tablePromises = tableConfigs.map(async (config) => {
      const result = await checkTableExists(config.name)
      
      if (result.code === 0) {
        setTableStatus(prev => ({ ...prev, [config.name]: result.data || false }))
        return { name: config.name, success: true, code: result.code }
      } else if (result.code === -1) {
        setTableStatus(prev => ({ ...prev, [config.name]: false }))
        return { name: config.name, success: false, code: result.code }
      } else {
        setTableStatus(prev => ({ ...prev, [config.name]: false }))
        return { name: config.name, success: false, code: result.code }
      }
    })

    // Check all functions in parallel
    const functionPromises = functionConfigs.map(async (config) => {
      const exists = await checkFunctionExists(config.name)
      setFunctionManage(prev => ({ ...prev, [config.name]: exists }))
      return { name: config.name, exists }
    })

    // Wait for all checks to complete
    const tableResults = await Promise.all(tablePromises)
    await Promise.all(functionPromises)
    
    // Check if any table had configuration error
    const configError = tableResults.find(r => r.code === -1)
    if (configError) {
      setError('Please configure Supabase connection first in the Backend tab.')
    }
  }

  useEffect(() => {
    checkAllTables()
  }, [])

  return (
    <div className="tables-status">
      <h2>Database Tables & Functions</h2>
      <p className="description">
        Manage database tables and server-side functions. Create/delete operations require running SQL in Supabase SQL Editor.
      </p>

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
          {error.includes('configure Supabase') && (
            <button onClick={checkAllTables} className="retry-btn" style={{ marginLeft: '8px' }}>
              Retry
            </button>
          )}
        </div>
      )}

      <TabsOnTop defaultTab="tables">
        <TabsOnTop.Tab label="Tables">
          <div className="tables-container">
            {tableConfigs.map(config => (
              <TableManage
                key={config.name}
                tableName={config.name}
                description={config.description}
                exists={tableStatus[config.name]}
                createSQL={config.createSQL()}
                onRefresh={checkAllTables}
                onRefreshSingle={() => handleRefreshSingle(config.name)}
                onShowSQL={(sql) => setModalData({ name: config.name, sql })}
              />
            ))}
          </div>
        </TabsOnTop.Tab>

        <TabsOnTop.Tab label="Functions">
          <div className="functions-container">
            {functionConfigs.map(config => (
              <FunctionManage
                key={config.name}
                functionName={config.name}
                description={config.description}
                exists={functionStatus[config.name]}
                createSQL={config.createSQL}
                dropSQL={config.dropSQL}
                onRefreshSingle={() => handleRefreshSingleFunction(config.name)}
                onShowSQL={(sql, dropSQL) => setModalData({ name: config.name, sql, dropSQL })}
              />
            ))}
          </div>
        </TabsOnTop.Tab>
      </TabsOnTop>

      <SQLModal
        isOpen={modalData !== null}
        onClose={() => setModalData(null)}
        title={modalData?.name || ''}
        sql={modalData?.sql || ''}
        dropSQL={modalData?.dropSQL}
      />
    </div>
  )
}

export default TablesStatus

