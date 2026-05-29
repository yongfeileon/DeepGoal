from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Protocol

from pydantic import BaseModel


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


class HookResult(BaseModel):
    continue_: bool = True
    decision: Literal["block"] | None = None
    reason: str | None = None
    additional_context: str | None = None


class HookHandler(Protocol):
    async def __call__(
        self, event: HookEvent, payload: dict[str, Any]
    ) -> HookResult: ...
