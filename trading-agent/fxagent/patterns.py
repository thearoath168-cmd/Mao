"""Candlestick pattern recognition.

Each detector returns a Series of +1 (bullish), -1 (bearish) or 0.
"""
from __future__ import annotations

import pandas as pd


def _parts(df: pd.DataFrame):
    o, h, l, c = df["open"], df["high"], df["low"], df["close"]
    body = (c - o).abs()
    rng = (h - l).replace(0, float("nan"))
    upper = h - pd.concat([o, c], axis=1).max(axis=1)
    lower = pd.concat([o, c], axis=1).min(axis=1) - l
    return o, h, l, c, body, rng, upper, lower


def engulfing(df: pd.DataFrame) -> pd.Series:
    o, h, l, c, body, *_ = _parts(df)
    po, pc = o.shift(), c.shift()
    bull = (pc < po) & (c > o) & (c >= po) & (o <= pc) & (body > (pc - po).abs())
    bear = (pc > po) & (c < o) & (c <= po) & (o >= pc) & (body > (pc - po).abs())
    return bull.astype(int) - bear.astype(int)


def hammer_star(df: pd.DataFrame) -> pd.Series:
    """Hammer (+1, long lower wick) and shooting star (-1, long upper wick).

    Direction is only meaningful in context (after a decline / rally), which
    the analysis layer checks.
    """
    o, h, l, c, body, rng, upper, lower = _parts(df)
    small = body <= 0.35 * rng
    hammer = small & (lower >= 2 * body) & (upper <= 0.25 * rng)
    star = small & (upper >= 2 * body) & (lower <= 0.25 * rng)
    return hammer.astype(int) - star.astype(int)


def morning_evening_star(df: pd.DataFrame) -> pd.Series:
    o, h, l, c, body, rng, *_ = _parts(df)
    o2, c2, b2 = o.shift(2), c.shift(2), body.shift(2)
    b1 = body.shift(1)
    mid2 = (o2 + c2) / 2
    morning = (c2 < o2) & (b1 < 0.5 * b2) & (c > o) & (c > mid2)
    evening = (c2 > o2) & (b1 < 0.5 * b2) & (c < o) & (c < mid2)
    return morning.astype(int) - evening.astype(int)


def doji(df: pd.DataFrame) -> pd.Series:
    """1 where the candle is a doji (indecision), else 0. Not directional."""
    *_, body, rng, _u, _l = _parts(df)
    return (body <= 0.1 * rng).astype(int)


NAMES = {
    "engulfing": ("Bullish Engulfing", "Bearish Engulfing"),
    "hammer_star": ("Hammer", "Shooting Star"),
    "star3": ("Morning Star", "Evening Star"),
}


def detect(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "engulfing": engulfing(df),
            "hammer_star": hammer_star(df),
            "star3": morning_evening_star(df),
            "doji": doji(df),
        },
        index=df.index,
    )


def describe(row: pd.Series) -> list[tuple[str, int]]:
    """List of (pattern name, direction) present on a row from detect()."""
    found = []
    for col, (bull, bear) in NAMES.items():
        v = row.get(col, 0)
        if v > 0:
            found.append((bull, 1))
        elif v < 0:
            found.append((bear, -1))
    if row.get("doji", 0):
        found.append(("Doji", 0))
    return found
