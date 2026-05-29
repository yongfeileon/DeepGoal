from __future__ import annotations

from enum import Enum


class PermissionMode(str, Enum):
    DEFAULT = "default"
    ACCEPT_EDITS = "acceptEdits"
    BYPASS = "bypassPermissions"


class McpServerType(str, Enum):
    STDIO = "stdio"
    SSE = "sse"
    HTTP = "http"
