from __future__ import annotations

import asyncio
import shutil
import sys
from pathlib import Path

_LAUNCHER_DIR = Path(__file__).parent
_CORE_DIR = _LAUNCHER_DIR.parent / "core"
_CLONE_DIR = _LAUNCHER_DIR.parent / "_core_clone"


def _clone_core() -> None:
    if _CLONE_DIR.exists():
        shutil.rmtree(_CLONE_DIR)
    shutil.copytree(_CORE_DIR, _CLONE_DIR)
    (_CLONE_DIR / "__init__.py").touch()
    print(f"[launcher] core cloned -> {_CLONE_DIR}")


def _inject_clone_path() -> None:
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
    from _core_clone.node import PipelineInput, PipelineOutput  # type: ignore[import]
    from _core_clone.pipeline.pipe import Pipe  # type: ignore[import]
    from _core_clone.types import EngineOptions  # type: ignore[import]

    workspace = str(Path(goal_file_path).parent)
    pipe = Pipe(items=[
        AnalysisAgent(output=PipelineOutput(primary_path=f"{workspace}/analysis.md")),
        DecompositionAgent(output=PipelineOutput(primary_path=f"{workspace}/tasks.md")),
        PlanningAgent(output=PipelineOutput(primary_path=f"{workspace}/plan.md")),
        TaskAgent(output=PipelineOutput(primary_path=f"{workspace}/task_detail.md")),
        ExecutorAgent(output=PipelineOutput(primary_path=f"{workspace}/code")),
        AcceptanceAgent(output=PipelineOutput(primary_path=f"{workspace}/acceptance.md")),
    ])

    result = await pipe.run(PipelineInput(primary_path=goal_file_path), EngineOptions())
    print(f"[launcher] done: success={result.success} output={result.output.primary_path} error={result.error}")


if __name__ == "__main__":
    _goal_file_path = sys.argv[1] if len(sys.argv) > 1 else str(Path.cwd() / "goal.md")
    asyncio.run(main(_goal_file_path))
