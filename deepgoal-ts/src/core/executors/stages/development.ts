import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPipelineOutput, type PipelineInput, type PipelineOutput } from '../../node.js';
import type { EngineOptions, JsonObject } from '../../types/index.js';
import { ClaudeStageExecutor, type ClaudeStageExecutorConfig } from '../claude-stage.js';
import { parseJsonObject, readText } from './helpers.js';

export type DevelopmentArtifact = JsonObject & {
  readonly stage: 'development';
  readonly summary: string;
  readonly primaryPath: string;
};

export interface DevelopmentPromptContext {
  readonly goalPath: string;
  readonly goalText: string;
  readonly requirementsPath: string;
  readonly requirementsText: string;
  readonly outputPath: string;
}

export interface DevelopmentStageExecutorConfig extends Omit<ClaudeStageExecutorConfig, 'name' | 'outputPath' | 'systemPrompt'> {
  readonly goalPath: string;
  readonly requirementsPath?: string | undefined;
  readonly outputPath: string;
  readonly name?: string | undefined;
  readonly systemPrompt?: string | undefined;
  readonly createStageOptions?: ((options: EngineOptions) => EngineOptions) | undefined;
}

export abstract class DevelopmentExecutor<TParsed extends JsonObject> extends ClaudeStageExecutor<TParsed> {
  protected constructor(config: ClaudeStageExecutorConfig) {
    super(config);
  }

  protected abstract createDevelopmentContext(input: PipelineInput): DevelopmentPromptContext;

  protected override createPrompt(input: PipelineInput): string {
    const context = this.createDevelopmentContext(input);
    return [
      '请根据原始目标和上游需求分析完成开发。',
      '你必须使用文件写入工具创建指定开发产物，不要只在回复里给代码。',
      '不要新增原始目标和上游需求分析以外的硬性功能要求；具体实现由你自行判断。',
      '完成后只返回 JSON，格式必须为：',
      '{"stage":"development","summary":"...","primaryPath":"..."}',
      `原始目标文件路径：${context.goalPath}`,
      `原始目标文本：${context.goalText}`,
      `上游需求分析文件路径：${context.requirementsPath}`,
      `上游需求分析内容：${context.requirementsText}`,
      `必须写入的开发产物路径：${context.outputPath}`,
    ].join('\n');
  }
}

export interface ConfigurableDevelopmentExecutorConfig<TParsed extends JsonObject> extends ClaudeStageExecutorConfig {
  readonly createContext: (input: PipelineInput) => DevelopmentPromptContext;
  readonly createStageOptions?: ((options: EngineOptions) => EngineOptions) | undefined;
  readonly parseOutput: (rawOutput: string) => TParsed | undefined;
  readonly materializeOutput: (parsed: TParsed, input: PipelineInput) => PipelineOutput;
}

export class ConfigurableDevelopmentExecutor<TParsed extends JsonObject> extends DevelopmentExecutor<TParsed> {
  constructor(private readonly executorConfig: ConfigurableDevelopmentExecutorConfig<TParsed>) {
    super(executorConfig);
  }

  protected override createStageOptions(options: EngineOptions): EngineOptions {
    return this.executorConfig.createStageOptions?.(options) ?? options;
  }

  protected override createDevelopmentContext(input: PipelineInput): DevelopmentPromptContext {
    return this.executorConfig.createContext(input);
  }

  protected override parseOutput(rawOutput: string): TParsed | undefined {
    return this.executorConfig.parseOutput(rawOutput);
  }

  protected override materializeOutput(parsed: TParsed, input: PipelineInput): PipelineOutput {
    return this.executorConfig.materializeOutput(parsed, input);
  }
}

export function createDevelopmentStageExecutor(config: DevelopmentStageExecutorConfig): ConfigurableDevelopmentExecutor<DevelopmentArtifact> {
  return new ConfigurableDevelopmentExecutor<DevelopmentArtifact>({
    name: config.name ?? '开发',
    cwd: config.cwd,
    outputPath: config.outputPath,
    systemPrompt: config.systemPrompt ?? '你是开发工程师。你可以使用文件工具在指定工作目录内创建文件。完成开发后只输出请求的 JSON 对象。',
    model: config.model,
    settingSources: config.settingSources,
    strictMcpConfig: config.strictMcpConfig,
    logger: config.logger,
    createStageOptions: config.createStageOptions,
    createContext: (input: PipelineInput): DevelopmentPromptContext => {
      const requirementsPath = input.primaryPath ?? config.requirementsPath;
      return {
        goalPath: config.goalPath,
        goalText: readText(config.goalPath),
        requirementsPath: requirePath(requirementsPath),
        requirementsText: readText(requirementsPath),
        outputPath: config.outputPath,
      };
    },
    parseOutput: parseDevelopmentArtifact,
    materializeOutput: (parsed: DevelopmentArtifact, _input: PipelineInput): PipelineOutput => {
      const expectedPath = normalizePath(config.outputPath);
      assert.equal(normalizePath(parsed.primaryPath), expectedPath, '开发阶段返回的 primaryPath 必须等于目标产物路径。');
      assert.equal(existsSync(expectedPath), true, `开发产物文件不存在: ${expectedPath}`);
      return createPipelineOutput({
        primaryPath: expectedPath,
        metadata: {
          ...parsed,
          primaryPath: expectedPath,
          preview: readText(expectedPath).slice(0, 1200),
          writtenPath: expectedPath,
        },
      });
    },
  });
}

export function parseDevelopmentArtifact(rawOutput: string): DevelopmentArtifact | undefined {
  const parsed = parseJsonObject(rawOutput);
  if (parsed === undefined || parsed.stage !== 'development') {
    return undefined;
  }
  if (typeof parsed.summary !== 'string' || typeof parsed.primaryPath !== 'string') {
    return undefined;
  }
  return parsed as DevelopmentArtifact;
}

function requirePath(path: string | undefined): string {
  if (path === undefined) {
    throw new Error('需要提供需求分析文件路径。');
  }
  return path;
}

function normalizePath(path: string): string {
  return resolve(path);
}
