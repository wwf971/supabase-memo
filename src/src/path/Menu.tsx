import React from 'react'
import './Menu.css'

export interface MenuItem {
  label: string
  onClick: () => void
}

interface MenuProps {
  items: MenuItem[]
  position: { x: number; y: number }
  onClose: () => void
}

/**
 * Context menu component
 */
const Menu: React.FC<MenuProps> = ({ items, position, onClose }) => {
  return (
    <>
      {/* Backdrop to close menu when clicking outside */}
      <div className="menu-backdrop" onClick={onClose} />
      
      {/* Menu */}
      <div 
        className="context-menu" 
        style={{ left: position.x, top: position.y }}
      >
        {items.map((item, index) => (
          <div
            key={index}
            className="context-menu-item"
            onClick={item.onClick}
          >
            {item.label}
          </div>
        ))}
      </div>
    </>
  )
}

export default Menu

