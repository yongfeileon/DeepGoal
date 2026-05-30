import { query as sdkQuery, type Query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentStreamEvent } from '../../types/engine.js';
import { mapPermissionMode, mapMcpServers } from './mapper.js';
import { mapSdkMessageToEvents } from './message-mapper.js';
import { PromptStream } from './prompt-stream.js';
import { createSdkOptions } from './sdk-options.js';
import type { PermissionMode } from '../../types/enums.js';
import type { McpServerConfig } from '../../types/tools.js';
import type { ClaudeAgentClientConfig, ClaudeAgentOptions, ClaudeAgentQueryFactory } from './types.js';

interface StreamState {
  readonly events: AsyncIterable<AgentStreamEvent>;
  readonly query: Query;
}

export class ClaudeAgentClient {
  private readonly queryFactory: ClaudeAgentQueryFactory;
  private readonly defaults: Partial<Omit<ClaudeAgentOptions, 'cwd'>>;
  private query: Query | undefined;

  constructor(config: ClaudeAgentClientConfig = {}) {
    const { queryFactory, ...defaults } = config;
    this.queryFactory = queryFactory ?? sdkQuery;
    this.defaults = defaults;
  }

  start(prompt: string, options: ClaudeAgentOptions): Promise<void> {
    this.close();
    this.query = this.createQuery(prompt, options);
    return Promise.resolve();
  }

  async send(prompt: string): Promise<void> {
    if (this.query === undefined) {
      throw new Error('Claude agent session has not started.');
    }
    await this.query.streamInput(createPromptStream(prompt));
  }

  async *events(): AsyncIterable<AgentStreamEvent> {
    if (this.query === undefined) {
      return;
    }
    yield* this.consumeQuery(this.query);
  }

  async *stream(prompt: string, options: ClaudeAgentOptions): AsyncIterable<AgentStreamEvent> {
    const streamState = await this.startStream(prompt, options);
    try {
      yield* streamState.events;
    } finally {
      streamState.query.close();
      if (this.query === streamState.query) {
        this.query = undefined;
      }
    }
  }

  async interrupt(): Promise<void> {
    await this.query?.interrupt();
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    await this.query?.setPermissionMode(mapPermissionMode(mode));
  }

  async setMcpServers(servers: Record<string, McpServerConfig>): Promise<void> {
    await this.query?.setMcpServers(mapMcpServers(servers));
  }

  close(): void {
    this.query?.close();
    this.query = undefined;
  }

  private async startStream(prompt: string, options: ClaudeAgentOptions): Promise<StreamState> {
    this.close();
    const query = this.createQuery(prompt, options);
    this.query = query;
    return { events: this.consumeQuery(query), query };
  }

  private createQuery(prompt: string, options: ClaudeAgentOptions): Query {
    return this.queryFactory({
      prompt: createPromptStream(prompt),
      options: createSdkOptions({ ...this.defaults, ...options }),
    });
  }

  private async *consumeQuery(query: Query): AsyncIterable<AgentStreamEvent> {
    for await (const message of query) {
      yield* mapSdkMessageToEvents(message);
    }
  }
}

function createPromptStream(prompt: string): PromptStream {
  const stream = new PromptStream();
  stream.push(prompt);
  stream.close();
  return stream;
}
