import { createClaudeNormalizer } from '@/renderer/lib/a2a/normalizers/claude'
import { createCodexNormalizer } from '@/renderer/lib/a2a/normalizers/codex'
import { createCommonNormalizer } from '@/renderer/lib/a2a/normalizers/common'
import { createGeminiNormalizer } from '@/renderer/lib/a2a/normalizers/gemini'
import type { A2AEventNormalizer } from '@/renderer/lib/a2a/normalizers/types'
import type { A2AAdapterKind } from '@/renderer/lib/a2a-adapter'

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
