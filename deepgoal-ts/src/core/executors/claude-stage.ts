import {
  createExecutionError,
  createExecutionMetrics,
  createPipelineOutput,
  failResult,
  okResult,
  type PipelineInput,
  type PipelineOutput,
  type PipelineResult,
} from '../node.js';
import type { AgentStreamEvent, EngineOptions, JsonObject } from '../types/index.js';
import { createAgentRunRequest } from '../types/index.js';
import { ClaudeAgentClient, createClaudeAgentOptionsFromEngine, type ClaudeAgentClientConfig } from '../engines/claude-agent/index.js';
import { Executor } from '../executor.js';

export type StageLogger = (title: string, value: unknown) => void;

export interface ClaudeStageExecutorConfig {
  readonly name: string;
  readonly cwd: string;
  readonly outputPath: string;
  readonly systemPrompt: string;
  readonly model?: string | undefined;
  readonly settingSources?: ClaudeAgentClientConfig['settingSources'] | undefined;
  readonly strictMcpConfig?: boolean | undefined;
  readonly logger?: StageLogger | undefined;
}

export abstract class ClaudeStageExecutor<TParsed extends JsonObject> extends Executor {
  protected constructor(protected readonly config: ClaudeStageExecutorConfig) {
    super(createPipelineOutput({ primaryPath: config.outputPath }));
  }

  protected createStageOptions(options: EngineOptions): EngineOptions {
    return options;
  }

  override async execute(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    const startedAt = new Date();
    const started = performance.now();
    const prompt = this.createPrompt(input);
    const events: AgentStreamEvent[] = [];
    const toolCalls: string[] = [];

    this.log(`节点 ${this.config.name} 输入`, input);
    this.log(`节点 ${this.config.name} Prompt`, prompt);

    const request = createAgentRunRequest(prompt, this.config.cwd, { stage: this.config.name });
    const agentOptions = createClaudeAgentOptionsFromEngine(request, this.createStageOptions(options), {
      model: this.config.model,
      systemPrompt: this.config.systemPrompt,
      settingSources: this.config.settingSources,
      strictMcpConfig: this.config.strictMcpConfig,
    });
    const client = new ClaudeAgentClient();
    let outputText = '';

    try {
      for await (const event of client.stream(prompt, agentOptions)) {
        events.push(event);
        if (event.type === 'tool_call' && typeof event.content === 'string') {
          toolCalls.push(event.content);
        }
        this.log(`节点 ${this.config.name} 流式事件`, event);
        if ((event.type === 'message' || event.type === 'done') && typeof event.content === 'string') {
          outputText = event.content;
        }
      }
    } catch (error) {
      return failResult(
        createExecutionError({
          type: error instanceof Error ? error.name : 'ClaudeAgentClientError',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        }),
        this.output,
        metrics(startedAt, started)
      );
    }

    this.log(`节点 ${this.config.name} Claude 原始输出`, outputText);
    const parsed = this.parseOutput(outputText);
    if (parsed === undefined) {
      return failResult(
        createExecutionError({
          type: 'InvalidClaudeAgentOutput',
          message: `无法解析 ${this.config.name} 输出: ${outputText}`,
          details: { output: outputText },
        }),
        this.output,
        metrics(startedAt, started)
      );
    }

    const output = this.materializeOutput(parsed, input);
    const enrichedOutput: PipelineOutput = {
      ...output,
      metadata: {
        ...output.metadata,
        rawOutput: outputText,
        toolCalls,
        eventCount: events.length,
      },
    };
    this.log(`节点 ${this.config.name} 输出`, enrichedOutput);
    return okResult(enrichedOutput, metrics(startedAt, started));
  }

  protected abstract createPrompt(input: PipelineInput): string;

  protected abstract parseOutput(rawOutput: string): TParsed | undefined;

  protected abstract materializeOutput(parsed: TParsed, input: PipelineInput): PipelineOutput;

  private log(title: string, value: unknown): void {
    this.config.logger?.(title, value);
  }
}

function metrics(startedAt: Date, started: number): ReturnType<typeof createExecutionMetrics> {
  return createExecutionMetrics({
    startedAt,
    finishedAt: new Date(),
    durationSeconds: (performance.now() - started) / 1000,
  });
}
