import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { cn } from '@/renderer/lib/utils'

export type CodeEditorProps = {
  value: string
  language?: string
  readOnly?: boolean
  onChange?: (value: string) => void
  className?: string
  theme?: 'light' | 'dark'
}

const getLanguageExtension = (lang?: string) => {
  switch (lang?.toLowerCase()) {
    case 'js':
    case 'javascript':
      return javascript()
    case 'ts':
    case 'typescript':
      return javascript({ typescript: true })
    case 'jsx':
      return javascript({ jsx: true })
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'json':
      return json()
    case 'html':
      return html()
    case 'css':
      return css()
    case 'md':
    case 'markdown':
      return markdown()
    case 'py':
    case 'python':
      return python()
    default:
      return javascript()
  }
}

const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '.cm-content': {
    caretColor: 'var(--foreground)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '13px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--accent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--accent)',
  },
})

export function CodeEditor({
  value,
  language,
  readOnly = true,
  onChange,
  className,
  theme = 'dark',
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      syntaxHighlighting(defaultHighlightStyle),
      getLanguageExtension(language),
      theme === 'dark' ? oneDark : lightTheme,
      EditorView.lineWrapping,
      EditorState.readOnly.of(readOnly),
    ]

    if (onChange && !readOnly) {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString())
          }
        })
      )
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [language, readOnly, theme])

  // Update content when value changes externally
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentValue = view.state.doc.toString()
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className={cn('h-full w-full overflow-auto rounded border border-border', className)}
    />
  )
}
