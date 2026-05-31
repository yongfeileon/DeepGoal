import { createConfiguredPipeline } from './builder.js';
import type {
  ConfiguredPipeline,
  PipelineBuilderOptions,
  PipelineConfigDocument,
  PipelineConfigObject,
  PipelineConfigValue,
  PipelineDefaultsConfig,
  PipelineStageConfig,
  PipelineTemplate,
  PipelineTemplateParameterValues,
} from './types.js';

const PARAMETER_PLACEHOLDER_PATTERN = /\$\{parameters\.([^}]+)\}/g;
const WHOLE_PARAMETER_PLACEHOLDER_PATTERN = /^\$\{parameters\.([^}]+)\}$/;

export interface PipelineTemplateStageOverride {
  readonly id: string;
  readonly stage: Partial<PipelineStageConfig>;
}

export interface PipelineTemplateOverride {
  readonly stages?: readonly PipelineTemplateStageOverride[];
  readonly appendStages?: readonly PipelineStageConfig[];
  readonly defaults?: PipelineDefaultsConfig;
  readonly executors?: Record<string, PipelineDefaultsConfig>;
}

export interface PipelineTemplateInstantiationInput {
  readonly parameters?: PipelineTemplateParameterValues;
  readonly override?: PipelineTemplateOverride;
}

export interface PipelineTemplateBuildInput extends PipelineTemplateInstantiationInput {
  readonly builderOptions?: PipelineBuilderOptions;
}

export function resolvePipelineTemplateParameters(
  template: PipelineTemplate,
  parameters: PipelineTemplateParameterValues = {}
): PipelineTemplateParameterValues {
  const definitions = template.parameters ?? {};
  const resolved: Record<string, PipelineConfigValue> = {};

  for (const [name, definition] of Object.entries(definitions)) {
    if (hasOwn(parameters, name)) {
      const value = parameters[name];
      if (value !== undefined) {
        resolved[name] = value;
      }
      continue;
    }
    if (definition.default !== undefined) {
      resolved[name] = resolveTemplateConfigValue(definition.default, { ...parameters, ...resolved } as PipelineTemplateParameterValues);
      continue;
    }
    if (definition.required === true) {
      throw new Error(`Pipeline template ${template.name} missing required parameter: ${name}`);
    }
  }

  for (const name of Object.keys(parameters)) {
    if (!hasOwn(definitions, name)) {
      throw new Error(`Pipeline template ${template.name} has no parameter named ${name}.`);
    }
  }

  return resolved as PipelineTemplateParameterValues;
}

export function instantiatePipelineTemplate(
  template: PipelineTemplate,
  input: PipelineTemplateInstantiationInput = {}
): PipelineConfigDocument {
  const parameters = resolvePipelineTemplateParameters(template, input.parameters);
  const document = template.kind === 'yaml'
    ? resolveTemplateDocumentParameters(template.document, parameters)
    : template.factory({ parameters });
  return applyPipelineTemplateOverride(template.name, document, input.override);
}

export function createConfiguredPipelineFromTemplate(
  template: PipelineTemplate,
  input: PipelineTemplateBuildInput = {}
): ConfiguredPipeline {
  return createConfiguredPipeline(instantiatePipelineTemplate(template, input), input.builderOptions);
}

function applyPipelineTemplateOverride(
  templateName: string,
  document: PipelineConfigDocument,
  override: PipelineTemplateOverride | undefined
): PipelineConfigDocument {
  if (override === undefined) {
    return document;
  }
  const stageOverrides = override.stages ?? [];
  requireStageOverrideTargets(templateName, document.stages, stageOverrides);
  const stageOverrideById = indexStageOverrides(templateName, stageOverrides);
  const stages = document.stages.map(stage => applyStageOverride(stage, stageOverrideById));
  const appendStages = override.appendStages ?? [];
  return removeUndefinedFields({
    ...document,
    defaults: mergeOptionalConfig(document.defaults, override.defaults),
    executors: mergeOptionalExecutors(document.executors, override.executors),
    stages: [...stages, ...appendStages],
  }) as PipelineConfigDocument;
}

function requireStageOverrideTargets(
  templateName: string,
  stages: readonly PipelineStageConfig[],
  overrides: readonly PipelineTemplateStageOverride[]
): void {
  const stageIds = new Set(stages.map(stage => stage.id).filter((id): id is string => id !== undefined));
  for (const override of overrides) {
    if (!stageIds.has(override.id)) {
      throw new Error(`Pipeline template ${templateName} stage override target not found: ${override.id}`);
    }
  }
}

function indexStageOverrides(
  templateName: string,
  overrides: readonly PipelineTemplateStageOverride[]
): ReadonlyMap<string, Partial<PipelineStageConfig>> {
  const indexed = new Map<string, Partial<PipelineStageConfig>>();
  for (const override of overrides) {
    if (indexed.has(override.id)) {
      throw new Error(`Pipeline template ${templateName} has duplicate stage override for: ${override.id}`);
    }
    indexed.set(override.id, override.stage);
  }
  return indexed;
}

function applyStageOverride(
  stage: PipelineStageConfig,
  overrides: ReadonlyMap<string, Partial<PipelineStageConfig>>
): PipelineStageConfig {
  const id = stage.id;
  if (id === undefined) {
    return stage;
  }
  const override = overrides.get(id);
  if (override === undefined) {
    return stage;
  }
  return removeUndefinedFields({ ...stage, ...override }) as PipelineStageConfig;
}

function mergeOptionalConfig(
  base: PipelineDefaultsConfig | undefined,
  override: PipelineDefaultsConfig | undefined
): PipelineDefaultsConfig | undefined {
  if (override === undefined) {
    return base;
  }
  return removeUndefinedFields({ ...base, ...override }) as PipelineDefaultsConfig;
}

function mergeOptionalExecutors(
  base: Record<string, PipelineDefaultsConfig> | undefined,
  override: Record<string, PipelineDefaultsConfig> | undefined
): Record<string, PipelineDefaultsConfig> | undefined {
  if (override === undefined) {
    return base;
  }
  const merged: Record<string, PipelineDefaultsConfig> = { ...(base ?? {}) };
  for (const [name, defaults] of Object.entries(override)) {
    merged[name] = mergeOptionalConfig(merged[name], defaults) ?? {};
  }
  return merged;
}

function resolveTemplateDocumentParameters(
  document: PipelineConfigDocument,
  parameters: PipelineTemplateParameterValues
): PipelineConfigDocument {
  return resolveTemplateConfigValue(document, parameters) as PipelineConfigDocument;
}

function resolveTemplateConfigValue(
  value: PipelineConfigValue,
  parameters: PipelineTemplateParameterValues
): PipelineConfigValue {
  if (typeof value === 'string') {
    return resolveTemplateString(value, parameters);
  }
  if (Array.isArray(value)) {
    return value.map(item => resolveTemplateConfigValue(item, parameters));
  }
  if (isConfigObject(value)) {
    const resolved: PipelineConfigObject = {};
    for (const [key, item] of Object.entries(value)) {
      resolved[key] = resolveTemplateConfigValue(item, parameters);
    }
    return resolved;
  }
  return value;
}

function resolveTemplateString(value: string, parameters: PipelineTemplateParameterValues): PipelineConfigValue {
  const wholeMatch = value.match(WHOLE_PARAMETER_PLACEHOLDER_PATTERN);
  if (wholeMatch !== null) {
    return requireParameter(parameters, requireCapture(wholeMatch[1], value));
  }
  return value.replace(PARAMETER_PLACEHOLDER_PATTERN, (_match: string, name: string | undefined): string => {
    const parameter = requireParameter(parameters, requireCapture(name, value));
    return stringifyParameterValue(parameter);
  });
}

function requireParameter(parameters: PipelineTemplateParameterValues, name: string): PipelineConfigValue {
  const trimmed = name.trim();
  const value = parameters[trimmed];
  if (value === undefined) {
    throw new Error(`Unresolved pipeline template parameter: ${trimmed}`);
  }
  return value;
}

function stringifyParameterValue(value: PipelineConfigValue): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return '';
  }
  return JSON.stringify(value);
}

function requireCapture(value: string | undefined, source: string): string {
  if (value === undefined) {
    throw new Error(`Invalid pipeline template parameter expression: ${source}`);
  }
  return value;
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

function isConfigObject(value: PipelineConfigValue): value is PipelineConfigObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
