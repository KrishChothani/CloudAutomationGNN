/**
 * App.jsx
 * ───────
 * Root routing component for CloudAutomationGNN Frontend.
 *
 * Route map:
 *   /           → LandingPage   (public)
 *   /login      → LoginPage     (public)
 *   /signup     → SignupPage    (public)
 *   /dashboard  → DashboardPage (protected — requires valid JWT)
 *   /alerts     → AlertsPage    (protected — requires valid JWT)
 *   *           → redirect to /
 *
 * Auth guard: ProtectedRoute reads AuthContext; redirects unauthenticated
 * users to /login and preserves the original target in location state.
 *
 * Rule compliance: functional component, React Router v6, no PropTypes needed
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import LandingPage from './JSX/Pages/LandingPage.jsx'
import LoginPage from './JSX/Pages/LoginPage.jsx'
import SignupPage from './JSX/Pages/SignupPage.jsx'
import DashboardPage from './JSX/Pages/DashboardPage.jsx'
import AlertsPage from './JSX/Pages/AlertsPage.jsx'
import ProtectedRoute from './JSX/Components/Protection/ProtectedRoute.jsx'


function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App