import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Executor } from '../executor.js';
import { createExecutionError, failResult, inputToOutput, okResult, type PipelineInput, type PipelineOutput, type PipelineResult } from '../node.js';
import type { EngineOptions } from '../types/index.js';

export class HumanExecutor extends Executor {
  constructor(
    private readonly prompt: string,
    output?: PipelineOutput
  ) {
    super(output);
  }

  override async execute(inputValue: PipelineInput, _options: EngineOptions): Promise<PipelineResult> {
    output.write(`\n[HumanExecutor] ${this.prompt}\n  ${inputValue.primaryPath ?? ''}  ->  ${this.output.primaryPath ?? ''}\n`);
    const response = await this.askUser('  确认继续? [y/N]: ');

    if (response.trim().toLowerCase() === 'y') {
      return okResult(this.output);
    }

    return failResult(
      createExecutionError({ type: 'HumanRejected', message: '人工拒绝继续', recoverable: true }),
      inputToOutput(inputValue)
    );
  }

  private async askUser(prompt: string): Promise<string> {
    const readline = createInterface({ input, output });
    try {
      return await readline.question(prompt);
    } finally {
      readline.close();
    }
  }
}
