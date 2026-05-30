import { Executor } from '../executor.js';
import { Node, type PipelineInput, type PipelineResult } from '../node.js';
import type { EngineOptions } from '../types/index.js';

abstract class ExecutorBackedNode extends Node {
  protected constructor(protected readonly executor: Executor) {
    super();
  }

  override run(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    return this.executor.execute(input, options);
  }
}

export class RequirementsAnalysisNode extends ExecutorBackedNode {
  constructor(executor: Executor) {
    super(executor);
  }
}

export class DevelopmentNode extends ExecutorBackedNode {
  constructor(executor: Executor) {
    super(executor);
  }
}

export class TestingNode extends ExecutorBackedNode {
  constructor(executor: Executor) {
    super(executor);
  }
}
