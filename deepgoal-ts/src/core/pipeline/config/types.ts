import type { SettingSource } from '@anthropic-ai/claude-agent-sdk';
import type { PipelineItem } from '../../container.js';
import type { Executor } from '../../executor.js';
import type { Node } from '../../node.js';
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
  readonly componentRegistry?: ComponentRegistry;
  readonly componentRegistryDuplicateKeyPolicy?: ComponentRegistryDuplicateKeyPolicy;
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

/**
 * Maps a user-facing stage config to the runtime item executed by the pipeline.
 * Stage is the configuration and product semantics layer; runtime execution still uses PipelineItem.
 */
export interface StageRegistryEntry {
  /** Pipeline stage type handled by this entry. This should match the registry key. */
  readonly type: string;
  /** Executor name this stage accepts after defaults and stage config are resolved. */
  readonly executor: string;
  /** Resolved config fields that must be present after conventions are applied. */
  readonly requiredFields: readonly string[];
  /** Applies artifact, path, variable, or stage-specific defaults before field validation. */
  readonly applyConventions: (stage: ResolvedStageConfig, context: ResolvedPipelineContext) => ResolvedStageConfig;
  /** Builds the concrete Node or Executor that will be placed in the Pipe. */
  readonly build: (input: StageBuildInput) => PipelineItem;
}

export type StageRegistry = Record<string, StageRegistryEntry>;

export interface McpPresetInput {
  readonly name: string;
  readonly config: PipelineMcpServerConfig;
}

export type McpPresetFactory = (input: McpPresetInput) => McpServerConfig;
export type McpPresetRegistry = Record<string, McpPresetFactory>;

export type NodeFactory = (...args: never[]) => Node;
export type NodeRegistry = Record<string, NodeFactory>;

export type ExecutorFactory = (...args: never[]) => Executor;
export type ExecutorRegistry = Record<string, ExecutorFactory>;

export interface PipelineTemplateParameterDefinition {
  readonly description?: string;
  readonly default?: PipelineConfigValue;
  readonly required?: boolean;
}

export type PipelineTemplateParameters = Record<string, PipelineTemplateParameterDefinition>;
export type PipelineTemplateParameterValues = Readonly<Record<string, PipelineConfigValue>>;

export interface PipelineTemplateBase {
  readonly name: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly parameters?: PipelineTemplateParameters;
}

export interface PipelineYamlTemplate extends PipelineTemplateBase {
  readonly kind: 'yaml';
  readonly document: PipelineConfigDocument;
}

export interface PipelineTemplateFactoryInput {
  readonly parameters: PipelineTemplateParameterValues;
}

export type PipelineTemplateFactory = (input: PipelineTemplateFactoryInput) => PipelineConfigDocument;

export interface PipelineFactoryTemplate extends PipelineTemplateBase {
  readonly kind: 'factory';
  readonly factory: PipelineTemplateFactory;
}

export type PipelineTemplate = PipelineYamlTemplate | PipelineFactoryTemplate;

export type PipelineTemplateRegistry = Record<string, PipelineTemplate>;

export interface SuperNodePrecompileInput {
  readonly document: PipelineConfigDocument;
  readonly componentRegistry: ComponentRegistry;
  readonly manifests: readonly DeepGoalComponentManifest[];
  readonly templateParameters?: PipelineTemplateParameterValues;
  readonly runtime: PipelineBuilderRuntime;
}

export type SuperNodePrecompileArtifactKind = 'resolved-pipeline-config' | 'yaml-patch' | 'typescript-adapter';

export interface SuperNodePrecompileArtifactBase {
  readonly kind: SuperNodePrecompileArtifactKind;
  readonly path?: string;
  readonly hash?: string;
}

export interface SuperNodeResolvedPipelineConfigArtifact extends SuperNodePrecompileArtifactBase {
  readonly kind: 'resolved-pipeline-config';
  readonly document: PipelineConfigDocument;
}

export interface SuperNodeYamlPatchArtifact extends SuperNodePrecompileArtifactBase {
  readonly kind: 'yaml-patch';
  readonly patch: string;
}

export interface SuperNodeTypeScriptAdapterArtifact extends SuperNodePrecompileArtifactBase {
  readonly kind: 'typescript-adapter';
  readonly modulePath: string;
  readonly exportName?: string;
}

export type SuperNodePrecompileArtifact =
  | SuperNodeResolvedPipelineConfigArtifact
  | SuperNodeYamlPatchArtifact
  | SuperNodeTypeScriptAdapterArtifact;

export type SuperNodePrecompileValidationStatus = 'pending' | 'passed' | 'failed';

export interface SuperNodePrecompileValidation {
  readonly status: SuperNodePrecompileValidationStatus;
  readonly errors?: readonly string[];
}

export interface SuperNodePrecompileSource {
  readonly kind: string;
  readonly name: string;
  readonly version?: string;
}

export interface SuperNodePrecompileMetadata {
  readonly source: SuperNodePrecompileSource;
  readonly inputHash: string;
  readonly artifactHash?: string;
  readonly model?: string;
  readonly validation: SuperNodePrecompileValidation;
  readonly artifactPaths: readonly string[];
  readonly generatedAt?: string;
}

export interface SuperNodePrecompileResult {
  readonly document: PipelineConfigDocument;
  readonly artifacts: readonly SuperNodePrecompileArtifact[];
  readonly metadata: SuperNodePrecompileMetadata;
}

export interface SuperNodeComponent {
  readonly name: string;
  readonly precompile: (input: SuperNodePrecompileInput) => SuperNodePrecompileResult | Promise<SuperNodePrecompileResult>;
}

export type SuperNodeRegistry = Record<string, SuperNodeComponent>;

export interface DeepGoalComponentManifestExports {
  readonly stages: readonly string[];
  readonly executors: readonly string[];
  readonly nodes: readonly string[];
  readonly pipelines: readonly string[];
}

export interface DeepGoalComponentManifestCapabilities {
  readonly tools: readonly string[];
  readonly mcpServers: readonly string[];
  readonly permissions: readonly string[];
}

export interface DeepGoalComponentManifestQuality {
  readonly hasTests: boolean;
  readonly hasExamples: boolean;
  readonly hasTypedConfig: boolean;
}

export interface DeepGoalComponentManifest {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly deepgoalVersion: string;
  readonly exports: DeepGoalComponentManifestExports;
  readonly capabilities: DeepGoalComponentManifestCapabilities;
  readonly quality: DeepGoalComponentManifestQuality;
}

export type ComponentRegistryDuplicateKeyPolicy = 'reject' | 'overwrite';

export interface ComponentRegistryMergeOptions {
  readonly duplicateKeyPolicy?: ComponentRegistryDuplicateKeyPolicy;
}

export interface ComponentRegistry {
  readonly stages?: StageRegistry;
  readonly nodes?: NodeRegistry;
  readonly executors?: ExecutorRegistry;
  readonly mcpPresets?: McpPresetRegistry;
  readonly pipelines?: PipelineTemplateRegistry;
  readonly superNodes?: SuperNodeRegistry;
}

export interface DeepGoalComponentModule {
  readonly deepgoal: ComponentRegistry;
  readonly manifest?: DeepGoalComponentManifest;
}
