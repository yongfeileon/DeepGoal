import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  ClaudeAgentClient,
  PermissionMode,
  buildSubagentPrompt,
  createAgentRunRequest,
  createEngineOptions,
  createSubagentPhaseReportSummary,
  createClaudeAgentOptionsFromEngine,
  parseSubagentPhaseReport,
  selectNextRoadmapTaskGroup,
  createDefaultComponentRegistry,
  createConfiguredPipelineFromTemplate,
  type AgentStreamEvent,
  type SubagentPhaseReportSummary,
} from '../index.js';

const DEFAULT_E2E_TIMEOUT_MS = 360_000;
const E2E_TIMEOUT_MS = parseTimeout(process.env.DEEPGOAL_AGENT_PHASE_RUNNER_E2E_TIMEOUT_MS) ?? DEFAULT_E2E_TIMEOUT_MS;

interface EnvFileResult {
  readonly loaded: boolean;
  readonly path: string;
}

interface AgentPhaseRunnerFixture {
  readonly workspaceDir: string;
  readonly architecturePath: string;
  readonly roadmapPath: string;
  readonly packageJsonPath: string;
  readonly srcDir: string;
}

interface SubagentRunSummary {
  readonly report: SubagentPhaseReportSummary;
  readonly eventSummary: {
    readonly eventCount: number;
    readonly toolCallCount: number;
  };
}

describe('Agent phase runner e2e', { timeout: E2E_TIMEOUT_MS }, () => {
  it('使用真实 ClaudeAgentClient fork subagent 完成一个最小 roadmap 任务组', async () => {
    loadDotEnv();
    assertRequiredEnv();
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
    console.log('Environment variables:', {
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN?.slice(0, 10) + '...',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
    });

    const fixture = createAgentPhaseRunnerFixture();
    const technicalDoc = readFileSync(fixture.architecturePath, 'utf8');
    const roadmap = readFileSync(fixture.roadmapPath, 'utf8');
    const selection = selectNextRoadmapTaskGroup({ roadmapText: roadmap });
    assert.equal(selection.kind, 'selected');
    if (selection.kind !== 'selected') {
      return;
    }

    const prompt = buildSubagentPrompt({
      workspaceRoot: fixture.workspaceDir,
      technicalDocPath: fixture.architecturePath,
      roadmapPath: fixture.roadmapPath,
      technicalDocSummary: technicalDoc,
      selection,
      allowedTestCommands: ['npm test'],
    });

    const runSummary = await runRealSubagent(fixture.workspaceDir, prompt);
    const updatedRoadmap = readFileSync(fixture.roadmapPath, 'utf8');
    const metadata = {
      subagentReport: runSummary.report,
      eventSummary: runSummary.eventSummary,
    };

    assert.match(updatedRoadmap, /- \[x\] 创建一个 JSON 配置解析函数并增加 node:test 单元测试/);
    assert.equal(existsSync(join(fixture.srcDir, 'config.mjs')), true);
    assert.equal(existsSync(join(fixture.srcDir, 'config.test.mjs')), true);
    assert.equal(runSummary.report.roadmapUpdated, true);
    assert.equal(runSummary.report.tests.some(test => test.command === 'npm test' && test.passed), true);
    assert.equal(JSON.stringify(metadata).includes('tool_call'), false);
    assert.equal(JSON.stringify(metadata).includes('streamInput'), false);
  });

  it('使用 AgentPhaseRunnerPipelineTemplate 构建并运行 pipeline', async () => {
    loadDotEnv();
    assertRequiredEnv();

    const fixture = createAgentPhaseRunnerFixture();
    const componentRegistry = createDefaultComponentRegistry();
    const template = componentRegistry.pipelines?.['agent-phase-runner'];
    assert.ok(template, 'agent-phase-runner template should exist');

    const configuredPipeline = createConfiguredPipelineFromTemplate(template, {
      parameters: {
        workspace: fixture.workspaceDir,
        technicalDocPath: fixture.architecturePath,
        roadmapPath: fixture.roadmapPath,
        maxIterations: 2,
        allowedTestCommands: ['npm test'],
      },
    });

    const result = await configuredPipeline.pipeline.run(
      { artifacts: [], metadata: {} },
      configuredPipeline.engineOptions
    );

    assert.ok(result.success, 'Pipeline should succeed');
    const updatedRoadmap = readFileSync(fixture.roadmapPath, 'utf8');
    assert.match(updatedRoadmap, /- \[x\] 创建一个 JSON 配置解析函数并增加 node:test 单元测试/);
    assert.match(updatedRoadmap, /- \[x\] 在 config\.mjs 中添加 validateConfig 函数验证配置有效性/);
    assert.equal(existsSync(join(fixture.srcDir, 'config.mjs')), true);
    assert.equal(existsSync(join(fixture.srcDir, 'config.test.mjs')), true);
  });
});

async function runRealSubagent(workspaceDir: string, prompt: string): Promise<SubagentRunSummary> {
  const request = createAgentRunRequest(prompt, workspaceDir, { executor: 'agent-phase-runner-e2e' });
  const agentOptions = createClaudeAgentOptionsFromEngine(
    request,
    createEngineOptions({ permissionMode: PermissionMode.Bypass }),
    {
      model: process.env.ANTHROPIC_MODEL,
      systemPrompt: '你是 DeepGoal TS subagent。必须完成实现、测试、更新 roadmap。最后只输出单个 JSON 对象，不要输出 Markdown、解释或代码块。',
      settingSources: [],
    }
  );
  const client = new ClaudeAgentClient();
  const events: AgentStreamEvent[] = [];
  let outputText = '';
  let toolCallCount = 0;

  for await (const event of client.stream(prompt, agentOptions)) {
    events.push(event);
    if (event.type === 'tool_call') {
      toolCallCount += 1;
    }
    if ((event.type === 'message' || event.type === 'done') && typeof event.content === 'string') {
      outputText = event.content;
    }
  }

  const parsed = parseSubagentPhaseReport(outputText);
  if (!parsed.success) {
    assert.fail(parsed.error);
  }

  return {
    report: createSubagentPhaseReportSummary(parsed.report),
    eventSummary: {
      eventCount: events.length,
      toolCallCount,
    },
  };
}

function createAgentPhaseRunnerFixture(): AgentPhaseRunnerFixture {
  const workspaceDir = resolve(process.cwd(), 'e2e-workspace', 'agent-phase-runner-fixture');
  const srcDir = join(workspaceDir, 'src');
  try {
    rmSync(workspaceDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to remove fixture directory, continuing anyway:', error instanceof Error ? error.message : String(error));
  }
  mkdirSync(srcDir, { recursive: true });

  const architecturePath = join(workspaceDir, 'architecture.md');
  const roadmapPath = join(workspaceDir, 'roadmap.md');
  const packageJsonPath = join(workspaceDir, 'package.json');

  writeFileSync(architecturePath, createArchitectureDocument(), 'utf8');
  writeFileSync(roadmapPath, createRoadmapDocument(), 'utf8');
  writeFileSync(packageJsonPath, createPackageJson(), 'utf8');

  return {
    workspaceDir,
    architecturePath,
    roadmapPath,
    packageJsonPath,
    srcDir,
  };
}

function createArchitectureDocument(): string {
  return [
    '# Agent Phase Runner Fixture Architecture',
    '',
    '这是一个极小 fixture workspace，只用于验证真实 subagent fork 闭环。',
    '',
    '## Phase 1 目标',
    '',
    '- 在 `src/config.mjs` 中实现 `parseGoalConfig(raw)`。',
    '- `raw` 是 JSON 字符串，解析后必须包含非空字符串 `name` 和数组 `steps`。',
    '- 返回 `{ name, steps }`，其中 `steps` 必须保留字符串数组。',
    '- 无效 JSON、空 name、缺失 steps、非字符串 steps 都应抛出 Error。',
    '- 在 `src/config.test.mjs` 中使用 `node:test` 和 `node:assert/strict` 覆盖成功和失败场景。',
    '',
    '## Phase 2 目标',
    '',
    '- 在 `src/config.mjs` 中添加 `validateConfig(config)` 函数。',
    '- 验证 `config.name` 长度在 1-100 之间。',
    '- 验证 `config.steps` 数组长度在 1-50 之间。',
    '- 验证每个 step 长度在 1-200 之间。',
    '- 不符合要求时抛出 Error，包含具体错误信息。',
    '- 在 `src/config.test.mjs` 中添加 validateConfig 的测试用例。',
    '',
    '## 测试',
    '',
    '运行 `npm test`。',
  ].join('\n');
}

function createRoadmapDocument(): string {
  return [
    '# Fixture Roadmap',
    '',
    '## Phase 1 - 配置解析',
    '',
    '- [ ] 创建一个 JSON 配置解析函数并增加 node:test 单元测试',
    '',
    '## Phase 2 - 配置验证',
    '',
    '- [ ] 在 config.mjs 中添加 validateConfig 函数验证配置有效性',
    '',
    '## 交接描述',
    '',
    '从 Phase 1 开始，每次只做一个最小闭环。Phase 1 完成后再进入 Phase 2。',
  ].join('\n');
}

function createPackageJson(): string {
  return JSON.stringify({
    type: 'module',
    scripts: {
      test: 'node --test "src/**/*.test.mjs"',
    },
  }, null, 2);
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

function trimQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseTimeout(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
