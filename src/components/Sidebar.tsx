import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Kanban,
    ListOrdered,
    Settings,
    Package,
    ChevronLeft,
    Menu,
    FileUp,
    RotateCcw,
    DollarSign
} from 'lucide-react';

interface SidebarProps {
    collapsed: boolean;
    toggleCollapse: () => void;
}

export default function Sidebar({ collapsed, toggleCollapse }: SidebarProps) {
    const links = [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/kanban', icon: Kanban, label: 'Kanban' },
        { to: '/pedidos', icon: ListOrdered, label: 'Pedidos' },
        { to: '/devolucao', icon: RotateCcw, label: 'Devolução' },
        { to: '/importar', icon: FileUp, label: 'Importar' },
        { to: '/custos', icon: DollarSign, label: 'Custos' },
        { to: '/configuracoes', icon: Settings, label: 'Configurações' },
    ];

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="logo">
                <Package size={28} style={{ minWidth: '28px' }} />
                {!collapsed && <span>WeExpedição</span>}
            </div>

            <button onClick={toggleCollapse} className="collapse-btn">
                {collapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
            </button>

            <nav style={{ flex: 1 }}>
                <ul className="nav-links">
                    {links.map((link) => (
                        <li key={link.to}>
                            <NavLink
                                to={link.to}
                                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                                title={collapsed ? link.label : ''}
                            >
                                <link.icon size={20} style={{ minWidth: '20px' }} />
                                {!collapsed && <span>{link.label}</span>}
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </nav>
        </aside>
    );
}
