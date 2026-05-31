import { readFileSync } from 'node:fs';
import type {
  DeepGoalComponentManifest,
  DeepGoalComponentManifestCapabilities,
  DeepGoalComponentManifestExports,
  DeepGoalComponentManifestQuality,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

export function parseDeepGoalComponentManifest(value: unknown): DeepGoalComponentManifest {
  const manifest = requireObject(value, 'manifest');
  const exports = parseManifestExports(requiredField(manifest, 'exports', 'exports'));
  requireAtLeastOneExport(exports);

  return {
    schemaVersion: parseSchemaVersion(requiredField(manifest, 'schemaVersion', 'schemaVersion')),
    name: parseString(requiredField(manifest, 'name', 'name'), 'name'),
    displayName: parseString(requiredField(manifest, 'displayName', 'displayName'), 'displayName'),
    description: parseString(requiredField(manifest, 'description', 'description'), 'description'),
    deepgoalVersion: parseString(requiredField(manifest, 'deepgoalVersion', 'deepgoalVersion'), 'deepgoalVersion'),
    exports,
    capabilities: parseManifestCapabilities(requiredField(manifest, 'capabilities', 'capabilities')),
    quality: parseManifestQuality(requiredField(manifest, 'quality', 'quality')),
  };
}

export function loadDeepGoalComponentManifestFile(filePath: string): DeepGoalComponentManifest {
  try {
    return parseDeepGoalComponentManifest(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load component manifest from ${filePath}: ${message}`);
  }
}

function parseSchemaVersion(value: unknown): 1 {
  if (value !== 1) {
    throw new Error('schemaVersion must be 1.');
  }
  return 1;
}

function parseManifestExports(value: unknown): DeepGoalComponentManifestExports {
  const exports = requireObject(value, 'exports');
  return {
    stages: parseStringArray(requiredField(exports, 'stages', 'exports.stages'), 'exports.stages'),
    executors: parseStringArray(requiredField(exports, 'executors', 'exports.executors'), 'exports.executors'),
    nodes: parseStringArray(requiredField(exports, 'nodes', 'exports.nodes'), 'exports.nodes'),
    pipelines: parseStringArray(requiredField(exports, 'pipelines', 'exports.pipelines'), 'exports.pipelines'),
  };
}

function parseManifestCapabilities(value: unknown): DeepGoalComponentManifestCapabilities {
  const capabilities = requireObject(value, 'capabilities');
  return {
    tools: parseStringArray(requiredField(capabilities, 'tools', 'capabilities.tools'), 'capabilities.tools'),
    mcpServers: parseStringArray(requiredField(capabilities, 'mcpServers', 'capabilities.mcpServers'), 'capabilities.mcpServers'),
    permissions: parseStringArray(requiredField(capabilities, 'permissions', 'capabilities.permissions'), 'capabilities.permissions'),
  };
}

function parseManifestQuality(value: unknown): DeepGoalComponentManifestQuality {
  const quality = requireObject(value, 'quality');
  return {
    hasTests: parseBoolean(requiredField(quality, 'hasTests', 'quality.hasTests'), 'quality.hasTests'),
    hasExamples: parseBoolean(requiredField(quality, 'hasExamples', 'quality.hasExamples'), 'quality.hasExamples'),
    hasTypedConfig: parseBoolean(requiredField(quality, 'hasTypedConfig', 'quality.hasTypedConfig'), 'quality.hasTypedConfig'),
  };
}

function requireAtLeastOneExport(exports: DeepGoalComponentManifestExports): void {
  if (
    exports.stages.length === 0 &&
    exports.executors.length === 0 &&
    exports.nodes.length === 0 &&
    exports.pipelines.length === 0
  ) {
    throw new Error('exports must declare at least one stage, executor, node, or pipeline.');
  }
}

function parseString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string.`);
  }
  return value;
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean.`);
  }
  return value;
}

function parseStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value.map((item, index) => parseString(item, `${path}[${index}]`));
}

function requiredField(record: UnknownRecord, key: string, path: string): unknown {
  if (!Object.hasOwn(record, key)) {
    throw new Error(`${path} is required.`);
  }
  return record[key];
}

function requireObject(value: unknown, path: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as UnknownRecord;
}
