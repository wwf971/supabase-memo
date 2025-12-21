import React from 'react'
import './FunctionManage.css'

interface FunctionManageProps {
  functionName: string
  description: string
  exists: boolean | null | 'no-checker'  // null = loading, true = exists, false = missing, 'no-checker' = check function doesn't exist
  createSQL: string
  dropSQL: string
  isUtility?: boolean  // Special badge for utility functions
  onRefreshSingle: () => void
  onShowSQL: (sql: string, dropSQL: string) => void
}

const FunctionManage: React.FC<FunctionManageProps> = ({
  functionName,
  description,
  exists,
  createSQL,
  dropSQL,
  isUtility = false,
  onRefreshSingle,
  onShowSQL
}) => {
  return (
    <div className="function-card">
      <div className="function-card-header">
        <div className="function-info">
          <div className="function-name-row">
            <div className="item-type-badge">FUNC</div>
            {isUtility && <div className="utility-badge" title="Utility function used to check other functions">CHECK FUNCTION</div>}
            <div className="function-name-status-group">
              <span className="function-name">{functionName}</span>
              {exists === null ? (
                <span className="function-status loading-status">⟳ Checking...</span>
              ) : exists === 'no-checker' ? (
                <span className="function-status no-checker-status" title="The check_function_exists utility function is missing. Create it first to check other functions.">
                  ⓘ Missing Check Function
                </span>
              ) : (
                <span className={`function-status ${exists ? 'exists' : 'missing'}`}>
                  {exists ? '✓ Exists' : '✗ Missing'}
                </span>
              )}
              {(exists === false || exists === true || exists === 'no-checker') && (
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

