import type {
  HookCallbackMatcher,
  HookEvent as SdkHookEvent,
  HookInput,
  HookJSONOutput,
  McpServerConfig as SdkMcpServerConfig,
  Options as SdkOptions,
  PermissionMode as SdkPermissionMode,
} from '@anthropic-ai/claude-agent-sdk';
import { McpServerType, PermissionMode } from '../../types/enums.js';
import type { AgentRunRequest, EngineOptions } from '../../types/engine.js';
import type { HookEvent, HookHandler, HookResult } from '../../types/hooks.js';
import type { McpServerConfig, ToolConfig } from '../../types/tools.js';
import type { JsonObject } from '../../types/common.js';
import { DEFAULT_CLAUDE_AGENT_MODEL, type ClaudeAgentClientConfig, type ClaudeAgentOptions } from './types.js';
import { stringifyUnknown } from './utils.js';

export function createClaudeAgentOptionsFromEngine(
  request: AgentRunRequest,
  options: EngineOptions,
  config: ClaudeAgentClientConfig = {}
): ClaudeAgentOptions {
  const agentOptions: ClaudeAgentOptions = {
    cwd: request.cwd,
    model: config.model ?? DEFAULT_CLAUDE_AGENT_MODEL,
    permissionMode: mapPermissionMode(options.permissionMode),
  };

  if (config.systemPrompt !== undefined) {
    agentOptions.systemPrompt = config.systemPrompt;
  }
  if (config.settingSources !== undefined) {
    agentOptions.settingSources = config.settingSources;
  }
  if (config.canUseTool !== undefined) {
    agentOptions.canUseTool = config.canUseTool;
  }
  if (config.includePartialMessages !== undefined) {
    agentOptions.includePartialMessages = config.includePartialMessages;
  }
  if (config.strictMcpConfig !== undefined) {
    agentOptions.strictMcpConfig = config.strictMcpConfig;
  }
  if (options.tools.length > 0) {
    agentOptions.tools = options.tools.map(mapToolName);
  }
  if (Object.keys(options.mcpServers).length > 0) {
    agentOptions.mcpServers = mapMcpServers(options.mcpServers);
  }
  if (options.skills.length > 0) {
    agentOptions.skills = options.skills.map(skill => skill.name);
  }
  const hooks = mapHooks(options.hooks);
  if (hooks !== undefined) {
    agentOptions.hooks = hooks;
  }
  if (options.permissionMode === PermissionMode.Bypass) {
    agentOptions.allowDangerouslySkipPermissions = true;
  }

  return agentOptions;
}

export function mapPermissionMode(mode: PermissionMode): SdkPermissionMode {
  switch (mode) {
    case PermissionMode.Default:
      return 'default';
    case PermissionMode.AcceptEdits:
      return 'acceptEdits';
    case PermissionMode.Bypass:
      return 'bypassPermissions';
    default:
      return mode;
  }
}

export function mapMcpServers(servers: Record<string, McpServerConfig>): Record<string, SdkMcpServerConfig> {
  return Object.fromEntries(Object.entries(servers).map(([name, server]) => [name, mapMcpServer(server)]));
}

export function mapMcpServer(server: McpServerConfig): SdkMcpServerConfig {
  switch (server.type) {
    case McpServerType.Stdio:
      return {
        type: 'stdio',
        command: server.command ?? '',
        args: [...server.args],
        env: { ...server.env },
      };
    case McpServerType.Sse:
      return {
        type: 'sse',
        url: server.url ?? '',
        headers: { ...server.headers },
      };
    case McpServerType.Http:
      return {
        type: 'http',
        url: server.url ?? '',
        headers: { ...server.headers },
      };
    default:
      return {
        type: 'stdio',
        command: server.command ?? '',
        args: [...server.args],
        env: { ...server.env },
      };
  }
}

export function mapHooks(hooks: Partial<Record<HookEvent, HookHandler[]>>): SdkOptions['hooks'] {
  const entries = Object.entries(hooks) as Array<[HookEvent, HookHandler[] | undefined]>;
  const mapped: Partial<Record<SdkHookEvent, HookCallbackMatcher[]>> = {};

  for (const [event, handlers] of entries) {
    if (handlers === undefined || handlers.length === 0) {
      continue;
    }
    mapped[event as SdkHookEvent] = [
      {
        hooks: handlers.map(handler => async (input: HookInput, toolUseID: string | undefined, hookOptions: { signal: AbortSignal }): Promise<HookJSONOutput> => {
          const result = await handler(event, { data: hookPayloadFromInput(input, toolUseID, hookOptions.signal) });
          return createSdkHookResult(event, result);
        }),
      },
    ];
  }

  return Object.keys(mapped).length === 0 ? undefined : mapped;
}

function hookPayloadFromInput(input: HookInput, toolUseID: string | undefined, signal: AbortSignal): JsonObject {
  const payload: JsonObject = {
    input: stringifyUnknown(input),
    aborted: signal.aborted,
  };
  if (toolUseID !== undefined) {
    payload.toolUseID = toolUseID;
  }
  return payload;
}

function createSdkHookResult(event: HookEvent, result: HookResult): HookJSONOutput {
  const output: Record<string, unknown> = { continue: result.continue };
  if (result.decision === 'block') {
    output.decision = 'block';
  }
  if (result.reason !== undefined) {
    output.reason = result.reason;
  }
  if (result.additionalContext !== undefined) {
    const hookSpecificOutput = createAdditionalContextOutput(event, result.additionalContext);
    if (hookSpecificOutput === undefined) {
      output.systemMessage = result.additionalContext;
    } else {
      output.hookSpecificOutput = hookSpecificOutput;
    }
  }
  return output as HookJSONOutput;
}

function createAdditionalContextOutput(event: HookEvent, additionalContext: string): Record<string, string> | undefined {
  switch (event) {
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'UserPromptSubmit':
    case 'SubagentStart':
    case 'Notification':
      return { hookEventName: event, additionalContext };
    default:
      return undefined;
  }
}

function mapToolName(tool: ToolConfig): string {
  return tool.name;
}
