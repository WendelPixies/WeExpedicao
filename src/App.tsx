import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Kanban from './pages/Kanban';
import OrdersPage from './pages/Orders';
import ImportPage from './pages/Import';
import Settings from './pages/Settings';

function App() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Router>
      <Sidebar collapsed={collapsed} toggleCollapse={() => setCollapsed(!collapsed)} />
      <main className="main-content" style={{ marginLeft: collapsed ? '80px' : '260px', transition: 'margin-left 0.3s ease' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kanban" element={<Kanban />} />
          <Route path="/pedidos" element={<OrdersPage />} />
          <Route path="/importar" element={<ImportPage />} />
          <Route path="/configuracoes" element={<Settings />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
