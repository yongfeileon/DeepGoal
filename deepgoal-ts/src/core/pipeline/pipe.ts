import { SerialNode, type PipelineItem } from '../container.js';
import type { PipelineInput, PipelineResult } from '../node.js';
import { createEngineOptions, type EngineOptions } from '../types/index.js';

export class Pipe extends SerialNode {
  private readonly defaultOptions: EngineOptions;

  constructor(items: PipelineItem[], options: EngineOptions = createEngineOptions()) {
    super(items);
    this.defaultOptions = options;
  }

  override async run(input: PipelineInput, options: EngineOptions = this.defaultOptions): Promise<PipelineResult> {
    return super.run(input, options);
  }
}
