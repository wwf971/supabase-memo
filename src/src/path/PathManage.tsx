// @ts-nocheck
import React, { useState } from 'react'
import TabsOnTop from '@wwf971/react-comp-misc/src/layout/tab/TabsOnTop'
import PathTab, { PathTabData } from './PathTab'
import './PathManage.css'

/**
 * Generate random ID string using 0-9, a-e
 */
const generateRandomId = (): string => {
  const chars = '0123456789abcde'
  let result = ''
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

const PathManage: React.FC = () => {
  const [tabs, setTabs] = useState<PathTabData[]>([
    {
      tabId: generateRandomId(),
      tabLabel: 'All segment/content',
      currentPath: [],
      history: [[]],  // Start with root path in history
      historyPointer: 0,
      canNaviBack: false,
      canNaviForward: false
    }
  ])
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].tabId)

  /**
   * Handle tab data change
   */
  const handleTabDataChange = (updatedData: PathTabData) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.tabId === updatedData.tabId ? updatedData : tab
      )
    )
  }

  /**
   * Handle tab close
   */
  const handleTabClose = (tabKey: string) => {
    // Extract tab index from key (e.g., "tab-1" -> 0)
    const tabIndex = parseInt(tabKey.split('-')[1]) - 1
    
    // Don't close if it's the last tab
    if (tabs.length === 1) {
      return
    }

    const newTabs = tabs.filter((_, idx) => idx !== tabIndex)
    setTabs(newTabs)

    // If closing active tab, switch to first tab
    if (tabs[tabIndex].tabId === activeTabId && newTabs.length > 0) {
      setActiveTabId(newTabs[0].tabId)
    }
  }

  /**
   * Handle tab create
   */
  const handleTabCreate = () => {
    const newTab: PathTabData = {
      tabId: generateRandomId(),
      tabLabel: 'All segment/content',
      currentPath: [],
      history: [[]],
      historyPointer: 0,
      canNaviBack: false,
      canNaviForward: false
    }
    setTabs([...tabs, newTab])
    setActiveTabId(newTab.tabId)
  }

  const handleNavi = (tabId: string, newPath: string[], newLabel?: string) => {
    console.log(`[PathManage] handleNavi called - tabId: ${tabId}, newPath:`, newPath, 'label:', newLabel)
    
    setTabs(tabs.map(tab => {
      if (tab.tabId !== tabId) return tab
      
      console.log(`[PathManage] Updating tab - old currentPath:`, tab.currentPath, '-> new currentPath:', newPath)
      
      // If navigating from middle of history, discard forward history
      const newHistory = [...tab.history.slice(0, tab.historyPointer + 1), newPath]
      const newPointer = newHistory.length - 1
      
      // Determine tab label
      let tabLabel = tab.tabLabel
      if (newLabel) {
        tabLabel = newLabel
      } else if (newPath.length === 0) {
        tabLabel = 'All segment/content'
      }
      
      const updatedTab = {
        ...tab,
        tabLabel,
        currentPath: newPath,
        history: newHistory,
        historyPointer: newPointer,
        canNaviBack: newPointer > 0,
        canNaviForward: false
      }
      
      console.log(`[PathManage] Updated tab currentPath:`, updatedTab.currentPath)
      return updatedTab
    }))
  }

  const handleNaviBack = (tabId: string) => {
    setTabs(tabs.map(tab => {
      if (tab.tabId !== tabId || !tab.canNaviBack) return tab
      
      const newPointer = tab.historyPointer - 1
      const newPath = tab.history[newPointer]
      
      return {
        ...tab,
        currentPath: newPath,
        historyPointer: newPointer,
        canNaviBack: newPointer > 0,
        canNaviForward: true
      }
    }))
  }

  const handleNaviForward = (tabId: string) => {
    setTabs(tabs.map(tab => {
      if (tab.tabId !== tabId || !tab.canNaviForward) return tab
      
      const newPointer = tab.historyPointer + 1
      const newPath = tab.history[newPointer]
      
      return {
        ...tab,
        currentPath: newPath,
        historyPointer: newPointer,
        canNaviBack: true,
        canNaviForward: newPointer < tab.history.length - 1
      }
    }))
  }

  return (
    <div className="path-manage">
      <TabsOnTop
        allowCloseTab={true}
        onTabClose={handleTabClose}
        allowTabCreate={true}
        onTabCreate={handleTabCreate}
      >
        {tabs.map(tab => (
          <TabsOnTop.Tab key={tab.tabId} label={tab.tabLabel}>
            <PathTab
              data={tab}
              onDataChange={handleTabDataChange}
              onNavi={(path, label) => handleNavi(tab.tabId, path, label)}
              onNaviBack={() => handleNaviBack(tab.tabId)}
              onNaviForward={() => handleNaviForward(tab.tabId)}
            />
          </TabsOnTop.Tab>
        ))}
      </TabsOnTop>
    </div>
  )
}

export default PathManage

