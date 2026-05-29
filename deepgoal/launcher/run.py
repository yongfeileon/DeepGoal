from __future__ import annotations

import asyncio
import shutil
import sys
from pathlib import Path

# ── 路径常量 ──────────────────────────────────────────────
_LAUNCHER_DIR = Path(__file__).parent
_CORE_DIR = _LAUNCHER_DIR.parent / "core"
_CLONE_DIR = _LAUNCHER_DIR.parent / "_core_clone"


def _clone_core() -> None:
    """全量克隆 core/ 到 .clone/（先清空再复制，确保无残留）。"""
    if _CLONE_DIR.exists():
        shutil.rmtree(_CLONE_DIR)
    shutil.copytree(_CORE_DIR, _CLONE_DIR)
    (_CLONE_DIR / "__init__.py").touch()  # 使 .clone/ 成为合法包 'clone'
    print(f"[launcher] core cloned → {_CLONE_DIR}")


def _inject_clone_path() -> None:
    """将 .clone/ 的父目录注入 sys.path，以 'clone' 包名导入。"""
    parent_str = str(_LAUNCHER_DIR.parent)
    if parent_str not in sys.path:
        sys.path.insert(0, parent_str)


async def main(goal_file_path: str) -> None:
    _clone_core()
    _inject_clone_path()

    from _core_clone.agents.impls import (  # type: ignore[import]
        AcceptanceAgent,
        AnalysisAgent,
        DecompositionAgent,
        ExecutorAgent,
        PlanningAgent,
        TaskAgent,
    )
    from _core_clone.pipeline.pipe import Pipe  # type: ignore[import]
    from _core_clone.types import EngineOptions  # type: ignore[import]

    workspace = str(Path(goal_file_path).parent)
    pipe = Pipe(items=[
        AnalysisAgent(output_file_path=f"{workspace}/analysis.md"),
        DecompositionAgent(output_file_path=f"{workspace}/tasks.md"),
        PlanningAgent(output_file_path=f"{workspace}/plan.md"),
        TaskAgent(output_file_path=f"{workspace}/task_detail.md"),
        ExecutorAgent(output_file_path=f"{workspace}/code"),
        AcceptanceAgent(output_file_path=f"{workspace}/acceptance.md"),  # 可选
    ])

    result = await pipe.run(goal_file_path, EngineOptions())
    print(f"[launcher] done — success={result.success} output={result.output_file_path} error={result.error}")


if __name__ == "__main__":
    _goal_file_path = sys.argv[1] if len(sys.argv) > 1 else str(Path.cwd() / "goal.md")
    asyncio.run(main(_goal_file_path))
