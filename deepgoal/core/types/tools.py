from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .enums import McpServerType


class McpServerConfig(BaseModel):
    type: McpServerType = McpServerType.STDIO
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    url: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    env: dict[str, str] = Field(default_factory=dict)


class ToolConfig(BaseModel):
    name: str
    params: dict[str, Any] = Field(default_factory=dict)


class SkillConfig(BaseModel):
    name: str
    args: str = ""
