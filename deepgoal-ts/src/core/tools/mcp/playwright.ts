import { McpServerType, createMcpServerConfig, type McpServerConfig } from '../../types/index.js';

export const PLAYWRIGHT_MCP_SERVER_NAME = 'playwright';
export const PLAYWRIGHT_TOOL_PREFIX = 'mcp__playwright__';

export interface PlaywrightMcpStdioConfigParams {
  readonly command?: string | undefined;
  readonly args?: string[] | undefined;
  readonly env?: Record<string, string> | undefined;
  readonly outputDir?: string | undefined;
}

export function createPlaywrightMcpStdioConfig(params: PlaywrightMcpStdioConfigParams = {}): McpServerConfig {
  const args = params.args ?? ['-y', '@playwright/mcp@latest'];
  return createMcpServerConfig({
    type: McpServerType.Stdio,
    command: params.command ?? 'npx',
    args: params.outputDir === undefined ? args : [...args, '--output-dir', params.outputDir],
    env: params.env ?? {},
  });
}
