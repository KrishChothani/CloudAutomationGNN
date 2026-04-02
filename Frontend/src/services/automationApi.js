import apiClient from './apiClient.js'

/**
 * Automation API — remediation logs
 */

// Fetch automation log timeline for AutomationLog.jsx
export const getAutomationLogs = (params = {}) =>
  apiClient.get('/automation/logs', { params })

// Create a log entry (called internally after a trigger)
export const createAutomationLog = (data) =>
  apiClient.post('/automation/logs', data)

// Trigger a remediation action
export const triggerRemediation = (data) =>
  apiClient.post('/automation/trigger', data)

// Get counts by status
export const getAutomationStats = () =>
  apiClient.get('/automation/stats')
