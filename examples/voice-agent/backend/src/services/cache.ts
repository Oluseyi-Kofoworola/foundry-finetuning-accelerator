/**
 * Acme Health - Session Cache Service
 * 
 * Provides fast, consistent caching for session data including:
 * - Verified member identity
 * - MFA verification status
 * - Medical records
 * - Recent tool results
 * 
 * Cache is session-scoped for security and automatically expires.
 */

import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

interface SessionCache {
  entries: Map<string, CacheEntry>;
  createdAt: number;
  lastActivity: number;
}

interface CacheStats {
  totalSessions: number;
  totalEntries: number;
  hits: number;
  misses: number;
  hitRate: number;
}

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes default TTL
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes session lifetime
const CLEANUP_INTERVAL = 5 * 60 * 1000; // Cleanup every 5 minutes
const MAX_ENTRIES_PER_SESSION = 50;

// Category-specific TTLs (in milliseconds)
const CATEGORY_TTL: Record<string, number> = {
  'identity': 30 * 60 * 1000,      // 30 min - verified identity persists
  'mfa': 10 * 60 * 1000,           // 10 min - MFA verification
  'medical_records': 15 * 60 * 1000, // 15 min - medical records
  'prescriptions': 10 * 60 * 1000,  // 10 min - prescription data
  'appointments': 5 * 60 * 1000,    // 5 min - appointment data (changes often)
  'providers': 30 * 60 * 1000,      // 30 min - provider network
  'pricing': 5 * 60 * 1000,         // 5 min - pricing can change
};

// =============================================================================
// SESSION CACHE SERVICE
// =============================================================================

class SessionCacheService {
  private sessions: Map<string, SessionCache> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
  };
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
    logger.info('[Cache] Session cache service initialized');
  }

  /**
   * Start the periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL);
  }

  /**
   * Stop the cleanup timer
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
    logger.info('[Cache] Session cache service shut down');
  }

  /**
   * Get or create a session cache
   */
  private getSessionCache(sessionId: string): SessionCache {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = {
        entries: new Map(),
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      this.sessions.set(sessionId, session);
      logger.debug(`[Cache] Created new session cache: ${sessionId}`);
    } else {
      session.lastActivity = Date.now();
    }
    
    return session;
  }

  /**
   * Generate a cache key from category and identifier
   */
  private generateKey(category: string, identifier: string): string {
    return `${category}:${identifier}`;
  }

  /**
   * Get TTL for a category
   */
  private getTTL(category: string): number {
    return CATEGORY_TTL[category] || DEFAULT_TTL;
  }

  /**
   * Set a value in the cache
   */
  set<T>(
    sessionId: string,
    category: string,
    identifier: string,
    data: T,
    customTTL?: number
  ): void {
    const session = this.getSessionCache(sessionId);
    const key = this.generateKey(category, identifier);
    const ttl = customTTL || this.getTTL(category);
    const now = Date.now();

    // Enforce max entries limit
    if (session.entries.size >= MAX_ENTRIES_PER_SESSION) {
      this.evictOldest(session);
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + ttl,
      accessCount: 0,
      lastAccessed: now,
    };

    session.entries.set(key, entry);
    
    logger.debug(`[Cache] SET ${sessionId}/${key}`, {
      category,
      ttl: ttl / 1000,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    });
  }

  /**
   * Get a value from the cache
   */
  get<T>(sessionId: string, category: string, identifier: string): T | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.stats.misses++;
      return null;
    }

    const key = this.generateKey(category, identifier);
    const entry = session.entries.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      logger.debug(`[Cache] MISS ${sessionId}/${key}`);
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      session.entries.delete(key);
      this.stats.misses++;
      logger.debug(`[Cache] EXPIRED ${sessionId}/${key}`);
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    session.lastActivity = Date.now();
    this.stats.hits++;

    logger.debug(`[Cache] HIT ${sessionId}/${key}`, {
      accessCount: entry.accessCount,
      age: Math.round((Date.now() - entry.timestamp) / 1000),
    });

    return entry.data;
  }

  /**
   * Check if a value exists and is valid
   */
  has(sessionId: string, category: string, identifier: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const key = this.generateKey(category, identifier);
    const entry = session.entries.get(key);

    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      session.entries.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific entry
   */
  delete(sessionId: string, category: string, identifier: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const key = this.generateKey(category, identifier);
    return session.entries.delete(key);
  }

  /**
   * Clear all entries for a category in a session
   */
  clearCategory(sessionId: string, category: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;

    let deleted = 0;
    for (const key of session.entries.keys()) {
      if (key.startsWith(`${category}:`)) {
        session.entries.delete(key);
        deleted++;
      }
    }

    logger.debug(`[Cache] Cleared ${deleted} entries for category ${category} in session ${sessionId}`);
    return deleted;
  }

  /**
   * Clear entire session cache
   */
  clearSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      logger.debug(`[Cache] Cleared session cache: ${sessionId}`);
    }
    return deleted;
  }

  /**
   * Evict the oldest/least accessed entry from a session
   */
  private evictOldest(session: SessionCache): void {
    let oldestKey: string | null = null;
    let oldestAccess = Date.now();

    for (const [key, entry] of session.entries) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      session.entries.delete(oldestKey);
      logger.debug(`[Cache] Evicted oldest entry: ${oldestKey}`);
    }
  }

  /**
   * Clean up expired entries and sessions
   */
  private cleanup(): void {
    const now = Date.now();
    let expiredSessions = 0;
    let expiredEntries = 0;

    for (const [sessionId, session] of this.sessions) {
      // Check if session itself is expired
      if (now - session.lastActivity > SESSION_TTL) {
        this.sessions.delete(sessionId);
        expiredSessions++;
        continue;
      }

      // Clean expired entries within session
      for (const [key, entry] of session.entries) {
        if (now > entry.expiresAt) {
          session.entries.delete(key);
          expiredEntries++;
        }
      }
    }

    if (expiredSessions > 0 || expiredEntries > 0) {
      logger.debug(`[Cache] Cleanup: removed ${expiredSessions} sessions, ${expiredEntries} entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let totalEntries = 0;
    for (const session of this.sessions.values()) {
      totalEntries += session.entries.size;
    }

    const total = this.stats.hits + this.stats.misses;
    return {
      totalSessions: this.sessions.size,
      totalEntries,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Get all cached data for a session (for debugging)
   */
  getSessionData(sessionId: string): Record<string, unknown> | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const data: Record<string, unknown> = {};
    for (const [key, entry] of session.entries) {
      if (Date.now() <= entry.expiresAt) {
        data[key] = {
          data: entry.data,
          age: Math.round((Date.now() - entry.timestamp) / 1000),
          ttl: Math.round((entry.expiresAt - Date.now()) / 1000),
          accessCount: entry.accessCount,
        };
      }
    }
    return data;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const sessionCache = new SessionCacheService();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Cache wrapper for async functions - memoizes results
 */
export function withCache<TArgs extends unknown[], TResult>(
  sessionId: string,
  category: string,
  keyFn: (...args: TArgs) => string,
  fn: (...args: TArgs) => Promise<TResult>,
  ttl?: number
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const key = keyFn(...args);
    
    // Check cache first
    const cached = sessionCache.get<TResult>(sessionId, category, key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn(...args);
    sessionCache.set(sessionId, category, key, result, ttl);
    return result;
  };
}

/**
 * Pre-defined cache keys for common operations
 */
export const CacheKeys = {
  identity: (memberId: string) => `member:${memberId}`,
  mfaStatus: (memberId: string) => `mfa:${memberId}`,
  medicalRecords: (memberId: string, section?: string) => 
    section ? `records:${memberId}:${section}` : `records:${memberId}:all`,
  prescriptions: (memberId: string) => `rx:${memberId}`,
  appointments: (memberId: string) => `appt:${memberId}`,
  providers: (specialty: string, location: string) => `providers:${specialty}:${location}`,
  pricing: (medicationId: string, pharmacyId: string) => `price:${medicationId}:${pharmacyId}`,
};
