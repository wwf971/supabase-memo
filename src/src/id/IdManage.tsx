import React, { useState, useEffect } from 'react'
import {
  getIds,
  getIdTypes,
  issueId,
  markIdInUse,
  abortId,
  getIdStats,
  IdRecord,
  IdTypeRecord
} from '../backend/id'
import { formatIdInfo } from '../utils/id'
import './IdManage.css'

const IdManage: React.FC = () => {
  const [ids, setIds] = useState<IdRecord[]>([])
  const [idTypes, setIdTypes] = useState<IdTypeRecord[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterState, setFilterState] = useState<number | ''>('')
  const [filterType, setFilterType] = useState<number | ''>('')
  const [page, setPage] = useState(0)
  const pageSize = 20

  // Issue ID
  const [issueTypeCode, setIssueTypeCode] = useState<number>(1)
  const [issuing, setIssuing] = useState(false)

  // Load data
  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Load ID types
      const typesResult = await getIdTypes()
      if (typesResult.code !== 0) {
        setError(typesResult.message || 'Failed to load ID types')
        return
      }
      setIdTypes(typesResult.data || [])

      // Load IDs with filters
      const filters: any = {
        limit: pageSize,
        offset: page * pageSize
      }
      if (filterState !== '') filters.state = filterState
      if (filterType !== '') filters.typeCode = filterType

      const idsResult = await getIds(filters)
      if (idsResult.code !== 0) {
        setError(idsResult.message || 'Failed to load IDs')
        return
      }
      setIds(idsResult.data || [])

      // Load stats
      const statsResult = await getIdStats()
      if (statsResult.code === 0) {
        setStats(statsResult.data)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [page, filterState, filterType])

  const handleIssueId = async () => {
    setIssuing(true)
    const result = await issueId(issueTypeCode)
    setIssuing(false)

    if (result.code === 0) {
      loadData() // Reload data
    } else {
      setError(result.message || 'Failed to issue ID')
    }
  }

  const handleMarkInUse = async (idString: string) => {
    const result = await markIdInUse(idString)
    if (result.code === 0) {
      loadData()
    } else {
      setError(result.message || 'Failed to mark ID as in use')
    }
  }

  const handleAbort = async (idString: string) => {
    const result = await abortId(idString)
    if (result.code === 0) {
      loadData()
    } else {
      setError(result.message || 'Failed to abort ID')
    }
  }

  const getStateName = (state: number) => {
    if (state < 0) return 'Aborted'
    if (state === 0) return 'In Use'
    if (state === 1) return 'Issued'
    return 'Unknown'
  }

  const getTypeName = (typeCode: number) => {
    const type = idTypes.find(t => t.type_code === typeCode)
    return type?.type_name || `Type ${typeCode}`
  }

  if (loading && ids.length === 0) {
    return <div className="id-manage">Loading...</div>
  }

  return (
    <div className="id-manage">
      <h2>ID Management</h2>
      <p className="description">
        Manage universal IDs based on Unix timestamp (microseconds) encoded in base-26 (a-z).
      </p>

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="stats-section">
          <h3>Statistics</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total IDs</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.inUse}</div>
              <div className="stat-label">In Use</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.issued}</div>
              <div className="stat-label">Issued</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.aborted}</div>
              <div className="stat-label">Aborted</div>
            </div>
          </div>
        </div>
      )}

      {/* Issue new ID */}
      <div className="issue-section">
        <h3>Issue New ID</h3>
        <div className="issue-form">
          <select
            value={issueTypeCode}
            onChange={(e) => setIssueTypeCode(Number(e.target.value))}
            className="type-select"
          >
            {idTypes.map(type => (
              <option key={type.type_code} value={type.type_code}>
                {type.type_name} - {type.description}
              </option>
            ))}
          </select>
          <button
            onClick={handleIssueId}
            disabled={issuing}
            className="issue-btn"
          >
            {issuing ? 'Issuing...' : 'Issue ID'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <h3>Filters</h3>
        <div className="filters-form">
          <div className="filter-group">
            <label>State:</label>
            <select
              value={filterState}
              onChange={(e) => {
                setFilterState(e.target.value === '' ? '' : Number(e.target.value))
                setPage(0)
              }}
            >
              <option value="">All</option>
              <option value="-1">Aborted</option>
              <option value="0">In Use</option>
              <option value="1">Issued</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Type:</label>
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value === '' ? '' : Number(e.target.value))
                setPage(0)
              }}
            >
              <option value="">All</option>
              {idTypes.map(type => (
                <option key={type.type_code} value={type.type_code}>
                  {type.type_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ID List */}
      <div className="ids-section">
        <h3>ID Registry ({ids.length} records)</h3>
        <div className="table-container">
          <table className="ids-table">
            <thead>
              <tr>
                <th>ID String</th>
                <th>Readable Time</th>
                <th>State</th>
                <th>Type</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ids.map(id => {
                const info = formatIdInfo(id.id_string)
                return (
                  <tr key={id.id_string}>
                    <td className="mono">{id.id_string}</td>
                    <td className="mono">{info.readable || 'Invalid'}</td>
                    <td>
                      <span className={`state-badge state-${id.state < 0 ? 'aborted' : id.state === 0 ? 'in-use' : 'issued'}`}>
                        {getStateName(id.state)}
                      </span>
                    </td>
                    <td>{getTypeName(id.type_code)}</td>
                    <td>{new Date(id.created_at).toLocaleString()}</td>
                    <td>
                      <div className="action-buttons">
                        {id.state === 1 && (
                          <button
                            onClick={() => handleMarkInUse(id.id_string)}
                            className="btn-small btn-success"
                          >
                            Use
                          </button>
                        )}
                        {id.state >= 0 && (
                          <button
                            onClick={() => handleAbort(id.id_string)}
                            className="btn-small btn-danger"
                          >
                            Abort
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pagination">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="page-btn"
          >
            ← Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={ids.length < pageSize}
            className="page-btn"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}

export default IdManage

