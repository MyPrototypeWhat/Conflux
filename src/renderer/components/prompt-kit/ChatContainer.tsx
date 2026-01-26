import type * as React from 'react'
import { useStickToBottom } from 'use-stick-to-bottom'

import { cn } from '@/lib/utils'

interface ChatContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

function ChatContainer({ children, className, ...props }: ChatContainerProps) {
  const { scrollRef, contentRef } = useStickToBottom()

  return (
    <div ref={scrollRef} className={cn('flex-1 overflow-y-auto', className)} {...props}>
      <div ref={contentRef} className="flex flex-col gap-4 p-4">
        {children}
      </div>
    </div>
  )
}

export { ChatContainer }
