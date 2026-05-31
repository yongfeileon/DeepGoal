import { readFileSync } from 'node:fs';
import { Executor } from './executor.js';
import { Node } from './node.js';
import {
  createExecutionError,
  createPipelineOutput,
  failResult,
  okResult,
  type PipelineInput,
  type PipelineResult,
} from './node.js';
import type { EngineOptions, JsonObject } from './types/index.js';

export interface RoadmapPlanningInput {
  readonly roadmapText: string;
}

export interface SelectedRoadmapTaskGroup {
  readonly kind: 'selected';
  readonly selectedPhase: string;
  readonly selectedTaskGroup: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly lineNumber: number;
}

export interface RoadmapPlanningStop {
  readonly kind: 'stopped';
  readonly stopReason: string;
}

export type RoadmapPlanningResult = SelectedRoadmapTaskGroup | RoadmapPlanningStop;

export interface RoadmapReaderExecutorConfig {
  readonly technicalDocPath: string;
  readonly roadmapPath: string;
}

export interface RoadmapReaderOutput {
  readonly technicalDocSummary: string;
  readonly roadmapState: string;
  readonly nextIncompleteItems: readonly string[];
  readonly handoffSection: string;
}

export interface PhasePlannerInput {
  readonly technicalDocSummary: string;
  readonly roadmapState: string;
  readonly handoffSection: string;
}

export interface PhasePlannerOutput {
  readonly selectedPhase?: string | undefined;
  readonly selectedTaskGroup: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly stopReason?: string | undefined;
}

export interface SubagentPromptInput {
  readonly workspaceRoot: string;
  readonly technicalDocPath: string;
  readonly roadmapPath: string;
  readonly technicalDocSummary: string;
  readonly selection: SelectedRoadmapTaskGroup;
  readonly allowedTestCommands: readonly string[];
}

export interface SubagentForkExecutorConfig {
  readonly subagentPrompt: string;
  readonly cwd: string;
  readonly model?: string | undefined;
  readonly permissionMode?: string | undefined;
}

export interface SubagentEventSummary {
  readonly totalEvents: number;
  readonly toolCallCount: number;
  readonly errorCount: number;
}

export interface SubagentForkOutput {
  readonly subagentReport: SubagentPhaseReport;
  readonly eventSummary: SubagentEventSummary;
  readonly rawOutputPath?: string | undefined;
}

export interface ProgressLoopConfig {
  readonly technicalDocPath: string;
  readonly roadmapPath: string;
  readonly workspaceRoot: string;
  readonly allowedTestCommands: readonly string[];
  readonly maxIterations: number;
  readonly model?: string | undefined;
  readonly permissionMode?: string | undefined;
}

export interface ProgressLoopIterationReport {
  readonly iteration: number;
  readonly selectedPhase: string;
  readonly subagentReport: SubagentPhaseReport;
  readonly eventSummary: SubagentEventSummary;
}

export interface ProgressLoopOutput {
  readonly reports: readonly ProgressLoopIterationReport[];
  readonly completedIterations: number;
  readonly finalRoadmapState: string;
  readonly stopReason: string;
}

export interface SubagentTestResult {
  readonly command: string;
  readonly passed: boolean;
  readonly summary: string;
}

export interface SubagentPhaseReport {
  readonly completedSummary: readonly string[];
  readonly currentStatus: string;
  readonly nextPlan: readonly string[];
  readonly handoffNotes: readonly string[];
  readonly roadmapUpdated: true;
  readonly tests: readonly SubagentTestResult[];
  readonly changedFiles: readonly string[];
  readonly noTestReason?: string | undefined;
}

export interface SubagentPhaseReportSummary {
  readonly completedSummary: readonly string[];
  readonly currentStatus: string;
  readonly nextPlan: readonly string[];
  readonly handoffNotes: readonly string[];
  readonly roadmapUpdated: true;
  readonly tests: readonly SubagentTestResult[];
  readonly changedFiles: readonly string[];
}

export interface ParsedSubagentPhaseReport {
  readonly success: true;
  readonly report: SubagentPhaseReport;
  readonly summary: SubagentPhaseReportSummary;
}

export interface InvalidSubagentPhaseReport {
  readonly success: false;
  readonly error: string;
}

export type SubagentPhaseReportParseResult = ParsedSubagentPhaseReport | InvalidSubagentPhaseReport;

interface RoadmapHeading {
  readonly depth: number;
  readonly title: string;
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/;
const CHECKBOX_PATTERN = /^\s*[-*]\s+\[(?<status>[ xX])]\s+(?<text>.+?)\s*$/;
const HANDOFF_HEADING_PATTERN = /^#{1,6}\s+(交接|交接描述|当前交接|新会话接力注意事项|handoff)/i;

export class RoadmapReaderExecutor extends Executor {
  constructor(private readonly config: RoadmapReaderExecutorConfig) {
    super(createPipelineOutput({ metadata: { component: 'roadmap-reader' } }));
  }

  override async execute(input: PipelineInput, _options: EngineOptions): Promise<PipelineResult> {
    try {
      const output = readRoadmapDocuments(this.config);
      return okResult(createPipelineOutput({
        primaryPath: this.config.roadmapPath,
        artifacts: input.artifacts,
        metadata: toJsonObject(output),
      }));
    } catch (error) {
      return failResult(
        createExecutionError({
          type: 'RoadmapReaderError',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        }),
        this.output
      );
    }
  }
}

export class PhasePlannerExecutor extends Executor {
  override async execute(input: PipelineInput, _options: EngineOptions): Promise<PipelineResult> {
    const plannerInput = readPhasePlannerInput(input.metadata);
    if (plannerInput === undefined) {
      return failResult(
        createExecutionError({
          type: 'PhasePlannerInputError',
          message: 'PhasePlannerExecutor requires technicalDocSummary, roadmapState, and handoffSection metadata.',
          recoverable: false,
        }),
        this.output
      );
    }

    const output = planNextPhase(plannerInput);
    return okResult(createPipelineOutput({
      primaryPath: input.primaryPath,
      artifacts: input.artifacts,
      metadata: toJsonObject(output),
    }));
  }
}

export class SubagentForkExecutor extends Executor {
  constructor(
    private readonly config: SubagentForkExecutorConfig,
    private readonly client: { stream(prompt: string, options: unknown): AsyncIterable<unknown> }
  ) {
    super(createPipelineOutput({ metadata: { component: 'subagent-fork' } }));
  }

  override async execute(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    let totalEvents = 0;
    let toolCallCount = 0;
    let errorCount = 0;
    let finalOutput = '';

    try {
      const streamOptions = {
        cwd: this.config.cwd,
        model: this.config.model,
        permissionMode: this.config.permissionMode ?? options.permissionMode,
      };

      for await (const event of this.client.stream(this.config.subagentPrompt, streamOptions)) {
        totalEvents += 1;
        const agentEvent = event as { type: string; content?: string };

        if (agentEvent.type === 'tool_call') {
          toolCallCount += 1;
        } else if (agentEvent.type === 'error') {
          errorCount += 1;
        } else if (agentEvent.type === 'text' && agentEvent.content !== undefined) {
          finalOutput += agentEvent.content;
        }
      }

      const parseResult = parseSubagentPhaseReport(finalOutput);
      if (!parseResult.success) {
        return failResult(
          createExecutionError({
            type: 'SubagentReportParseError',
            message: parseResult.error,
            recoverable: false,
          }),
          this.output
        );
      }

      const output: SubagentForkOutput = {
        subagentReport: parseResult.report,
        eventSummary: { totalEvents, toolCallCount, errorCount },
      };

      return okResult(createPipelineOutput({
        primaryPath: input.primaryPath,
        artifacts: input.artifacts,
        metadata: toJsonObject(output),
      }));
    } catch (error) {
      return failResult(
        createExecutionError({
          type: 'SubagentForkError',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        }),
        this.output
      );
    }
  }
}

export class ProgressLoopNode extends Node {
  constructor(
    private readonly config: ProgressLoopConfig,
    private readonly client: { stream(prompt: string, options: unknown): AsyncIterable<unknown> }
  ) {
    super();
  }

  override async run(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    const reports: ProgressLoopIterationReport[] = [];
    let completedIterations = 0;
    let finalRoadmapState = '';
    let stopReason = '';

    try {
      while (completedIterations < this.config.maxIterations) {
        const readerResult = await this.runReader(input, options);
        if (!readerResult.success) {
          return readerResult;
        }

        const plannerResult = await this.runPlanner(readerResult.output, options);
        if (!plannerResult.success) {
          return plannerResult;
        }

        const plannerOutput = readPlannerOutput(plannerResult.output.metadata);
        if (plannerOutput === undefined) {
          return failResult(
            createExecutionError({
              type: 'ProgressLoopError',
              message: 'Planner output missing required fields.',
              recoverable: false,
            }),
            createPipelineOutput({})
          );
        }

        if (plannerOutput.stopReason !== undefined) {
          finalRoadmapState = readerResult.output.metadata.roadmapState as string;
          stopReason = plannerOutput.stopReason;
          break;
        }

        completedIterations += 1;

        const selection: SelectedRoadmapTaskGroup = {
          kind: 'selected',
          selectedPhase: plannerOutput.selectedPhase ?? 'Unknown Phase',
          selectedTaskGroup: plannerOutput.selectedTaskGroup,
          acceptanceCriteria: plannerOutput.acceptanceCriteria,
          lineNumber: 0,
        };

        const subagentPrompt = buildSubagentPrompt({
          workspaceRoot: this.config.workspaceRoot,
          technicalDocPath: this.config.technicalDocPath,
          roadmapPath: this.config.roadmapPath,
          technicalDocSummary: readerResult.output.metadata.technicalDocSummary as string,
          selection,
          allowedTestCommands: this.config.allowedTestCommands,
        });

        const forkResult = await this.runSubagentFork(subagentPrompt, plannerResult.output, options);
        if (!forkResult.success) {
          return forkResult;
        }

        const forkOutput = forkResult.output.metadata as unknown as SubagentForkOutput;
        reports.push({
          iteration: completedIterations,
          selectedPhase: selection.selectedPhase,
          subagentReport: forkOutput.subagentReport,
          eventSummary: forkOutput.eventSummary,
        });

        finalRoadmapState = readFileSync(this.config.roadmapPath, 'utf8');
      }

      if (stopReason === '') {
        stopReason = `达到最大迭代次数 ${this.config.maxIterations}。`;
      }

      const output: ProgressLoopOutput = {
        reports,
        completedIterations,
        finalRoadmapState,
        stopReason,
      };

      return okResult(createPipelineOutput({
        primaryPath: this.config.roadmapPath,
        artifacts: input.artifacts,
        metadata: toJsonObject(output),
      }));
    } catch (error) {
      return failResult(
        createExecutionError({
          type: 'ProgressLoopError',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        }),
        createPipelineOutput({})
      );
    }
  }

  private async runReader(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    const reader = new RoadmapReaderExecutor({
      technicalDocPath: this.config.technicalDocPath,
      roadmapPath: this.config.roadmapPath,
    });
    return reader.execute(input, options);
  }

  private async runPlanner(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    const planner = new PhasePlannerExecutor();
    return planner.execute(input, options);
  }

  private async runSubagentFork(prompt: string, input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    const fork = new SubagentForkExecutor(
      {
        subagentPrompt: prompt,
        cwd: this.config.workspaceRoot,
        model: this.config.model,
        permissionMode: this.config.permissionMode,
      },
      this.client
    );
    return fork.execute(input, options);
  }
}

export function readRoadmapDocuments(input: RoadmapReaderExecutorConfig): RoadmapReaderOutput {
  const technicalDoc = readFileSync(input.technicalDocPath, 'utf8');
  const roadmap = readFileSync(input.roadmapPath, 'utf8');
  const selection = selectNextRoadmapTaskGroup({ roadmapText: roadmap });
  return {
    technicalDocSummary: summarizeTechnicalDoc(technicalDoc),
    roadmapState: roadmap,
    nextIncompleteItems: selection.kind === 'selected' ? selection.selectedTaskGroup : [],
    handoffSection: extractHandoffSection(roadmap),
  };
}

export function planNextPhase(input: PhasePlannerInput): PhasePlannerOutput {
  const selection = selectNextRoadmapTaskGroup({ roadmapText: input.roadmapState });
  if (selection.kind === 'stopped') {
    return {
      selectedTaskGroup: [],
      acceptanceCriteria: [],
      stopReason: selection.stopReason,
    };
  }

  return {
    selectedPhase: selection.selectedPhase,
    selectedTaskGroup: selection.selectedTaskGroup,
    acceptanceCriteria: selection.acceptanceCriteria,
  };
}

export function selectNextRoadmapTaskGroup(input: RoadmapPlanningInput): RoadmapPlanningResult {
  const headings: RoadmapHeading[] = [];
  const lines = input.roadmapText.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const headingMatch = HEADING_PATTERN.exec(line);
    if (headingMatch !== null) {
      const marker = headingMatch[1] ?? '';
      const title = headingMatch[2] ?? '';
      headings.splice(marker.length - 1);
      headings.push({ depth: marker.length, title });
      continue;
    }

    const checkboxMatch = CHECKBOX_PATTERN.exec(line);
    const checkboxGroups = checkboxMatch?.groups;
    if (checkboxGroups?.status !== ' ' || checkboxGroups.text === undefined) {
      continue;
    }

    const taskText = checkboxGroups.text.trim();
    return {
      kind: 'selected',
      selectedPhase: formatSelectedPhase(headings),
      selectedTaskGroup: [taskText],
      acceptanceCriteria: [`完成 roadmap 第 ${index + 1} 行的任务：${taskText}`],
      lineNumber: index + 1,
    };
  }

  return {
    kind: 'stopped',
    stopReason: 'roadmap 中没有未完成的 checklist 任务。',
  };
}

export function buildSubagentPrompt(input: SubagentPromptInput): string {
  return [
    '你是 DeepGoal TS subagent。你只负责本次选中的最小任务组。',
    '',
    `当前工作目录：${input.workspaceRoot}`,
    `技术文档路径：${input.technicalDocPath}`,
    `roadmap 路径：${input.roadmapPath}`,
    '',
    `当前阶段：${input.selection.selectedPhase}`,
    '本次任务组：',
    ...input.selection.selectedTaskGroup.map(task => `- ${task}`),
    '',
    '验收标准：',
    ...input.selection.acceptanceCriteria.map(criteria => `- ${criteria}`),
    '',
    '技术文档摘要：',
    input.technicalDocSummary,
    '',
    '实现约束：',
    '- 只实现本次选中的最小任务组。',
    '- 创建或更新必要单元测试，避免引入回归。',
    '- 完成后更新 roadmap 对应 checklist。',
    '- 主流程只会读取你的最终 JSON 汇报，请不要把完整日志、diff 或 Markdown 放进最终输出。',
    '',
    '允许的测试命令：',
    ...formatAllowedTestCommands(input.allowedTestCommands),
    '',
    '最后只输出 JSON，不要输出 Markdown、解释或代码块。JSON schema：',
    '{"completedSummary":["..."],"currentStatus":"...","nextPlan":["..."],"handoffNotes":["..."],"roadmapUpdated":true,"tests":[{"command":"...","passed":true,"summary":"..."}],"changedFiles":["..."],"noTestReason":"仅在无需测试时填写"}',
  ].join('\n');
}

export function parseSubagentPhaseReport(rawOutput: string): SubagentPhaseReportParseResult {
  const parsed = parseStrictJsonObject(rawOutput);
  if (parsed === undefined) {
    return { success: false, error: 'Subagent 最终输出必须是单个 JSON 对象。' };
  }

  const completedSummary = getStringArray(parsed, 'completedSummary');
  if (completedSummary === undefined || completedSummary.length === 0) {
    return { success: false, error: 'Subagent report 缺少非空 completedSummary。' };
  }

  const currentStatus = getString(parsed, 'currentStatus');
  if (currentStatus === undefined) {
    return { success: false, error: 'Subagent report 缺少 currentStatus。' };
  }

  const nextPlan = getStringArray(parsed, 'nextPlan');
  if (nextPlan === undefined) {
    return { success: false, error: 'Subagent report 缺少 nextPlan。' };
  }

  const handoffNotes = getStringArray(parsed, 'handoffNotes');
  if (handoffNotes === undefined) {
    return { success: false, error: 'Subagent report 缺少 handoffNotes。' };
  }

  if (parsed.roadmapUpdated !== true) {
    return { success: false, error: 'Subagent report 必须将 roadmapUpdated 设置为 true。' };
  }

  const tests = getTests(parsed.tests);
  if (tests === undefined) {
    return { success: false, error: 'Subagent report tests 必须是数组，且每项包含 command、passed、summary。' };
  }

  const noTestReason = getOptionalString(parsed, 'noTestReason');
  if (tests.length === 0 && noTestReason === undefined) {
    return { success: false, error: 'Subagent report 必须包含测试结果，或提供 noTestReason。' };
  }

  const changedFiles = getStringArray(parsed, 'changedFiles');
  if (changedFiles === undefined || changedFiles.length === 0) {
    return { success: false, error: 'Subagent report 缺少非空 changedFiles。' };
  }

  const report: SubagentPhaseReport = {
    completedSummary,
    currentStatus,
    nextPlan,
    handoffNotes,
    roadmapUpdated: true,
    tests,
    changedFiles,
    ...(noTestReason === undefined ? {} : { noTestReason }),
  };

  return {
    success: true,
    report,
    summary: createSubagentPhaseReportSummary(report),
  };
}

export function createSubagentPhaseReportSummary(report: SubagentPhaseReport): SubagentPhaseReportSummary {
  return {
    completedSummary: report.completedSummary,
    currentStatus: report.currentStatus,
    nextPlan: report.nextPlan,
    handoffNotes: report.handoffNotes,
    roadmapUpdated: report.roadmapUpdated,
    tests: report.tests,
    changedFiles: report.changedFiles,
  };
}

function summarizeTechnicalDoc(text: string): string {
  return text.trim();
}

function extractHandoffSection(roadmap: string): string {
  const lines = roadmap.split(/\r?\n/);
  const startIndex = lines.findIndex(line => HANDOFF_HEADING_PATTERN.test(line));
  if (startIndex === -1) {
    return '';
  }

  const startLine = lines[startIndex] ?? '';
  const startHeadingMatch = HEADING_PATTERN.exec(startLine);
  const startDepth = startHeadingMatch?.[1]?.length ?? 1;
  const sectionLines = [startLine];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const headingMatch = HEADING_PATTERN.exec(line);
    if (headingMatch !== null && (headingMatch[1]?.length ?? 0) <= startDepth) {
      break;
    }
    sectionLines.push(line);
  }

  return sectionLines.join('\n').trim();
}

function readPhasePlannerInput(metadata: JsonObject): PhasePlannerInput | undefined {
  const technicalDocSummary = metadata.technicalDocSummary;
  const roadmapState = metadata.roadmapState;
  const handoffSection = metadata.handoffSection;
  if (typeof technicalDocSummary !== 'string' || typeof roadmapState !== 'string' || typeof handoffSection !== 'string') {
    return undefined;
  }
  return { technicalDocSummary, roadmapState, handoffSection };
}

function readPlannerOutput(metadata: JsonObject): PhasePlannerOutput | undefined {
  const selectedTaskGroup = metadata.selectedTaskGroup;
  const acceptanceCriteria = metadata.acceptanceCriteria;
  if (!Array.isArray(selectedTaskGroup) || !Array.isArray(acceptanceCriteria)) {
    return undefined;
  }
  const taskGroupStrings = selectedTaskGroup.every((item): item is string => typeof item === 'string') ? selectedTaskGroup : undefined;
  const criteriaStrings = acceptanceCriteria.every((item): item is string => typeof item === 'string') ? acceptanceCriteria : undefined;
  if (taskGroupStrings === undefined || criteriaStrings === undefined) {
    return undefined;
  }
  const selectedPhase = typeof metadata.selectedPhase === 'string' ? metadata.selectedPhase : undefined;
  const stopReason = typeof metadata.stopReason === 'string' ? metadata.stopReason : undefined;
  return { selectedPhase, selectedTaskGroup: taskGroupStrings, acceptanceCriteria: criteriaStrings, stopReason };
}

function toJsonObject(value: RoadmapReaderOutput | PhasePlannerOutput | SubagentForkOutput | ProgressLoopOutput): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function formatSelectedPhase(headings: readonly RoadmapHeading[]): string {
  if (headings.length === 0) {
    return '未命名阶段';
  }
  return headings
    .filter(heading => heading.depth <= 3)
    .map(heading => heading.title)
    .join(' > ');
}

function formatAllowedTestCommands(commands: readonly string[]): readonly string[] {
  if (commands.length === 0) {
    return ['- 如本任务无需运行测试，请在 noTestReason 中说明原因。'];
  }
  return commands.map(command => `- ${command}`);
}

function parseStrictJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function getString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getStringArray(source: Record<string, unknown>, key: string): readonly string[] | undefined {
  const value = source[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length === value.length ? strings : undefined;
}

function getTests(value: unknown): readonly SubagentTestResult[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tests: SubagentTestResult[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return undefined;
    }
    const record = item as Record<string, unknown>;
    const command = getString(record, 'command');
    const summary = getString(record, 'summary');
    if (command === undefined || typeof record.passed !== 'boolean' || summary === undefined) {
      return undefined;
    }
    tests.push({ command, passed: record.passed, summary });
  }

  return tests;
}
