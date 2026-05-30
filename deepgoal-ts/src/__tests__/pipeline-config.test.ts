import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  PermissionMode,
  createConfiguredPipeline,
  createEngineOptions,
  Executor,
  okResult,
  parsePipelineConfigYaml,
  pipelineInputFromPath,
  pipelineOutputFromPath,
  type EngineOptions,
  type PipelineInput,
  type PipelineResult,
  type ResolvedStageConfig,
  type StageRegistry,
} from '../index.js';

const CONFIG_YAML = `
version: 1
pipeline:
  type: serial
engine:
  permissionMode: bypassPermissions
goal:
  path: ${'${runtime.goalPath}'}
  text: Build the configured target
paths:
  workspace: ${'${runtime.workspaceDir}'}
  goal: ${'${goal.path}'}
artifacts:
  requirements:
    path: ${'${runtime.requirementsPath}'}
  implementation:
    path: ${'${runtime.implementationPath}'}
  validationReport:
    path: ${'${runtime.validationReportPath}'}
  testEvidence:
    path: ${'${runtime.testEvidenceDir}'}
defaults:
  executor: claude
  cwd: ${'${paths.workspace}'}
  goalPath: ${'${paths.goal}'}
  model: ${'${env.ANTHROPIC_MODEL}'}
  settingSources: []
  strictMcpConfig: true
stages:
  - id: requirements
    type: requirements-analysis
    produces: requirements
  - id: implementation
    type: development
    consumes: requirements
    produces: implementation
  - id: validation
    type: testing
    consumes:
      - requirements
      - implementation
    produces: validationReport
    artifactUrl: ${'${fileUrl:artifacts.implementation.path}'}
    metadata:
      testEvidenceDir: ${'${artifacts.testEvidence.path}'}
    stageOptions:
      mcpServers:
        playwright:
          preset: playwright
          outputDir: ${'${artifacts.testEvidence.path}'}
`;

interface CapturedStage {
  readonly id: string | undefined;
  readonly type: string;
  readonly config: ResolvedStageConfig;
}

class TraceExecutor extends Executor {
  constructor(outputPath: string) {
    super(pipelineOutputFromPath(outputPath));
  }

  override async execute(_input: PipelineInput, _options: EngineOptions): Promise<PipelineResult> {
    return okResult(this.output);
  }
}

describe('pipeline YAML config builder', () => {
  it('applies defaults, artifact conventions, interpolation, and engine options', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-test-model';
    const captured: CapturedStage[] = [];
    const configured = createConfiguredPipeline(parsePipelineConfigYaml(CONFIG_YAML), {
      runtime: runtimeValues(),
      stageRegistry: createCapturingStageRegistry(captured),
      logger: () => undefined,
    });

    assert.equal(configured.engineOptions.permissionMode, PermissionMode.Bypass);
    assert.deepEqual(configured.goal, { path: '/workspace/goal.txt', text: 'Build the configured target', source: 'inline' });
    const result = await configured.pipeline.run(pipelineInputFromPath('/workspace/goal.txt'), createEngineOptions());

    assert.equal(result.success, true);
    assert.equal(result.output.primaryPath, '/workspace/e2e-report.json');
    assert.equal(captured.length, 3);
    assert.deepEqual(captured.map(stage => stage.id), ['requirements', 'implementation', 'validation']);

    const requirements = requireCaptured(captured, 'requirements');
    assert.equal(requirements.config.cwd, '/workspace');
    assert.equal(requirements.config.goalPath, '/workspace/goal.txt');
    assert.equal(requirements.config.outputPath, '/workspace/requirements.json');
    assert.equal(requirements.config.model, 'claude-test-model');
    assert.deepEqual(requirements.config.settingSources, []);
    assert.equal(requirements.config.strictMcpConfig, true);

    const implementation = requireCaptured(captured, 'implementation');
    assert.equal(implementation.config.requirementsPath, '/workspace/requirements.json');
    assert.equal(implementation.config.outputPath, '/workspace/index.html');

    const validation = requireCaptured(captured, 'validation');
    assert.equal(validation.config.requirementsPath, '/workspace/requirements.json');
    assert.equal(validation.config.artifactPath, '/workspace/index.html');
    assert.equal(validation.config.artifactUrl, pathToFileURL('/workspace/index.html').href);
    assert.equal(validation.config.outputPath, '/workspace/e2e-report.json');
    assert.deepEqual(validation.config.metadata, { testEvidenceDir: '/workspace/test-evidence' });
    assert.equal(typeof validation.config.createStageOptions, 'function');

    const stageOptions = validation.config.createStageOptions?.(createEngineOptions({
      mcpServers: {
        existing: {
          type: 'stdio',
          command: 'noop',
          args: [],
          headers: {},
          env: {},
        },
      },
      permissionMode: PermissionMode.AcceptEdits,
    } as Partial<EngineOptions>));
    assert.equal(stageOptions?.permissionMode, PermissionMode.AcceptEdits);
    assert.equal(stageOptions?.mcpServers.existing?.command, 'noop');
    assert.deepEqual(stageOptions?.mcpServers.playwright?.args, ['-y', '@playwright/mcp@latest', '--output-dir', '/workspace/test-evidence']);
  });

  it('loads goal text from a configured file path', () => {
    const goalPath = resolve(process.cwd(), 'package.json');
    const config = parsePipelineConfigYaml(`
version: 1
goal:
  path: ${JSON.stringify(goalPath)}
defaults:
  cwd: /workspace
  goalPath: ${JSON.stringify(goalPath)}
stages:
  - id: requirements
    type: requirements-analysis
    outputPath: /workspace/requirements.json
`);

    const configured = createConfiguredPipeline(config);

    assert.equal(configured.goal?.path, goalPath);
    assert.equal(configured.goal?.text, readFileSync(goalPath, 'utf8'));
    assert.equal(configured.goal?.source, 'file');
  });

  it('rejects unknown stage types with a clear error', () => {
    const config = parsePipelineConfigYaml(`
version: 1
stages:
  - id: mystery
    type: unknown-stage
`);

    assert.throws(
      () => createConfiguredPipeline(config),
      /Unknown pipeline stage type: unknown-stage/
    );
  });

  it('reports missing required fields after convention resolution', () => {
    const config = parsePipelineConfigYaml(`
version: 1
defaults:
  cwd: /workspace
stages:
  - id: requirements
    type: requirements-analysis
`);

    assert.throws(
      () => createConfiguredPipeline(config),
      /Stage requirements<requirements-analysis> missing required fields: goalPath, outputPath/
    );
  });
});

function runtimeValues(): Record<string, string> {
  return {
    workspaceDir: '/workspace',
    goalPath: '/workspace/goal.txt',
    requirementsPath: '/workspace/requirements.json',
    implementationPath: '/workspace/index.html',
    validationReportPath: '/workspace/e2e-report.json',
    testEvidenceDir: '/workspace/test-evidence',
  };
}

function createCapturingStageRegistry(captured: CapturedStage[]): StageRegistry {
  return {
    'requirements-analysis': createCapturingEntry('requirements-analysis', ['cwd', 'goalPath', 'outputPath'], captured),
    development: createCapturingEntry('development', ['cwd', 'goalPath', 'outputPath'], captured),
    testing: createCapturingEntry('testing', ['cwd', 'goalPath', 'requirementsPath', 'outputPath'], captured),
  };
}

function createCapturingEntry(type: string, requiredFields: readonly string[], captured: CapturedStage[]): StageRegistry[string] {
  return {
    type,
    executor: 'claude',
    requiredFields,
    applyConventions: (stage, context) => {
      if (type === 'requirements-analysis') {
        return withFields(stage, {
          outputPath: stage.outputPath ?? artifactPath(context.artifacts, stage.produces ?? 'requirements'),
        });
      }
      if (type === 'development') {
        return withFields(stage, {
          requirementsPath: stage.requirementsPath ?? artifactPath(context.artifacts, 'requirements'),
          outputPath: stage.outputPath ?? artifactPath(context.artifacts, stage.produces ?? 'implementation'),
        });
      }
      return withFields(stage, {
        requirementsPath: stage.requirementsPath ?? artifactPath(context.artifacts, 'requirements'),
        artifactPath: stage.artifactPath ?? artifactPath(context.artifacts, 'implementation'),
        outputPath: stage.outputPath ?? artifactPath(context.artifacts, stage.produces ?? 'validationReport'),
      });
    },
    build: input => {
      captured.push({ id: input.resolvedConfig.id, type, config: input.resolvedConfig });
      return new TraceExecutor(input.resolvedConfig.outputPath ?? type);
    },
  };
}

function withFields(stage: ResolvedStageConfig, fields: Partial<ResolvedStageConfig>): ResolvedStageConfig {
  const merged: Record<string, unknown> = { ...stage };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as unknown as ResolvedStageConfig;
}

function artifactPath(artifacts: Record<string, unknown>, name: string): string | undefined {
  const artifact = artifacts[name];
  if (artifact === null || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return undefined;
  }
  const path = (artifact as Record<string, unknown>).path;
  return typeof path === 'string' ? path : undefined;
}

function requireCaptured(captured: CapturedStage[], id: string): CapturedStage {
  const stage = captured.find(item => item.id === id);
  if (stage === undefined) {
    throw new Error(`Missing captured stage: ${id}`);
  }
  return stage;
}
