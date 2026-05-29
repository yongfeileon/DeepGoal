from __future__ import annotations

from ..executor import Executor


class BaseAgent(Executor):
    """Agent 是 Executor 的子类：AI 驱动的 input → output 执行单元。"""
