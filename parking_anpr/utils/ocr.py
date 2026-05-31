"""
utils/ocr.py — OCR module for Indian number plates.

Debug mode: set DEBUG_OCR = True to print every raw read, what
fix_characters() produces, and exactly why validate_plate() rejects it.
This tells you instantly whether the problem is OCR or validation.
"""

import re
import warnings
from typing import Optional, Union

import numpy as np

# ── Set True to see exactly what OCR reads and why plates are rejected ──────
DEBUG_OCR = True

# Set True to skip PaddleOCR and always use EasyOCR
FORCE_EASYOCR = False

# ---------------------------------------------------------------------------
# State code lookup
# ---------------------------------------------------------------------------

VALID_STATES = {
    "AN", "AP", "AR", "AS", "BR", "CH", "CG", "DD",
    "DL", "DN", "GA", "GJ", "HR", "HP", "JK", "JH",
    "KA", "KL", "LA", "LD", "MP", "MH", "MN", "ML",
    "MZ", "NL", "OD", "PY", "PB", "RJ", "SK", "TN",
    "TS", "TR", "UP", "UK", "WB",
}

STANDARD_PATTERN = re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{1,4}$")
BH_PATTERN       = re.compile(r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$")

_L2D = {"O": "0", "I": "1", "l": "1", "B": "8", "S": "5", "Z": "2", "G": "6"}
_D2L = {"0": "O", "1": "I", "8": "B", "5": "S", "2": "Z", "6": "G"}


# ---------------------------------------------------------------------------
# Character correction
# ---------------------------------------------------------------------------

def normalise_raw(raw: str) -> str:
    return raw.upper().replace(" ", "").replace("-", "").replace(".", "").replace("/", "")


def _fix_standard(chars: list) -> list:
    n = len(chars)
    if n < 8:
        return chars
    fixed = list(chars)
    for i in (0, 1):
        if fixed[i] in _D2L:
            fixed[i] = _D2L[fixed[i]]
    for i in (2, 3):
        if fixed[i] in _L2D:
            fixed[i] = _L2D[fixed[i]]
    for i in range(n - 4, n):
        if fixed[i] in _L2D:
            fixed[i] = _L2D[fixed[i]]
    for i in range(4, n - 4):
        if fixed[i] in _D2L:
            fixed[i] = _D2L[fixed[i]]
    return fixed


def fix_characters(raw: str) -> str:
    return "".join(_fix_standard(list(raw)))


# ---------------------------------------------------------------------------
# Plate validation  — with detailed rejection reasons when DEBUG_OCR=True
# ---------------------------------------------------------------------------

def validate_plate(raw: str) -> Optional[str]:
    """
    Returns the validated plate string or None.
    When DEBUG_OCR=True, prints the exact reason for every rejection
    so you can see whether OCR is reading correctly but validation blocks it.
    """
    if len(raw) < 6:
        if DEBUG_OCR:
            print(f"    [validate] REJECT '{raw}' — too short ({len(raw)} chars, need ≥6)")
        return None

    # BH series check
    for candidate in (raw, fix_characters(raw)):
        if BH_PATTERN.match(candidate):
            if DEBUG_OCR:
                print(f"    [validate] ACCEPT '{candidate}' — BH series")
            return candidate

    candidate = fix_characters(raw)

    if DEBUG_OCR and candidate != raw:
        print(f"    [validate] fix_characters: '{raw}' → '{candidate}'")

    # State code check
    state = candidate[:2]
    if state not in VALID_STATES:
        if DEBUG_OCR:
            print(f"    [validate] REJECT '{candidate}' — state code '{state}' not in VALID_STATES")
            # Suggest the closest valid state in case it's a minor OCR error
            close = [s for s in VALID_STATES if s[0] == state[0] or s[1] == state[1]]
            if close:
                print(f"    [validate]   → similar valid states: {sorted(close)}")
        return None

    # Standard pattern check
    if STANDARD_PATTERN.match(candidate):
        if DEBUG_OCR:
            print(f"    [validate] ACCEPT '{candidate}' — standard pattern")
        return candidate

    # Lenient fallback
    if len(candidate) in (8, 9, 10) and candidate[:2] in VALID_STATES:
        if DEBUG_OCR:
            print(f"    [validate] ACCEPT '{candidate}' — lenient fallback (state ok, len={len(candidate)})")
        return candidate

    # Rejected — print detailed reason
    if DEBUG_OCR:
        print(f"    [validate] REJECT '{candidate}' — failed all checks")
        print(f"    [validate]   length={len(candidate)}  state='{state}'  "
              f"pattern_match={bool(STANDARD_PATTERN.match(candidate))}")
        # Character-by-character breakdown so you can see where OCR went wrong
        pos_types = []
        for i, ch in enumerate(candidate):
            if i < 2:
                pos_types.append(f"[{i}]='{ch}'(letter?{'yes' if ch.isalpha() else 'NO'})")
            elif i < 4:
                pos_types.append(f"[{i}]='{ch}'(digit?{'yes' if ch.isdigit() else 'NO'})")
            else:
                pos_types.append(f"[{i}]='{ch}'")
        print(f"    [validate]   chars: {' '.join(pos_types)}")

    return None


# ---------------------------------------------------------------------------
# EasyOCR singleton
# ---------------------------------------------------------------------------

_easy_reader = None
_easy_gpu    = None


def _get_easyocr(gpu: bool = False):
    global _easy_reader, _easy_gpu
    if _easy_reader is not None and _easy_gpu == gpu:
        return _easy_reader
    actual_gpu = gpu
    if gpu:
        try:
            import torch
            if not torch.cuda.is_available():
                actual_gpu = False
        except ImportError:
            actual_gpu = False
    import easyocr
    print(f"  [OCR] Loading EasyOCR (gpu={actual_gpu})…")
    _easy_reader = easyocr.Reader(["en"], gpu=actual_gpu)
    _easy_gpu    = actual_gpu
    print("  [OCR] EasyOCR ready.")
    return _easy_reader


def _easy_read(img: np.ndarray, gpu: bool, min_conf: float):
    try:
        reader  = _get_easyocr(gpu)
        results = reader.readtext(img, detail=1, paragraph=False)
        results = [r for r in results if r[2] >= min_conf]
        if not results:
            if DEBUG_OCR:
                print(f"    [easyocr] No text found above min_conf={min_conf}")
            return None, 0.0
        results  = sorted(results, key=lambda r: r[0][0][1])
        raw      = normalise_raw("".join(r[1] for r in results))
        avg_conf = sum(r[2] for r in results) / len(results)
        if DEBUG_OCR:
            per_word = [(r[1], f"{r[2]:.2f}") for r in results]
            print(f"    [easyocr] raw='{raw}'  conf={avg_conf:.2f}  words={per_word}")
        if len(raw) < 6:
            if DEBUG_OCR:
                print(f"    [easyocr] SKIP '{raw}' — too short after merge")
            return None, 0.0
        plate = validate_plate(raw)
        return (plate, avg_conf) if plate else (None, 0.0)
    except Exception as e:
        print(f"    [easyocr] ERROR: {e}")
        return None, 0.0


# ---------------------------------------------------------------------------
# PaddleOCR singleton  (optional fast engine)
# ---------------------------------------------------------------------------

_paddle_reader    = None
_paddle_available = None


def _get_paddle():
    global _paddle_reader, _paddle_available
    if _paddle_available is False or FORCE_EASYOCR:
        return None
    if _paddle_reader is not None:
        return _paddle_reader
    try:
        from paddleocr import PaddleOCR
        print("  [OCR] Loading PaddleOCR…")
        _paddle_reader = PaddleOCR(use_angle_cls=True, lang="en",
                                   show_log=False, use_gpu=False)
        _paddle_available = True
        print("  [OCR] PaddleOCR ready.")
    except Exception as e:
        _paddle_available = False
        warnings.warn(
            f"[OCR] PaddleOCR not available ({e}). Using EasyOCR.",
            RuntimeWarning, stacklevel=3,
        )
    return _paddle_reader


def _paddle_read(img: np.ndarray, min_conf: float):
    reader = _get_paddle()
    if reader is None:
        return None, 0.0
    try:
        result = reader.ocr(img, cls=True)
        if not result or not result[0]:
            if DEBUG_OCR:
                print(f"    [paddle] No text found")
            return None, 0.0
        lines    = sorted(result[0], key=lambda x: x[0][0][1])
        texts    = [l[1][0] for l in lines if l[1][1] >= min_conf]
        confs    = [l[1][1] for l in lines if l[1][1] >= min_conf]
        if not texts:
            return None, 0.0
        raw      = normalise_raw("".join(texts))
        avg_conf = sum(confs) / len(confs)
        if DEBUG_OCR:
            per_word = list(zip(texts, [f"{c:.2f}" for c in confs]))
            print(f"    [paddle] raw='{raw}'  conf={avg_conf:.2f}  words={per_word}")
        if len(raw) < 6:
            return None, 0.0
        plate = validate_plate(raw)
        return (plate, avg_conf) if plate else (None, 0.0)
    except Exception as e:
        print(f"    [paddle] ERROR: {e}")
        return None, 0.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class PlateReader:
    def __init__(self, gpu: bool = False):
        self._gpu = gpu
        _get_paddle()   # warm up

    def read(
        self,
        crop_or_variants: Union[np.ndarray, dict],
        min_conf: float = 0.15,
        detail: bool = False,
    ) -> Optional[str]:
        if isinstance(crop_or_variants, np.ndarray):
            images = [("direct", crop_or_variants)]
        elif isinstance(crop_or_variants, dict):
            images = list(crop_or_variants.items())
        else:
            return (None, 0.0) if detail else None

        if DEBUG_OCR:
            n = len(images)
            print(f"  [OCR] Trying {n} variant(s)…")

        # Pass 1 — PaddleOCR
        for name, img in images:
            if DEBUG_OCR:
                print(f"  [OCR] variant='{name}' engine=paddle")
            plate, conf = _paddle_read(img, min_conf)
            if plate:
                if DEBUG_OCR:
                    print(f"  [OCR] ✓ ACCEPTED '{plate}' (conf={conf:.2f}, engine=paddle, variant={name})")
                return (plate, conf) if detail else plate

        # Pass 2 — EasyOCR fallback
        for name, img in images:
            if DEBUG_OCR:
                print(f"  [OCR] variant='{name}' engine=easyocr")
            plate, conf = _easy_read(img, self._gpu, min_conf)
            if plate:
                if DEBUG_OCR:
                    print(f"  [OCR] ✓ ACCEPTED '{plate}' (conf={conf:.2f}, engine=easyocr, variant={name})")
                return (plate, conf) if detail else plate

        if DEBUG_OCR:
            print(f"  [OCR] ✗ No valid plate found across all variants")
        return (None, 0.0) if detail else None


def read_plate(crop_or_variants, gpu: bool = False, min_conf: float = 0.15) -> Optional[str]:
    return PlateReader(gpu=gpu).read(crop_or_variants, min_conf=min_conf)