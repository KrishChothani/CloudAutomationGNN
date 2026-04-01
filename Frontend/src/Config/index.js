// API base URL configuration
const config = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  PYTHON_API_URL: import.meta.env.VITE_PYTHON_API_URL || 'http://localhost:8000',
  WS_URL: import.meta.env.VITE_WS_URL || 'ws://localhost:5000',
  APP_NAME: 'CloudAutomationGNN',
  APP_VERSION: '1.0.0',
}

export default config
