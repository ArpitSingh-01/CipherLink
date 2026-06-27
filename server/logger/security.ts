/**
 * SEC-FIX: Security event logging
 * 
 * Logs security-relevant events for monitoring and incident response.
 * In production, these should be sent to a centralized logging service.
 */

interface SecurityEvent {
  type: 'auth_failure' | 'replay_attempt' | 'invalid_input' | 'rate_limit' | 'duplicate_message' | 'key_rotation' | 'device_management';
  publicKey?: string;
  ip: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// In-memory tracking for alerting (in production, use Redis or similar)
const recentEvents = new Map<string, number[]>();

export function logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>) {
  const fullEvent: SecurityEvent = {
    ...event,
    // FIX 7: Truncate public key to first 16 chars in logs — sufficient for debugging
    publicKey: event.publicKey ? event.publicKey.slice(0, 16) + '...' : undefined,
    timestamp: new Date().toISOString(),
  };
  
  // Log to console (in production, send to logging service)
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[SECURITY]', JSON.stringify(fullEvent));
  } else {
    // FIX 5-A: In production, emit ONLY type + severity — no IP, UA, or key material.
    // Centralized logging services must never ingest identity-correlated data.
    console.log(JSON.stringify({
      type: fullEvent.type,
      severity: shouldAlert(fullEvent.type, 1) ? 'high' : 'info',
      timestamp: fullEvent.timestamp,
    }));
  }
  
  // Track events for alerting
  trackEventForAlerting(fullEvent);
}

function trackEventForAlerting(event: SecurityEvent) {
  // FIX 7: Use only first 16 chars of publicKey in tracking key
  const key = `${event.type}:${event.ip}:${(event.publicKey || 'unknown').slice(0, 16)}`;
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  
  // Get recent events for this key
  let events = recentEvents.get(key) || [];
  
  // Remove events older than 5 minutes
  events = events.filter(t => t > fiveMinutesAgo);
  
  // Add current event
  events.push(now);
  recentEvents.set(key, events);
  
  // Check if we should alert
  if (shouldAlert(event.type, events.length)) {
    sendAlert(event, events.length);
  }
  
  // BUG-6 FIX: Deterministic cleanup moved to module-level setInterval below
}

function shouldAlert(eventType: string, count: number): boolean {
  switch (eventType) {
    case 'auth_failure':
      return count > 50; // >50 auth failures in 5 minutes
    case 'replay_attempt':
      return count > 10; // >10 replay attempts in 5 minutes
    case 'invalid_input':
      return count > 100; // >100 invalid inputs in 5 minutes
    case 'rate_limit':
      return count > 20; // >20 rate limit hits in 5 minutes
    default:
      return false;
  }
}

function sendAlert(event: SecurityEvent, count: number) {
  // In production, send to alerting service (PagerDuty, Slack, etc.)
  // FIX 7: Also truncate publicKey in alert output
  console.error(`[SECURITY ALERT] ${event.type} threshold exceeded: ${count} events in 5 minutes`, {
    type: event.type,
    ip: event.ip,
    publicKey: event.publicKey ? event.publicKey.slice(0, 16) + '...' : undefined,
    count,
  });
}

function cleanupOldEvents() {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  
  const keysToDelete: string[] = [];
  const keysToUpdate: Array<[string, number[]]> = [];
  
  recentEvents.forEach((events, key) => {
    const filteredEvents = events.filter((t: number) => t > fiveMinutesAgo);
    if (filteredEvents.length === 0) {
      keysToDelete.push(key);
    } else if (filteredEvents.length !== events.length) {
      keysToUpdate.push([key, filteredEvents]);
    }
  });
  
  // Apply deletions
  keysToDelete.forEach(key => recentEvents.delete(key));
  
  // Apply updates
  keysToUpdate.forEach(([key, events]) => recentEvents.set(key, events));
}

// BUG-6 FIX: Deterministic cleanup — runs every 60 seconds.
// Replaces the probabilistic Math.random() < 0.01 check that left stale entries
// accumulating during low-traffic periods.
setInterval(() => cleanupOldEvents(), 60_000);
