import { Executor } from './executor.js';
import { Node, createPipelineInput, inputToOutput, okResult, type PipelineInput, type PipelineOutput, type PipelineResult } from './node.js';
import type { EngineOptions } from './types/index.js';

export type PipelineItem = Node | Executor;
export type ParallelMerge = (results: PipelineResult[]) => PipelineResult;
export type LoopPredicate = (result: PipelineResult) => boolean;
export type BranchSelector = (input: PipelineInput) => PipelineItem;

export function outputToInput(previous: PipelineInput, output: PipelineOutput): PipelineInput {
  return createPipelineInput({
    primaryPath: output.primaryPath,
    artifacts: [...previous.artifacts, ...output.artifacts],
    metadata: { ...previous.metadata, ...output.metadata },
  });
}

export async function runPipelineItem(item: PipelineItem, input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
  if (item instanceof Node) {
    return item.run(input, options);
  }
  if (item instanceof Executor) {
    return item.execute(input, options);
  }
  throw new TypeError(`Unsupported pipeline item: ${typeof item}`);
}

export class SerialNode extends Node {
  constructor(private readonly items: PipelineItem[]) {
    super();
  }

  override async run(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    let current = input;
    let result = okResult(inputToOutput(input));

    for (const item of this.items) {
      result = await runPipelineItem(item, current, options);
      if (!result.success) {
        return result;
      }
      current = outputToInput(current, result.output);
    }

    return result;
  }
}

export class ParallelNode extends Node {
  constructor(
    private readonly items: PipelineItem[],
    private readonly merge: ParallelMerge
  ) {
    super();
  }

  override async run(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    const results = await Promise.all(this.items.map(item => runPipelineItem(item, input, options)));
    return this.merge(results);
  }
}

export class LoopNode extends Node {
  constructor(
    private readonly inner: PipelineItem,
    private readonly until: LoopPredicate
  ) {
    super();
  }

  override async run(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    let current = input;

    while (true) {
      const result = await runPipelineItem(this.inner, current, options);
      if (!result.success || this.until(result)) {
        return result;
      }
      current = outputToInput(current, result.output);
    }
  }
}

export class BranchNode extends Node {
  constructor(private readonly selector: BranchSelector) {
    super();
  }

  override async run(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    return runPipelineItem(this.selector(input), input, options);
  }
}
