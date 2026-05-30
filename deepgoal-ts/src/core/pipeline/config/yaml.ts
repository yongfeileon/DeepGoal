import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import type {
  PipelineArtifactConfig,
  PipelineArtifactsConfig,
  PipelineConfigDocument,
  PipelineConfigObject,
  PipelineConfigValue,
  PipelineDefaultsConfig,
  PipelineEngineConfig,
  PipelineGoalConfig,
  PipelineMcpServerConfig,
  PipelinePathsConfig,
  PipelineShapeConfig,
  PipelineStageConfig,
  PipelineStageOptionsConfig,
  PipelineVarsConfig,
} from './types.js';
import { createConfiguredPipeline } from './builder.js';
import type { ConfiguredPipeline, PipelineBuilderOptions } from './types.js';

export function parsePipelineConfigYaml(source: string): PipelineConfigDocument {
  return parsePipelineConfigDocument(load(source));
}

export function loadPipelineConfigYamlFile(filePath: string): PipelineConfigDocument {
  return parsePipelineConfigYaml(readFileSync(filePath, 'utf8'));
}

export function loadConfiguredPipelineFromYamlFile(
  filePath: string,
  options: PipelineBuilderOptions = {}
): ConfiguredPipeline {
  return createConfiguredPipeline(loadPipelineConfigYamlFile(filePath), options);
}

export function parsePipelineConfigDocument(value: unknown): PipelineConfigDocument {
  const object = requireObject(value, 'pipeline config');
  const version = object.version;
  if (version !== 1) {
    throw new Error(`Unsupported pipeline config version: ${String(version)}`);
  }
  const stagesValue = object.stages;
  if (!Array.isArray(stagesValue)) {
    throw new Error('pipeline config requires stages array.');
  }
  const document: PipelineConfigDocument = {
    version,
    stages: stagesValue.map((stage, index) => parseStageConfig(stage, `stages[${index}]`)),
  };
  setOptional(document, 'pipeline', optionalShapeConfig(object.pipeline));
  setOptional(document, 'engine', optionalEngineConfig(object.engine));
  setOptional(document, 'goal', optionalGoalConfig(object.goal));
  setOptional(document, 'paths', optionalPathsConfig(object.paths));
  setOptional(document, 'artifacts', optionalArtifactsConfig(object.artifacts));
  setOptional(document, 'vars', optionalVarsConfig(object.vars));
  setOptional(document, 'defaults', optionalDefaultsConfig(object.defaults));
  setOptional(document, 'executors', optionalExecutorDefaults(object.executors));
  return document;
}

function setOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function optionalShapeConfig(value: unknown): PipelineShapeConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = requireConfigObject(value, 'pipeline');
  optionalString(object.type, 'pipeline.type');
  return object as PipelineShapeConfig;
}

function optionalEngineConfig(value: unknown): PipelineEngineConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = requireConfigObject(value, 'engine');
  optionalString(object.permissionMode, 'engine.permissionMode');
  return object as PipelineEngineConfig;
}

function optionalGoalConfig(value: unknown): PipelineGoalConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = requireConfigObject(value, 'goal');
  optionalString(object.path, 'goal.path');
  optionalString(object.text, 'goal.text');
  if (object.path === undefined && object.text === undefined) {
    throw new Error('goal requires path or text.');
  }
  return object as PipelineGoalConfig;
}

function optionalPathsConfig(value: unknown): PipelinePathsConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireConfigObject(value, 'paths');
}

function optionalArtifactsConfig(value: unknown): PipelineArtifactsConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = requireObject(value, 'artifacts');
  const artifacts: PipelineArtifactsConfig = {};
  for (const [name, artifact] of Object.entries(object)) {
    artifacts[name] = parseArtifactConfig(artifact, `artifacts.${name}`);
  }
  return artifacts;
}

function optionalVarsConfig(value: unknown): PipelineVarsConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireConfigObject(value, 'vars');
}

function optionalDefaultsConfig(value: unknown): PipelineDefaultsConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseDefaultsConfig(value, 'defaults');
}

function optionalExecutorDefaults(value: unknown): Record<string, PipelineDefaultsConfig> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = requireObject(value, 'executors');
  const executors: Record<string, PipelineDefaultsConfig> = {};
  for (const [name, defaults] of Object.entries(object)) {
    executors[name] = parseDefaultsConfig(defaults, `executors.${name}`);
  }
  return executors;
}

function parseArtifactConfig(value: unknown, path: string): PipelineArtifactConfig {
  const object = requireConfigObject(value, path);
  optionalString(object.path, `${path}.path`);
  return object as PipelineArtifactConfig;
}

function parseDefaultsConfig(value: unknown, path: string): PipelineDefaultsConfig {
  const object = requireConfigObject(value, path);
  optionalString(object.executor, `${path}.executor`);
  optionalString(object.cwd, `${path}.cwd`);
  optionalString(object.goalPath, `${path}.goalPath`);
  optionalString(object.outputPath, `${path}.outputPath`);
  optionalString(object.model, `${path}.model`);
  optionalStringArray(object.settingSources, `${path}.settingSources`);
  optionalBoolean(object.strictMcpConfig, `${path}.strictMcpConfig`);
  return object as PipelineDefaultsConfig;
}

function parseStageConfig(value: unknown, path: string): PipelineStageConfig {
  const object = requireConfigObject(value, path);
  const type = object.type;
  if (typeof type !== 'string' || type.length === 0) {
    throw new Error(`${path}.type must be a non-empty string.`);
  }
  optionalString(object.id, `${path}.id`);
  optionalString(object.executor, `${path}.executor`);
  optionalConsumes(object.consumes, `${path}.consumes`);
  optionalString(object.produces, `${path}.produces`);
  optionalString(object.name, `${path}.name`);
  optionalString(object.cwd, `${path}.cwd`);
  optionalString(object.goalPath, `${path}.goalPath`);
  optionalString(object.requirementsPath, `${path}.requirementsPath`);
  optionalString(object.artifactPath, `${path}.artifactPath`);
  optionalString(object.artifactUrl, `${path}.artifactUrl`);
  optionalString(object.outputPath, `${path}.outputPath`);
  optionalString(object.systemPrompt, `${path}.systemPrompt`);
  optionalString(object.toolInstruction, `${path}.toolInstruction`);
  optionalString(object.toolPrefix, `${path}.toolPrefix`);
  optionalString(object.model, `${path}.model`);
  optionalStringArray(object.settingSources, `${path}.settingSources`);
  optionalBoolean(object.strictMcpConfig, `${path}.strictMcpConfig`);
  optionalJsonObject(object.metadata, `${path}.metadata`);
  optionalStageOptionsConfig(object.stageOptions, `${path}.stageOptions`);
  return object as PipelineStageConfig;
}

function optionalStageOptionsConfig(value: unknown, path: string): PipelineStageOptionsConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  const object = requireConfigObject(value, path);
  if (object.mcpServers !== undefined) {
    const servers = requireObject(object.mcpServers, `${path}.mcpServers`);
    for (const [name, server] of Object.entries(servers)) {
      parseMcpServerConfig(server, `${path}.mcpServers.${name}`);
    }
  }
  return object as PipelineStageOptionsConfig;
}

function parseMcpServerConfig(value: unknown, path: string): PipelineMcpServerConfig {
  const object = requireConfigObject(value, path);
  optionalString(object.preset, `${path}.preset`);
  optionalString(object.command, `${path}.command`);
  optionalStringArray(object.args, `${path}.args`);
  optionalStringRecord(object.env, `${path}.env`);
  optionalString(object.outputDir, `${path}.outputDir`);
  return object as PipelineMcpServerConfig;
}

function optionalConsumes(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value === 'string') {
    return;
  }
  optionalStringArray(value, path);
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`${path} must be a string.`);
  }
}

function optionalBoolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean.`);
  }
}

function optionalStringArray(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${path} must be a string array.`);
  }
}

function optionalStringRecord(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  const object = requireObject(value, path);
  for (const [key, item] of Object.entries(object)) {
    if (typeof item !== 'string') {
      throw new Error(`${path}.${key} must be a string.`);
    }
  }
}

function optionalJsonObject(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  if (!isConfigObject(value)) {
    throw new Error(`${path} must be an object.`);
  }
}

function requireConfigObject(value: unknown, path: string): PipelineConfigObject {
  const object = requireObject(value, path);
  if (!isPipelineConfigObject(object)) {
    throw new Error(`${path} contains unsupported values.`);
  }
  return object;
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function isPipelineConfigObject(value: Record<string, unknown>): value is PipelineConfigObject {
  return Object.values(value).every(isPipelineConfigValue);
}

function isPipelineConfigValue(value: unknown): value is PipelineConfigValue {
  if (value === null) {
    return true;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isPipelineConfigValue);
  }
  if (isConfigObject(value)) {
    return Object.values(value).every(isPipelineConfigValue);
  }
  return false;
}

function isConfigObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
