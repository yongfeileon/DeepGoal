import { pathToFileURL } from 'node:url';
import type {
  PipelineBuilderRuntime,
  PipelineConfigObject,
  PipelineConfigValue,
  ResolvedPipelineContext,
} from './types.js';

const PLACEHOLDER_PATTERN = /\$\{([^}]+)\}/g;
const WHOLE_PLACEHOLDER_PATTERN = /^\$\{([^}]+)\}$/;

export function createBaseInterpolationContext(runtime: PipelineBuilderRuntime = {}): ResolvedPipelineContext {
  return {
    runtime,
    goal: {},
    paths: {},
    artifacts: {},
    vars: {},
    env: process.env,
  };
}

export function resolveConfigValue(value: PipelineConfigValue, context: ResolvedPipelineContext): PipelineConfigValue {
  if (typeof value === 'string') {
    return resolveString(value, context);
  }
  if (Array.isArray(value)) {
    return value.map(item => resolveConfigValue(item, context));
  }
  if (isConfigObject(value)) {
    return resolveConfigObject(value, context);
  }
  return value;
}

export function resolveConfigObject(value: PipelineConfigObject, context: ResolvedPipelineContext): PipelineConfigObject {
  const resolved: PipelineConfigObject = {};
  for (const [key, item] of Object.entries(value)) {
    resolved[key] = resolveConfigValue(item, context);
  }
  return resolved;
}

export function resolvePipelineContext(documentContext: {
  readonly goal?: PipelineConfigObject | undefined;
  readonly paths?: PipelineConfigObject | undefined;
  readonly artifacts?: PipelineConfigObject | undefined;
  readonly vars?: PipelineConfigObject | undefined;
}, runtime: PipelineBuilderRuntime = {}): ResolvedPipelineContext {
  const base = createBaseInterpolationContext(runtime);
  const goal = resolveConfigObject(documentContext.goal ?? {}, base);
  const withGoal: ResolvedPipelineContext = { ...base, goal };
  const paths = resolveConfigObject(documentContext.paths ?? {}, withGoal);
  const withPaths: ResolvedPipelineContext = { ...withGoal, paths };
  const artifacts = resolveConfigObject(documentContext.artifacts ?? {}, withPaths);
  const withArtifacts: ResolvedPipelineContext = { ...withPaths, artifacts };
  const vars = resolveConfigObject(documentContext.vars ?? {}, withArtifacts);
  return { ...withArtifacts, vars };
}

function resolveString(value: string, context: ResolvedPipelineContext): PipelineConfigValue {
  const wholeMatch = value.match(WHOLE_PLACEHOLDER_PATTERN);
  if (wholeMatch !== null) {
    return resolveExpression(requireCapture(wholeMatch[1], value), context);
  }
  return value.replace(PLACEHOLDER_PATTERN, (_match: string, expression: string | undefined): string => {
    const resolved = resolveExpression(requireCapture(expression, value), context);
    return stringifyResolvedValue(resolved);
  });
}

function resolveExpression(expression: string, context: ResolvedPipelineContext): PipelineConfigValue {
  const trimmed = expression.trim();
  if (trimmed.startsWith('fileUrl:')) {
    const pathExpression = trimmed.slice('fileUrl:'.length).trim();
    const pathValue = resolveReference(pathExpression, context);
    if (typeof pathValue !== 'string') {
      throw new Error(`fileUrl expression must resolve to a string path: ${expression}`);
    }
    return pathToFileURL(pathValue).href;
  }
  return resolveReference(trimmed, context);
}

function resolveReference(reference: string, context: ResolvedPipelineContext): PipelineConfigValue {
  const [root, ...segments] = reference.split('.');
  if (root === undefined || root.length === 0 || segments.length === 0) {
    throw new Error(`Invalid interpolation reference: ${reference}`);
  }

  switch (root) {
    case 'runtime':
      return requireValue(getPathValue(context.runtime, segments), reference);
    case 'goal':
      return requireValue(getPathValue(context.goal, segments), reference);
    case 'paths':
      return requireValue(getPathValue(context.paths, segments), reference);
    case 'artifacts':
      return requireValue(getPathValue(context.artifacts, segments), reference);
    case 'vars':
      return requireValue(getPathValue(context.vars, segments), reference);
    case 'env':
      return requireValue(context.env[segments.join('.')], reference);
    default:
      throw new Error(`Unknown interpolation root: ${root}`);
  }
}

function getPathValue(source: unknown, segments: readonly string[]): PipelineConfigValue | undefined {
  let current: unknown = source;
  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return isPipelineConfigValue(current) ? current : undefined;
}

function requireValue(value: PipelineConfigValue | undefined, reference: string): PipelineConfigValue {
  if (value === undefined) {
    throw new Error(`Unresolved interpolation reference: ${reference}`);
  }
  return value;
}

function stringifyResolvedValue(value: PipelineConfigValue): string {
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
    throw new Error(`Invalid interpolation expression: ${source}`);
  }
  return value;
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
  if (isRecord(value)) {
    return Object.values(value).every(isPipelineConfigValue);
  }
  return false;
}

function isConfigObject(value: PipelineConfigValue): value is PipelineConfigObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
