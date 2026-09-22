r"""Python 版の AI の「候補手 → 特徴量 → 評価値 → 選んだ手」を書き出す（TS 版との一致テスト用）。

**このサイトでいちばん大事なテストデータ**。TypeScript に移植した候補手の列挙・特徴量・
ニューラルネットが Python 版とずれていないかを、tests/parity.test.ts がこれで確かめる。

    ..\game_ai_lab\backend\.venv\Scripts\python tools\export_cases.py v3-selfplay:best

出力: tests/fixtures/parity.json
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import _lab

LOOKAHEADS = (0, 1, 2, 3)


def collect_positions(agent, seeds: list[int], per_seed: int, every: int, garbage: float) -> list:
    """AI に遊ばせて、途中の局面を集める（おじゃまも降らせて崩れた盤面も混ぜる）。"""
    from games.tetris import Game
    from rl.tetris.position import Position

    out = []
    for seed in seeds:
        rng = random.Random(seed)
        g = Game(seed=seed)
        taken = 0
        for step in range(2000):
            if g.over or taken >= per_seed:
                break
            pos = Position.from_game(g)
            # 最初の 1 手（空の盤面）も、積み上がったところも欲しいので一定間隔で拾う
            if step % every == 0:
                out.append(pos)
                taken += 1
            cand = agent.choose(pos)
            if cand is None:
                break
            for act in cand.path:
                g.apply(act)
            if rng.random() < garbage:
                g.receive_garbage(rng.choice([1, 1, 2, 2, 4]))
    return out


def dump_position(pos) -> dict:
    return {
        "rows": list(pos.board.rows),
        "current": pos.current,
        "hold": pos.hold,
        "canHold": pos.can_hold,
        "next": list(pos.next),
        "combo": pos.combo,
        "b2b": pos.b2b,
        "pending": [list(p) for p in pos.pending],
    }


def dump_candidate(c) -> dict:
    o = c.outcome
    return {
        "piece": c.placement.piece, "rot": c.placement.rot, "x": c.placement.x, "y": c.placement.y,
        "spin": c.placement.spin, "useHold": c.use_hold, "path": list(c.path),
        "holdAfter": c.hold_after, "nextAfter": c.next_after, "dead": bool(c.dead),
        "lines": o.lines, "attack": o.attack, "sent": o.sent, "combo": o.combo,
        "b2b": bool(o.b2b), "perfectClear": bool(o.perfect_clear),
        "garbageReceived": o.garbage_received, "topOut": bool(o.dead),
        "pendingAfter": [list(p) for p in o.pending],
        "rowsAfter": list(o.board.rows),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("agent", nargs="?", default=None)
    p.add_argument("--seeds", type=int, nargs="*", default=[1, 2, 3, 4, 5, 6])
    p.add_argument("--per-seed", type=int, default=7)
    p.add_argument("--every", type=int, default=11)
    p.add_argument("--garbage", type=float, default=0.28, help="1 手ごとにおじゃまを降らせる確率")
    p.add_argument("--lookahead", type=int, default=1, help="局面を集めるときの先読み（速さのため浅め）")
    p.add_argument("--out", default=str(_lab.SITE_ROOT / "tests" / "fixtures" / "parity.json"))
    a = p.parse_args()

    import numpy as np
    import torch

    torch.set_num_threads(1)

    from rl.tetris.agent import NeuralAgent
    from rl.tetris.encoding import FEATURE_NAMES_BY_VERSION, encode_many
    from rl.tetris.position import enumerate_candidates

    agent_id = _lab.resolve_agent_id(a.agent)
    agent = NeuralAgent.load(_lab.checkpoint_path(agent_id), "cpu", lookahead=a.lookahead)
    version = agent.feature_version

    positions = collect_positions(agent, a.seeds, a.per_seed, a.every, a.garbage)
    print(f"{len(positions)} 局面を集めました", flush=True)

    cases = []
    for i, pos in enumerate(positions):
        cands = enumerate_candidates(pos)
        if not cands:
            continue
        feats = encode_many(cands, version)
        scores = agent.scores(cands, feats)
        choice = {}
        for la in LOOKAHEADS:
            agent.lookahead = la
            choice[str(la)] = int(np.argmax(scores)) if la == 0 else int(agent._beam_search(cands, scores))
        cases.append(
            {
                "id": i,
                "position": dump_position(pos),
                "candidates": [dump_candidate(c) for c in cands],
                "features": [[float(v) for v in row] for row in feats],
                "scores": [float(v) for v in scores],
                "choice": choice,
            }
        )
    agent.lookahead = a.lookahead

    data = {
        "agent": agent_id,
        "featureVersion": version,
        "featureNames": FEATURE_NAMES_BY_VERSION[version],
        "lookaheads": list(LOOKAHEADS),
        "beam": agent.beam,
        "gamma": agent.gamma,
        "reward": {
            "alive": agent.reward.alive, "line": agent.reward.line,
            "attack": agent.reward.attack, "death": agent.reward.death,
        },
        "cases": cases,
    }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    n_cand = sum(len(c["candidates"]) for c in cases)
    print(f"書き出し: {out}（{len(cases)} 局面 / 候補手 {n_cand} 個 / {out.stat().st_size / 1024:.0f} KB）")


if __name__ == "__main__":
    main()
