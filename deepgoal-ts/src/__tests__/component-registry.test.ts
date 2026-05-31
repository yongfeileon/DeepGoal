import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  McpServerType,
  createComponentRegistry,
  createDefaultComponentRegistry,
  createConfiguredPipeline,
  createDefaultStageRegistry,
  instantiatePipelineTemplate,
  loadPipelineConfigYamlFile,
  mergeComponentRegistries,
  type ComponentRegistry,
  type PipelineConfigDocument,
  type ResolvedStageConfig,
  type StageBuildInput,
  type StageRegistry,
  type SuperNodeComponent,
  type SuperNodePrecompileInput,
} from '../index.js';

const traceStage = createStageRegistry('trace');
const reviewStage = createStageRegistry('review');
const templateExamplePaths = [
  fileURLToPath(new URL('../../src/__tests__/pipeline-template-sdd.example.yaml', import.meta.url)),
  fileURLToPath(new URL('../../src/__tests__/pipeline-template-tdd.example.yaml', import.meta.url)),
  fileURLToPath(new URL('../../src/__tests__/pipeline-template-bugfix.example.yaml', import.meta.url)),
];

describe('component registry', () => {
  it('merges multiple component registries', () => {
    const merged = createComponentRegistry(
      {
        stages: traceStage,
        mcpPresets: {
          browser: input => ({
            type: McpServerType.Stdio,
            command: 'browser-mcp',
            args: [input.name],
            env: {},
            headers: {},
          }),
        },
      },
      {
        stages: reviewStage,
        pipelines: {
          review: {
            kind: 'yaml',
            name: 'review',
            document: {
              version: 1,
              stages: [],
            },
          },
          build: {
            kind: 'factory',
            name: 'build',
            factory: () => ({
              version: 1,
              stages: [],
            }),
          },
        },
      }
    );

    assert.equal(merged.stages?.trace, traceStage.trace);
    assert.equal(merged.stages?.review, reviewStage.review);
    assert.equal(typeof merged.mcpPresets?.browser, 'function');
    assert.equal(merged.pipelines?.review?.kind, 'yaml');
    assert.equal(merged.pipelines?.review?.name, 'review');
    assert.equal(merged.pipelines?.review?.document.version, 1);
    assert.equal(merged.pipelines?.build?.kind, 'factory');
    assert.equal(typeof merged.pipelines?.build?.factory, 'function');
  });

  it('includes agent-phase-runner stage in default registry', () => {
    const registry = createDefaultStageRegistry();
    const agentPhaseRunner = registry['agent-phase-runner'];

    assert.ok(agentPhaseRunner, 'agent-phase-runner stage should exist in default registry');
    assert.equal(agentPhaseRunner.type, 'agent-phase-runner');
    assert.equal(agentPhaseRunner.executor, 'claude');
    assert.deepEqual(agentPhaseRunner.requiredFields, ['technicalDocPath', 'roadmapPath', 'workspaceRoot', 'maxIterations']);
  });

  it('includes agent-phase-runner template in default registry', () => {
    const componentRegistry = createDefaultComponentRegistry();
    const template = componentRegistry.pipelines?.['agent-phase-runner'];

    assert.ok(template, 'agent-phase-runner template should exist in default registry');
    assert.equal(template.kind, 'yaml');
    assert.equal(template.name, 'agent-phase-runner');
    assert.equal(template.displayName, 'Agent Phase Runner');
    assert.ok(template.parameters?.workspace?.required, 'workspace parameter should be required');
    assert.ok(template.parameters?.technicalDocPath?.required, 'technicalDocPath parameter should be required');
    assert.ok(template.parameters?.roadmapPath?.required, 'roadmapPath parameter should be required');
  });

  it('merges super node components and preserves the precompile protocol shape', async () => {
    const superNode = createTraceSuperNode('adapter');
    const document = {
      version: 1,
      stages: [],
    } satisfies PipelineConfigDocument;
    const registry = createComponentRegistry({
      superNodes: {
        adapter: superNode,
      },
    });

    const result = await registry.superNodes?.adapter?.precompile({
      document,
      componentRegistry: registry,
      manifests: [],
      runtime: {},
    });

    assert.equal(registry.superNodes?.adapter, superNode);
    assert.equal(result?.document, document);
    assert.equal(result?.artifacts[0]?.kind, 'resolved-pipeline-config');
    assert.equal(result?.metadata.source.kind, 'super-node');
    assert.equal(result?.metadata.validation.status, 'passed');
    assert.deepEqual(result?.metadata.artifactPaths, []);
  });

  it('rejects duplicate super node registry keys', () => {
    assert.throws(
      () => createComponentRegistry(
        { superNodes: { adapter: createTraceSuperNode('adapter') } },
        { superNodes: { adapter: createTraceSuperNode('adapter') } }
      ),
      /Duplicate super node registry key: adapter/
    );
  });

  it('rejects duplicate stage registry keys', () => {
    assert.throws(
      () => createComponentRegistry(
        { stages: traceStage },
        { stages: createStageRegistry('trace') }
      ),
      /Duplicate stage registry key: trace/
    );
  });

  it('allows explicit overwrite of duplicate registry keys', () => {
    const replacementTraceStage = createStageRegistry('trace');
    const merged = mergeComponentRegistries(
      { duplicateKeyPolicy: 'overwrite' },
      { stages: traceStage },
      { stages: replacementTraceStage }
    );

    assert.equal(merged.stages?.trace, replacementTraceStage.trace);
  });

  it('creates a default component registry from built-in stages, MCP presets, and pipeline templates', () => {
    const defaultComponentRegistry = createDefaultComponentRegistry();
    const defaultStageRegistry = createDefaultStageRegistry();

    assert.deepEqual(Object.keys(defaultComponentRegistry.stages ?? {}).sort(), Object.keys(defaultStageRegistry).sort());
    assert.equal(defaultComponentRegistry.stages?.['requirements-analysis']?.type, defaultStageRegistry['requirements-analysis']?.type);
    assert.equal(defaultComponentRegistry.stages?.development?.type, defaultStageRegistry.development?.type);
    assert.equal(defaultComponentRegistry.stages?.testing?.type, defaultStageRegistry.testing?.type);
    assert.equal(typeof defaultComponentRegistry.mcpPresets?.playwright, 'function');
    assert.deepEqual(Object.keys(defaultComponentRegistry.pipelines ?? {}).sort(), ['agent-phase-runner', 'bugfix', 'sdd', 'tdd']);
    assert.equal(defaultComponentRegistry.pipelines?.tdd?.kind, 'yaml');
  });

  it('builds default pipeline templates through the configured pipeline builder', () => {
    const defaultComponentRegistry = createDefaultComponentRegistry();
    const expectedStages = {
      sdd: 'requirements-analysis,development,testing',
      tdd: 'development,testing',
      bugfix: 'requirements-analysis,development,testing',
    };

    for (const [name, stageTypes] of Object.entries(expectedStages)) {
      const template = defaultComponentRegistry.pipelines?.[name];
      if (template === undefined) {
        throw new Error(`Missing default ${name} pipeline template.`);
      }

      const document = instantiatePipelineTemplate(template, {
        parameters: {
          workspace: `/workspace/${name}`,
          goalPath: `/workspace/${name}/goal.md`,
        },
      });
      const captured: ResolvedStageConfig[] = [];
      const configured = createConfiguredPipeline(document, {
        stageRegistry: createCapturingBuiltInStageRegistry(captured),
      });

      assert.equal(document.stages.map(stage => stage.type).join(','), stageTypes);
      assert.equal(document.artifacts?.implementation?.path?.startsWith(`/workspace/${name}/`), true);
      assert.equal(document.artifacts?.validationReport?.path?.startsWith(`/workspace/${name}/`), true);
      assert.equal(configured.pipeline.constructor.name, 'Pipe');
      const validation = captured.find(stage => stage.id === 'validation');
      assert.equal(validation?.outputPath, `/workspace/${name}/${name === 'bugfix' ? 'bugfix-validation.json' : 'validation-report.json'}`);
      assert.equal(validation?.artifactPath, `/workspace/${name}/${name === 'bugfix' ? 'bugfix.patch' : 'implementation.patch'}`);
    }
  });

  it('builds minimal YAML examples for built-in pipeline templates', () => {
    for (const examplePath of templateExamplePaths) {
      const document = loadPipelineConfigYamlFile(examplePath);
      const configured = createConfiguredPipeline(document);

      assert.equal(document.version, 1);
      assert.equal(configured.pipeline.constructor.name, 'Pipe');
    }
  });

  it('omits empty registry groups', () => {
    const merged = createComponentRegistry({ stages: traceStage }, {} satisfies ComponentRegistry);

    assert.equal(merged.stages?.trace, traceStage.trace);
    assert.equal(merged.nodes, undefined);
    assert.equal(merged.executors, undefined);
    assert.equal(merged.mcpPresets, undefined);
    assert.equal(merged.pipelines, undefined);
    assert.equal(merged.superNodes, undefined);
  });
});

function createCapturingBuiltInStageRegistry(captured: ResolvedStageConfig[]): StageRegistry {
  const registry = createDefaultStageRegistry();
  const capturing: StageRegistry = {};
  for (const [key, entry] of Object.entries(registry)) {
    capturing[key] = {
      ...entry,
      build: (input: StageBuildInput) => {
        captured.push(input.resolvedConfig);
        return entry.build(input);
      },
    };
  }
  return capturing;
}

function createStageRegistry(type: string): StageRegistry {
  return {
    [type]: {
      type,
      executor: 'claude',
      requiredFields: [],
      applyConventions: stage => stage,
      build: () => {
        throw new Error('The component registry merge test should not build stages.');
      },
    },
  };
}

function createTraceSuperNode(name: string): SuperNodeComponent {
  return {
    name,
    precompile: (input: SuperNodePrecompileInput) => ({
      document: input.document,
      artifacts: [
        {
          kind: 'resolved-pipeline-config',
          document: input.document,
        },
      ],
      metadata: {
        source: {
          kind: 'super-node',
          name,
        },
        inputHash: 'test-input-hash',
        validation: {
          status: 'passed',
        },
        artifactPaths: [],
      },
    }),
  };
}
