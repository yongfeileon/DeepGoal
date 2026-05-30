import type { SDKAssistantMessage, SDKMessage, SDKResultError, SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import type { JsonObject } from '../../types/common.js';
import type { AgentStreamEvent } from '../../types/engine.js';
import { getObjectValue, isRecord, jsonValueFromUnknown, stringifyUnknown } from './utils.js';

export function mapSdkMessageToEvents(message: SDKMessage): AgentStreamEvent[] {
  switch (message.type) {
    case 'assistant':
      return assistantMessageToEvents(message);
    case 'user':
      return userMessageToEvents(message);
    case 'system':
      return systemMessageToEvents(message);
    case 'result':
      return resultMessageToEvents(message);
    default:
      return [{ type: 'message', content: stringifyUnknown(message), metadata: baseMetadata(message) }];
  }
}

function assistantMessageToEvents(message: SDKAssistantMessage): AgentStreamEvent[] {
  if (message.error !== undefined) {
    return [{ type: 'error', content: message.error, metadata: baseMetadata(message) }];
  }

  const content = getObjectValue(message.message, 'content');
  const events = contentBlocksToEvents(content, baseMetadata(message));
  if (events.length > 0) {
    return events;
  }

  return [{ type: 'message', content: stringifyUnknown(message.message), metadata: baseMetadata(message) }];
}

function userMessageToEvents(message: Extract<SDKMessage, { type: 'user' }>): AgentStreamEvent[] {
  const events = contentBlocksToEvents(message.message.content, baseMetadata(message));
  if (events.length > 0) {
    return events;
  }
  return [{ type: 'message', content: stringifyMessageParam(message.message), metadata: baseMetadata(message) }];
}

function systemMessageToEvents(message: Extract<SDKMessage, { type: 'system' }>): AgentStreamEvent[] {
  const content = 'subtype' in message && typeof message.subtype === 'string' ? message.subtype : stringifyUnknown(message);
  return [{ type: 'message', content, metadata: baseMetadata(message) }];
}

function resultMessageToEvents(message: SDKResultSuccess | SDKResultError): AgentStreamEvent[] {
  if (message.subtype === 'success') {
    return [{ type: 'done', content: message.result, metadata: baseMetadata(message) }];
  }
  return [{ type: 'error', content: message.errors.join('\n'), metadata: baseMetadata(message) }];
}

function contentBlocksToEvents(content: unknown, metadata: JsonObject): AgentStreamEvent[] {
  if (!Array.isArray(content)) {
    return [];
  }

  const events: AgentStreamEvent[] = [];
  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }

    const blockType = typeof block.type === 'string' ? block.type : '';
    const eventMetadata: JsonObject = { ...metadata, block: jsonValueFromUnknown(block) };
    if (blockType === 'text' && typeof block.text === 'string') {
      events.push({ type: 'message', content: block.text, metadata: eventMetadata });
      continue;
    }
    if (blockType === 'tool_use') {
      const contentText = typeof block.name === 'string' ? block.name : stringifyUnknown(block);
      events.push({ type: 'tool_call', content: contentText, metadata: eventMetadata });
      continue;
    }
    if (blockType === 'tool_result') {
      events.push({ type: 'tool_result', content: stringifyUnknown(block.content), metadata: eventMetadata });
    }
  }

  return events;
}

function baseMetadata(message: SDKMessage): JsonObject {
  const metadata: JsonObject = { type: message.type };
  if ('subtype' in message && typeof message.subtype === 'string') {
    metadata.subtype = message.subtype;
  }
  if ('session_id' in message && typeof message.session_id === 'string') {
    metadata.sessionId = message.session_id;
  }
  if ('uuid' in message && typeof message.uuid === 'string') {
    metadata.uuid = message.uuid;
  }
  return metadata;
}

function stringifyMessageParam(message: Extract<SDKMessage, { type: 'user' }>['message']): string {
  return typeof message.content === 'string' ? message.content : stringifyUnknown(message.content);
}
