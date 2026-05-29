from __future__ import annotations

from pydantic import BaseModel, Field

from .common import JsonValue
from .enums import McpServerType


class ToolParams(BaseModel):
    values: dict[str, JsonValue] = Field(default_factory=dict)


class McpServerConfig(BaseModel):
    type: McpServerType = McpServerType.STDIO
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    url: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    env: dict[str, str] = Field(default_factory=dict)


class ToolConfig(BaseModel):
    name: str
    params: ToolParams = Field(default_factory=ToolParams)


class SkillConfig(BaseModel):
    name: str
    args: str = ""
