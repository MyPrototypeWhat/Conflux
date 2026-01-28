export type A2AAdapterKind = 'gemini-cli' | 'codex' | 'claude-code' | 'unknown'

type AgentCard = {
  name?: string
  protocolVersion?: string
  provider?: { organization?: string }
}

type AdapterEntry = {
  adapter: A2AAdapterKind
  fingerprint: string
}

const adapterCache = new Map<string, AdapterEntry>()

const normalize = (value?: string) => (value ?? '').toLowerCase()

const getAgentCardUrl = (baseUrl: string) => {
  try {
    return new URL('/.well-known/agent-card.json', baseUrl).toString()
  } catch {
    const trimmed = baseUrl.replace(/\/$/, '')
    return `${trimmed}/.well-known/agent-card.json`
  }
}

const fingerprintFromCard = (cardUrl: string, card?: AgentCard) => {
  const parts = [cardUrl, card?.name, card?.protocolVersion, card?.provider?.organization]
  return parts.filter(Boolean).join('|')
}

const detectAdapter = (card?: AgentCard): A2AAdapterKind => {
  const organization = normalize(card?.provider?.organization)
  const name = normalize(card?.name)

  if (organization.includes('google') || name.includes('gemini')) return 'gemini-cli'
  if (organization.includes('openai') || name.includes('codex')) return 'codex'
  if (organization.includes('anthropic') || name.includes('claude')) return 'claude-code'
  return 'unknown'
}

export async function resolveAdapterForUrl(baseUrl: string) {
  const cardUrl = getAgentCardUrl(baseUrl)
  const cached = adapterCache.get(cardUrl)
  if (cached) {
    return { ...cached, cardUrl }
  }

  try {
    const response = await fetch(cardUrl)
    if (!response.ok) {
      throw new Error(`Agent card request failed: ${response.status}`)
    }
    const card = (await response.json()) as AgentCard
    const adapter = detectAdapter(card)
    const fingerprint = fingerprintFromCard(cardUrl, card)
    const entry = { adapter, fingerprint }
    adapterCache.set(cardUrl, entry)
    return { ...entry, cardUrl }
  } catch {
    const entry = { adapter: 'unknown' as const, fingerprint: cardUrl }
    adapterCache.set(cardUrl, entry)
    return { ...entry, cardUrl }
  }
}
