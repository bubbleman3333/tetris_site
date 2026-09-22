r"""学習済み ValueNet の重みを、ブラウザで読める JSON に書き出す。

game_ai_lab 側は**読むだけ**（何も変えない）。

    ..\game_ai_lab\backend\.venv\Scripts\python tools\export_weights.py v3-selfplay:best

出力: public/ai/<run>-<kind>.json
  {
    "agent": "v3-selfplay:best",
    "featureVersion": 1,          # 43 次元か 52 次元か（rl/tetris/encoding.py と同じ番号）
    "featureDim": 43,
    "gamma": 0.97,
    "reward": {"alive":0.1, "line":0.2, "attack":1.0, "death":-5.0, "win":0.0},
    "layers": [{"in":43, "out":256, "w":"<base64 float32>", "b":"<base64 float32>"}, ...]
  }

重みは float32 のバイト列を base64 にして入れる（**Python 側と 1bit も違わない**ので、
TypeScript 版と Python 版の一致テストが厳密にできる。JSON の数値だと丸めで差が出る）。
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

import _lab


def b64(arr) -> str:
    import numpy as np

    return base64.b64encode(np.ascontiguousarray(arr, dtype=np.float32).tobytes()).decode("ascii")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("agent", nargs="?", default=None)
    p.add_argument("--out-dir", default=str(_lab.SITE_ROOT / "public" / "ai"))
    a = p.parse_args()

    from rl.tetris.encoding import FEATURE_DIMS
    from rl.tetris.model import load_checkpoint

    agent_id = _lab.resolve_agent_id(a.agent)
    path = _lab.checkpoint_path(agent_id)
    model, meta = load_checkpoint(path, "cpu")
    version = meta["feature_version"]
    cfg = meta.get("config", {})

    layers = []
    for mod in model.net:
        w = getattr(mod, "weight", None)
        if w is None:  # ReLU
            continue
        layers.append(
            {
                "in": int(w.shape[1]),
                "out": int(w.shape[0]),
                "w": b64(w.detach().numpy()),  # 形は [out, in]（PyTorch の Linear と同じ）
                "b": b64(mod.bias.detach().numpy()),
            }
        )

    data = {
        "agent": agent_id,
        "featureVersion": version,
        "featureDim": FEATURE_DIMS[version],
        "hidden": int(model.hidden),
        "episode": meta.get("episode"),
        "gamma": float(cfg.get("gamma", 0.97)),
        "reward": {
            "alive": 0.1, "line": 0.2, "attack": 1.0, "death": -5.0, "win": 0.0,
            **{k: float(v) for k, v in (cfg.get("reward") or {}).items()},
        },
        "layers": layers,
    }

    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / (agent_id.replace(":", "-") + ".json")
    out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    size = out.stat().st_size / 1024
    print(f"{agent_id}: 特徴量バージョン {version}（{data['featureDim']} 次元）"
          f" 層 {[(l['in'], l['out']) for l in layers]}")
    print(f"書き出し: {out}（{size:.0f} KB）")


if __name__ == "__main__":
    main()
