import apiClient from './apiClient.js'

/**
 * Anomaly API — GNN anomaly detection results and XAI explanations
 */

// Fetch all detected anomalies
export const getAnomalies = (params = {}) =>
  apiClient.get('/anomalies', { params })

// Fetch anomaly detail by ID
export const getAnomalyById = (id) =>
  apiClient.get(`/anomalies/${id}`)

// Get XAI explanation for a specific anomaly
export const getExplanation = (id) =>
  apiClient.get(`/anomalies/explain/${id}`)

// Get anomaly summary stats (counts by severity)
export const getAnomalyStats = () =>
  apiClient.get('/anomalies/stats')

// Resolve / acknowledge an anomaly
export const resolveAnomaly = (id) =>
  apiClient.patch(`/anomalies/${id}/resolve`)
