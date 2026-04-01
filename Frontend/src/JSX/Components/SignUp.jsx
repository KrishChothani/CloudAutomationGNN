import { useState, useContext } from 'react'
import { Link } from 'react-router-dom'
import AuthContext from '../Contexts/AuthContext.js'
import { MdEmail, MdLock, MdPerson, MdVisibility, MdVisibilityOff } from 'react-icons/md'

export default function SignUp() {
  const { register, isLoading } = useContext(AuthContext)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await register(fullName, email, password)
    } catch {
      // toast handled in context
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" id="signup-form">
      {/* Full Name */}
      <div className="relative">
        <MdPerson size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          id="signup-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          required
          className="input-field pl-11"
          autoComplete="name"
        />
      </div>

      {/* Email */}
      <div className="relative">
        <MdEmail size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          required
          className="input-field pl-11"
          autoComplete="email"
        />
      </div>

      {/* Password */}
      <div className="relative">
        <MdLock size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          id="signup-password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 8 chars)"
          required
          minLength={8}
          className="input-field pl-11 pr-11"
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-muted)' }}
        >
          {showPassword ? <MdVisibilityOff size={16} /> : <MdVisibility size={16} />}
        </button>
      </div>

      {/* Submit */}
      <button
        id="signup-submit"
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full mt-1 flex items-center justify-center gap-2 relative z-10"
        style={{ minHeight: '48px' }}
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating account…
          </>
        ) : (
          'Create Account'
        )}
      </button>

      <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent-indigo)' }}>
          Sign in
        </Link>
      </p>
    </form>
  )
}
