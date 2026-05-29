[![PyPI version](https://badge.fury.io/py/deepgoal.svg)](https://pypi.org/project/deepgoal/)

[中文版本](./README_CN.md)

# DeepGoal

DeepGoal is a pre-alpha AI Agent framework for goal-driven automatic programming. It models engineering workflows as composable pipelines: container nodes orchestrate the flow, while executors perform the leaf work.

## Status

DeepGoal is under active design and development. APIs may change before the first stable release.

## Requirements

- Python 3.11+

## Installation

```bash
pip install deepgoal
```

For local development:

```bash
pip install -e ".[dev]"
```

## Minimal Example

```python
from deepgoal.core.executor import Executor
from deepgoal.core.node import PipelineInput, PipelineOutput, PipelineResult
from deepgoal.core.pipeline.pipe import Pipe
from deepgoal.core.types import EngineOptions


class WriteSpecExecutor(Executor):
    async def execute(self, input: PipelineInput, options: EngineOptions) -> PipelineResult:
        return PipelineResult.ok(PipelineOutput(primary_path="workspace/spec.md"))


pipe = Pipe(items=[WriteSpecExecutor()])
result = await pipe.run(PipelineInput(primary_path="goal.md"))
print(result.output.primary_path)
```

## Core Idea

- `Node` / `Pipe` are containers that expose pipeline input and output boundaries.
- `Executor` is a leaf execution unit.
- Containers can compose child nodes and executors into serial, parallel, loop, or branch workflows.
