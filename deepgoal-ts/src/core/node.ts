import type { EngineOptions, JsonObject } from './types/index.js';

export interface Artifact {
  path: string;
  kind?: string | undefined;
  mimeType?: string | undefined;
  metadata: JsonObject;
}

export interface ExecutionError {
  type: string;
  message: string;
  details: JsonObject;
  traceback?: string | undefined;
  recoverable: boolean;
}

export interface ExecutionMetrics {
  startedAt?: Date | undefined;
  finishedAt?: Date | undefined;
  durationSeconds?: number | undefined;
}

export interface PipelineInput {
  primaryPath?: string | undefined;
  artifacts: Artifact[];
  metadata: JsonObject;
}

export interface PipelineOutput {
  primaryPath?: string | undefined;
  artifacts: Artifact[];
  metadata: JsonObject;
}

export interface PipelineResult {
  success: boolean;
  output: PipelineOutput;
  error?: ExecutionError | undefined;
  metrics?: ExecutionMetrics | undefined;
}

export abstract class Node {
  abstract run(input: PipelineInput, options: EngineOptions): Promise<PipelineResult>;
}

export function createArtifact(path: string, options: Partial<Omit<Artifact, 'path'>> = {}): Artifact {
  return {
    path,
    metadata: options.metadata ?? {},
    ...(options.kind === undefined ? {} : { kind: options.kind }),
    ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
  };
}

export function createExecutionError(error: Pick<ExecutionError, 'type' | 'message'> & Partial<ExecutionError>): ExecutionError {
  return {
    type: error.type,
    message: error.message,
    details: error.details ?? {},
    recoverable: error.recoverable ?? false,
    ...(error.traceback === undefined ? {} : { traceback: error.traceback }),
  };
}

export function createExecutionMetrics(metrics: Partial<ExecutionMetrics> = {}): ExecutionMetrics {
  return {
    ...(metrics.startedAt === undefined ? {} : { startedAt: metrics.startedAt }),
    ...(metrics.finishedAt === undefined ? {} : { finishedAt: metrics.finishedAt }),
    ...(metrics.durationSeconds === undefined ? {} : { durationSeconds: metrics.durationSeconds }),
  };
}

export function createPipelineInput(input: Partial<PipelineInput> = {}): PipelineInput {
  return {
    ...(input.primaryPath === undefined ? {} : { primaryPath: input.primaryPath }),
    artifacts: [...(input.artifacts ?? [])],
    metadata: { ...(input.metadata ?? {}) },
  };
}

export function pipelineInputFromPath(path: string): PipelineInput {
  return createPipelineInput({ primaryPath: path });
}

export function createPipelineOutput(output: Partial<PipelineOutput> = {}): PipelineOutput {
  return {
    ...(output.primaryPath === undefined ? {} : { primaryPath: output.primaryPath }),
    artifacts: [...(output.artifacts ?? [])],
    metadata: { ...(output.metadata ?? {}) },
  };
}

export function pipelineOutputFromPath(path: string): PipelineOutput {
  return createPipelineOutput({ primaryPath: path });
}

export function inputToOutput(input: PipelineInput): PipelineOutput {
  return createPipelineOutput({
    primaryPath: input.primaryPath,
    artifacts: input.artifacts,
    metadata: input.metadata,
  });
}

export function outputToStandaloneInput(output: PipelineOutput): PipelineInput {
  return createPipelineInput({
    primaryPath: output.primaryPath,
    artifacts: output.artifacts,
    metadata: output.metadata,
  });
}

export function okResult(output: PipelineOutput = createPipelineOutput(), metrics?: ExecutionMetrics): PipelineResult {
  return {
    success: true,
    output,
    ...(metrics === undefined ? {} : { metrics }),
  };
}

export function failResult(error: ExecutionError, output: PipelineOutput = createPipelineOutput(), metrics?: ExecutionMetrics): PipelineResult {
  return {
    success: false,
    output,
    error,
    ...(metrics === undefined ? {} : { metrics }),
  };
}
