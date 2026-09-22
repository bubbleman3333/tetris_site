r"""AI がどれだけ耐えるかを実測する（おじゃまの強さのバランス調整用）。

サイトと同じ条件でシミュレーションする:
  - AI は `--move-sec`（既定 0.4 秒）に 1 手のペースで打つ
  - 挑戦者は毎秒 `rate` 段ぶんのエネルギーを溜め、4 段ずつまとめて送る（いちばん効率のよい撃ち方）

使い方（game_ai_lab の venv で実行する）:
    ..\game_ai_lab\backend\.venv\Scripts\python tools\measure_ai.py v3-selfplay:best --lookahead 1
"""

from __future__ import annotations

import argparse
import json
import statistics
from concurrent.futures import ProcessPoolExecutor

import _lab  # noqa: F401  （sys.path に game_ai_lab の backend を足す）

MOVE_SEC = 0.4
CHUNK = 4  # まとめて送る段数

_agent_cache: dict[tuple, object] = {}


def _get_agent(agent_id: str, lookahead: int):
    import torch

    torch.set_num_threads(1)
    key = (agent_id, lookahead)
    if key not in _agent_cache:
        from rl.tetris.agent import NeuralAgent

        _agent_cache[key] = NeuralAgent.load(_lab.checkpoint_path(agent_id), "cpu", lookahead=lookahead)
    return _agent_cache[key]


def play(args: tuple) -> dict:
    """1 局ぶん遊ぶ。戻り値は生存手数・秒数・消したライン・受けたおじゃま。"""
    agent_id, lookahead, seed, rate, max_pieces, move_sec = args
    from games.tetris import Game
    from rl.tetris.position import Position

    agent = _get_agent(agent_id, lookahead)
    g = Game(seed=seed)
    budget = 0.0  # 溜まっている「送れる段数」
    sent_total = 0
    pieces = 0

    while not g.over and pieces < max_pieces:
        cand = agent.choose(Position.from_game(g))
        if cand is None:
            break
        for act in cand.path:
            g.apply(act)
        pieces += 1
        budget += rate * move_sec
        while budget >= CHUNK:
            g.receive_garbage(CHUNK)
            budget -= CHUNK
            sent_total += CHUNK

    return {
        "seed": seed,
        "rate": rate,
        "pieces": pieces,
        "seconds": pieces * move_sec,
        "lines": g.stats.lines,
        "attack": g.stats.attack,
        "garbage_sent": sent_total,
        "dead": g.over,
    }


def summarize(results: list[dict], move_sec: float) -> dict:
    secs = [r["seconds"] for r in results]
    dead = [r for r in results if r["dead"]]
    return {
        "games": len(results),
        "kills": len(dead),
        "kill_rate": round(len(dead) / len(results), 3),
        "avg_seconds": round(statistics.fmean(secs), 1),
        "median_seconds": round(statistics.median(secs), 1),
        "avg_kill_seconds": round(statistics.fmean([r["seconds"] for r in dead]), 1) if dead else None,
        "avg_lines": round(statistics.fmean([r["lines"] for r in results]), 1),
        "avg_attack_per_piece": round(
            statistics.fmean([r["attack"] / max(r["pieces"], 1) for r in results]), 3
        ),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("agent", nargs="?", default=None, help="v3-selfplay:best など（省略で default_agent.txt）")
    p.add_argument("--lookahead", type=int, default=1)
    p.add_argument("--games", type=int, default=6)
    p.add_argument("--max-pieces", type=int, default=750, help="打ち切り（0.4 秒/手なら 750 手 = 5 分）")
    p.add_argument("--move-sec", type=float, default=MOVE_SEC)
    p.add_argument("--rates", type=float, nargs="*", default=[0.0, 0.6, 0.9, 1.2, 1.5, 2.0])
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--out", default=None, help="結果を書き出す JSON")
    a = p.parse_args()

    agent_id = _lab.resolve_agent_id(a.agent)
    tasks = [
        (agent_id, a.lookahead, 1000 + i, rate, a.max_pieces, a.move_sec)
        for rate in a.rates
        for i in range(a.games)
    ]
    print(f"AI={agent_id} lookahead={a.lookahead} games={a.games} 手数上限={a.max_pieces}", flush=True)

    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        results = list(ex.map(play, tasks))

    report = {"agent": agent_id, "lookahead": a.lookahead, "move_sec": a.move_sec, "by_rate": {}}
    for rate in a.rates:
        rows = [r for r in results if r["rate"] == rate]
        s = summarize(rows, a.move_sec)
        report["by_rate"][str(rate)] = s
        print(
            f"  毎秒 {rate:>4} 段: 撃破率 {s['kill_rate']:>5.0%}  平均生存 {s['avg_seconds']:>6.1f} 秒"
            f"  （倒せた局だけ {s['avg_kill_seconds']}）  平均 {s['avg_lines']} ライン"
            f"  火力 {s['avg_attack_per_piece']}/手",
            flush=True,
        )

    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"書き出し: {a.out}")


if __name__ == "__main__":
    main()
