from __future__ import annotations

import asyncio
import os
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from .node import ExecutionError, ExecutionMetrics, PipelineInput, PipelineOutput, PipelineResult
from .types import EngineOptions


class Executor(ABC):
    """Leaf unit that performs actual work inside a pipeline container."""

    def __init__(self, output: PipelineOutput | None = None) -> None:
        self.output = output or PipelineOutput()

    @abstractmethod
    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult: ...


class CliCommandSpec(BaseModel):
    executable: str
    args: list[str] = Field(default_factory=list)
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)


class CliExecutor(Executor):
    def __init__(self, command: CliCommandSpec, output: PipelineOutput | None = None) -> None:
        super().__init__(output)
        self._command = command

    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        started_at = datetime.now(timezone.utc)
        started = time.perf_counter()
        args = [self._format_arg(arg, input) for arg in self._command.args]
        env = None if not self._command.env else {**os.environ, **self._command.env}

        try:
            proc = await asyncio.create_subprocess_exec(
                self._command.executable,
                *args,
                cwd=self._command.cwd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
        except OSError as exc:
            return PipelineResult.fail(
                error=ExecutionError(type=type(exc).__name__, message=str(exc)),
                output=self.output,
                metrics=self._metrics(started_at, started),
            )

        output = self.output.model_copy(deep=True)
        output.metadata.update(
            {
                "returncode": proc.returncode or 0,
                "stdout": stdout.decode(errors="replace"),
                "stderr": stderr.decode(errors="replace"),
            }
        )
        metrics = self._metrics(started_at, started)
        if proc.returncode == 0:
            return PipelineResult.ok(output=output, metrics=metrics)
        return PipelineResult.fail(
            error=ExecutionError(
                type="CliCommandFailed",
                message=f"Command exited with status {proc.returncode}",
                details={"returncode": proc.returncode or 0},
            ),
            output=output,
            metrics=metrics,
        )

    def _format_arg(self, arg: str, input: PipelineInput) -> str:
        return (
            arg.replace("{input.primary_path}", input.primary_path or "")
            .replace("{output.primary_path}", self.output.primary_path or "")
        )

    def _metrics(self, started_at: datetime, started: float) -> ExecutionMetrics:
        return ExecutionMetrics(
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
            duration_seconds=time.perf_counter() - started,
        )


class HumanExecutor(Executor):
    def __init__(self, prompt: str, output: PipelineOutput | None = None) -> None:
        super().__init__(output)
        self._prompt = prompt

    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        print(f"\n[HumanExecutor] {self._prompt}\n  {input.primary_path}  ->  {self.output.primary_path}")
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(None, input_text, "  确认继续? [y/N]: ")
        if response.strip().lower() == "y":
            return PipelineResult.ok(output=self.output)
        return PipelineResult.fail(
            error=ExecutionError(type="HumanRejected", message="人工拒绝继续", recoverable=True),
            output=input.to_output(),
        )


def input_text(prompt: str) -> str:
    return input(prompt)
