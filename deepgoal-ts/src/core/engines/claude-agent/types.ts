import {
  query as sdkQuery,
  type CanUseTool,
  type HookCallbackMatcher,
  type HookEvent as SdkHookEvent,
  type McpServerConfig as SdkMcpServerConfig,
  type Options as SdkOptions,
  type PermissionMode as SdkPermissionMode,
  type Query,
  type SettingSource,
} from '@anthropic-ai/claude-agent-sdk';

export const DEFAULT_CLAUDE_AGENT_MODEL = 'claude-opus-4-6';

export type ClaudeAgentQueryFactory = (params: Parameters<typeof sdkQuery>[0]) => Query;

export interface ClaudeAgentOptions {
  cwd: string;
  model?: string | undefined;
  systemPrompt?: SdkOptions['systemPrompt'] | undefined;
  tools?: string[] | undefined;
  skills?: string[] | undefined;
  mcpServers?: Record<string, SdkMcpServerConfig> | undefined;
  hooks?: Partial<Record<SdkHookEvent, HookCallbackMatcher[]>> | undefined;
  permissionMode?: SdkPermissionMode | undefined;
  canUseTool?: CanUseTool | undefined;
  settingSources?: SettingSource[] | undefined;
  includePartialMessages?: boolean | undefined;
  strictMcpConfig?: boolean | undefined;
  allowDangerouslySkipPermissions?: boolean | undefined;
}

export interface ClaudeAgentClientConfig extends Partial<Omit<ClaudeAgentOptions, 'cwd'>> {
  queryFactory?: ClaudeAgentQueryFactory | undefined;
}
