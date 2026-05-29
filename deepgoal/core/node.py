from __future__ import annotations

from abc import ABC, abstractmethod

from .types import EngineOptions


class NodeResult:
    def __init__(self, success: bool, output_file_path: str, error: str | None = None) -> None:
        self.success = success
        self.output_file_path = output_file_path
        self.error = error


class Node(ABC):
    """流水线的基本单元：容器和执行器的共同接口。"""

    @abstractmethod
    async def run(self, input_file_path: str, options: EngineOptions) -> NodeResult: ...
