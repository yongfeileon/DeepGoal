import type { JsonObject, JsonValue } from '../../types/common.js';

export function appendLine(previous: string, next: string): string {
  return previous.length === 0 ? next : `${previous}\n${next}`;
}

export function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function getObjectValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function jsonValueFromUnknown(value: unknown, seen: WeakSet<object> = new WeakSet()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function' || value === undefined) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(item => jsonValueFromUnknown(item, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const output: JsonObject = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = jsonValueFromUnknown(nested, seen);
    }
    seen.delete(value);
    return output;
  }
  return String(value);
}
