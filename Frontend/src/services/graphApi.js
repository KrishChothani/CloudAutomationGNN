import apiClient from './apiClient.js'

/**
 * Graph API — infrastructure topology graph
 */

// Fetch full node + edge graph for ResourceGraph.jsx
export const getGraph = () =>
  apiClient.get('/graph')
