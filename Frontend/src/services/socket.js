/**
 * socket.js
 * ─────────
 * Reusable WebSocket service for real-time, event-driven updates.
 * Uses AWS API Gateway WebSocket when VITE_WS_URL is configured.
 * Falls back to HTTP polling every POLL_INTERVAL_MS when WS is unavailable,
 * so the dashboard always stays fresh without manual page refreshes.
 */

const WS_URL = import.meta.env.VITE_WS_URL || ''
const POLL_INTERVAL_MS = 15_000  // 15 seconds polling fallback

// Events to broadcast on each poll cycle to trigger re-fetches in all components
const POLL_BROADCAST_EVENTS = ['ANOMALY_UPDATE', 'STATS_UPDATE', 'AUTOMATION_LOG', 'GRAPH_UPDATE']

class SocketService {
  constructor() {
    this.socket = null
    this.listeners = new Map() // eventType -> Set of callbacks
    this.reconnectAttempts = 0
    this.maxReconnects = 5          // Reduced — fallback to polling if WS keeps failing
    this.isConnected = false
    this._pollTimer = null
    this._wsEnabled = !!WS_URL && !WS_URL.includes('your-api-gateway-url')
  }

  // ── WebSocket connection ────────────────────────────────────────────────────
  connect() {
    if (!this._wsEnabled) {
      // No WS configured — go straight to polling
      this._startPolling()
      return
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    console.log('[WebSocket] Connecting to', WS_URL)
    try {
      this.socket = new WebSocket(WS_URL)
    } catch (err) {
      console.warn('[WebSocket] Could not create socket, falling back to polling:', err.message)
      this._startPolling()
      return
    }

    this.socket.onopen = () => {
      console.log('[WebSocket] Connected ✓')
      this.isConnected = true
      this.reconnectAttempts = 0
      this._stopPolling()  // WS connected — no need for polling
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
      if (this.reconnectAttempts < this.maxReconnects) {
        this.attemptReconnect()
      } else {
        console.warn('[WebSocket] Switching to HTTP polling fallback')
        this._startPolling()
      }
    }

    this.socket.onerror = () => {
      // onclose will follow; suppress noisy error
    }
  }

  attemptReconnect() {
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    console.log(`[WebSocket] Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts}/${this.maxReconnects})`)
    setTimeout(() => this.connect(), delay)
  }

  // ── HTTP polling fallback ───────────────────────────────────────────────────
  _startPolling() {
    if (this._pollTimer) return  // already polling
    console.log(`[SocketService] Starting HTTP polling fallback (every ${POLL_INTERVAL_MS / 1000}s)`)
    this._pollTimer = setInterval(() => this._broadcastPollTick(), POLL_INTERVAL_MS)
    // Immediate first tick so UI updates right away
    this._broadcastPollTick()
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
      console.log('[SocketService] Polling stopped (WS connected)')
    }
  }

  /** Emit synthetic events so all subscribed components re-fetch their data */
  _broadcastPollTick() {
    POLL_BROADCAST_EVENTS.forEach(eventType => {
      if (this.listeners.has(eventType)) {
        this.listeners.get(eventType).forEach(cb => cb(null))
      }
    })
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  subscribe(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType).add(callback)

    if (!this.isConnected && !this._pollTimer) {
      // First subscriber ever — start the connection/polling
      this.connect()
    } else if (this._pollTimer) {
      // Already polling — fire an immediate tick for THIS new subscriber
      // so it gets data right away instead of waiting up to 15s
      try { callback(null) } catch (_) {}
    }
  }

  unsubscribe(eventType, callback) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).delete(callback)
    }
  }

  /** Force an immediate refresh across all subscribed components */
  refresh() {
    this._broadcastPollTick()
  }
}

export const socketService = new SocketService()

