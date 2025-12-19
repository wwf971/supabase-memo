import React, { useState } from 'react'
// @ts-ignore
import { SpinningCircle } from '../../../../react-comp-misc/src/icon/Icon'
import './TestPythonServer.css'

interface RequestLog {
  timestamp: string
  method: 'GET' | 'POST'
  url: string
  status: number | null
  response: string
  contentType?: string // Store Content-Type header
  isImage?: boolean // Flag for image responses
  error?: string
}

const TestPythonServer: React.FC = () => {
  const [serverHost, setServerHost] = useState('http://localhost')
  const [serverPort, setServerPort] = useState('18100')
  const [getToken, setGetToken] = useState('example_token')
  const [postToken, setPostToken] = useState('example_post_token')
  const [path, setPath] = useState('/')
  const [postData, setPostData] = useState('{\n  "test": "data"\n}')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null)

  const serverUrl = `${serverHost}:${serverPort}`

  const addLog = (log: RequestLog) => {
    setLogs(prev => [log, ...prev])
    setSelectedLogIndex(0)
  }

  const sendGetRequest = async () => {
    setLoading(true)
    const timestamp = new Date().toLocaleTimeString()
    const url = `${serverUrl}${path}?token=${getToken}`

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const contentType = response.headers.get('Content-Type') || ''
      const isImage = contentType.startsWith('image/')
      
      let data: string
      if (isImage) {
        // For images, convert to blob URL
        const blob = await response.blob()
        data = URL.createObjectURL(blob)
      } else {
        data = await response.text()
      }
      
      addLog({
        timestamp,
        method: 'GET',
        url,
        status: response.status,
        response: data,
        contentType,
        isImage,
      })
    } catch (error: any) {
      addLog({
        timestamp,
        method: 'GET',
        url,
        status: null,
        response: '',
        error: error.message || 'Network error',
      })
    } finally {
      setLoading(false)
    }
  }

  const sendPostRequest = async () => {
    setLoading(true)
    const timestamp = new Date().toLocaleTimeString()
    const url = `${serverUrl}/api/test?token=${postToken}`

    try {
      let parsedData: any
      try {
        parsedData = JSON.parse(postData)
      } catch {
        throw new Error('Invalid JSON in POST data')
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parsedData),
      })

      const data = await response.text()
      
      addLog({
        timestamp,
        method: 'POST',
        url,
        status: response.status,
        response: data,
      })
    } catch (error: any) {
      addLog({
        timestamp,
        method: 'POST',
        url,
        status: null,
        response: '',
        error: error.message || 'Network error',
      })
    } finally {
      setLoading(false)
    }
  }

  const clearLogs = () => {
    setLogs([])
    setSelectedLogIndex(null)
  }

  const formatResponse = (response: string) => {
    try {
      const parsed = JSON.parse(response)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return response
    }
  }

  const isImageResponse = (log: RequestLog) => {
    // Check if it's flagged as image or is base64 image data
    if (log.isImage) {
      return true
    }
    if (log.response && log.response.startsWith('data:image/')) {
      return true
    }
    return false
  }

  const selectedLog = selectedLogIndex !== null ? logs[selectedLogIndex] : null

  return (
    <div className="test-python-server">
      <h2>Test Python Server</h2>
      <p className="description">
        Send GET/POST requests to the Python Flask server with token authentication.
      </p>

      <div className="config-section">
        <h3>Server Configuration</h3>
        
        <div className="form-row">
          <div className="form-group flex-2">
            <label htmlFor="server-host">Server Host</label>
            <input
              id="server-host"
              type="text"
              value={serverHost}
              onChange={(e) => setServerHost(e.target.value)}
              placeholder="http://localhost"
              className="input-field"
            />
          </div>
          <div className="form-group flex-1">
            <label htmlFor="server-port">Port</label>
            <input
              id="server-port"
              type="text"
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              placeholder="18100"
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="request-section">
        <h3>GET Request</h3>
        <div className="form-row">
          <div className="form-group flex-2">
            <label htmlFor="path">Path</label>
            <input
              id="path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/xxx/yy/"
              className="input-field"
            />
          </div>
          <div className="form-group flex-1">
            <label htmlFor="get-token">Token</label>
            <input
              id="get-token"
              type="text"
              value={getToken}
              onChange={(e) => setGetToken(e.target.value)}
              placeholder="example_token"
              className="input-field"
            />
          </div>
          <div className="button-wrapper">
            <button
              onClick={sendGetRequest}
              disabled={loading}
              className="action-button primary"
            >
              {loading ? 'Sending...' : 'Send GET'}
            </button>
            {loading && (
              <span className="spinner-inline">
                <SpinningCircle width={16} height={16} color="#007bff" />
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="request-section">
        <h3>POST Request</h3>
        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="post-token">Token</label>
            <input
              id="post-token"
              type="text"
              value={postToken}
              onChange={(e) => setPostToken(e.target.value)}
              placeholder="example_post_token"
              className="input-field"
            />
          </div>
          <div className="button-wrapper">
            <button
              onClick={sendPostRequest}
              disabled={loading}
              className="action-button primary"
            >
              {loading ? 'Sending...' : 'Send POST'}
            </button>
            {loading && (
              <span className="spinner-inline">
                <SpinningCircle width={16} height={16} color="#007bff" />
              </span>
            )}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="post-data">JSON Data</label>
          <textarea
            id="post-data"
            value={postData}
            onChange={(e) => setPostData(e.target.value)}
            placeholder='{"key": "value"}'
            className="input-field textarea-field"
            rows={6}
          />
        </div>
      </div>

      <div className="logs-section">
        <div className="logs-header">
          <h3>Request History</h3>
          <button onClick={clearLogs} className="action-button secondary small">
            Clear Logs
          </button>
        </div>

        <div className="logs-container">
          <div className="logs-list">
            {logs.length === 0 ? (
              <div className="empty-state">No requests yet</div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`log-item ${selectedLogIndex === index ? 'selected' : ''} ${log.error ? 'error' : ''}`}
                  onClick={() => setSelectedLogIndex(index)}
                >
                  <div className="log-header">
                    <span className={`log-method ${log.method.toLowerCase()}`}>
                      {log.method}
                    </span>
                    <span className="log-timestamp">{log.timestamp}</span>
                    {log.status !== null && (
                      <span className={`log-status status-${Math.floor(log.status / 100)}`}>
                        {log.status}
                      </span>
                    )}
                    {log.error && <span className="log-status error">ERROR</span>}
                  </div>
                  <div className="log-url">{log.url}</div>
                </div>
              ))
            )}
          </div>

          <div className="log-detail">
            {selectedLog ? (
              <div className="log-detail-content">
                <div className="detail-section">
                  <h4>Request</h4>
                  <div className="detail-info">
                    <div><strong>Method:</strong> {selectedLog.method}</div>
                    <div><strong>URL:</strong> {selectedLog.url}</div>
                    <div><strong>Time:</strong> {selectedLog.timestamp}</div>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>Response</h4>
                  {selectedLog.error ? (
                    <div className="error-message">
                      <strong>Error:</strong> {selectedLog.error}
                    </div>
                  ) : (
                    <>
                      <div className="detail-info">
                        <div><strong>Status:</strong> {selectedLog.status}</div>
                        {selectedLog.contentType && (
                          <div><strong>Content-Type:</strong> {selectedLog.contentType}</div>
                        )}
                      </div>
                      {isImageResponse(selectedLog) ? (
                        <div className="response-image">
                          <img src={selectedLog.response} alt="Response" style={{ maxWidth: '100%', height: 'auto' }} />
                        </div>
                      ) : (
                        <div className="response-body">
                          <pre>{formatResponse(selectedLog.response)}</pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">Select a request to view details</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TestPythonServer

