import type { AgentEngine, AgentRunRequest, AgentStreamEvent, EngineOptions, EngineRunResult } from '../../types/engine.js';
import { ClaudeAgentClient } from './client.js';
import { createClaudeAgentOptionsFromEngine } from './mapper.js';
import { collectEngineRunResult } from './run-result.js';
import type { ClaudeAgentClientConfig } from './types.js';

export interface ClaudeAgentEngineConfig {
  clientFactory?: (() => ClaudeAgentClient) | undefined;
  clientConfig?: ClaudeAgentClientConfig | undefined;
}

export class ClaudeAgentEngine implements AgentEngine {
  constructor(private readonly config: ClaudeAgentEngineConfig = {}) {}

  stream(request: AgentRunRequest, options: EngineOptions): AsyncIterable<AgentStreamEvent> {
    const client = this.createClient();
    const agentOptions = createClaudeAgentOptionsFromEngine(request, options, this.config.clientConfig);
    return client.stream(request.prompt, agentOptions);
  }

  async run(request: AgentRunRequest, options: EngineOptions): Promise<EngineRunResult> {
    return collectEngineRunResult(this.stream(request, options), request);
  }

  private createClient(): ClaudeAgentClient {
    return this.config.clientFactory?.() ?? new ClaudeAgentClient(this.config.clientConfig);
  }
}
