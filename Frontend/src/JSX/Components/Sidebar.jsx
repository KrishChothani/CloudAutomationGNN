import { useContext, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import AuthContext from '../Contexts/AuthContext.js'
import {
  MdDashboard,
  MdNotificationsActive,
  MdAccountTree,
  MdHistory,
  MdLogout,
  MdCloud,
  MdChevronLeft,
  MdChevronRight,
  MdPerson,
} from 'react-icons/md'

const navItems = [
  { to: '/dashboard', icon: MdDashboard, label: 'Dashboard' },
  { to: '/alerts', icon: MdNotificationsActive, label: 'Alerts' },
]

export default function Sidebar() {
  const { user, logout } = useContext(AuthContext)
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  return (
    <aside
      className="flex flex-col border-r transition-all duration-300 relative"
      style={{
        width: collapsed ? '72px' : '240px',
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-subtle)',
        minHeight: '100vh',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 12px rgba(99,102,241,0.5)' }}
        >
          <MdCloud size={18} color="#fff" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>CloudGNN</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>AIOps Platform</p>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-14 w-6 h-6 rounded-full flex items-center justify-center border z-10 transition-all duration-200 hover:scale-110"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-glow)',
          color: 'var(--accent-indigo)',
        }}
      >
        {collapsed ? <MdChevronRight size={14} /> : <MdChevronLeft size={14} />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''} ${collapsed ? 'justify-center' : ''}`
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={20} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User Section */}
      <div className="px-3 pb-4 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
        {/* User Info */}
        {!collapsed && user && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(99,102,241,0.08)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
              <MdPerson size={16} color="#fff" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {user?.fullName || 'User'}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {user?.email || ''}
              </p>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className={`sidebar-link w-full text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? 'Logout' : undefined}
        >
          <MdLogout size={20} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
