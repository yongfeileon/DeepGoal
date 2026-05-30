import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { JsonObject } from '../../types/index.js';
import type { StageLogger } from '../claude-stage.js';

export function readText(path: string | undefined): string {
  if (path === undefined) {
    throw new Error('需要提供文件路径。');
  }
  if (!existsSync(path)) {
    throw new Error(`文件不存在: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

export function writeJsonFile(path: string, value: JsonObject, logger?: StageLogger | undefined): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
  logger?.(`写入 JSON 文件 ${basename(path)}`, {
    path,
    text: readText(path),
  });
}

export function parseJsonObject(text: string): JsonObject | undefined {
  const trimmed = text.trim();
  const json = trimmed.startsWith('{') ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (json === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(json) as unknown;
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
