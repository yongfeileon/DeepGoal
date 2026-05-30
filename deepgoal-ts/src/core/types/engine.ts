import type { AsyncIterableLike, JsonObject } from './common.js';
import { PermissionMode } from './enums.js';
import type { HookEvent, HookHandler } from './hooks.js';
import type { McpServerConfig, SkillConfig, ToolConfig } from './tools.js';

export interface EngineOptions {
  tools: ToolConfig[];
  mcpServers: Record<string, McpServerConfig>;
  skills: SkillConfig[];
  hooks: Partial<Record<HookEvent, HookHandler[]>>;
  permissionMode: PermissionMode;
}

export interface AgentRunRequest {
  prompt: string;
  cwd: string;
  metadata: JsonObject;
}

export type AgentStreamEventType = 'message' | 'tool_call' | 'tool_result' | 'error' | 'done';

export interface AgentStreamEvent {
  type: AgentStreamEventType;
  content?: string | undefined;
  metadata: JsonObject;
}

export interface EngineRunResult {
  success: boolean;
  output: string;
  error?: string | undefined;
  metadata: JsonObject;
}

export interface AgentEngine {
  stream(request: AgentRunRequest, options: EngineOptions): AsyncIterableLike<AgentStreamEvent>;
  run(request: AgentRunRequest, options: EngineOptions): Promise<EngineRunResult>;
}

export function createEngineOptions(options: Partial<EngineOptions> = {}): EngineOptions {
  return {
    tools: options.tools ?? [],
    mcpServers: options.mcpServers ?? {},
    skills: options.skills ?? [],
    hooks: options.hooks ?? {},
    permissionMode: options.permissionMode ?? PermissionMode.Default,
  };
}

export function createAgentRunRequest(prompt: string, cwd: string, metadata: JsonObject = {}): AgentRunRequest {
  return { prompt, cwd, metadata };
}

export function createAgentStreamEvent(type: AgentStreamEventType, content?: string, metadata: JsonObject = {}): AgentStreamEvent {
  return { type, content, metadata };
}

export function createEngineRunResult(success: boolean, output: string, metadata: JsonObject = {}, error?: string): EngineRunResult {
  return { success, output, metadata, error };
}
