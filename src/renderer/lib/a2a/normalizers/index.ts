import type { A2AAdapterKind } from '@/lib/a2a-adapter'
import type { A2AEventNormalizer } from '@/lib/a2a/normalizers/types'
import { createCommonNormalizer } from '@/lib/a2a/normalizers/common'
import { createGeminiNormalizer } from '@/lib/a2a/normalizers/gemini'
import { createCodexNormalizer } from '@/lib/a2a/normalizers/codex'
import { createClaudeNormalizer } from '@/lib/a2a/normalizers/claude'

export const createA2AEventNormalizer = (adapterKind: A2AAdapterKind): A2AEventNormalizer => {
  switch (adapterKind) {
    case 'gemini-cli':
      return createGeminiNormalizer()
    case 'codex':
      return createCodexNormalizer()
    case 'claude-code':
      return createClaudeNormalizer()
    default:
      return createCommonNormalizer()
  }
}
