import assert from 'node:assert/strict';
import { createPipelineOutput, type PipelineInput, type PipelineOutput } from '../../node.js';
import type { EngineOptions, JsonObject } from '../../types/index.js';
import { ClaudeStageExecutor, type ClaudeStageExecutorConfig } from '../claude-stage.js';
import { isStringArray, parseJsonObject, readText, writeJsonFile } from './helpers.js';

export type TestingArtifact = JsonObject & {
  readonly stage: 'testing';
  readonly passed: boolean;
  readonly summary: string;
  readonly checked: string[];
};

export interface TestingPromptContext {
  readonly goalPath: string;
  readonly goalText: string;
  readonly requirementsPath: string;
  readonly requirementsText: string;
  readonly artifactPath: string;
  readonly artifactUrl?: string | undefined;
  readonly toolInstruction?: string | undefined;
  readonly toolPrefix?: string | undefined;
}

export interface TestingStageExecutorConfig extends Omit<ClaudeStageExecutorConfig, 'name' | 'outputPath' | 'systemPrompt'> {
  readonly goalPath: string;
  readonly requirementsPath: string;
  readonly artifactPath?: string | undefined;
  readonly artifactUrl?: string | undefined;
  readonly outputPath: string;
  readonly toolInstruction?: string | undefined;
  readonly toolPrefix?: string | undefined;
  readonly name?: string | undefined;
  readonly systemPrompt?: string | undefined;
  readonly createStageOptions?: ((options: EngineOptions) => EngineOptions) | undefined;
  readonly metadata?: JsonObject | undefined;
}

export abstract class TestingExecutor<TParsed extends JsonObject> extends ClaudeStageExecutor<TParsed> {
  protected constructor(config: ClaudeStageExecutorConfig) {
    super(config);
  }

  protected abstract createTestingContext(input: PipelineInput): TestingPromptContext;

  protected override createPrompt(input: PipelineInput): string {
    const context = this.createTestingContext(input);
    return [
      '请对开发产物做测试。',
      '测试依据是原始目标、上游需求分析和开发产物；不要用本 Prompt 预设的功能清单替代你的判断。',
      context.toolInstruction,
      '完成后只返回 JSON，格式必须为：',
      '{"stage":"testing","passed":true,"summary":"...","checked":["..."]}',
      `原始目标文件路径：${context.goalPath}`,
      `原始目标文本：${context.goalText}`,
      `上游需求分析文件路径：${context.requirementsPath}`,
      `上游需求分析内容：${context.requirementsText}`,
      `开发产物路径：${context.artifactPath}`,
      context.artifactUrl === undefined ? undefined : `开发产物 URL：${context.artifactUrl}`,
      context.toolPrefix === undefined ? undefined : `测试工具前缀：${context.toolPrefix}`,
    ].filter((line): line is string => line !== undefined).join('\n');
  }
}

export interface ConfigurableTestingExecutorConfig<TParsed extends JsonObject> extends ClaudeStageExecutorConfig {
  readonly createContext: (input: PipelineInput) => TestingPromptContext;
  readonly createStageOptions?: ((options: EngineOptions) => EngineOptions) | undefined;
  readonly parseOutput: (rawOutput: string) => TParsed | undefined;
  readonly materializeOutput: (parsed: TParsed, input: PipelineInput) => PipelineOutput;
}

export class ConfigurableTestingExecutor<TParsed extends JsonObject> extends TestingExecutor<TParsed> {
  constructor(private readonly executorConfig: ConfigurableTestingExecutorConfig<TParsed>) {
    super(executorConfig);
  }

  protected override createStageOptions(options: EngineOptions): EngineOptions {
    return this.executorConfig.createStageOptions?.(options) ?? options;
  }

  protected override createTestingContext(input: PipelineInput): TestingPromptContext {
    return this.executorConfig.createContext(input);
  }

  protected override parseOutput(rawOutput: string): TParsed | undefined {
    return this.executorConfig.parseOutput(rawOutput);
  }

  protected override materializeOutput(parsed: TParsed, input: PipelineInput): PipelineOutput {
    return this.executorConfig.materializeOutput(parsed, input);
  }
}

export function createTestingStageExecutor(config: TestingStageExecutorConfig): ConfigurableTestingExecutor<TestingArtifact> {
  return new ConfigurableTestingExecutor<TestingArtifact>({
    name: config.name ?? '测试',
    cwd: config.cwd,
    outputPath: config.outputPath,
    systemPrompt: config.systemPrompt ?? '你是测试工程师。请实际验证开发产物。最后只输出请求的 JSON 对象。',
    model: config.model,
    settingSources: config.settingSources,
    strictMcpConfig: config.strictMcpConfig,
    logger: config.logger,
    createStageOptions: config.createStageOptions,
    createContext: (input: PipelineInput): TestingPromptContext => ({
      goalPath: config.goalPath,
      goalText: readText(config.goalPath),
      requirementsPath: config.requirementsPath,
      requirementsText: readText(config.requirementsPath),
      artifactPath: input.primaryPath ?? config.artifactPath ?? config.outputPath,
      artifactUrl: config.artifactUrl,
      toolInstruction: config.toolInstruction,
      toolPrefix: config.toolPrefix,
    }),
    parseOutput: parseTestingArtifact,
    materializeOutput: (parsed: TestingArtifact, _input: PipelineInput): PipelineOutput => {
      assert.equal(parsed.passed, true, '测试阶段必须返回 passed=true。');
      writeJsonFile(config.outputPath, parsed, config.logger);
      return createPipelineOutput({
        primaryPath: config.outputPath,
        metadata: {
          ...parsed,
          ...(config.metadata ?? {}),
          writtenPath: config.outputPath,
          writtenText: readText(config.outputPath),
        },
      });
    },
  });
}

export function parseTestingArtifact(rawOutput: string): TestingArtifact | undefined {
  const parsed = parseJsonObject(rawOutput);
  if (parsed === undefined || parsed.stage !== 'testing') {
    return undefined;
  }
  if (typeof parsed.passed !== 'boolean' || typeof parsed.summary !== 'string' || !isStringArray(parsed.checked)) {
    return undefined;
  }
  return parsed as TestingArtifact;
}
