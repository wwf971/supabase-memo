import React, { useState, useEffect } from 'react'
import {
  createUpdateFunction,
  createId09aeTable,
  createIdTypeTable,
  createPathSegmentTable,
  createPathSegmentRelationTypeTable,
  createPathSegmentRelationTable
} from '../backend/coreSql'
import {
  createContentTypeTable,
  createContentTable,
  createContentBinaryTable
} from '../backend/contentSql'
import TableManage from './TableManage'
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
    createSQL: () => `${createUpdateFunction()}\n\n${createPathSegmentTable()}`
  },
  {
    name: 'segment_relation_type',
    description: 'Segment relation type mappings (0=direct parent/child, 1=indirect)',
    createSQL: () => createPathSegmentRelationTypeTable()
  },
  {
    name: 'segment_relation',
    description: 'Many-to-many relationships between path segments and content',
    createSQL: () => createPathSegmentRelationTable()
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

const TablesStatus: React.FC = () => {
  const [tableStatus, setTableStatus] = useState<Record<string, boolean | null>>(
    Object.fromEntries(tableConfigs.map(config => [config.name, null]))
  )
  const [error, setError] = useState<string | null>(null)

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

  const checkAllTables = async () => {
    setError(null)
    // Reset to loading state
    setTableStatus(Object.fromEntries(tableConfigs.map(config => [config.name, null])))
    
    // Check each table individually and update immediately
    const { checkTableExists } = await import('../backend/dbInit')
    
    for (const config of tableConfigs) {
      const result = await checkTableExists(config.name)
      
      if (result.code === 0) {
        setTableStatus(prev => ({ ...prev, [config.name]: result.data || false }))
      } else if (result.code === -1) {
        setError('Please configure Supabase connection first in the Backend tab.')
        setTableStatus(prev => ({ ...prev, [config.name]: false }))
        break // Stop checking if not configured
      } else {
        setTableStatus(prev => ({ ...prev, [config.name]: false }))
      }
    }
  }

  useEffect(() => {
    checkAllTables()
  }, [])

  return (
    <div className="tables-status">
      <h2>Database Tables</h2>
      <p className="description">
        Manage database tables for the Info Service. Create/delete operations require running SQL in Supabase SQL Editor.
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
          />
        ))}
      </div>
    </div>
  )
}

export default TablesStatus

