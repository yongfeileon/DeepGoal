import {
  DevelopmentNode,
  RequirementsAnalysisNode,
  TestingNode,
} from '../stages.js';
import {
  createDevelopmentStageExecutor,
  createRequirementsAnalysisStageExecutor,
  createTestingStageExecutor,
  type DevelopmentStageExecutorConfig,
  type RequirementsAnalysisStageExecutorConfig,
  type TestingStageExecutorConfig,
} from '../../executors/stages/index.js';
import {
  PLAYWRIGHT_MCP_SERVER_NAME,
  createPlaywrightMcpStdioConfig,
} from '../../tools/index.js';
import type { EngineOptions, McpServerConfig } from '../../types/index.js';
import type {
  ComponentRegistry,
  ComponentRegistryMergeOptions,
  ExecutorRegistry,
  McpPresetRegistry,
  NodeRegistry,
  PipelineTemplate,
  PipelineTemplateRegistry,
  PipelineMcpServerConfig,
  PipelineStageConfig,
  PipelineStageOptionsConfig,
  ResolvedPipelineContext,
  ResolvedStageConfig,
  StageRegistry,
  SuperNodeRegistry,
} from './types.js';

export const CLAUDE_EXECUTOR_NAME = 'claude';

const REQUIREMENTS_ARTIFACT_NAME = 'requirements';
const IMPLEMENTATION_ARTIFACT_NAME = 'implementation';
const VALIDATION_REPORT_ARTIFACT_NAME = 'validationReport';

type BuiltInPipelineTemplateStage = 'requirements-analysis' | 'development' | 'testing';

interface BuiltInPipelineTemplateInput {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly stages: readonly BuiltInPipelineTemplateStage[];
  readonly implementationPathDefault: string;
  readonly validationReportPathDefault: string;
  readonly requirementsPathReference: string;
}

export function createComponentRegistry(...registries: readonly ComponentRegistry[]): ComponentRegistry {
  return mergeComponentRegistries({}, ...registries);
}

export function mergeComponentRegistries(
  options: ComponentRegistryMergeOptions,
  ...registries: readonly ComponentRegistry[]
): ComponentRegistry {
  const stages = mergeRegistryGroup('stage', options, registries.map(registry => registry.stages));
  const nodes = mergeRegistryGroup('node', options, registries.map(registry => registry.nodes));
  const executors = mergeRegistryGroup('executor', options, registries.map(registry => registry.executors));
  const mcpPresets = mergeRegistryGroup('MCP preset', options, registries.map(registry => registry.mcpPresets));
  const pipelines = mergeRegistryGroup('pipeline template', options, registries.map(registry => registry.pipelines));
  const superNodes = mergeRegistryGroup('super node', options, registries.map(registry => registry.superNodes));

  return removeUndefinedFields({
    stages,
    nodes,
    executors,
    mcpPresets,
    pipelines,
    superNodes,
  }) as unknown as ComponentRegistry;
}

export function createDefaultComponentRegistry(): ComponentRegistry {
  return {
    stages: createDefaultStageRegistry(),
    mcpPresets: createDefaultMcpPresetRegistry(),
    pipelines: createDefaultPipelineTemplateRegistry(),
  };
}

export function createDefaultPipelineTemplateRegistry(): PipelineTemplateRegistry {
  return {
    sdd: createLinearBuiltInPipelineTemplate({
      name: 'sdd',
      displayName: 'SDD Pipeline',
      description: 'A minimal specification-driven development pipeline using built-in requirement, development, and testing stages.',
      stages: ['requirements-analysis', 'development', 'testing'],
      implementationPathDefault: '${parameters.workspace}/implementation.patch',
      validationReportPathDefault: '${parameters.workspace}/validation-report.json',
      requirementsPathReference: '${artifacts.requirements.path}',
    }),
    tdd: createLinearBuiltInPipelineTemplate({
      name: 'tdd',
      displayName: 'TDD Pipeline',
      description: 'A minimal test-driven development pipeline using the built-in development and testing stages.',
      stages: ['development', 'testing'],
      implementationPathDefault: '${parameters.workspace}/implementation.patch',
      validationReportPathDefault: '${parameters.workspace}/validation-report.json',
      requirementsPathReference: '${paths.goal}',
    }),
    bugfix: createLinearBuiltInPipelineTemplate({
      name: 'bugfix',
      displayName: 'BugFix Pipeline',
      description: 'A minimal bug fix pipeline using built-in requirement, development, and testing stages.',
      stages: ['requirements-analysis', 'development', 'testing'],
      implementationPathDefault: '${parameters.workspace}/bugfix.patch',
      validationReportPathDefault: '${parameters.workspace}/bugfix-validation.json',
      requirementsPathReference: '${artifacts.requirements.path}',
    }),
  };
}

function createLinearBuiltInPipelineTemplate(input: BuiltInPipelineTemplateInput): PipelineTemplate {
  const stages = input.stages.map(stage => createBuiltInTemplateStage(stage, input.requirementsPathReference));
  return {
    kind: 'yaml',
    name: input.name,
    displayName: input.displayName,
    description: input.description,
    parameters: {
      workspace: {
        required: true,
      },
      goalPath: {
        required: true,
      },
      requirementsPath: {
        default: '${parameters.workspace}/requirements.json',
      },
      implementationPath: {
        default: input.implementationPathDefault,
      },
      validationReportPath: {
        default: input.validationReportPathDefault,
      },
    },
    document: {
      version: 1,
      pipeline: {
        type: 'serial',
      },
      paths: {
        workspace: '${parameters.workspace}',
        goal: '${parameters.goalPath}',
      },
      artifacts: {
        requirements: {
          path: '${parameters.requirementsPath}',
        },
        implementation: {
          path: '${parameters.implementationPath}',
        },
        validationReport: {
          path: '${parameters.validationReportPath}',
        },
      },
      defaults: {
        executor: CLAUDE_EXECUTOR_NAME,
        cwd: '${paths.workspace}',
        goalPath: '${paths.goal}',
      },
      stages,
    },
  };
}

function createBuiltInTemplateStage(stage: BuiltInPipelineTemplateStage, requirementsPathReference: string): PipelineStageConfig {
  if (stage === 'requirements-analysis') {
    return {
      id: 'requirements',
      type: 'requirements-analysis',
      produces: REQUIREMENTS_ARTIFACT_NAME,
    };
  }
  if (stage === 'development') {
    return {
      id: 'implementation',
      type: 'development',
      consumes: REQUIREMENTS_ARTIFACT_NAME,
      produces: IMPLEMENTATION_ARTIFACT_NAME,
      requirementsPath: requirementsPathReference,
    };
  }
  return {
    id: 'validation',
    type: 'testing',
    consumes: [REQUIREMENTS_ARTIFACT_NAME, IMPLEMENTATION_ARTIFACT_NAME],
    produces: VALIDATION_REPORT_ARTIFACT_NAME,
    requirementsPath: requirementsPathReference,
  };
}

export function createDefaultStageRegistry(): StageRegistry {
  return {
    'requirements-analysis': {
      type: 'requirements-analysis',
      executor: CLAUDE_EXECUTOR_NAME,
      requiredFields: ['cwd', 'goalPath', 'outputPath'],
      applyConventions: applyRequirementsAnalysisConventions,
      build: input => new RequirementsAnalysisNode(createRequirementsAnalysisStageExecutor(toRequirementsAnalysisConfig(input.resolvedConfig))),
    },
    development: {
      type: 'development',
      executor: CLAUDE_EXECUTOR_NAME,
      requiredFields: ['cwd', 'goalPath', 'outputPath'],
      applyConventions: applyDevelopmentConventions,
      build: input => new DevelopmentNode(createDevelopmentStageExecutor(toDevelopmentConfig(input.resolvedConfig))),
    },
    testing: {
      type: 'testing',
      executor: CLAUDE_EXECUTOR_NAME,
      requiredFields: ['cwd', 'goalPath', 'requirementsPath', 'outputPath'],
      applyConventions: applyTestingConventions,
      build: input => new TestingNode(createTestingStageExecutor(toTestingConfig(input.resolvedConfig))),
    },
  };
}

export function createDefaultMcpPresetRegistry(): McpPresetRegistry {
  return {
    playwright: input => createPlaywrightMcpStdioConfig({
      command: input.config.command,
      args: input.config.args,
      env: input.config.env,
      outputDir: input.config.outputDir,
    }),
  };
}

export function createStageOptionsResolver(
  stageOptions: PipelineStageOptionsConfig | undefined,
  presetRegistry: McpPresetRegistry
): ((options: EngineOptions) => EngineOptions) | undefined {
  const mcpServers = stageOptions?.mcpServers;
  if (mcpServers === undefined) {
    return undefined;
  }

  return (options: EngineOptions): EngineOptions => ({
    ...options,
    mcpServers: {
      ...options.mcpServers,
      ...resolveMcpServers(mcpServers, presetRegistry),
    },
  });
}

export function requireStageFields(stage: ResolvedStageConfig, fields: readonly string[]): void {
  const missing = fields.filter(field => getStageField(stage, field) === undefined);
  if (missing.length > 0) {
    throw new Error(`Stage ${formatStage(stage)} missing required fields: ${missing.join(', ')}`);
  }
}

export function formatStage(stage: PipelineStageConfig | ResolvedStageConfig): string {
  return stage.id === undefined ? `<${stage.type}>` : `${stage.id}<${stage.type}>`;
}

function applyRequirementsAnalysisConventions(stage: ResolvedStageConfig, context: ResolvedPipelineContext): ResolvedStageConfig {
  return withOptionalResolvedFields(stage, {
    outputPath: stage.outputPath ?? artifactPath(context, stage.produces ?? REQUIREMENTS_ARTIFACT_NAME),
  });
}

function applyDevelopmentConventions(stage: ResolvedStageConfig, context: ResolvedPipelineContext): ResolvedStageConfig {
  const consumes = normalizeConsumes(stage.consumes);
  return withOptionalResolvedFields(stage, {
    requirementsPath: stage.requirementsPath ?? firstMatchingArtifactPath(context, consumes, [REQUIREMENTS_ARTIFACT_NAME]),
    outputPath: stage.outputPath ?? artifactPath(context, stage.produces ?? IMPLEMENTATION_ARTIFACT_NAME),
  });
}

function applyTestingConventions(stage: ResolvedStageConfig, context: ResolvedPipelineContext): ResolvedStageConfig {
  const consumes = normalizeConsumes(stage.consumes);
  return withOptionalResolvedFields(stage, {
    requirementsPath: stage.requirementsPath ?? firstMatchingArtifactPath(context, consumes, [REQUIREMENTS_ARTIFACT_NAME]),
    artifactPath: stage.artifactPath ?? firstMatchingArtifactPath(context, [IMPLEMENTATION_ARTIFACT_NAME, ...consumes], []),
    outputPath: stage.outputPath ?? artifactPath(context, stage.produces ?? VALIDATION_REPORT_ARTIFACT_NAME),
  });
}

function toRequirementsAnalysisConfig(stage: ResolvedStageConfig): RequirementsAnalysisStageExecutorConfig {
  return removeUndefinedFields({
    cwd: requiredString(stage.cwd, stage, 'cwd'),
    goalPath: requiredString(stage.goalPath, stage, 'goalPath'),
    outputPath: requiredString(stage.outputPath, stage, 'outputPath'),
    ...commonStageFields(stage),
  }) as unknown as RequirementsAnalysisStageExecutorConfig;
}

function toDevelopmentConfig(stage: ResolvedStageConfig): DevelopmentStageExecutorConfig {
  return removeUndefinedFields({
    cwd: requiredString(stage.cwd, stage, 'cwd'),
    goalPath: requiredString(stage.goalPath, stage, 'goalPath'),
    requirementsPath: stage.requirementsPath,
    outputPath: requiredString(stage.outputPath, stage, 'outputPath'),
    ...commonStageFields(stage),
  }) as unknown as DevelopmentStageExecutorConfig;
}

function toTestingConfig(stage: ResolvedStageConfig): TestingStageExecutorConfig {
  return removeUndefinedFields({
    cwd: requiredString(stage.cwd, stage, 'cwd'),
    goalPath: requiredString(stage.goalPath, stage, 'goalPath'),
    requirementsPath: requiredString(stage.requirementsPath, stage, 'requirementsPath'),
    artifactPath: stage.artifactPath,
    artifactUrl: stage.artifactUrl,
    outputPath: requiredString(stage.outputPath, stage, 'outputPath'),
    toolInstruction: stage.toolInstruction,
    toolPrefix: stage.toolPrefix,
    metadata: stage.metadata,
    ...commonStageFields(stage),
  }) as unknown as TestingStageExecutorConfig;
}

function commonStageFields(stage: ResolvedStageConfig): Record<string, unknown> {
  return removeUndefinedFields({
    name: stage.name,
    systemPrompt: stage.systemPrompt,
    model: stage.model,
    settingSources: stage.settingSources,
    strictMcpConfig: stage.strictMcpConfig,
    logger: stage.logger,
    createStageOptions: stage.createStageOptions,
  });
}

function withOptionalResolvedFields(
  stage: ResolvedStageConfig,
  fields: Partial<ResolvedStageConfig>
): ResolvedStageConfig {
  return removeUndefinedFields({ ...stage, ...fields }) as unknown as ResolvedStageConfig;
}

function removeUndefinedFields(value: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      cleaned[key] = item;
    }
  }
  return cleaned;
}

function resolveMcpServers(
  configs: Record<string, PipelineMcpServerConfig>,
  presetRegistry: McpPresetRegistry
): Record<string, McpServerConfig> {
  const resolved: Record<string, McpServerConfig> = {};
  for (const [serverName, serverConfig] of Object.entries(configs)) {
    const presetName = serverConfig.preset;
    if (presetName === undefined) {
      throw new Error(`MCP server ${serverName} must declare a preset.`);
    }
    const preset = presetRegistry[presetName];
    if (preset === undefined) {
      throw new Error(`Unknown MCP preset: ${presetName}`);
    }
    const resolvedName = presetName === 'playwright' && serverName === PLAYWRIGHT_MCP_SERVER_NAME ? PLAYWRIGHT_MCP_SERVER_NAME : serverName;
    resolved[resolvedName] = preset({ name: serverName, config: serverConfig });
  }
  return resolved;
}

function mergeRegistryGroup<TRegistry extends StageRegistry | NodeRegistry | ExecutorRegistry | McpPresetRegistry | PipelineTemplateRegistry | SuperNodeRegistry>(
  label: string,
  options: ComponentRegistryMergeOptions,
  registries: readonly (TRegistry | undefined)[]
): TRegistry | undefined {
  const duplicateKeyPolicy = options.duplicateKeyPolicy ?? 'reject';
  const merged: Record<string, unknown> = {};
  let hasEntries = false;

  for (const registry of registries) {
    if (registry === undefined) {
      continue;
    }
    for (const [key, value] of Object.entries(registry)) {
      if (Object.hasOwn(merged, key) && duplicateKeyPolicy === 'reject') {
        throw new Error(`Duplicate ${label} registry key: ${key}`);
      }
      merged[key] = value;
      hasEntries = true;
    }
  }

  return hasEntries ? merged as TRegistry : undefined;
}

function artifactPath(context: ResolvedPipelineContext, name: string): string | undefined {
  const artifact = context.artifacts[name];
  if (!isObject(artifact)) {
    return undefined;
  }
  const path = artifact.path;
  return typeof path === 'string' ? path : undefined;
}

function firstMatchingArtifactPath(
  context: ResolvedPipelineContext,
  consumes: readonly string[],
  fallbackNames: readonly string[]
): string | undefined {
  for (const name of [...consumes, ...fallbackNames]) {
    const path = artifactPath(context, name);
    if (path !== undefined) {
      return path;
    }
  }
  return undefined;
}

function normalizeConsumes(consumes: string | string[] | undefined): string[] {
  if (consumes === undefined) {
    return [];
  }
  return Array.isArray(consumes) ? consumes : [consumes];
}

function getStageField(stage: ResolvedStageConfig, field: string): unknown {
  return (stage as unknown as Record<string, unknown>)[field];
}

function requiredString(value: string | undefined, stage: PipelineStageConfig | ResolvedStageConfig, field: string): string {
  if (value === undefined) {
    throw new Error(`Stage ${formatStage(stage)} missing required field: ${field}`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
