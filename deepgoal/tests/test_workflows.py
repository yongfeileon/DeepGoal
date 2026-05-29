from __future__ import annotations

import asyncio
import sys

import pytest

from deepgoal.core.container import BranchNode, LoopNode, ParallelNode, SerialNode
from deepgoal.core.executor import CliCommandSpec, CliExecutor, Executor
from deepgoal.core.node import ExecutionError, Node, PipelineInput, PipelineOutput, PipelineResult
from deepgoal.core.pipeline.pipe import Pipe
from deepgoal.core.types import EngineOptions


class TraceExecutor(Executor):
    def __init__(self, name: str, output_path: str, trace: list[str] | None = None, success: bool = True) -> None:
        super().__init__(PipelineOutput(primary_path=output_path))
        self._name = name
        self._trace = trace
        self._success = success

    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        if self._trace is not None:
            self._trace.append(f"{self._name}:{input.primary_path}")
        if self._success:
            return PipelineResult.ok(output=self.output)
        return PipelineResult.fail(
            error=ExecutionError(type="TraceFailure", message=f"{self._name} failed"),
            output=input.to_output(),
        )


class TraceNode(Node):
    def __init__(self, name: str, output_path: str, trace: list[str] | None = None) -> None:
        self._name = name
        self._output = PipelineOutput(primary_path=output_path)
        self._trace = trace

    async def run(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        if self._trace is not None:
            self._trace.append(f"{self._name}:{input.primary_path}")
        return PipelineResult.ok(output=self._output)


@pytest.mark.asyncio
async def test_serial_waterfall_workflow() -> None:
    trace: list[str] = []
    pipeline = SerialNode([
        TraceNode("requirements", "docs/requirements.md", trace),
        TraceNode("design", "docs/design.md", trace),
        TraceExecutor("implementation", "src/module.py", trace),
    ])

    result = await pipeline.run(PipelineInput.from_path("goal.md"), EngineOptions())

    assert result.success
    assert result.output.primary_path == "src/module.py"
    assert trace == [
        "requirements:goal.md",
        "design:docs/requirements.md",
        "implementation:docs/design.md",
    ]


@pytest.mark.asyncio
async def test_parallel_module_workflow() -> None:
    def merge(results: list[PipelineResult]) -> PipelineResult:
        assert [r.output.primary_path for r in results] == ["dist/web", "dist/api", "dist/cli"]
        return PipelineResult.ok(PipelineOutput(primary_path="dist/all"))

    pipeline = ParallelNode([
        TraceExecutor("web", "dist/web"),
        TraceExecutor("api", "dist/api"),
        TraceExecutor("cli", "dist/cli"),
    ], merge=merge)

    result = await pipeline.run(PipelineInput.from_path("spec.yaml"), EngineOptions())

    assert result.success
    assert result.output.primary_path == "dist/all"


@pytest.mark.asyncio
async def test_loop_agile_workflow() -> None:
    iterations = 0

    def until_done(result: PipelineResult) -> bool:
        nonlocal iterations
        iterations += 1
        return iterations == 3

    pipeline = LoopNode(TraceExecutor("sprint", "sprint/output"), until=until_done)

    result = await pipeline.run(PipelineInput.from_path("backlog.yaml"), EngineOptions())

    assert result.success
    assert iterations == 3


@pytest.mark.asyncio
async def test_branch_feature_workflow() -> None:
    def select(input: PipelineInput) -> Node | Executor:
        if input.primary_path and "hotfix" in input.primary_path:
            return TraceExecutor("hotfix", "deploy/hotfix")
        return TraceExecutor("feature", "deploy/feature")

    pipeline = BranchNode(select)

    hotfix = await pipeline.run(PipelineInput.from_path("input/hotfix.yaml"), EngineOptions())
    feature = await pipeline.run(PipelineInput.from_path("input/feature.yaml"), EngineOptions())

    assert hotfix.output.primary_path == "deploy/hotfix"
    assert feature.output.primary_path == "deploy/feature"


@pytest.mark.asyncio
async def test_cicd_pipeline() -> None:
    def merge_checks(results: list[PipelineResult]) -> PipelineResult:
        return PipelineResult.ok(PipelineOutput(primary_path="reports/checks.json", metadata={"checks": len(results)}))

    pipeline = SerialNode([
        TraceExecutor("checkout", "workspace/code"),
        ParallelNode([
            TraceExecutor("lint", "reports/lint.xml"),
            TraceExecutor("unit", "reports/unit.xml"),
            TraceExecutor("security", "reports/security.xml"),
        ], merge=merge_checks),
        TraceExecutor("deploy", "deploy/staging"),
    ])

    result = await pipeline.run(PipelineInput.from_path("commit.txt"), EngineOptions())

    assert result.success
    assert result.output.primary_path == "deploy/staging"


@pytest.mark.asyncio
async def test_code_review_workflow() -> None:
    trace: list[str] = []
    pipeline = SerialNode([
        TraceExecutor("prepare", "reviews/pr.md", trace),
        TraceExecutor("automated-review", "reviews/auto.md", trace),
        TraceExecutor("human-review", "reviews/human.md", trace),
    ])

    result = await pipeline.run(PipelineInput.from_path("branch/feature"), EngineOptions())

    assert result.success
    assert trace[-1] == "human-review:reviews/auto.md"


@pytest.mark.asyncio
async def test_tdd_workflow() -> None:
    cycles = 0

    def complete(result: PipelineResult) -> bool:
        nonlocal cycles
        cycles += 1
        return cycles >= 2

    tdd_cycle = SerialNode([
        TraceExecutor("red", "tests/failing_test.py"),
        TraceExecutor("green", "src/feature.py"),
        TraceExecutor("refactor", "src/feature_refactored.py"),
    ])
    pipeline = LoopNode(tdd_cycle, until=complete)

    result = await pipeline.run(PipelineInput.from_path("feature.md"), EngineOptions())

    assert result.success
    assert cycles == 2


@pytest.mark.asyncio
async def test_microservice_deployment() -> None:
    services = ["gateway", "user", "order"]

    def service_pipeline(name: str) -> SerialNode:
        return SerialNode([
            TraceExecutor(f"build-{name}", f"images/{name}"),
            TraceExecutor(f"test-{name}", f"reports/{name}.xml"),
        ])

    def merge(results: list[PipelineResult]) -> PipelineResult:
        return PipelineResult.ok(PipelineOutput(primary_path="k8s/manifest.yaml", metadata={"services": len(results)}))

    pipeline = ParallelNode([service_pipeline(service) for service in services], merge=merge)

    result = await pipeline.run(PipelineInput.from_path("services.yaml"), EngineOptions())

    assert result.success
    assert result.output.metadata["services"] == 3


@pytest.mark.asyncio
async def test_bugfix_workflow_stops_on_failure() -> None:
    trace: list[str] = []
    pipeline = SerialNode([
        TraceExecutor("reproduce", "reports/repro.md", trace),
        TraceExecutor("fix", "patches/fix.patch", trace, success=False),
        TraceExecutor("verify", "reports/verify.xml", trace),
    ])

    result = await pipeline.run(PipelineInput.from_path("bugs/critical.yaml"), EngineOptions())

    assert not result.success
    assert result.error is not None
    assert result.error.type == "TraceFailure"
    assert trace == ["reproduce:bugs/critical.yaml", "fix:reports/repro.md"]


@pytest.mark.asyncio
async def test_complex_hybrid_workflow() -> None:
    def merge_design(results: list[PipelineResult]) -> PipelineResult:
        return PipelineResult.ok(PipelineOutput(primary_path="docs/design", metadata={"designs": len(results)}))

    def release(input: PipelineInput) -> Node | Executor:
        if input.metadata.get("canary") is True:
            return TraceExecutor("canary", "deploy/canary")
        return TraceExecutor("production", "deploy/production")

    pipeline = Pipe([
        TraceExecutor("analysis", "docs/analysis.md"),
        ParallelNode([
            TraceExecutor("architecture", "docs/architecture.md"),
            TraceExecutor("api", "docs/api.md"),
        ], merge=merge_design),
        BranchNode(release),
    ])

    result = await pipeline.run(PipelineInput(primary_path="goal.md", metadata={"canary": True}))

    assert result.success
    assert result.output.primary_path == "deploy/canary"


@pytest.mark.asyncio
async def test_cli_executor_uses_structured_argv() -> None:
    executor = CliExecutor(
        CliCommandSpec(executable=sys.executable, args=["-c", "import sys; print(sys.argv[1])", "{input.primary_path}"]),
        output=PipelineOutput(primary_path="reports/cli.txt"),
    )

    result = await executor.execute(PipelineInput.from_path("safe;not-shell"), EngineOptions())

    assert result.success
    assert result.output.metadata["stdout"].strip() == "safe;not-shell"


@pytest.mark.asyncio
async def test_cli_executor_returns_structured_error() -> None:
    executor = CliExecutor(
        CliCommandSpec(executable=sys.executable, args=["-c", "import sys; sys.exit(7)"]),
        output=PipelineOutput(primary_path="reports/cli.txt"),
    )

    result = await executor.execute(PipelineInput.from_path("input.txt"), EngineOptions())

    assert not result.success
    assert result.error is not None
    assert result.error.type == "CliCommandFailed"
    assert result.output.metadata["returncode"] == 7


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v", "-s"]))
