import type { SettingSource } from '@anthropic-ai/claude-agent-sdk';
import type { PipelineItem } from '../../container.js';
import type { Pipe } from '../pipe.js';
import type { StageLogger } from '../../executors/claude-stage.js';
import type { EngineOptions, JsonObject, JsonValue, McpServerConfig } from '../../types/index.js';

export type StageOptionsFactory = (options: EngineOptions) => EngineOptions;

export type PipelineConfigScalar = string | number | boolean | null;
export type PipelineConfigValue = PipelineConfigScalar | PipelineConfigValue[] | { [key: string]: PipelineConfigValue };
export type PipelineConfigObject = { [key: string]: PipelineConfigValue };

export interface PipelineArtifactConfig extends PipelineConfigObject {
  readonly path?: string;
}

export type PipelinePathsConfig = Record<string, PipelineConfigValue>;
export type PipelineArtifactsConfig = Record<string, PipelineArtifactConfig>;
export type PipelineVarsConfig = Record<string, PipelineConfigValue>;

export interface PipelineShapeConfig extends PipelineConfigObject {
  readonly type?: string;
}

export interface PipelineEngineConfig extends PipelineConfigObject {
  readonly permissionMode?: string;
}

export interface PipelineGoalConfig extends PipelineConfigObject {
  readonly path?: string;
  readonly text?: string;
}

export interface ResolvedPipelineGoal {
  readonly path: string;
  readonly text: string;
  readonly source: 'inline' | 'file';
}

export interface PipelineDefaultsConfig extends PipelineConfigObject {
  readonly executor?: string;
  readonly cwd?: string;
  readonly goalPath?: string;
  readonly outputPath?: string;
  readonly model?: string;
  readonly settingSources?: SettingSource[];
  readonly strictMcpConfig?: boolean;
}

export interface PipelineStageOptionsConfig extends PipelineConfigObject {
  readonly mcpServers?: Record<string, PipelineMcpServerConfig>;
}

export interface PipelineMcpServerConfig extends PipelineConfigObject {
  readonly preset?: string;
  readonly command?: string;
  readonly args?: string[];
  readonly env?: Record<string, string>;
  readonly outputDir?: string;
}

export interface PipelineStageConfig extends PipelineConfigObject {
  readonly id?: string;
  readonly type: string;
  readonly executor?: string;
  readonly consumes?: string | string[];
  readonly produces?: string;
  readonly name?: string;
  readonly cwd?: string;
  readonly goalPath?: string;
  readonly requirementsPath?: string;
  readonly artifactPath?: string;
  readonly artifactUrl?: string;
  readonly outputPath?: string;
  readonly systemPrompt?: string;
  readonly toolInstruction?: string;
  readonly toolPrefix?: string;
  readonly model?: string;
  readonly settingSources?: SettingSource[];
  readonly strictMcpConfig?: boolean;
  readonly metadata?: JsonObject;
  readonly stageOptions?: PipelineStageOptionsConfig;
}

export interface PipelineConfigDocument extends PipelineConfigObject {
  readonly version: 1;
  readonly pipeline?: PipelineShapeConfig;
  readonly engine?: PipelineEngineConfig;
  readonly goal?: PipelineGoalConfig;
  readonly paths?: PipelinePathsConfig;
  readonly artifacts?: PipelineArtifactsConfig;
  readonly vars?: PipelineVarsConfig;
  readonly defaults?: PipelineDefaultsConfig;
  readonly executors?: Record<string, PipelineDefaultsConfig>;
  readonly stages: PipelineStageConfig[];
}

export type PipelineBuilderRuntime = Record<string, JsonValue | undefined>;

export interface PipelineBuilderOptions {
  readonly runtime?: PipelineBuilderRuntime;
  readonly logger?: StageLogger;
  readonly stageRegistry?: StageRegistry;
  readonly mcpPresetRegistry?: McpPresetRegistry;
}

export interface ConfiguredPipeline {
  readonly pipeline: Pipe;
  readonly engineOptions: EngineOptions;
  readonly goal?: ResolvedPipelineGoal | undefined;
}

export interface ResolvedPipelineContext {
  readonly runtime: PipelineBuilderRuntime;
  readonly goal: PipelineConfigObject;
  readonly paths: PipelineConfigObject;
  readonly artifacts: PipelineConfigObject;
  readonly vars: PipelineConfigObject;
  readonly env: Record<string, string | undefined>;
}

export interface ResolvedStageConfig {
  readonly id?: string | undefined;
  readonly type: string;
  readonly executor?: string | undefined;
  readonly consumes?: string | string[] | undefined;
  readonly produces?: string | undefined;
  readonly name?: string | undefined;
  readonly cwd?: string | undefined;
  readonly goalPath?: string | undefined;
  readonly requirementsPath?: string | undefined;
  readonly artifactPath?: string | undefined;
  readonly artifactUrl?: string | undefined;
  readonly outputPath?: string | undefined;
  readonly systemPrompt?: string | undefined;
  readonly toolInstruction?: string | undefined;
  readonly toolPrefix?: string | undefined;
  readonly model?: string | undefined;
  readonly settingSources?: SettingSource[] | undefined;
  readonly strictMcpConfig?: boolean | undefined;
  readonly metadata?: JsonObject | undefined;
  readonly logger?: StageLogger | undefined;
  readonly createStageOptions?: StageOptionsFactory | undefined;
}

export interface StageBuildInput {
  readonly stage: PipelineStageConfig;
  readonly resolvedConfig: ResolvedStageConfig;
  readonly context: ResolvedPipelineContext;
}

export interface StageRegistryEntry {
  readonly type: string;
  readonly executor: string;
  readonly requiredFields: readonly string[];
  readonly applyConventions: (stage: ResolvedStageConfig, context: ResolvedPipelineContext) => ResolvedStageConfig;
  readonly build: (input: StageBuildInput) => PipelineItem;
}

export type StageRegistry = Record<string, StageRegistryEntry>;

export interface McpPresetInput {
  readonly name: string;
  readonly config: PipelineMcpServerConfig;
}

export type McpPresetFactory = (input: McpPresetInput) => McpServerConfig;
export type McpPresetRegistry = Record<string, McpPresetFactory>;
