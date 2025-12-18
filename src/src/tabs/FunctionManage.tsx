import React from 'react'
import './FunctionManage.css'

interface FunctionManageProps {
  functionName: string
  description: string
  exists: boolean | null  // null means loading
  createSQL: string
  dropSQL: string
  onRefreshSingle: () => void
  onShowSQL: (sql: string, dropSQL: string) => void
}

const FunctionManage: React.FC<FunctionManageProps> = ({
  functionName,
  description,
  exists,
  createSQL,
  dropSQL,
  onRefreshSingle,
  onShowSQL
}) => {
  return (
    <div className="function-card">
      <div className="function-card-header">
        <div className="function-info">
          <div className="function-name-row">
            <div className="item-type-badge">FUNC</div>
            <div className="function-name-status-group">
              <span className="function-name">{functionName}</span>
              {exists === null ? (
                <span className="function-status loading-status">⟳ Checking...</span>
              ) : (
                <span className={`function-status ${exists ? 'exists' : 'missing'}`}>
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
          <p className="function-description">{description}</p>
        </div>
      </div>

      <div className="function-card-actions">
        {exists === null ? (
          <div className="card-loading">Loading...</div>
        ) : (
          <button 
            onClick={() => onShowSQL(createSQL, dropSQL)}
            className="btn-view-sql"
          >
            View SQL
          </button>
        )}
      </div>
    </div>
  )
}

export default FunctionManage

