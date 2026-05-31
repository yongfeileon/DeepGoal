[English Version](./README.md)

# DeepGoal

DeepGoal 是一个面向目标驱动自动编程的 pre-alpha AI Agent 框架。它把工程流程建模为可组合流水线：容器节点负责编排流程，执行器负责叶子任务。

## 当前状态

DeepGoal 正在积极设计和开发中。稳定版本发布前，API 可能继续调整。

**当前版本：** TypeScript 实现 (deepgoal-ts)

## 环境要求

- Node.js 18+
- TypeScript 5.3+

## 安装

```bash
npm install deepgoal
```

本地开发安装：

```bash
cd deepgoal-ts
npm install
npm run build
```

## 最小示例

```typescript
import { Executor } from 'deepgoal/core';
import type { PipelineInput, PipelineOutput, PipelineResult, EngineOptions } from 'deepgoal/core';
import { Pipe } from 'deepgoal/core';

class WriteSpecExecutor extends Executor {
  async execute(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    return {
      status: 'ok',
      output: { primary_path: 'workspace/spec.md' }
    };
  }
}

const pipe = new Pipe({ items: [new WriteSpecExecutor()] });
const result = await pipe.run({ primary_path: 'goal.md' });
console.log(result.output.primary_path);
```

## 核心思想

- `Node` / `Pipe` 是容器，对外提供流水线输入输出边界。
- `Executor` 是叶子执行单元。
- 容器可以组合子节点和执行器，形成串行、并行、循环、分支等工作流。
