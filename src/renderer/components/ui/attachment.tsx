import type { Part } from '@a2a-js/sdk'
import { useEffect, useMemo } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ArtifactData = {
  artifactId: string
  name?: string
  parts: Part[]
}

type AttachmentProps = {
  artifact: ArtifactData
}

const decodeBase64 = (base64: string) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const FileAttachment = ({ file }: { file: Extract<Part, { kind: 'file' }>['file'] }) => {
  const { bytes, uri, mimeType, name } = file as {
    bytes?: string
    uri?: string
    mimeType?: string
    name?: string
  }

  const objectUrl = useMemo(() => {
    if (!bytes) return null
    const decoded = decodeBase64(bytes)
    const blob = new Blob([decoded], { type: mimeType || 'application/octet-stream' })
    return URL.createObjectURL(blob)
  }, [bytes, mimeType])

  useEffect(() => {
    if (!objectUrl) return
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  const href = uri || objectUrl
  const label = name || 'attachment'

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background/40 px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {mimeType && <span className="text-[11px] text-muted-foreground">{mimeType}</span>}
      </div>
      {href && (
        <a
          className={cn(buttonVariants({ variant: 'outline', size: 'xs' }), 'text-xs')}
          href={href}
          download={name}
          target={uri ? '_blank' : undefined}
          rel={uri ? 'noreferrer' : undefined}
        >
          {uri ? 'Open' : 'Download'}
        </a>
      )}
    </div>
  )
}

const Attachment = ({ artifact }: AttachmentProps) => {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Artifact
        </div>
        <div className="text-xs text-muted-foreground">{artifact.name || artifact.artifactId}</div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {artifact.parts.map((part, index) => {
          if (part.kind === 'text') {
            return (
              <div key={`text-${index}`} className="whitespace-pre-wrap text-sm">
                {part.text}
              </div>
            )
          }
          if (part.kind === 'file') {
            return <FileAttachment key={`file-${index}`} file={part.file} />
          }
          if (part.kind === 'data') {
            return (
              <pre
                key={`data-${index}`}
                className="whitespace-pre-wrap rounded bg-background/60 p-2 text-xs text-muted-foreground"
              >
                {JSON.stringify(part.data, null, 2)}
              </pre>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

export { Attachment }
