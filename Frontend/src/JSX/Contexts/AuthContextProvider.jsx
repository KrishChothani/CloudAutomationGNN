import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import AuthContext from './AuthContext.js'
import apiClient from '../../services/apiClient.js'

export function AuthContextProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        setIsLoading(false)
        return
      }
      try {
        const response = await apiClient.get('/users/me')
        setUser(response.data?.data?.user || null)
      } catch {
        localStorage.removeItem('accessToken')
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    restoreSession()
  }, [])

  const login = useCallback(async (email, password) => {
    setIsLoading(true)
    try {
      const response = await apiClient.post('/users/login', { email, password })
      const { accessToken, user: userData } = response.data?.data || {}
      if (accessToken) localStorage.setItem('accessToken', accessToken)
      setUser(userData)
      toast.success(`Welcome back, ${userData?.fullName || 'User'}!`)
      navigate('/dashboard')
    } catch (error) {
      const msg = error.response?.data?.message || 'Login failed. Please check credentials.'
      toast.error(msg)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [navigate])

  const register = useCallback(async (fullName, email, password) => {
    setIsLoading(true)
    try {
      const response = await apiClient.post('/users/register', { fullName, email, password })
      const { accessToken, user: userData } = response.data?.data || {}
      if (accessToken) localStorage.setItem('accessToken', accessToken)
      setUser(userData)
      toast.success('Account created! Welcome to CloudAutomationGNN.')
      navigate('/dashboard')
    } catch (error) {
      const msg = error.response?.data?.message || 'Registration failed. Try again.'
      toast.error(msg)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [navigate])

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/users/logout')
    } catch {
      // swallow server error
    } finally {
      localStorage.removeItem('accessToken')
      setUser(null)
      toast.info('You have been logged out.')
      navigate('/login')
    }
  }, [navigate])

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    register,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
