import React, { useState, useEffect } from 'react'
import { EyeIcon, EyeOffIcon, SpinningCircle } from '@wwf971/react-comp-misc'
import { loadDefaultConfig, testConnection as testSupabaseConnection, initSupabase } from '../backend/supabase'
import './TestConnect.css'

const TestConnect: React.FC = () => {
  const [apiUrl, setApiUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [isButtonDisabled, setIsButtonDisabled] = useState(false)

  // Load default config on mount and auto-test if available
  useEffect(() => {
    const loadConfig = async () => {
      const config = await loadDefaultConfig()
      setApiUrl(config.apiUrl)
      setAnonKey(config.anonKey)
      
      // Auto-test connection if we have config
      if (config.apiUrl && config.anonKey) {
        setStatus('testing')
        setMessage('Testing connection from config file...')
        
        const result = await testSupabaseConnection(config.apiUrl, config.anonKey)
        setStatus(result.code === 0 ? 'success' : 'error')
        setMessage(result.message || '')
        
        // Set up client for use (even if test has warnings)
        if (result.code === 0) {
          initSupabase(config.apiUrl, config.anonKey)
        }
      }
    }
    loadConfig()
  }, [])

  const testConnection = async () => {
    if (!apiUrl.trim() || !anonKey.trim()) {
      setStatus('error')
      setMessage('Please provide both API URL and Anon Key')
      return
    }

    setStatus('testing')
    setMessage('Testing connection...')
    setIsButtonDisabled(true)

    const startTime = Date.now()
    
    // Perform the actual test
    const result = await testSupabaseConnection(apiUrl.trim(), anonKey.trim())
    
    // Calculate remaining time to meet minimum durations
    const elapsed = Date.now() - startTime
    const minSpinnerTime = 150 // 0.15s for spinner
    const minButtonDisableTime = 200 // 0.2s for button
    
    // Wait for minimum spinner time (150ms)
    if (elapsed < minSpinnerTime) {
      await new Promise(resolve => setTimeout(resolve, minSpinnerTime - elapsed))
    }
    
    // Update status
    setStatus(result.code === 0 ? 'success' : 'error')
    setMessage(result.message || '')
    
    // If successful, set up the client for use
    if (result.code === 0) {
      initSupabase(apiUrl.trim(), anonKey.trim())
    }
    
    // Ensure button stays disabled for minimum time (200ms)
    const totalElapsed = Date.now() - startTime
    if (totalElapsed < minButtonDisableTime) {
      setTimeout(() => setIsButtonDisabled(false), minButtonDisableTime - totalElapsed)
    } else {
      setIsButtonDisabled(false)
    }
  }

  return (
    <div className="supabase-config">
      <h2>Supabase Configuration</h2>
      <p className="description">
        Test connection to Supabase project by providing the project URL and Anon Key.
      </p>

      <div className="form-group">
        <label htmlFor="api-url">API URL</label>
        <input
          id="api-url"
          type="text"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="https://your-project.supabase.co"
          className="input-field"
        />
      </div>

      <div className="form-group">
        <label htmlFor="anon-key">Anon Key</label>
        <div className="input-with-icon">
          <input
            id="anon-key"
            type={showPassword ? 'text' : 'password'}
            value={anonKey}
            onChange={(e) => setAnonKey(e.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            className="input-field"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="toggle-password-btn"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
          </button>
        </div>
      </div>

      <div className="button-container">
        <button
          onClick={testConnection}
          disabled={isButtonDisabled}
          className={`test-button ${isButtonDisabled ? 'testing' : ''}`}
        >
          {status === 'testing' ? 'Testing...' : 'Test Connection'}
        </button>
        {status === 'testing' && (
          <span className="spinner-container">
            <SpinningCircle width={18} height={18} color="#007bff" />
          </span>
        )}
      </div>

      {status !== 'idle' && status !== 'testing' && (
        <div className={`status-message ${status}`}>
          <span className="status-icon">
            {status === 'success' && '✓'}
            {status === 'error' && '✗'}
          </span>
          <span className="status-text">{message}</span>
        </div>
      )}

      {status === 'success' && (
        <div className="next-step">
          <p>✓ Connection successful! Next step: Go to the <strong>Database</strong> tab to initialize tables.</p>
        </div>
      )}
    </div>
  )
}

export default TestConnect

