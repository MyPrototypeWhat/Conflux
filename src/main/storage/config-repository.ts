import type Database from 'better-sqlite3'
import {
  type AgentConfigs,
  type AgentId,
  type AppConfig,
  DEFAULT_APP_CONFIG,
  DEFAULT_CLAUDE_CODE_CONFIG,
  DEFAULT_CODEX_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_GLOBAL_CONFIG,
  type GlobalConfig,
} from '../../types/config'
import { getDatabase } from './database'

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends object>(target: T, source: DeepPartial<T>): T {
  const result = { ...target }

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key]
    const targetValue = target[key]

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue as DeepPartial<typeof targetValue>)
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T]
    }
  }

  return result
}

/**
 * Repository for config data stored in SQLite
 */
export class ConfigRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase()
  }

  // ============================================
  // Low-level key-value operations
  // ============================================

  private getValue(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  private setValue(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO config (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, Date.now())
  }

  private deleteValue(key: string): void {
    this.db.prepare('DELETE FROM config WHERE key = ?').run(key)
  }

  // ============================================
  // Global config operations
  // ============================================

  getGlobal(): GlobalConfig {
    const value = this.getValue('global')
    if (!value) {
      return DEFAULT_GLOBAL_CONFIG
    }

    try {
      const stored = JSON.parse(value) as Partial<GlobalConfig>
      return deepMerge(DEFAULT_GLOBAL_CONFIG, stored)
    } catch {
      return DEFAULT_GLOBAL_CONFIG
    }
  }

  setGlobal(config: DeepPartial<GlobalConfig>): void {
    const current = this.getGlobal()
    const merged = deepMerge(current, config)
    this.setValue('global', JSON.stringify(merged))
  }

  // ============================================
  // Agent config operations
  // ============================================

  private getDefaultAgentConfig(agentId: AgentId): AgentConfigs[AgentId] {
    const defaults: AgentConfigs = {
      'gemini-cli': DEFAULT_GEMINI_CONFIG,
      'claude-code': DEFAULT_CLAUDE_CODE_CONFIG,
      codex: DEFAULT_CODEX_CONFIG,
    }
    return defaults[agentId]
  }

  getAgent<T extends AgentId>(agentId: T): AgentConfigs[T] {
    const key = `agent:${agentId}`
    const value = this.getValue(key)
    const defaultConfig = this.getDefaultAgentConfig(agentId)

    if (!value) {
      return defaultConfig as AgentConfigs[T]
    }

    try {
      const stored = JSON.parse(value) as DeepPartial<AgentConfigs[T]>
      return deepMerge(defaultConfig, stored) as AgentConfigs[T]
    } catch {
      return defaultConfig as AgentConfigs[T]
    }
  }

  setAgent<T extends AgentId>(agentId: T, config: DeepPartial<AgentConfigs[T]>): void {
    const current = this.getAgent(agentId)
    const merged = deepMerge(current, config)
    this.setValue(`agent:${agentId}`, JSON.stringify(merged))
  }

  getAllAgentConfigs(): AgentConfigs {
    return {
      'gemini-cli': this.getAgent('gemini-cli'),
      'claude-code': this.getAgent('claude-code'),
      codex: this.getAgent('codex'),
    }
  }

  // ============================================
  // Credential operations (API Keys)
  // ============================================

  getApiKey(agentId: AgentId): string | null {
    return this.getValue(`credential:${agentId}`)
  }

  setApiKey(agentId: AgentId, key: string): void {
    this.setValue(`credential:${agentId}`, key)
  }

  deleteApiKey(agentId: AgentId): void {
    this.deleteValue(`credential:${agentId}`)
  }

  hasApiKey(agentId: AgentId): boolean {
    return this.getApiKey(agentId) !== null
  }

  // ============================================
  // Full config operations
  // ============================================

  getFullConfig(): AppConfig {
    return {
      global: this.getGlobal(),
      agents: this.getAllAgentConfigs(),
    }
  }

  resetGlobal(): void {
    this.setValue('global', JSON.stringify(DEFAULT_GLOBAL_CONFIG))
  }

  resetAgent(agentId: AgentId): void {
    const defaultConfig = this.getDefaultAgentConfig(agentId)
    this.setValue(`agent:${agentId}`, JSON.stringify(defaultConfig))
  }

  resetAll(): void {
    this.resetGlobal()
    this.resetAgent('gemini-cli')
    this.resetAgent('claude-code')
    this.resetAgent('codex')
    this.deleteApiKey('gemini-cli')
    this.deleteApiKey('claude-code')
    this.deleteApiKey('codex')
  }
}

// Export singleton instance
let configRepository: ConfigRepository | null = null

export function getConfigRepository(): ConfigRepository {
  if (!configRepository) {
    configRepository = new ConfigRepository()
  }
  return configRepository
}
