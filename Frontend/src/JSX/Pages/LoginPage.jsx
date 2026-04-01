import { Link } from 'react-router-dom'
import Login from '../Components/Login.jsx'
import { MdCloud } from 'react-icons/md'

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--bg-primary)', backgroundImage: 'var(--gradient-mesh)' }}
    >
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12"
           style={{ background: 'rgba(99,102,241,0.06)', borderRight: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)' }}>
            <MdCloud size={20} color="#818cf8" />
          </div>
          <span className="font-black text-xl" style={{ color: 'var(--text-primary)' }}>
            Cloud<span style={{ color: '#818cf8' }}>GNN</span>
          </span>
        </div>

        <div>
          <h2 className="text-4xl font-black leading-tight mb-4" style={{ color: 'var(--text-primary)' }}>
            Your infrastructure,<br />
            <span style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              always healthy.
            </span>
          </h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.75', fontSize: '14px' }}>
            Sign in to view your real-time cloud graph, active anomaly alerts, and automated remediation timeline.
          </p>
        </div>

        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          © 2025 CloudAutomationGNN
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Login />
          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold" style={{ color: '#818cf8' }}>
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
