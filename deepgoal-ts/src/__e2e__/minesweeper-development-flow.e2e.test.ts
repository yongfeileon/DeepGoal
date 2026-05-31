import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  PLAYWRIGHT_TOOL_PREFIX,
  createComponentRegistry,
  createConfiguredPipelineFromTemplate,
  createDefaultComponentRegistry,
  instantiatePipelineTemplate,
  loadDeepGoalComponentManifestFile,
  type ComponentRegistry,
  type ConfiguredPipeline,
  type DeepGoalComponentManifest,
  type JsonObject,
  type PipelineInput,
  type PipelineTemplate,
  type PipelineTemplateParameterValues,
  type PipelineTemplateParameters,
  type PipelineYamlTemplate,
  type ResolvedPipelineGoal,
} from '../index.js';

const PIPELINE_TEMPLATE_NAME = 'minesweeper-development-flow';
const COMPONENT_MANIFEST_PATH = resolve(process.cwd(), 'src', '__e2e__', 'minesweeper-development-flow.deepgoal.component.json');
const DEFAULT_E2E_TIMEOUT_MS = 360_000;
const E2E_TIMEOUT_MS = parseTimeout(process.env.DEEPGOAL_MINESWEEPER_E2E_TIMEOUT_MS) ?? DEFAULT_E2E_TIMEOUT_MS;

interface EnvFileResult {
  readonly loaded: boolean;
  readonly path: string;
}

interface MinesweeperWorkspace {
  readonly workspaceDir: string;
  readonly goalPath: string;
  readonly requirementsPath: string;
  readonly implementationPath: string;
  readonly validationReportPath: string;
  readonly testEvidenceDir: string;
}

interface MinesweeperPipelineConfig {
  readonly configured: ConfiguredPipeline;
  readonly componentRegistry: ComponentRegistry;
  readonly manifest: DeepGoalComponentManifest;
}

function logSection(title: string, value: unknown): void {
  console.log(`\n===== ${title} =====`);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

describe('Minesweeper development flow e2e', { timeout: E2E_TIMEOUT_MS }, () => {
  it('使用 ClaudeAgentClient 完成扫雷静态页面开发，并通过 Playwright MCP 验证', async () => {
    loadDotEnv();
    assertRequiredEnv();

    const workspace = createMinesweeperWorkspace();
    const { configured, componentRegistry, manifest } = loadMinesweeperPipeline(workspace);
    assertMinesweeperComponentManifest(manifest, componentRegistry);
    const goal = requireConfiguredGoal(configured.goal);
    writeFileSync(goal.path, goal.text, 'utf8');
    logSection('扫雷开发流程组件 Manifest', manifest);
    logSection('扫雷开发流程工作目录', workspace);
    logSection('扫雷开发目标', readText(goal.path));

    const initialInput: PipelineInput = {
      primaryPath: goal.path,
      artifacts: [],
      metadata: { goal: goal.text, workspaceDir: workspace.workspaceDir },
    };

    const result = await configured.pipeline.run(initialInput, configured.engineOptions);
    logSection('扫雷开发流程最终结果', result);

    assert.equal(result.success, true, result.error?.message);
    assert.equal(result.output.primaryPath, workspace.validationReportPath);
    assert.equal(existsSync(workspace.requirementsPath), true);
    assert.equal(existsSync(workspace.implementationPath), true);
    assert.equal(existsSync(workspace.validationReportPath), true);
    assert.equal(result.output.metadata.passed, true);
    assert.equal(hasPlaywrightToolCall(result.output.metadata), true, '测试阶段应调用 Playwright MCP 工具。');
  });
});

function createMinesweeperWorkspace(): MinesweeperWorkspace {
  const workspaceDir = resolve(process.cwd(), 'e2e-workspace', 'minesweeper-development-flow');
  const testEvidenceDir = join(workspaceDir, 'playwright-output');
  mkdirSync(testEvidenceDir, { recursive: true });
  return {
    workspaceDir,
    goalPath: join(workspaceDir, 'goal.txt'),
    requirementsPath: join(workspaceDir, 'requirements.json'),
    implementationPath: join(workspaceDir, 'index.html'),
    validationReportPath: join(workspaceDir, 'e2e-report.json'),
    testEvidenceDir,
  };
}

function loadMinesweeperPipeline(workspace: MinesweeperWorkspace): MinesweeperPipelineConfig {
  const componentRegistry = createMinesweeperComponentRegistry();
  const manifest = loadDeepGoalComponentManifestFile(COMPONENT_MANIFEST_PATH);
  const template = requirePipelineTemplate(componentRegistry, PIPELINE_TEMPLATE_NAME);
  return {
    configured: createConfiguredPipelineFromTemplate(template, {
      parameters: minesweeperTemplateParameters(workspace),
      override: {
        defaults: {
          model: '${env.ANTHROPIC_MODEL}',
          settingSources: [],
          strictMcpConfig: true,
        },
        stages: [
          {
            id: 'validation',
            stage: {
              artifactUrl: '${fileUrl:artifacts.implementation.path}',
              systemPrompt: '你是端到端测试工程师。必须使用 Playwright MCP 浏览器工具验证页面。最后只输出请求的 JSON 对象。',
              toolInstruction: '请使用 Playwright MCP 浏览器工具实际打开页面，并至少使用 browser_navigate、browser_snapshot 或 browser_evaluate，以及一次用户交互相关的 MCP 工具。',
              toolPrefix: PLAYWRIGHT_TOOL_PREFIX,
              metadata: {
                testEvidenceDir: '${artifacts.testEvidence.path}',
              },
              stageOptions: {
                mcpServers: {
                  playwright: {
                    preset: 'playwright',
                    outputDir: '${artifacts.testEvidence.path}',
                  },
                },
              },
            },
          },
        ],
      },
      builderOptions: {
        componentRegistry,
        componentRegistryDuplicateKeyPolicy: 'overwrite',
        logger: logSection,
      },
    }),
    componentRegistry,
    manifest,
  };
}

function createMinesweeperComponentRegistry(): ComponentRegistry {
  const defaultRegistry = createDefaultComponentRegistry();
  return createComponentRegistry(
    defaultRegistry,
    {
      pipelines: {
        [PIPELINE_TEMPLATE_NAME]: createMinesweeperPipelineTemplate(defaultRegistry),
      },
    }
  );
}

function createMinesweeperPipelineTemplate(defaultRegistry: ComponentRegistry): PipelineYamlTemplate {
  const sddTemplate = requirePipelineTemplate(defaultRegistry, 'sdd');
  return {
    kind: 'yaml',
    name: PIPELINE_TEMPLATE_NAME,
    displayName: 'Minesweeper Development Flow',
    description: 'Develops a static Minesweeper page and validates it with Playwright MCP.',
    parameters: {
      ...requireTemplateParameters(sddTemplate, 'sdd'),
      testEvidenceDir: {
        default: '${parameters.workspace}/playwright-output',
      },
    },
    document: {
      ...instantiatePipelineTemplate(sddTemplate, {
        parameters: {
          workspace: '${parameters.workspace}',
          goalPath: '${parameters.goalPath}',
          requirementsPath: '${parameters.requirementsPath}',
          implementationPath: '${parameters.implementationPath}',
          validationReportPath: '${parameters.validationReportPath}',
        },
      }),
      engine: {
        permissionMode: 'bypassPermissions',
      },
      goal: {
        path: '${parameters.goalPath}',
        text: '实现一个静态html页面版的扫雷游戏，需要使用playwright mcp进行端到端测试',
      },
      paths: {
        workspace: '${parameters.workspace}',
        goal: '${goal.path}',
        output: '${parameters.workspace}',
      },
      artifacts: {
        requirements: {
          path: '${parameters.requirementsPath}',
        },
        implementation: {
          path: '${parameters.implementationPath}',
        },
        validationReport: {
          path: '${parameters.validationReportPath}',
        },
        testEvidence: {
          path: '${parameters.testEvidenceDir}',
        },
      },
    },
  };
}

function minesweeperTemplateParameters(workspace: MinesweeperWorkspace): PipelineTemplateParameterValues {
  return {
    workspace: workspace.workspaceDir,
    goalPath: workspace.goalPath,
    requirementsPath: workspace.requirementsPath,
    implementationPath: workspace.implementationPath,
    validationReportPath: workspace.validationReportPath,
    testEvidenceDir: workspace.testEvidenceDir,
  };
}

function requireTemplateParameters(template: PipelineTemplate, name: string): PipelineTemplateParameters {
  if (template.parameters === undefined) {
    throw new Error(`流水线模板缺少参数声明: ${name}`);
  }
  return template.parameters;
}

function requirePipelineTemplate(componentRegistry: ComponentRegistry, name: string): PipelineTemplate {
  const template = componentRegistry.pipelines?.[name];
  if (template === undefined) {
    throw new Error(`组件注册表缺少流水线模板: ${name}`);
  }
  return template;
}

function assertMinesweeperComponentManifest(manifest: DeepGoalComponentManifest, componentRegistry: ComponentRegistry): void {
  assert.equal(manifest.name, '@deepgoal/example-minesweeper-development-flow');
  assert.deepEqual(manifest.exports.stages, ['requirements-analysis', 'development', 'testing']);
  assert.deepEqual(manifest.exports.pipelines, ['minesweeper-development-flow']);
  assert.deepEqual(manifest.capabilities.mcpServers, ['playwright']);
  assert.deepEqual(manifest.capabilities.permissions, ['bypassPermissions']);
  assert.equal(manifest.quality.hasTests, true);
  assert.equal(manifest.quality.hasExamples, true);
  for (const stageType of manifest.exports.stages) {
    assert.equal(componentRegistry.stages?.[stageType]?.type, stageType);
  }
  for (const pipelineName of manifest.exports.pipelines) {
    assert.equal(componentRegistry.pipelines?.[pipelineName]?.name, pipelineName);
  }
  for (const presetName of manifest.capabilities.mcpServers) {
    assert.equal(typeof componentRegistry.mcpPresets?.[presetName], 'function');
  }
}

function requireConfiguredGoal(goal: ResolvedPipelineGoal | undefined): ResolvedPipelineGoal {
  if (goal === undefined) {
    throw new Error('流水线配置需要提供 goal.path 和 goal.text。');
  }
  return goal;
}

function hasPlaywrightToolCall(metadata: JsonObject): boolean {
  const toolCalls = metadata.toolCalls;
  return Array.isArray(toolCalls) && toolCalls.some(toolCall => typeof toolCall === 'string' && toolCall.startsWith(PLAYWRIGHT_TOOL_PREFIX));
}

function readText(path: string | undefined): string {
  if (path === undefined) {
    throw new Error('需要提供文件路径。');
  }
  assert.equal(existsSync(path), true, `文件不存在: ${path}`);
  return readFileSync(path, 'utf8');
}

function loadDotEnv(): EnvFileResult {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return { loaded: false, path: envPath };
  }

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimQuotes(trimmed.slice(separatorIndex + 1).trim());
    process.env[key] ??= value;
  }

  return { loaded: true, path: envPath };
}

function assertRequiredEnv(): void {
  const missing = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL']
    .filter(name => process.env[name] === undefined || process.env[name]?.trim().length === 0);
  assert.deepEqual(missing, [], `Missing required env vars: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
}

function parseTimeout(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('DEEPGOAL_MINESWEEPER_E2E_TIMEOUT_MS must be a positive number.');
  }
  return parsed;
}

function trimQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
