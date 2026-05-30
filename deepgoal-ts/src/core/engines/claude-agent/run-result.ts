import type { JsonObject } from '../../types/common.js';
import type { AgentRunRequest, AgentStreamEvent, EngineRunResult } from '../../types/engine.js';
import { createEngineRunResult } from '../../types/engine.js';
import { appendLine } from './utils.js';

export async function collectEngineRunResult(
  events: AsyncIterable<AgentStreamEvent>,
  request: AgentRunRequest
): Promise<EngineRunResult> {
  const errors: string[] = [];
  let lastMessage = '';
  let finalOutput = '';
  let finalMetadata: JsonObject = { ...request.metadata };

  for await (const event of events) {
    if (event.type === 'message' && typeof event.content === 'string') {
      lastMessage = appendLine(lastMessage, event.content);
    }
    if (event.type === 'done' && typeof event.content === 'string') {
      finalOutput = event.content;
      finalMetadata = { ...request.metadata, ...event.metadata };
    }
    if (event.type === 'error' && typeof event.content === 'string') {
      errors.push(event.content);
    }
  }

  const output = finalOutput.length > 0 ? finalOutput : lastMessage;
  if (errors.length > 0) {
    return createEngineRunResult(false, output, finalMetadata, errors.join('\n'));
  }
  return createEngineRunResult(true, output, finalMetadata);
}
