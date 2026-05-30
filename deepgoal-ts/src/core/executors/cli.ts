import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { Executor } from '../executor.js';
import {
  createExecutionError,
  createExecutionMetrics,
  failResult,
  okResult,
  type ExecutionMetrics,
  type PipelineInput,
  type PipelineOutput,
  type PipelineResult,
} from '../node.js';
import type { EngineOptions } from '../types/index.js';

export interface CliCommandSpec {
  executable: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  returnCode: number;
  signal?: NodeJS.Signals;
}

export function createCliCommandSpec(spec: Pick<CliCommandSpec, 'executable'> & Partial<CliCommandSpec>): CliCommandSpec {
  return {
    executable: spec.executable,
    args: spec.args ?? [],
    ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }),
    env: spec.env ?? {},
  };
}

export class CliExecutor extends Executor {
  constructor(
    private readonly command: CliCommandSpec,
    output?: PipelineOutput
  ) {
    super(output);
  }

  override async execute(input: PipelineInput, _options: EngineOptions): Promise<PipelineResult> {
    const startedAt = new Date();
    const started = performance.now();
    const args = this.command.args.map(arg => this.formatArg(arg, input));
    const env = Object.keys(this.command.env).length > 0 ? { ...process.env, ...this.command.env } : undefined;

    try {
      const result = await this.runCommand(args, env);
      const metrics = this.metrics(startedAt, started);
      const output = {
        ...this.output,
        metadata: {
          ...this.output.metadata,
          returncode: result.returnCode,
          stdout: result.stdout,
          stderr: result.stderr,
          ...(result.signal === undefined ? {} : { signal: result.signal }),
        },
      };

      if (result.returnCode === 0) {
        return okResult(output, metrics);
      }

      return failResult(
        createExecutionError({
          type: 'CliCommandFailed',
          message: result.signal === undefined
            ? `Command exited with status ${result.returnCode}`
            : `Command terminated by signal ${result.signal}`,
          details: {
            returncode: result.returnCode,
            ...(result.signal === undefined ? {} : { signal: result.signal }),
          },
        }),
        output,
        metrics
      );
    } catch (error) {
      return failResult(
        createExecutionError({
          type: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
        }),
        this.output,
        this.metrics(startedAt, started)
      );
    }
  }

  private formatArg(arg: string, input: PipelineInput): string {
    return arg
      .replaceAll('{input.primary_path}', input.primaryPath ?? '')
      .replaceAll('{output.primary_path}', this.output.primaryPath ?? '');
  }

  private runCommand(args: string[], env?: NodeJS.ProcessEnv): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command.executable, args, {
        ...(this.command.cwd === undefined ? {} : { cwd: this.command.cwd }),
        ...(env === undefined ? {} : { env }),
        shell: false,
      });
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', chunk => {
        stdout += String(chunk);
      });
      child.stderr?.on('data', chunk => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        resolve({
          stdout,
          stderr,
          returnCode: code ?? -1,
          ...(signal === null ? {} : { signal }),
        });
      });
    });
  }

  private metrics(startedAt: Date, started: number): ExecutionMetrics {
    return createExecutionMetrics({
      startedAt,
      finishedAt: new Date(),
      durationSeconds: (performance.now() - started) / 1000,
    });
  }
}
