import type { EngineOptions } from './types/index.js';
import { createPipelineOutput, type PipelineInput, type PipelineOutput, type PipelineResult } from './node.js';

export abstract class Executor {
  protected readonly output: PipelineOutput;

  constructor(output: PipelineOutput = createPipelineOutput()) {
    this.output = output;
  }

  abstract execute(input: PipelineInput, options: EngineOptions): Promise<PipelineResult>;
}
