import apiClient from './apiClient.js'

/**
 * Events API — cloud resource events
 */

// Fetch all events (with optional filters)
export const getEvents = (params = {}) =>
  apiClient.get('/events', { params })

// Fetch single event by ID
export const getEventById = (id) =>
  apiClient.get(`/events/${id}`)

// Ingest a new cloud event
export const postEvent = (eventData) =>
  apiClient.post('/events', eventData)

// Batch ingest events
export const batchPostEvents = (events) =>
  apiClient.post('/events/batch', { events })

// Get event statistics summary
export const getEventStats = () =>
  apiClient.get('/events/stats')
