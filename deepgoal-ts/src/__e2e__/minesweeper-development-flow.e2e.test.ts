import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  PLAYWRIGHT_TOOL_PREFIX,
  loadConfiguredPipelineFromYamlFile,
  type JsonObject,
  type PipelineInput,
  type ResolvedPipelineGoal,
} from '../index.js';

const PIPELINE_CONFIG_PATH = resolve(process.cwd(), 'src', '__e2e__', 'minesweeper-development-flow.pipeline.yaml');

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

function logSection(title: string, value: unknown): void {
  console.log(`\n===== ${title} =====`);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

describe('Minesweeper development flow e2e', { timeout: 360_000 }, () => {
  it('使用 ClaudeAgentClient 完成扫雷静态页面开发，并通过 Playwright MCP 验证', async () => {
    loadDotEnv();
    assertRequiredEnv();

    const workspace = createMinesweeperWorkspace();
    const configured = loadConfiguredPipelineFromYamlFile(PIPELINE_CONFIG_PATH, {
      runtime: {
        workspaceDir: workspace.workspaceDir,
        goalPath: workspace.goalPath,
        requirementsPath: workspace.requirementsPath,
        implementationPath: workspace.implementationPath,
        validationReportPath: workspace.validationReportPath,
        testEvidenceDir: workspace.testEvidenceDir,
      },
      logger: logSection,
    });
    const goal = requireConfiguredGoal(configured.goal);
    writeFileSync(goal.path, goal.text, 'utf8');
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

function trimQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
