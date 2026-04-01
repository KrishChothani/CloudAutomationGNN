import { Link } from 'react-router-dom'
import {
  MdCloud, MdBubbleChart, MdAutoFixHigh, MdShield,
  MdArrowForward, MdCheckCircle,
} from 'react-icons/md'

const FEATURES = [
  {
    icon:  MdBubbleChart,
    color: '#6366f1',
    title: 'GNN Anomaly Detection',
    desc:  'GraphSAGE neural network analyses your full infrastructure topology — catching multi-node cascades that threshold alerts miss.',
  },
  {
    icon:  MdAutoFixHigh,
    color: '#10b981',
    title: 'Automated Remediation',
    desc:  'EventBridge triggers intelligent playbooks — auto-scaling, failover, and Lambda redeployment — before your on-call engineer even wakes up.',
  },
  {
    icon:  MdCloud,
    color: '#06b6d4',
    title: 'Explainable AI (XAI)',
    desc:  'Every anomaly comes with SHAP feature attributions, cascade path visualisation, and a plain-English explanation you can share.',
  },
  {
    icon:  MdShield,
    color: '#f97316',
    title: 'Serverless at Scale',
    desc:  'Deployed on AWS Lambda + API Gateway — scales to thousands of metrics per second with zero cold-start impact.',
  },
]

const STATS = [
  { value: '15+', label: 'Cloud Resource Types' },
  { value: '<2s', label: 'Detection Latency' },
  { value: '97%', label: 'F1 Anomaly Score' },
  { value: '10×', label: 'Faster Than PagerDuty' },
]

export default function LandingPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg-primary)', backgroundImage: 'var(--gradient-mesh)' }}
    >
      {/* ── Navbar ── */}
      <nav className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)' }}>
            <MdCloud size={18} color="#818cf8" />
          </div>
          <span className="font-black text-lg" style={{ color: 'var(--text-primary)' }}>
            Cloud<span style={{ color: '#818cf8' }}>GNN</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}>
            Sign In
          </Link>
          <Link to="/signup"
            className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-8"
             style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          Powered by PyTorch Geometric + AWS Serverless
        </div>

        <h1 className="text-5xl md:text-7xl font-black mb-6 leading-none"
            style={{ color: 'var(--text-primary)' }}>
          Cloud Anomaly<br />
          <span style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Before It Hurts
          </span>
        </h1>

        <p className="text-lg max-w-xl mb-10 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Graph Neural Networks that understand your entire AWS infrastructure topology — detecting cascades, explaining anomalies, and auto-remediating 24/7.
        </p>

        <div className="flex items-center gap-4 flex-wrap justify-center">
          <Link to="/signup"
            className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold">
            Start Monitoring <MdArrowForward size={16} />
          </Link>
          <Link to="/login"
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all hover:bg-white/5"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            View Demo
          </Link>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 w-full max-w-3xl">
          {STATS.map(({ value, label }) => (
            <div key={label} className="glass-card p-4 text-center">
              <p className="text-3xl font-black mb-1"
                 style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {value}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="px-8 py-20 max-w-6xl mx-auto w-full">
        <p className="text-center text-xs font-bold uppercase tracking-widest mb-10"
           style={{ color: 'var(--text-muted)' }}>Capabilities</p>
        <div className="grid md:grid-cols-2 gap-5">
          {FEATURES.map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="glass-card p-6 flex gap-4 group hover:scale-[1.01] transition-transform">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                   style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                <Icon size={22} style={{ color }} />
              </div>
              <div>
                <p className="font-bold text-sm mb-1.5" style={{ color: 'var(--text-primary)' }}>{title}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="text-center px-8 py-20">
        <div className="glass-card max-w-2xl mx-auto p-10">
          <h2 className="text-3xl font-black mb-4" style={{ color: 'var(--text-primary)' }}>
            Ready to eliminate outages?
          </h2>
          <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
            Free to get started · No credit card required · Deploys in under 10 minutes
          </p>
          <Link to="/signup" className="btn-primary inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold">
            Create free account <MdArrowForward size={16} />
          </Link>
        </div>
      </section>

      <footer className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        © 2025 CloudAutomationGNN · Built with React 19 + PyTorch Geometric + AWS
      </footer>
    </div>
  )
}
