import React, { useState } from 'react'
import './TableManage.css'

interface TableManageProps {
  tableName: string
  description: string
  exists: boolean | null  // null means loading
  createSQL: string
  onRefresh: () => void
  onRefreshSingle: () => void
  onShowSQL?: (sql: string) => void
}

const TableManage: React.FC<TableManageProps> = ({
  tableName,
  description,
  exists,
  createSQL,
  onRefreshSingle,
  onShowSQL
}) => {
  const [showCreateSQL, setShowCreateSQL] = useState(false)
  const [showDeleteSQL, setShowDeleteSQL] = useState(false)
  const [showEmptySQL, setShowEmptySQL] = useState(false)
  const [copiedSQL, setCopiedSQL] = useState(false)

  const toggleCreateSQL = () => {
    setShowCreateSQL(!showCreateSQL)
  }

  const toggleDeleteSQL = () => {
    setShowDeleteSQL(!showDeleteSQL)
  }

  const toggleEmptySQL = () => {
    setShowEmptySQL(!showEmptySQL)
  }

  const handleCopySQL = (sql: string) => {
    navigator.clipboard.writeText(sql)
    setCopiedSQL(true)
    setTimeout(() => setCopiedSQL(false), 2000)
  }

  const getDeleteSQL = () => {
    return `DROP TABLE IF EXISTS ${tableName} CASCADE;`
  }

  const getEmptySQL = () => {
    return `TRUNCATE TABLE ${tableName} CASCADE;`
  }

  return (
    <div className="table-card">
      <div className="table-card-header">
        <div className="table-info">
          <div className="table-name-row">
            <div className="item-type-badge">TABLE</div>
            <div className="table-name-status-group">
              <span className="table-name">{tableName}</span>
              {exists === null ? (
                <span className="table-status loading-status">⟳ Checking...</span>
              ) : (
                <span className={`table-status ${exists ? 'exists' : 'missing'}`}>
                  {exists ? '✓ Exists' : '✗ Missing'}
                </span>
              )}
              {(exists === false || exists === true) && (
                <button onClick={onRefreshSingle} className="btn-recheck">
                  ↻ Re-check
                </button>
              )}
            </div>
          </div>
          <p className="table-description">{description}</p>
        </div>
      </div>

      <div className="table-card-actions">
        {exists === null ? (
          // Loading state
          <div className="card-loading">Loading...</div>
        ) : onShowSQL ? (
          // Use modal for SQL display
          <button onClick={() => onShowSQL(createSQL)} className="btn-view-sql">
            View SQL
          </button>
        ) : exists === false ? (
          // Table missing - show "How to create" button
          <button onClick={toggleCreateSQL} className="btn-how-to-create">
            {showCreateSQL ? 'Hide SQL' : 'How to Create'}
          </button>
        ) : (
          // Table exists - show "How to empty" and "How to delete" buttons
          <>
            <button onClick={toggleEmptySQL} className="btn-how-to-empty">
              {showEmptySQL ? 'Hide SQL' : 'How to Empty'}
            </button>
            <button onClick={toggleDeleteSQL} className="btn-how-to-delete">
              {showDeleteSQL ? 'Hide SQL' : 'How to Delete'}
            </button>
          </>
        )}
      </div>

      {showCreateSQL && exists === false && (
        <div className="sql-display">
          <div className="sql-header">
            <span>Run this SQL in Supabase SQL Editor:</span>
            <div className="sql-actions">
              <button onClick={() => handleCopySQL(createSQL)} className="btn-copy-small">
                {copiedSQL ? '✓ Copied' : 'Copy SQL'}
              </button>
            </div>
          </div>
          <pre className="sql-code-small">{createSQL}</pre>
        </div>
      )}

      {showEmptySQL && exists === true && (
        <div className="sql-display">
          <div className="sql-header">
            <span>Run this SQL in Supabase SQL Editor:</span>
            <div className="sql-actions">
              <button onClick={() => handleCopySQL(getEmptySQL())} className="btn-copy-small">
                {copiedSQL ? '✓ Copied' : 'Copy SQL'}
              </button>
            </div>
          </div>
          <pre className="sql-code-small">{getEmptySQL()}</pre>
        </div>
      )}

      {showDeleteSQL && exists === true && (
        <div className="sql-display">
          <div className="sql-header">
            <span>Run this SQL in Supabase SQL Editor:</span>
            <div className="sql-actions">
              <button onClick={() => handleCopySQL(getDeleteSQL())} className="btn-copy-small">
                {copiedSQL ? '✓ Copied' : 'Copy SQL'}
              </button>
            </div>
          </div>
          <pre className="sql-code-small">{getDeleteSQL()}</pre>
        </div>
      )}

    </div>
  )
}

export default TableManage

