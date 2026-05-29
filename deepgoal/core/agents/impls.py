from __future__ import annotations

from ..node import PipelineInput, PipelineOutput, PipelineResult
from ..types import EngineOptions
from .base import BaseAgent


class AnalysisAgent(BaseAgent):
    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        print(f"[AnalysisAgent] {input.primary_path} -> {self.output.primary_path}")
        return PipelineResult.ok(output=self.output)


class DecompositionAgent(BaseAgent):
    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        print(f"[DecompositionAgent] {input.primary_path} -> {self.output.primary_path}")
        return PipelineResult.ok(output=self.output)


class PlanningAgent(BaseAgent):
    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        print(f"[PlanningAgent] {input.primary_path} -> {self.output.primary_path}")
        return PipelineResult.ok(output=self.output)


class TaskAgent(BaseAgent):
    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        print(f"[TaskAgent] {input.primary_path} -> {self.output.primary_path}")
        return PipelineResult.ok(output=self.output)


class ExecutorAgent(BaseAgent):
    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        print(f"[ExecutorAgent] {input.primary_path} -> {self.output.primary_path}")
        return PipelineResult.ok(output=self.output)


class AcceptanceAgent(BaseAgent):
    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        print(f"[AcceptanceAgent] {input.primary_path} -> {self.output.primary_path}")
        return PipelineResult.ok(output=self.output)


def output_path(path: str) -> PipelineOutput:
    return PipelineOutput(primary_path=path)
