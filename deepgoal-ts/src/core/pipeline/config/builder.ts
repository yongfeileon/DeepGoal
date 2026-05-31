import { readFileSync } from 'node:fs';
import { Pipe } from '../pipe.js';
import { PermissionMode, createEngineOptions, type EngineOptions } from '../../types/index.js';
import {
  createDefaultComponentRegistry,
  createDefaultMcpPresetRegistry,
  createDefaultStageRegistry,
  createStageOptionsResolver,
  mergeComponentRegistries,
  requireStageFields,
} from './registry.js';
import { resolveConfigObject, resolvePipelineContext } from './interpolation.js';
import type {
  ComponentRegistry,
  ComponentRegistryMergeOptions,
  ConfiguredPipeline,
  McpPresetRegistry,
  PipelineBuilderOptions,
  PipelineConfigDocument,
  PipelineDefaultsConfig,
  PipelineGoalConfig,
  PipelineStageConfig,
  ResolvedPipelineContext,
  ResolvedPipelineGoal,
  ResolvedStageConfig,
  StageRegistry,
} from './types.js';

export function createConfiguredPipeline(
  document: PipelineConfigDocument,
  options: PipelineBuilderOptions = {}
): ConfiguredPipeline {
  validatePipelineDocument(document);

  const stageRegistry = resolveStageRegistry(options);
  const mcpPresetRegistry = resolveMcpPresetRegistry(options);
  const context = resolvePipelineContext({
    goal: document.goal,
    paths: document.paths,
    artifacts: document.artifacts,
    vars: document.vars,
  }, options.runtime);
  const goal = resolvePipelineGoal(document.goal, context);
  const defaults = resolveConfigObject(document.defaults ?? {}, context) as PipelineDefaultsConfig;
  const executors = resolveExecutorDefaults(document.executors, context);
  const engineOptions = createEngineOptions(resolveEngineOptions(document, context));
  const items = document.stages.map(stage => {
    const entry = stageRegistry[stage.type];
    if (entry === undefined) {
      throw new Error(`Unknown pipeline stage type: ${stage.type}`);
    }

    const resolvedStage = resolveStageConfig(stage, defaults, executors, context, options, mcpPresetRegistry);
    const conventionStage = entry.applyConventions(resolvedStage, context);
    requireSupportedExecutor(conventionStage.executor, entry.executor, conventionStage.type);
    requireStageFields(conventionStage, entry.requiredFields);

    return entry.build({
      stage,
      resolvedConfig: conventionStage,
      context,
    });
  });

  return removeUndefined({
    pipeline: new Pipe(items, engineOptions),
    engineOptions,
    goal,
  }) as unknown as ConfiguredPipeline;
}

function resolveStageRegistry(options: PipelineBuilderOptions): StageRegistry {
  if (options.stageRegistry !== undefined) {
    return options.stageRegistry;
  }
  const defaultRegistry = createDefaultComponentRegistry();
  if (options.componentRegistry === undefined) {
    return defaultRegistry.stages ?? createDefaultStageRegistry();
  }
  return mergeComponentRegistries(
    componentRegistryMergeOptions(options),
    stageComponentRegistry(defaultRegistry),
    stageComponentRegistry(options.componentRegistry)
  ).stages ?? {};
}

function resolveMcpPresetRegistry(options: PipelineBuilderOptions): McpPresetRegistry {
  if (options.mcpPresetRegistry !== undefined) {
    return options.mcpPresetRegistry;
  }
  const defaultRegistry = createDefaultComponentRegistry();
  if (options.componentRegistry === undefined) {
    return defaultRegistry.mcpPresets ?? createDefaultMcpPresetRegistry();
  }
  return mergeComponentRegistries(
    componentRegistryMergeOptions(options),
    mcpPresetComponentRegistry(defaultRegistry),
    mcpPresetComponentRegistry(options.componentRegistry)
  ).mcpPresets ?? {};
}

function componentRegistryMergeOptions(options: PipelineBuilderOptions): ComponentRegistryMergeOptions {
  const duplicateKeyPolicy = options.componentRegistryDuplicateKeyPolicy;
  return duplicateKeyPolicy === undefined ? {} : { duplicateKeyPolicy };
}

function stageComponentRegistry(registry: ComponentRegistry): ComponentRegistry {
  const stages = registry.stages;
  return stages === undefined ? {} : { stages };
}

function mcpPresetComponentRegistry(registry: ComponentRegistry): ComponentRegistry {
  const mcpPresets = registry.mcpPresets;
  return mcpPresets === undefined ? {} : { mcpPresets };
}

function resolvePipelineGoal(
  goal: PipelineGoalConfig | undefined,
  context: ResolvedPipelineContext
): ResolvedPipelineGoal | undefined {
  if (goal === undefined) {
    return undefined;
  }
  const resolvedGoal = resolveConfigObject(goal, context) as PipelineGoalConfig;
  const path = resolvedGoal.path;
  const text = resolvedGoal.text;
  if (path === undefined && text === undefined) {
    return undefined;
  }
  if (path === undefined) {
    throw new Error('goal.path is required when goal.text is provided.');
  }
  if (text !== undefined) {
    return { path, text, source: 'inline' };
  }
  return { path, text: readFileSync(path, 'utf8'), source: 'file' };
}

function resolveEngineOptions(document: PipelineConfigDocument, context: ResolvedPipelineContext): Partial<EngineOptions> {
  const engine = resolveConfigObject(document.engine ?? {}, context);
  const permissionMode = engine.permissionMode;
  if (permissionMode === undefined) {
    return {};
  }
  if (typeof permissionMode !== 'string') {
    throw new Error('engine.permissionMode must be a string.');
  }
  return { permissionMode: parsePermissionMode(permissionMode) };
}

function resolveStageConfig(
  stage: PipelineStageConfig,
  defaults: PipelineDefaultsConfig,
  executors: Record<string, PipelineDefaultsConfig>,
  context: ResolvedPipelineContext,
  options: PipelineBuilderOptions,
  mcpPresetRegistry: McpPresetRegistry
): ResolvedStageConfig {
  const resolvedStage = resolveConfigObject(stage, context) as PipelineStageConfig;
  const executorName = resolvedStage.executor ?? defaults.executor ?? 'claude';
  const executorDefaults = executors[executorName] ?? {};
  const merged = omitStageOnlyFields({
    ...defaults,
    ...executorDefaults,
    ...resolvedStage,
    executor: executorName,
  });
  const createStageOptions = createStageOptionsResolver(resolvedStage.stageOptions, mcpPresetRegistry);
  return removeUndefined({
    ...merged,
    logger: options.logger,
    createStageOptions,
  }) as unknown as ResolvedStageConfig;
}

function resolveExecutorDefaults(
  executors: Record<string, PipelineDefaultsConfig> | undefined,
  context: ResolvedPipelineContext
): Record<string, PipelineDefaultsConfig> {
  if (executors === undefined) {
    return {};
  }
  const resolved: Record<string, PipelineDefaultsConfig> = {};
  for (const [name, defaults] of Object.entries(executors)) {
    resolved[name] = resolveConfigObject(defaults, context) as PipelineDefaultsConfig;
  }
  return resolved;
}

function omitStageOnlyFields(stage: PipelineStageConfig): Omit<PipelineStageConfig, 'stageOptions'> {
  const { stageOptions: _stageOptions, ...rest } = stage;
  return rest;
}

function validatePipelineDocument(document: PipelineConfigDocument): void {
  if (document.version !== 1) {
    throw new Error(`Unsupported pipeline config version: ${document.version}`);
  }
  const pipelineType = document.pipeline?.type ?? 'serial';
  if (pipelineType !== 'serial') {
    throw new Error(`Unsupported pipeline type: ${pipelineType}`);
  }
}

function requireSupportedExecutor(actual: string | undefined, expected: string, stageType: string): void {
  const executor = actual ?? expected;
  if (executor !== expected) {
    throw new Error(`Stage ${stageType} requires executor ${expected}, got ${executor}.`);
  }
}

function parsePermissionMode(value: string): PermissionMode {
  const modes = Object.values(PermissionMode);
  if ((modes as string[]).includes(value)) {
    return value as PermissionMode;
  }
  throw new Error(`Unsupported permissionMode: ${value}`);
}

function removeUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      cleaned[key] = item;
    }
  }
  return cleaned;
}

