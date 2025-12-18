// @ts-nocheck
import React from 'react'
import './Header.css'

interface HeaderAction {
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

interface HeaderProps {
  title: string
  badge?: string
  actions?: HeaderAction[]
}

/**
 * Header - Unified header component for content/segment views
 */
const Header: React.FC<HeaderProps> = ({ title, badge, actions }) => {
  return (
    <div className="view-header">
      <div className="view-header-title">
        {title || '(unnamed)'}
      </div>
      <div className="view-header-meta">
        {badge && <span className="view-header-badge">{badge}</span>}
        {actions && actions.map((action, idx) => (
          <button
            key={idx}
            className="view-header-button"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.loading ? 'Loading...' : action.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default Header

