import { MessageContent } from "@/components/ui/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ui/reasoning";
import { Tool, type ToolPart } from "@/components/ui/tool";
import type { MessageBlock } from "@/hooks/useChat";

export type MessageBlockViewProps = {
  block: MessageBlock;
};

function blockToToolPart(block: MessageBlock): ToolPart | null {
  const getState = (): ToolPart["state"] => {
    if (block.isStreaming) return "input-streaming";
    if (
      block.metadata?.status === "error" ||
      (block.metadata?.exitCode && block.metadata?.exitCode !== 0)
    )
      return "output-error";
    return "output-available";
  };

  switch (block.type) {
    case "command_execution":
      return {
        type: "Shell",
        state: getState(),
        input: block.metadata?.command
          ? { command: block.metadata.command }
          : undefined,
        output: block.content ? { output: block.content } : undefined,
        errorText:
          block.metadata?.exitCode && block.metadata?.exitCode !== 0
            ? `Exit code: ${block.metadata?.exitCode}`
            : undefined,
      };
    case "todo_list":
      return {
        type: "TodoWrite",
        state: getState(),
        output: block.metadata?.items
          ? { items: block.metadata.items }
          : undefined,
      };
    case "file_change":
      return {
        type: "FileEdit",
        state: getState(),
        output: block.metadata?.changes
          ? { changes: block.metadata.changes }
          : undefined,
      };
    case "web_search":
      return {
        type: "WebSearch",
        state: getState(),
        input: block.metadata?.query
          ? { query: block.metadata.query }
          : undefined,
        output: block.content ? { results: block.content } : undefined,
      };
    default:
      return null;
  }
}

function MessageBlockView({ block }: MessageBlockViewProps) {
  // Try to render as tool first
  const toolPart = blockToToolPart(block);
  if (toolPart) {
    return <Tool toolPart={toolPart} />;
  }

  switch (block.type) {
    case "reasoning": {
      return (
        <Reasoning isStreaming={block.isStreaming}>
          <ReasoningTrigger className="text-sm">Reasoning</ReasoningTrigger>
          <ReasoningContent markdown={!block.isStreaming}>
            {block.content}
          </ReasoningContent>
        </Reasoning>
      );
    }
    case "error": {
      return (
        <MessageContent className=" text-red-600">
          {block.content}
        </MessageContent>
      );
    }
    default: {
      return <MessageContent markdown>{block.content}</MessageContent>;
    }
  }
}

export { MessageBlockView };
