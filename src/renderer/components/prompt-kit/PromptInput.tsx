import { Send } from 'lucide-react'
import { type KeyboardEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PromptInputProps {
  onSubmit: (content: string) => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
}

function PromptInput({
  onSubmit,
  isLoading = false,
  disabled = false,
  placeholder = 'Type a message...',
  className,
}: PromptInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isLoading || disabled) return

    onSubmit(trimmed)
    setValue('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)

    // Auto-resize textarea
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }

  return (
    <div className={cn('border-t border-border bg-background p-4', className)}>
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading || disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors',
            'placeholder:text-muted-foreground',
            'focus:border-ring focus:ring-1 focus:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />
        <Button
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading || disabled}
          size="icon"
          className="shrink-0"
        >
          {isLoading ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  )
}

export { PromptInput }
