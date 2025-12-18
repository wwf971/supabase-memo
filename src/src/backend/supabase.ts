import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Supabase configuration and client
let supabaseClient: SupabaseClient | null = null
let currentConfig = {
  apiUrl: '',
  anonKey: ''
}

// Try to load default config
export const loadDefaultConfig = async () => {
  try {
    // @ts-ignore - config.0.js is optional and git-ignored
    const configModule = await import('../../../config.0.js')
    if (configModule.supabase_config) {
      return {
        apiUrl: configModule.supabase_config.project_url || '',
        anonKey: configModule.supabase_config.anon_key || ''
      }
    }
  } catch (e) {
    // Config file doesn't exist
  }
  return { apiUrl: '', anonKey: '' }
}

// Set up Supabase client (doesn't establish connection, just stores config)
export const initSupabase = (apiUrl: string, anonKey: string) => {
  // Only recreate if config changed
  if (supabaseClient && currentConfig.apiUrl === apiUrl && currentConfig.anonKey === anonKey) {
    return supabaseClient
  }
  
  currentConfig = { apiUrl, anonKey }
  supabaseClient = createClient(apiUrl, anonKey)
  // Note: no active connection is created, just a client object
  return supabaseClient
}

// Get current Supabase client
// Auto-initializes from config if not already set up
export const getSupabaseClient = () => {
  if (!supabaseClient) {
    // Try to auto-initialize from stored config
    if (currentConfig.apiUrl && currentConfig.anonKey) {
      console.log('[Supabase] Auto-initializing client from stored config')
      supabaseClient = createClient(currentConfig.apiUrl, currentConfig.anonKey)
    } else {
      console.error('❌ Supabase client not initialized and no config available')
      throw new Error('Supabase not configured. Please set up connection first.')
    }
  }
  return supabaseClient
}

// Test Supabase connection by making an actual API call
// This validates that the URL and credentials are correct
// Returns: { code: 0 (success) | <0 (error), message?, data? }
export const testConnection = async (apiUrl: string, anonKey: string) => {
  try {
    const testClient = createClient(apiUrl, anonKey)
    
    // Try to make a simple REST API call to verify connection
    // We use the REST endpoint to check if we can reach the server
    const { error } = await testClient.from('_').select('*').limit(0)
    
    // Connection itself works if we get a response (even an error response)
    if (error) {
      // Check for auth/credential errors - these mean connection works but creds are bad
      if (error.message.includes('JWT') || error.message.includes('apikey') || error.message.includes('Invalid API')) {
        return { code: -1, message: 'Invalid API key or credentials' }
      }
      // Network errors mean we can't reach the server
      else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('fetch')) {
        return { code: -2, message: 'Network error: Cannot reach Supabase server. Check API URL.' }
      }
      // Any other error means connection succeeded (we got a response from server)
      else {
        return { code: 0, message: 'Connection successful! Server is reachable.' }
      }
    }
    
    return { code: 0, message: 'Connection successful! Credentials are valid.' }
  } catch (err: any) {
    // Catch network errors
    if (err.message && (err.message.includes('fetch') || err.message.includes('network'))) {
      return { code: -2, message: 'Network error: Cannot reach server. Check API URL.' }
    }
    return { code: -5, message: `Connection failed: ${err.message || 'Unknown error'}` }
  }
}

// Get current config
export const getCurrentConfig = () => currentConfig

