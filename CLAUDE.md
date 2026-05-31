# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeepGoal is an AI Agent framework for goal-driven automatic programming. It is currently in Pre-Alpha stage (version 0.0.2) and under active development.

**Core dependencies:** `claude-agent-sdk`, `pydantic`, `pyyaml`

**Python version:** >=3.11

## Build and Publish Commands

```bash
# Build the package
python -m build

# Upload to PyPI (requires API token)
python -m twine upload dist/*

# Install locally for development
pip install -e .

# Install with dev dependencies
pip install -e ".[dev]"
```

**Important:** Before publishing to PyPI, update the version in `pyproject.toml`. PyPI does not allow overwriting existing versions.

## Testing

```bash
# Run tests (when available)
pytest

# Run with coverage
pytest --cov=deepgoal
```

## Project Structure

- `deepgoal/` - Main package source
  - `core/` - Core framework components
  - `launcher/` - Agent launcher components
- `_docs/` - Documentation and reference materials (not part of the package)

## Environment Setup

Required environment variables (see `.env.sample`):
- `ANTHROPIC_BASE_URL` - Anthropic API base URL
- `ANTHROPIC_AUTH_TOKEN` - Anthropic authentication token
- `ANTHROPIC_MODEL` - Model identifier
- `ZHIPU_API_KEY` - Zhipu AI API key (optional, for web search)

## Coding Conventions

- **Strict typing**: All function parameters and return values must have type annotations. Use Pydantic models or TypedDict. Prohibit passing bare `dict` / `Any` across layers.
- Use `from __future__ import annotations` for forward references
- **Parameter encapsulation**: When a function has >=4 parameters, encapsulate them into a Pydantic model or TypedDict class. Even with fewer than 4 parameters, consider encapsulation if they are highly related.

## Communication Language
**保持用中文与我沟通** 


## Repository

GitHub: https://github.com/yongfeileon/DeepGoal
PyPI: https://pypi.org/project/deepgoal/