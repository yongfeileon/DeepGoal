from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from .common import JsonValue
from .enums import PermissionMode
from .hooks import HookEvent, HookHandler
from .tools import McpServerConfig, SkillConfig, ToolConfig


class EngineOptions(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    tools: list[ToolConfig] = Field(default_factory=list)
    mcp_servers: dict[str, McpServerConfig] = Field(default_factory=dict)
    skills: list[SkillConfig] = Field(default_factory=list)
    hooks: dict[HookEvent, list[HookHandler]] = Field(default_factory=dict)
    permission_mode: PermissionMode = PermissionMode.DEFAULT
    max_turns: int | None = None
    system_prompt: str | None = None


class AgentRunRequest(BaseModel):
    prompt: str
    cwd: str
    metadata: dict[str, JsonValue] = Field(default_factory=dict)


class AgentStreamEvent(BaseModel):
    type: Literal["message", "tool_call", "tool_result", "error", "done"]
    content: str | None = None
    metadata: dict[str, JsonValue] = Field(default_factory=dict)


class EngineRunResult(BaseModel):
    success: bool
    output: str
    error: str | None = None
    metadata: dict[str, JsonValue] = Field(default_factory=dict)


class AgentEngine(Protocol):
    def stream(self, request: AgentRunRequest, options: EngineOptions) -> AsyncIterator[AgentStreamEvent]: ...

    async def run(self, request: AgentRunRequest, options: EngineOptions) -> EngineRunResult: ...
