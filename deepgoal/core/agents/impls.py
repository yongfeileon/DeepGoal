from __future__ import annotations

from ..node import NodeResult
from ..types import EngineOptions
from .base import BaseAgent


class AnalysisAgent(BaseAgent):
    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        print(f"[AnalysisAgent] {input_file_path} -> {self.output_file_path}")
        return NodeResult(success=True, output_file_path=self.output_file_path)


class DecompositionAgent(BaseAgent):
    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        print(f"[DecompositionAgent] {input_file_path} -> {self.output_file_path}")
        return NodeResult(success=True, output_file_path=self.output_file_path)


class PlanningAgent(BaseAgent):
    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        print(f"[PlanningAgent] {input_file_path} -> {self.output_file_path}")
        return NodeResult(success=True, output_file_path=self.output_file_path)


class TaskAgent(BaseAgent):
    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        print(f"[TaskAgent] {input_file_path} -> {self.output_file_path}")
        return NodeResult(success=True, output_file_path=self.output_file_path)


class ExecutorAgent(BaseAgent):
    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        print(f"[ExecutorAgent] {input_file_path} -> {self.output_file_path}")
        return NodeResult(success=True, output_file_path=self.output_file_path)


class AcceptanceAgent(BaseAgent):
    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        print(f"[AcceptanceAgent] {input_file_path} -> {self.output_file_path}")
        return NodeResult(success=True, output_file_path=self.output_file_path)
