from __future__ import annotations

from ..container import PipelineItem, SerialNode
from ..node import NodeResult
from ..types import EngineOptions


class Pipe(SerialNode):
    """顺序执行一组 Node/Executor，Pipe 本身也是 Node，可嵌套进任何容器。"""

    def __init__(self, items: list[PipelineItem], options: EngineOptions | None = None) -> None:
        super().__init__(items)
        self._options = options or EngineOptions()

    async def run(self, input_file_path: str, options: EngineOptions | None = None) -> NodeResult:
        return await super().run(input_file_path, options or self._options)
