import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { AsyncMessageQueue } from './async-message-queue.js';

export class PromptStream implements AsyncIterable<SDKUserMessage> {
  private readonly queue = new AsyncMessageQueue<SDKUserMessage>();

  push(text: string): void {
    this.queue.push({
      type: 'user',
      message: createUserMessage(text),
      parent_tool_use_id: null,
    });
  }

  close(): void {
    this.queue.close();
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return this.queue[Symbol.asyncIterator]();
  }
}

function createUserMessage(text: string): SDKUserMessage['message'] {
  return {
    role: 'user',
    content: text,
  };
}
