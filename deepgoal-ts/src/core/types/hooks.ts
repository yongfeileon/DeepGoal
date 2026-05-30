import type { JsonObject } from './common.js';

export enum HookEvent {
  PreToolUse = 'PreToolUse',
  PostToolUse = 'PostToolUse',
  PostToolUseFailure = 'PostToolUseFailure',
  UserPromptSubmit = 'UserPromptSubmit',
  Stop = 'Stop',
  SubagentStop = 'SubagentStop',
  SubagentStart = 'SubagentStart',
  Notification = 'Notification',
  PreCompact = 'PreCompact',
  PermissionRequest = 'PermissionRequest',
}

export interface HookPayload {
  data: JsonObject;
}

export interface HookResult {
  continue: boolean;
  decision?: 'block' | undefined;
  reason?: string | undefined;
  additionalContext?: string | undefined;
}

export type HookHandler = (event: HookEvent, payload: HookPayload) => Promise<HookResult>;

export function createHookPayload(data: JsonObject = {}): HookPayload {
  return { data };
}

export function createHookResult(result: Partial<HookResult> = {}): HookResult {
  return {
    continue: result.continue ?? true,
    decision: result.decision,
    reason: result.reason,
    additionalContext: result.additionalContext,
  };
}
