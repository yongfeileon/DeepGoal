from __future__ import annotations

import asyncio
from collections.abc import Callable

from .executor import Executor
from .node import Node, NodeResult
from .types import EngineOptions

PipelineItem = Node | Executor


class SerialNode(Node):
    """串行容器：依次执行，上游 output_file_path 作为下游 input_file_path。"""

    def __init__(self, items: list[PipelineItem]) -> None:
        self._items = items

    async def run(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        current_in = input_file_path
        result = NodeResult(success=True, output_file_path=input_file_path)
        for item in self._items:
            if isinstance(item, Node):
                result = await item.run(current_in, options)
            else:
                result = await item.execute(current_in, options)
            if not result.success:
                return result
            current_in = result.output_file_path
        return result


class ParallelNode(Node):
    """并行容器：所有子项共享同一 input_file_path，由 merge 合并结果。"""

    def __init__(self, items: list[PipelineItem], merge: Callable[[list[NodeResult]], NodeResult]) -> None:
        self._items = items
        self._merge = merge

    async def run(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        async def _run(item: PipelineItem) -> NodeResult:
            return await (item.run(input_file_path, options) if isinstance(item, Node) else item.execute(input_file_path, options))

        results = await asyncio.gather(*[_run(item) for item in self._items])
        return self._merge(list(results))


class LoopNode(Node):
    """循环容器：重复执行 inner，直到 until(result) 为 True 或失败。"""

    def __init__(self, inner: PipelineItem, until: Callable[[NodeResult], bool]) -> None:
        self._inner = inner
        self._until = until

    async def run(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        current_in = input_file_path
        while True:
            if isinstance(self._inner, Node):
                result = await self._inner.run(current_in, options)
            else:
                result = await self._inner.execute(current_in, options)
            if not result.success or self._until(result):
                return result
            current_in = result.output_file_path


class BranchNode(Node):
    """条件容器：selector 根据 input_file_path 决定执行哪个子项。"""

    def __init__(self, selector: Callable[[str], PipelineItem]) -> None:
        self._selector = selector

    async def run(self, input_file_path: str, options: EngineOptions) -> NodeResult:
        item = self._selector(input_file_path)
        return await (item.run(input_file_path, options) if isinstance(item, Node) else item.execute(input_file_path, options))
