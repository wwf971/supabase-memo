// @ts-nocheck - React 19 type compatibility issue with FC components
import MasterDetail from '@wwf971/react-comp-misc/src/layout/MasterDetail'
import TestConnect from './tabs/TestConnect'
import TablesStatus from './tabs/TablesStatus'
import TestPythonServer from './tabs/TestPythonServer'
import IdManage from './id/IdManage'
import PathManage from './path/PathManage'

function App() {
  return (
    <MasterDetail title="Info Service" sidebarWidth="180px">
      <MasterDetail.Tab label="Backend">
        <MasterDetail.SubTab label="Supabase" isDefault>
          <TestConnect />
        </MasterDetail.SubTab>
        <MasterDetail.SubTab label="Database">
          <TablesStatus />
        </MasterDetail.SubTab>
        <MasterDetail.SubTab label="Python Server">
          <TestPythonServer />
        </MasterDetail.SubTab>
        <MasterDetail.SubTab label="ID Manage">
          <IdManage />
        </MasterDetail.SubTab>
      </MasterDetail.Tab>
      
      <MasterDetail.Tab label="Info">
        <MasterDetail.SubTab label="Path">
          <PathManage />
        </MasterDetail.SubTab>
      </MasterDetail.Tab>
    </MasterDetail>
  )
}

export default App
