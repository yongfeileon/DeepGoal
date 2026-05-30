import { BaseAgent } from './base.js';
import { okResult, pipelineOutputFromPath, type PipelineInput, type PipelineOutput, type PipelineResult } from '../node.js';
import type { EngineOptions } from '../types/index.js';

abstract class NamedStubAgent extends BaseAgent {
  constructor(
    private readonly agentName: string,
    output?: PipelineOutput
  ) {
    super(output);
  }

  override async execute(input: PipelineInput, _options: EngineOptions): Promise<PipelineResult> {
    return okResult({
      ...this.output,
      metadata: {
        ...this.output.metadata,
        agent: this.agentName,
        input: input.primaryPath ?? '',
      },
    });
  }
}

export class AnalysisAgent extends NamedStubAgent {
  constructor(output?: PipelineOutput) {
    super('AnalysisAgent', output);
  }
}

export class DecompositionAgent extends NamedStubAgent {
  constructor(output?: PipelineOutput) {
    super('DecompositionAgent', output);
  }
}

export class PlanningAgent extends NamedStubAgent {
  constructor(output?: PipelineOutput) {
    super('PlanningAgent', output);
  }
}

export class TaskAgent extends NamedStubAgent {
  constructor(output?: PipelineOutput) {
    super('TaskAgent', output);
  }
}

export class ExecutorAgent extends NamedStubAgent {
  constructor(output?: PipelineOutput) {
    super('ExecutorAgent', output);
  }
}

export class AcceptanceAgent extends NamedStubAgent {
  constructor(output?: PipelineOutput) {
    super('AcceptanceAgent', output);
  }
}

export function outputPath(path: string): PipelineOutput {
  return pipelineOutputFromPath(path);
}
