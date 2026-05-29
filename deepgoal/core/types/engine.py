from __future__ import annotations

from typing import Any, AsyncIterator, Protocol

from pydantic import BaseModel, Field

from .enums import PermissionMode
from .tools import McpServerConfig, SkillConfig, ToolConfig


class EngineOptions(BaseModel):
    tools: list[ToolConfig] = Field(default_factory=list)
    mcp_servers: dict[str, McpServerConfig] = Field(default_factory=dict)
    skills: list[SkillConfig] = Field(default_factory=list)
    # hooks: {HookEvent.value -> [callable]}，运行时注入，不做 Pydantic 校验
    hooks: dict[str, list[Any]] = Field(default_factory=dict)
    permission_mode: PermissionMode = PermissionMode.DEFAULT
    max_turns: int | None = None
    system_prompt: str | None = None


class EngineResult(Protocol):
    success: bool
    output: str
    error: str | None


class AgentEngine(Protocol):
    async def run(
        self,
        prompt: str,
        options: EngineOptions,
        cwd: str,
    ) -> AsyncIterator[Any]: ...
