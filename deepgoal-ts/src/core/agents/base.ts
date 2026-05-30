import { Executor } from '../executor.js';
import type { EngineOptions } from '../types/index.js';
import type { PipelineInput, PipelineResult } from '../node.js';

export abstract class BaseAgent extends Executor {
  abstract override execute(input: PipelineInput, options: EngineOptions): Promise<PipelineResult>;
}
