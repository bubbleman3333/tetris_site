"""game_ai_lab の backend を import できるようにする。

このサイトは game_ai_lab の**ルールと学習済みの重みを読むだけ**で、あちらのコードは一切変えない。
場所が違う場合は環境変数 `GAME_AI_LAB_BACKEND` で指定する。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

DEFAULT_BACKEND = Path(r"C:\Users\aiueo\PycharmProjects\game_ai_lab\backend")

LAB_BACKEND = Path(os.environ.get("GAME_AI_LAB_BACKEND", str(DEFAULT_BACKEND)))

if not (LAB_BACKEND / "games" / "tetris").is_dir():
    raise SystemExit(
        f"game_ai_lab の backend が見つかりません: {LAB_BACKEND}\n"
        "環境変数 GAME_AI_LAB_BACKEND で場所を指定してください。"
    )

if str(LAB_BACKEND) not in sys.path:
    sys.path.insert(0, str(LAB_BACKEND))

SITE_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = LAB_BACKEND / "runs" / "tetris"


def resolve_agent_id(agent_id: str | None) -> str:
    """`v3-selfplay:best` のような AI の ID。省略したら default_agent.txt を読む。"""
    if agent_id:
        return agent_id
    path = RUNS_DIR / "default_agent.txt"
    if path.exists():
        pinned = path.read_text(encoding="utf-8").strip()
        if pinned:
            return pinned
    raise SystemExit("AI の ID を指定してください（例: v6-opponent:best）")


def checkpoint_path(agent_id: str) -> Path:
    run, _, kind = agent_id.partition(":")
    path = RUNS_DIR / run / "checkpoints" / f"{kind or 'best'}.pt"
    if not path.exists():
        raise SystemExit(f"重みが見つかりません: {path}")
    return path
