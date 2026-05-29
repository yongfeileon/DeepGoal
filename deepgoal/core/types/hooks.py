from __future__ import annotations

from collections.abc import Awaitable, Callable
from enum import Enum
from typing import Literal, TypeAlias

from pydantic import BaseModel, Field

from .common import JsonValue


class HookEvent(str, Enum):
    PRE_TOOL_USE = "PreToolUse"
    POST_TOOL_USE = "PostToolUse"
    POST_TOOL_USE_FAILURE = "PostToolUseFailure"
    USER_PROMPT_SUBMIT = "UserPromptSubmit"
    STOP = "Stop"
    SUBAGENT_STOP = "SubagentStop"
    SUBAGENT_START = "SubagentStart"
    NOTIFICATION = "Notification"
    PRE_COMPACT = "PreCompact"
    PERMISSION_REQUEST = "PermissionRequest"


class HookPayload(BaseModel):
    data: dict[str, JsonValue] = Field(default_factory=dict)


class HookResult(BaseModel):
    continue_: bool = True
    decision: Literal["block"] | None = None
    reason: str | None = None
    additional_context: str | None = None


HookHandler: TypeAlias = Callable[[HookEvent, HookPayload], Awaitable[HookResult]]
