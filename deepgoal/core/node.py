from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from pydantic import BaseModel, Field

from .types.common import JsonValue
from .types.engine import EngineOptions


class Artifact(BaseModel):
    path: str
    kind: str | None = None
    mime_type: str | None = None
    metadata: dict[str, JsonValue] = Field(default_factory=dict)


class ExecutionError(BaseModel):
    type: str
    message: str
    details: dict[str, JsonValue] = Field(default_factory=dict)
    traceback: str | None = None
    recoverable: bool = False


class ExecutionMetrics(BaseModel):
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_seconds: float | None = None


class PipelineInput(BaseModel):
    primary_path: str | None = None
    artifacts: list[Artifact] = Field(default_factory=list)
    metadata: dict[str, JsonValue] = Field(default_factory=dict)

    @classmethod
    def from_path(cls, path: str) -> PipelineInput:
        return cls(primary_path=path)

    def to_output(self) -> PipelineOutput:
        return PipelineOutput(primary_path=self.primary_path, artifacts=list(self.artifacts), metadata=dict(self.metadata))


class PipelineOutput(BaseModel):
    primary_path: str | None = None
    artifacts: list[Artifact] = Field(default_factory=list)
    metadata: dict[str, JsonValue] = Field(default_factory=dict)

    @classmethod
    def from_path(cls, path: str) -> PipelineOutput:
        return cls(primary_path=path)

    def to_input(self) -> PipelineInput:
        return PipelineInput(primary_path=self.primary_path, artifacts=list(self.artifacts), metadata=dict(self.metadata))


class PipelineResult(BaseModel):
    success: bool
    output: PipelineOutput = Field(default_factory=PipelineOutput)
    error: ExecutionError | None = None
    metrics: ExecutionMetrics | None = None

    @classmethod
    def ok(cls, output: PipelineOutput | None = None, metrics: ExecutionMetrics | None = None) -> PipelineResult:
        return cls(success=True, output=output or PipelineOutput(), metrics=metrics)

    @classmethod
    def fail(
        cls,
        error: ExecutionError,
        output: PipelineOutput | None = None,
        metrics: ExecutionMetrics | None = None,
    ) -> PipelineResult:
        return cls(success=False, output=output or PipelineOutput(), error=error, metrics=metrics)


class Node(ABC):
    """Pipeline container with an explicit input/output boundary."""

    @abstractmethod
    async def run(self, input: PipelineInput, options: EngineOptions) -> PipelineResult: ...
