import { createPipelineOutput, type PipelineInput, type PipelineOutput } from '../../node.js';
import type { EngineOptions, JsonObject } from '../../types/index.js';
import { ClaudeStageExecutor, type ClaudeStageExecutorConfig } from '../claude-stage.js';
import { isStringArray, parseJsonObject, readText, writeJsonFile } from './helpers.js';

export type RequirementsAnalysisArtifact = JsonObject & {
  readonly stage: 'requirements_analysis';
  readonly summary: string;
  readonly acceptanceCriteria: string[];
  readonly implementationNotes: string[];
};

export interface RequirementsAnalysisPromptContext {
  readonly goalPath: string;
  readonly goalText: string;
}

export interface RequirementsAnalysisStageExecutorConfig extends Omit<ClaudeStageExecutorConfig, 'name' | 'outputPath' | 'systemPrompt'> {
  readonly goalPath: string;
  readonly outputPath: string;
  readonly name?: string | undefined;
  readonly systemPrompt?: string | undefined;
  readonly createStageOptions?: ((options: EngineOptions) => EngineOptions) | undefined;
}

export abstract class RequirementsAnalysisExecutor<TParsed extends JsonObject> extends ClaudeStageExecutor<TParsed> {
  protected constructor(config: ClaudeStageExecutorConfig) {
    super(config);
  }

  protected abstract createRequirementsAnalysisContext(input: PipelineInput): RequirementsAnalysisPromptContext;

  protected override createPrompt(input: PipelineInput): string {
    const context = this.createRequirementsAnalysisContext(input);
    return [
      '请读取目标文件并完成需求分析。',
      '只返回 JSON，格式必须为：',
      '{"stage":"requirements_analysis","summary":"...","acceptanceCriteria":["..."],"implementationNotes":["..."]}',
      '要求：',
      '1. 只能基于目标文本提炼，不要补充目标文本没有要求的固定规格、功能清单或实现细节。',
      '2. acceptanceCriteria 表达可验证的目标达成条件。',
      '3. implementationNotes 只记录目标文本中明确出现的技术约束，或对后续开发阶段有帮助的非扩写说明。',
      `目标文件路径：${context.goalPath}`,
      `目标文本：${context.goalText}`,
    ].join('\n');
  }
}

export interface ConfigurableRequirementsAnalysisExecutorConfig<TParsed extends JsonObject> extends ClaudeStageExecutorConfig {
  readonly createContext: (input: PipelineInput) => RequirementsAnalysisPromptContext;
  readonly createStageOptions?: ((options: EngineOptions) => EngineOptions) | undefined;
  readonly parseOutput: (rawOutput: string) => TParsed | undefined;
  readonly materializeOutput: (parsed: TParsed, input: PipelineInput) => PipelineOutput;
}

export class ConfigurableRequirementsAnalysisExecutor<TParsed extends JsonObject> extends RequirementsAnalysisExecutor<TParsed> {
  constructor(private readonly executorConfig: ConfigurableRequirementsAnalysisExecutorConfig<TParsed>) {
    super(executorConfig);
  }

  protected override createStageOptions(options: EngineOptions): EngineOptions {
    return this.executorConfig.createStageOptions?.(options) ?? options;
  }

  protected override createRequirementsAnalysisContext(input: PipelineInput): RequirementsAnalysisPromptContext {
    return this.executorConfig.createContext(input);
  }

  protected override parseOutput(rawOutput: string): TParsed | undefined {
    return this.executorConfig.parseOutput(rawOutput);
  }

  protected override materializeOutput(parsed: TParsed, input: PipelineInput): PipelineOutput {
    return this.executorConfig.materializeOutput(parsed, input);
  }
}

export function createRequirementsAnalysisStageExecutor(
  config: RequirementsAnalysisStageExecutorConfig
): ConfigurableRequirementsAnalysisExecutor<RequirementsAnalysisArtifact> {
  return new ConfigurableRequirementsAnalysisExecutor<RequirementsAnalysisArtifact>({
    name: config.name ?? '需求分析',
    cwd: config.cwd,
    outputPath: config.outputPath,
    systemPrompt: config.systemPrompt ?? '你是需求分析工程师。只输出请求的 JSON 对象，不要输出 Markdown 或解释。',
    model: config.model,
    settingSources: config.settingSources,
    strictMcpConfig: config.strictMcpConfig,
    logger: config.logger,
    createStageOptions: config.createStageOptions,
    createContext: (_input: PipelineInput): RequirementsAnalysisPromptContext => ({
      goalPath: config.goalPath,
      goalText: readText(config.goalPath),
    }),
    parseOutput: parseRequirementsAnalysisArtifact,
    materializeOutput: (parsed: RequirementsAnalysisArtifact, _input: PipelineInput): PipelineOutput => {
      writeJsonFile(config.outputPath, parsed, config.logger);
      return createPipelineOutput({
        primaryPath: config.outputPath,
        metadata: {
          ...parsed,
          writtenPath: config.outputPath,
          writtenText: readText(config.outputPath),
        },
      });
    },
  });
}

export function parseRequirementsAnalysisArtifact(rawOutput: string): RequirementsAnalysisArtifact | undefined {
  const parsed = parseJsonObject(rawOutput);
  if (parsed === undefined || parsed.stage !== 'requirements_analysis' || typeof parsed.summary !== 'string') {
    return undefined;
  }
  if (!isStringArray(parsed.acceptanceCriteria) || !isStringArray(parsed.implementationNotes)) {
    return undefined;
  }
  return parsed as RequirementsAnalysisArtifact;
}
