import type { JsonObject } from './common.js';
import { McpServerType } from './enums.js';

export interface ToolParams {
  values: JsonObject;
}

export interface McpServerConfig {
  type: McpServerType;
  command?: string | undefined;
  args: string[];
  url?: string | undefined;
  headers: Record<string, string>;
  env: Record<string, string>;
}

export interface ToolConfig {
  name: string;
  params: ToolParams;
}

export interface SkillConfig {
  name: string;
  args: string;
}

export function createToolParams(values: JsonObject = {}): ToolParams {
  return { values };
}

export function createMcpServerConfig(config: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    type: config.type ?? McpServerType.Stdio,
    command: config.command,
    args: config.args ?? [],
    url: config.url,
    headers: config.headers ?? {},
    env: config.env ?? {},
  };
}

export function createToolConfig(name: string, params: ToolParams = createToolParams()): ToolConfig {
  return { name, params };
}

export function createSkillConfig(name: string, args = ''): SkillConfig {
  return { name, args };
}
