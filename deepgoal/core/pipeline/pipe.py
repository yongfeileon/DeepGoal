from __future__ import annotations

from ..container import PipelineItem, SerialNode
from ..node import PipelineInput, PipelineResult
from ..types import EngineOptions


class Pipe(SerialNode):
    """Top-level pipeline container with default engine options."""

    def __init__(self, items: list[PipelineItem], options: EngineOptions | None = None) -> None:
        super().__init__(items)
        self._options = options or EngineOptions()

    async def run(self, input: PipelineInput, options: EngineOptions | None = None) -> PipelineResult:
        return await super().run(input, options or self._options)
