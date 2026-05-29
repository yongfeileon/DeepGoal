from __future__ import annotations

import asyncio
from collections.abc import Callable

from .executor import Executor
from .node import Node, PipelineInput, PipelineOutput, PipelineResult
from .types import EngineOptions

PipelineItem = Node | Executor


def output_to_input(previous: PipelineInput, output: PipelineOutput) -> PipelineInput:
    return PipelineInput(
        primary_path=output.primary_path,
        artifacts=[*previous.artifacts, *output.artifacts],
        metadata={**previous.metadata, **output.metadata},
    )


async def run_pipeline_item(item: PipelineItem, input: PipelineInput, options: EngineOptions) -> PipelineResult:
    if isinstance(item, Node):
        return await item.run(input, options)
    if isinstance(item, Executor):
        return await item.execute(input, options)
    raise TypeError(f"Unsupported pipeline item: {type(item).__name__}")


class SerialNode(Node):
    """Run child items sequentially, passing each output into the next item."""

    def __init__(self, items: list[PipelineItem]) -> None:
        self._items = items

    async def run(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        current = input
        result = PipelineResult.ok(output=input.to_output())
        for item in self._items:
            result = await run_pipeline_item(item, current, options)
            if not result.success:
                return result
            current = output_to_input(current, result.output)
        return result


class ParallelNode(Node):
    """Run child items concurrently with the same input and merge their results."""

    def __init__(self, items: list[PipelineItem], merge: Callable[[list[PipelineResult]], PipelineResult]) -> None:
        self._items = items
        self._merge = merge

    async def run(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        results = await asyncio.gather(*[run_pipeline_item(item, input, options) for item in self._items])
        return self._merge(list(results))


class LoopNode(Node):
    """Repeat an item until the predicate is satisfied or the item fails."""

    def __init__(self, inner: PipelineItem, until: Callable[[PipelineResult], bool]) -> None:
        self._inner = inner
        self._until = until

    async def run(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        current = input
        while True:
            result = await run_pipeline_item(self._inner, current, options)
            if not result.success or self._until(result):
                return result
            current = output_to_input(current, result.output)


class BranchNode(Node):
    """Select a child item at runtime based on the current input."""

    def __init__(self, selector: Callable[[PipelineInput], PipelineItem]) -> None:
        self._selector = selector

    async def run(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        item = self._selector(input)
        return await run_pipeline_item(item, input, options)
