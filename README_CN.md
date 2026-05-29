[![PyPI version](https://badge.fury.io/py/deepgoal.svg)](https://pypi.org/project/deepgoal/)

[English Version](./README.md)

# DeepGoal

DeepGoal 是一个面向目标驱动自动编程的 pre-alpha AI Agent 框架。它把工程流程建模为可组合流水线：容器节点负责编排流程，执行器负责叶子任务。

## 当前状态

DeepGoal 正在积极设计和开发中。稳定版本发布前，API 可能继续调整。

## 环境要求

- Python 3.11+

## 安装

```bash
pip install deepgoal
```

本地开发安装：

```bash
pip install -e ".[dev]"
```

## 最小示例

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

## 核心思想

- `Node` / `Pipe` 是容器，对外提供流水线输入输出边界。
- `Executor` 是叶子执行单元。
- 容器可以组合子节点和执行器，形成串行、并行、循环、分支等工作流。
