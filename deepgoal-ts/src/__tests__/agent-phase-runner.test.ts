import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createPipelineInput, createEngineOptions } from '../index.js';
import {
  PhasePlannerExecutor,
  ProgressLoopNode,
  RoadmapReaderExecutor,
  SubagentForkExecutor,
  buildSubagentPrompt,
  parseSubagentPhaseReport,
  planNextPhase,
  readRoadmapDocuments,
  selectNextRoadmapTaskGroup,
} from '../core/agent-phase-runner.js';

describe('agent phase runner planning helpers', () => {
  it('selects the first incomplete checklist item from top to bottom', () => {
    const result = selectNextRoadmapTaskGroup({
      roadmapText: [
        '# Roadmap',
        '',
        '## Phase 1',
        '',
        '- [x] 已完成任务',
        '- [ ] 第一个未完成任务',
        '',
        '## Phase 2',
        '',
        '- [ ] 不应被提前选择',
      ].join('\n'),
    });

    assert.equal(result.kind, 'selected');
    if (result.kind === 'selected') {
      assert.equal(result.selectedPhase, 'Roadmap > Phase 1');
      assert.deepEqual(result.selectedTaskGroup, ['第一个未完成任务']);
      assert.equal(result.lineNumber, 6);
    }
  });

  it('stops when roadmap has no incomplete checklist item', () => {
    const result = selectNextRoadmapTaskGroup({
      roadmapText: ['# Roadmap', '- [x] 已完成任务'].join('\n'),
    });

    assert.deepEqual(result, {
      kind: 'stopped',
      stopReason: 'roadmap 中没有未完成的 checklist 任务。',
    });
  });

  it('builds a subagent prompt with scope, tests, roadmap update, and JSON contract', () => {
    const selection = selectNextRoadmapTaskGroup({
      roadmapText: ['# Roadmap', '## Phase 1', '- [ ] 创建配置类型'].join('\n'),
    });
    assert.equal(selection.kind, 'selected');
    if (selection.kind !== 'selected') {
      return;
    }

    const prompt = buildSubagentPrompt({
      workspaceRoot: '/repo/fixture',
      technicalDocPath: '/repo/fixture/architecture.md',
      roadmapPath: '/repo/fixture/roadmap.md',
      technicalDocSummary: '只实现一个最小配置解析闭环。',
      selection,
      allowedTestCommands: ['npm test'],
    });

    assert.match(prompt, /你只负责本次选中的最小任务组/);
    assert.match(prompt, /创建配置类型/);
    assert.match(prompt, /完成后更新 roadmap 对应 checklist/);
    assert.match(prompt, /npm test/);
    assert.match(prompt, /"roadmapUpdated":true/);
    assert.match(prompt, /"noTestReason"/);
  });
});

describe('agent phase runner reader and planner', () => {
  it('reads technical doc, roadmap state, next item, and handoff section', () => {
    const fixture = createReaderFixture();

    const output = readRoadmapDocuments({
      technicalDocPath: fixture.technicalDocPath,
      roadmapPath: fixture.roadmapPath,
    });

    assert.match(output.technicalDocSummary, /技术文档内容/);
    assert.match(output.roadmapState, /第一个未完成任务/);
    assert.deepEqual(output.nextIncompleteItems, ['第一个未完成任务']);
    assert.match(output.handoffSection, /继续保持最小闭环/);
    assert.doesNotMatch(output.handoffSection, /后续章节/);
  });

  it('plans the next smallest task group without skipping incomplete items', () => {
    const output = planNextPhase({
      technicalDocSummary: '技术文档内容',
      roadmapState: ['# Roadmap', '## Phase 1', '- [x] 已完成任务', '- [ ] 第一个未完成任务', '## Phase 2', '- [ ] 第二阶段任务'].join('\n'),
      handoffSection: '继续保持最小闭环。',
    });

    assert.equal(output.selectedPhase, 'Roadmap > Phase 1');
    assert.deepEqual(output.selectedTaskGroup, ['第一个未完成任务']);
    assert.equal(output.acceptanceCriteria.length, 1);
    assert.equal(output.stopReason, undefined);
  });

  it('stops planning when all roadmap tasks are complete', () => {
    const output = planNextPhase({
      technicalDocSummary: '技术文档内容',
      roadmapState: ['# Roadmap', '- [x] 已完成任务'].join('\n'),
      handoffSection: '',
    });

    assert.deepEqual(output, {
      selectedTaskGroup: [],
      acceptanceCriteria: [],
      stopReason: 'roadmap 中没有未完成的 checklist 任务。',
    });
  });

  it('executes reader and planner with pipeline metadata', async () => {
    const fixture = createReaderFixture();
    const reader = new RoadmapReaderExecutor({
      technicalDocPath: fixture.technicalDocPath,
      roadmapPath: fixture.roadmapPath,
    });
    const readerResult = await reader.execute(createPipelineInput(), createEngineOptions());

    assert.equal(readerResult.success, true, readerResult.error?.message);
    assert.equal(readerResult.output.primaryPath, fixture.roadmapPath);
    assert.deepEqual(readerResult.output.metadata.nextIncompleteItems, ['第一个未完成任务']);

    const planner = new PhasePlannerExecutor();
    const plannerResult = await planner.execute(
      createPipelineInput({ primaryPath: readerResult.output.primaryPath, metadata: readerResult.output.metadata }),
      createEngineOptions()
    );

    assert.equal(plannerResult.success, true, plannerResult.error?.message);
    assert.equal(plannerResult.output.primaryPath, fixture.roadmapPath);
    assert.deepEqual(plannerResult.output.metadata.selectedTaskGroup, ['第一个未完成任务']);
  });

  it('fails planner execution when reader metadata is missing', async () => {
    const planner = new PhasePlannerExecutor();
    const result = await planner.execute(createPipelineInput(), createEngineOptions());

    assert.equal(result.success, false);
    assert.equal(result.error?.type, 'PhasePlannerInputError');
  });
});

describe('subagent phase report parser', () => {
  it('parses valid JSON report and returns a compact summary', () => {
    const result = parseSubagentPhaseReport(JSON.stringify(validReport({
      ignoredVerboseLog: '不应出现在 summary 中',
    })));

    assert.equal(result.success, true);
    if (!result.success) {
      return;
    }
    assert.equal(result.report.roadmapUpdated, true);
    assert.deepEqual(result.summary.completedSummary, ['完成配置类型']);
    assert.equal(Object.hasOwn(result.summary, 'ignoredVerboseLog'), false);
  });

  it('allows empty tests only when noTestReason is explicit', () => {
    const result = parseSubagentPhaseReport(JSON.stringify(validReport({
      tests: [],
      noTestReason: '仅更新交接文档，无代码行为变化。',
    })));

    assert.equal(result.success, true);
    if (!result.success) {
      return;
    }
    assert.deepEqual(result.report.tests, []);
    assert.equal(result.report.noTestReason, '仅更新交接文档，无代码行为变化。');
  });

  it('rejects non-json final output', () => {
    const result = parseSubagentPhaseReport('```json\n{}\n```');

    assert.deepEqual(result, {
      success: false,
      error: 'Subagent 最终输出必须是单个 JSON 对象。',
    });
  });

  it('rejects reports with missing required fields', () => {
    const result = parseSubagentPhaseReport(JSON.stringify(validReport({
      completedSummary: undefined,
    })));

    assert.deepEqual(result, {
      success: false,
      error: 'Subagent report 缺少非空 completedSummary。',
    });
  });

  it('rejects reports that do not update roadmap', () => {
    const result = parseSubagentPhaseReport(JSON.stringify(validReport({
      roadmapUpdated: false,
    })));

    assert.deepEqual(result, {
      success: false,
      error: 'Subagent report 必须将 roadmapUpdated 设置为 true。',
    });
  });

  it('rejects invalid test result items', () => {
    const result = parseSubagentPhaseReport(JSON.stringify(validReport({
      tests: [{ command: 'npm test', passed: 'yes', summary: '通过' }],
    })));

    assert.deepEqual(result, {
      success: false,
      error: 'Subagent report tests 必须是数组，且每项包含 command、passed、summary。',
    });
  });

  it('requires tests or an explicit no-test reason', () => {
    const result = parseSubagentPhaseReport(JSON.stringify(validReport({
      tests: [],
    })));

    assert.deepEqual(result, {
      success: false,
      error: 'Subagent report 必须包含测试结果，或提供 noTestReason。',
    });
  });

  it('requires changedFiles to be non-empty', () => {
    const result = parseSubagentPhaseReport(JSON.stringify(validReport({
      changedFiles: [],
    })));

    assert.deepEqual(result, {
      success: false,
      error: 'Subagent report 缺少非空 changedFiles。',
    });
  });
});

interface ReaderFixture {
  readonly technicalDocPath: string;
  readonly roadmapPath: string;
}

function createReaderFixture(): ReaderFixture {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'deepgoal-agent-phase-runner-'));
  const technicalDocPath = join(workspaceDir, 'architecture.md');
  const roadmapPath = join(workspaceDir, 'roadmap.md');
  mkdirSync(workspaceDir, { recursive: true });
  writeFileSync(technicalDocPath, '# Architecture\n\n技术文档内容。\n', 'utf8');
  writeFileSync(roadmapPath, [
    '# Roadmap',
    '',
    '## Phase 1',
    '',
    '- [x] 已完成任务',
    '- [ ] 第一个未完成任务',
    '',
    '## 交接描述',
    '',
    '继续保持最小闭环。',
    '',
    '## 后续章节',
    '',
    '- 不应进入 handoff section',
  ].join('\n'), 'utf8');

  return { technicalDocPath, roadmapPath };
}

function validReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const report: Record<string, unknown> = {
    completedSummary: ['完成配置类型'],
    currentStatus: 'Phase 1 第一项完成。',
    nextPlan: ['继续 parser 测试'],
    handoffNotes: ['保持 fixture 小范围变更'],
    roadmapUpdated: true,
    tests: [{ command: 'npm test', passed: true, summary: '通过' }],
    changedFiles: ['src/config.ts', 'roadmap.md'],
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete report[key];
    } else {
      report[key] = value;
    }
  }

  return report;
}

describe('SubagentForkExecutor', () => {
  it('collects event summary and parses subagent report', async () => {
    const validReportJson = JSON.stringify(validReport());
    const fakeClient = {
      async *stream(_prompt: string, _options: unknown) {
        yield { type: 'tool_call', content: undefined };
        yield { type: 'tool_result', content: undefined };
        yield { type: 'text', content: validReportJson.slice(0, 50) };
        yield { type: 'text', content: validReportJson.slice(50) };
        yield { type: 'done', content: undefined };
      },
    };

    const executor = new SubagentForkExecutor(
      { subagentPrompt: 'test prompt', cwd: '/test' },
      fakeClient
    );

    const input = createPipelineInput({ primaryPath: '/test/roadmap.md' });
    const options = createEngineOptions();
    const result = await executor.execute(input, options);

    assert.equal(result.success, true);
    if (result.success) {
      const metadata = result.output.metadata;
      const eventSummary = metadata.eventSummary as { totalEvents: number; toolCallCount: number; errorCount: number } | undefined;
      assert.equal(eventSummary?.totalEvents, 5);
      assert.equal(eventSummary?.toolCallCount, 1);
      assert.equal(eventSummary?.errorCount, 0);
      assert.ok(metadata.subagentReport);
    }
  });

  it('fails when subagent output is not valid JSON', async () => {
    const fakeClient = {
      async *stream(_prompt: string, _options: unknown) {
        yield { type: 'text', content: 'This is not JSON' };
      },
    };

    const executor = new SubagentForkExecutor(
      { subagentPrompt: 'test prompt', cwd: '/test' },
      fakeClient
    );

    const input = createPipelineInput({ primaryPath: '/test/roadmap.md' });
    const options = createEngineOptions();
    const result = await executor.execute(input, options);

    assert.equal(result.success, false);
    if (!result.success && result.error !== undefined) {
      assert.equal(result.error.type, 'SubagentReportParseError');
    }
  });

  it('does not preserve full stream log in metadata', async () => {
    const validReportJson = JSON.stringify(validReport());
    const longToolOutput = 'x'.repeat(10000);
    const fakeClient = {
      async *stream(_prompt: string, _options: unknown) {
        yield { type: 'tool_call', content: undefined };
        yield { type: 'tool_result', content: longToolOutput };
        yield { type: 'text', content: validReportJson };
      },
    };

    const executor = new SubagentForkExecutor(
      { subagentPrompt: 'test prompt', cwd: '/test' },
      fakeClient
    );

    const input = createPipelineInput({ primaryPath: '/test/roadmap.md' });
    const options = createEngineOptions();
    const result = await executor.execute(input, options);

    assert.equal(result.success, true);
    if (result.success) {
      const metadataStr = JSON.stringify(result.output.metadata);
      assert.ok(!metadataStr.includes(longToolOutput), 'metadata should not contain full tool output');
      assert.ok(metadataStr.length < 5000, 'metadata should be compressed');
    }
  });
});

describe('ProgressLoopNode', () => {
  it('runs multiple iterations until all tasks complete', async () => {
    const fixture = createReaderFixture();
    let callCount = 0;
    const fakeClient = {
      async *stream(_prompt: string, _options: unknown) {
        callCount += 1;
        const report = validReport({ completedSummary: [`完成第 ${callCount} 个任务`] });
        yield { type: 'text', content: JSON.stringify(report) };
      },
    };

    writeFileSync(fixture.roadmapPath, [
      '# Roadmap',
      '- [ ] 第一个任务',
      '- [ ] 第二个任务',
    ].join('\n'), 'utf8');

    const node = new ProgressLoopNode(
      {
        technicalDocPath: fixture.technicalDocPath,
        roadmapPath: fixture.roadmapPath,
        workspaceRoot: '/test',
        allowedTestCommands: ['npm test'],
        maxIterations: 5,
      },
      fakeClient
    );

    const input = createPipelineInput({ primaryPath: fixture.roadmapPath });
    const options = createEngineOptions();
    const result = await node.run(input, options);

    assert.equal(result.success, true);
    if (result.success) {
      const metadata = result.output.metadata;
      const reports = metadata.reports as unknown[];
      assert.ok(Array.isArray(reports));
      assert.ok(reports.length >= 1, 'should have at least one iteration report');
    }
  });

  it('stops when maxIterations is reached', async () => {
    const fixture = createReaderFixture();
    const fakeClient = {
      async *stream(_prompt: string, _options: unknown) {
        const report = validReport();
        yield { type: 'text', content: JSON.stringify(report) };
      },
    };

    writeFileSync(fixture.roadmapPath, [
      '# Roadmap',
      '- [ ] 任务1',
      '- [ ] 任务2',
      '- [ ] 任务3',
    ].join('\n'), 'utf8');

    const node = new ProgressLoopNode(
      {
        technicalDocPath: fixture.technicalDocPath,
        roadmapPath: fixture.roadmapPath,
        workspaceRoot: '/test',
        allowedTestCommands: [],
        maxIterations: 2,
      },
      fakeClient
    );

    const input = createPipelineInput({ primaryPath: fixture.roadmapPath });
    const options = createEngineOptions();
    const result = await node.run(input, options);

    assert.equal(result.success, true);
    if (result.success) {
      const metadata = result.output.metadata;
      assert.equal(metadata.completedIterations, 2);
      assert.ok((metadata.stopReason as string).includes('最大迭代次数'));
    }
  });

  it('stops when all roadmap tasks are complete', async () => {
    const fixture = createReaderFixture();
    const fakeClient = {
      async *stream(_prompt: string, _options: unknown) {
        const report = validReport();
        yield { type: 'text', content: JSON.stringify(report) };
      },
    };

    writeFileSync(fixture.roadmapPath, [
      '# Roadmap',
      '- [x] 已完成任务',
    ].join('\n'), 'utf8');

    const node = new ProgressLoopNode(
      {
        technicalDocPath: fixture.technicalDocPath,
        roadmapPath: fixture.roadmapPath,
        workspaceRoot: '/test',
        allowedTestCommands: [],
        maxIterations: 5,
      },
      fakeClient
    );

    const input = createPipelineInput({ primaryPath: fixture.roadmapPath });
    const options = createEngineOptions();
    const result = await node.run(input, options);

    assert.equal(result.success, true);
    if (result.success) {
      const metadata = result.output.metadata;
      assert.equal(metadata.completedIterations, 0);
      assert.ok((metadata.stopReason as string).includes('没有未完成'));
    }
  });
});
