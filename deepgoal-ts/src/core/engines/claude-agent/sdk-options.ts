import type { Options as SdkOptions } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeAgentOptions } from './types.js';

export function createSdkOptions(options: ClaudeAgentOptions): SdkOptions {
  const sdkOptions: SdkOptions = {
    cwd: options.cwd,
  };

  if (options.model !== undefined) {
    sdkOptions.model = options.model;
  }
  if (options.systemPrompt !== undefined) {
    sdkOptions.systemPrompt = options.systemPrompt;
  }
  if (options.settingSources !== undefined) {
    sdkOptions.settingSources = options.settingSources;
  }
  if (options.canUseTool !== undefined) {
    sdkOptions.canUseTool = options.canUseTool;
  }
  if (options.includePartialMessages !== undefined) {
    sdkOptions.includePartialMessages = options.includePartialMessages;
  }
  if (options.strictMcpConfig !== undefined) {
    sdkOptions.strictMcpConfig = options.strictMcpConfig;
  }
  if (options.tools !== undefined) {
    sdkOptions.tools = options.tools;
  }
  if (options.mcpServers !== undefined) {
    sdkOptions.mcpServers = options.mcpServers;
  }
  if (options.skills !== undefined) {
    sdkOptions.skills = options.skills;
  }
  if (options.hooks !== undefined) {
    sdkOptions.hooks = options.hooks;
  }
  if (options.permissionMode !== undefined) {
    sdkOptions.permissionMode = options.permissionMode;
  }
  if (options.allowDangerouslySkipPermissions !== undefined) {
    sdkOptions.allowDangerouslySkipPermissions = options.allowDangerouslySkipPermissions;
  }

  return sdkOptions;
}
