/**
 * socket.js
 * ─────────
 * Reusable WebSocket service for real-time, event-driven updates.
 * Replaces old HTTP polling with continuous push-based events from AWS API Gateway.
 */

const WS_URL = import.meta.env.VITE_WS_URL || 'wss://your-api-gateway-url.execute-api.ap-south-1.amazonaws.com/dev'

class SocketService {
  constructor() {
    this.socket = null
    this.listeners = new Map() // eventType -> Set of callbacks
    this.reconnectAttempts = 0
    this.maxReconnects = 10
    this.isConnected = false
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    console.log('[WebSocket] Connecting to', WS_URL)
    this.socket = new WebSocket(WS_URL)

    this.socket.onopen = () => {
      console.log('[WebSocket] Connected')
      this.isConnected = true
      this.reconnectAttempts = 0
    }

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const { type, payload } = data
        
        if (this.listeners.has(type)) {
          this.listeners.get(type).forEach(cb => cb(payload))
        }
      } catch (err) {
        console.error('[WebSocket] Message parse error:', err)
      }
    }

    this.socket.onclose = () => {
      console.log('[WebSocket] Disconnected')
      this.isConnected = false
      this.socket = null
      this.attemptReconnect()
    }

    this.socket.onerror = (err) => {
      console.error('[WebSocket] Error:', err)
      // onclose will follow
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnects) {
      console.error('[WebSocket] Max reconnect limit reached')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000) // Exponential backoff max 30s
    console.log(`[WebSocket] Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`)
    
    setTimeout(() => this.connect(), delay)
  }

  subscribe(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType).add(callback)
    
    // Auto-connect on first subscriber
    if (!this.isConnected) {
      this.connect()
    }
  }

  unsubscribe(eventType, callback) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).delete(callback)
    }
  }
}

export const socketService = new SocketService()
