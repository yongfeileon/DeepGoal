from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod

from .node import NodeResult
from .types import EngineOptions


class Executor(ABC):
    """执行器：纯粹的 input → output 工作单元，与 Node 体系完全独立。
    output_file_path 在构建时声明，execute 只接收 input_file_path。
    """

    def __init__(self, output_file_path: str) -> None:
        self.output_file_path = output_file_path

    @abstractmethod
    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult: ...


class ClaudeExecutor(Executor):
    """使用 claude-agent-sdk 执行任务（待实现）。"""

    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        raise NotImplementedError


class CliExecutor(Executor):
    def __init__(self, cmd_template: str, output_file_path: str) -> None:
        super().__init__(output_file_path)
        self._cmd_template = cmd_template

    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        cmd = self._cmd_template.format(input_file_path=input_file_path, output_file_path=self.output_file_path)
        proc = await asyncio.create_subprocess_shell(cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        _, stderr = await proc.communicate()
        success = proc.returncode == 0
        return NodeResult(success=success, output_file_path=self.output_file_path, error=stderr.decode() if not success else None)


class HumanExecutor(Executor):
    def __init__(self, prompt: str, output_file_path: str) -> None:
        super().__init__(output_file_path)
        self._prompt = prompt

    async def execute(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        print(f"\n[HumanExecutor] {self._prompt}\n  {input_file_path}  ->  {self.output_file_path}")
        response = await asyncio.get_event_loop().run_in_executor(None, input, "  确认继续? [y/N]: ")
        success = response.strip().lower() == "y"
        return NodeResult(success=success, output_file_path=self.output_file_path if success else input_file_path, error=None if success else "人工拒绝继续")
