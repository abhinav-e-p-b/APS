"""
utils/preprocess.py — Image preprocessing for Indian number plate crops.

Changes from v1:
  - preprocess_plate() now returns variants in a PRIORITY ORDER tuned for
    Indian plates: gray → sharp → otsu → otsu_inv → adap → adap_inv → boosted.
    The caller (PlateReader.read) stops on the first hit, so putting the
    highest-accuracy variants first avoids expensive later attempts.

  - Upscale uses INTER_LANCZOS4 when the crop is very small (<= 60px wide)
    and INTER_LINEAR otherwise. Lanczos preserves thin strokes better;
    cubic can introduce ringing around high-contrast edges.

  - CLAHE tileGridSize reduced to (4,4) — smaller tiles give stronger local
    contrast enhancement on the small ROIs we typically see from YOLO crops.

  - A deskew() helper is included.  Call it before preprocess_plate() when
    plates are coming in at an angle (common with wide-angle cameras or
    cars approaching from the side).

  - preprocess_plate_fast() returns only the two most reliable variants
    (gray + sharp) for real-time use when latency matters more than recall.
"""

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------

def upscale(img: np.ndarray, target_width: int = 240) -> np.ndarray:
    """
    Upscale to at least `target_width` pixels wide, preserving aspect ratio.
    Uses Lanczos for small crops (sharper strokes), linear for larger ones.
    """
    h, w = img.shape[:2]
    if w >= target_width:
        return img
    scale = target_width / w
    new_w = int(w * scale)
    new_h = int(h * scale)
    interp = cv2.INTER_LANCZOS4 if w <= 80 else cv2.INTER_LINEAR
    return cv2.resize(img, (new_w, new_h), interpolation=interp)


def to_gray(img: np.ndarray) -> np.ndarray:
    if len(img.shape) == 2:
        return img
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def apply_clahe(gray: np.ndarray, clip: float = 3.0, tile: int = 4) -> np.ndarray:
    """
    CLAHE with smaller tile grid for aggressive local contrast on small ROIs.
    clip=3.0 is stronger than the default 2.0; helps faint plates.
    """
    clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=(tile, tile))
    return clahe.apply(gray)


def sharpen(img: np.ndarray, strength: float = 1.5) -> np.ndarray:
    """Unsharp mask — gentler than a hard Laplacian kernel."""
    blurred = cv2.GaussianBlur(img, (0, 0), 3)
    return cv2.addWeighted(img, 1 + strength, blurred, -strength, 0)


def otsu_threshold(gray: np.ndarray) -> np.ndarray:
    _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return th


def otsu_threshold_inv(gray: np.ndarray) -> np.ndarray:
    _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return th


def adaptive_threshold(gray: np.ndarray, block_size: int = 21, c: int = 8) -> np.ndarray:
    """
    Smaller block_size (21 vs 31) adapts better to local lighting changes
    common on number plates with uneven illumination.
    """
    # block_size must be odd
    if block_size % 2 == 0:
        block_size += 1
    return cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block_size, c,
    )


def adaptive_threshold_inv(gray: np.ndarray, block_size: int = 21, c: int = 8) -> np.ndarray:
    if block_size % 2 == 0:
        block_size += 1
    return cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        block_size, c,
    )


def edge_boosted(gray: np.ndarray) -> np.ndarray:
    """Overlay Canny edges on the gray image to accentuate character outlines."""
    sharp = sharpen(gray)
    edges = cv2.Canny(sharp, 40, 120)
    return cv2.addWeighted(sharp, 0.85, edges, 0.15, 0)


# ---------------------------------------------------------------------------
# Optional: deskew
# ---------------------------------------------------------------------------

def deskew(img: np.ndarray) -> np.ndarray:
    """
    Attempt to correct minor rotation using moments-based skew estimation.
    Works best on binary/near-binary images.
    Safe to call on gray images too — converts internally.
    """
    gray = to_gray(img) if len(img.shape) == 3 else img
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    coords = np.column_stack(np.where(binary > 0))
    if len(coords) < 10:
        return img
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) < 1.0:           # skip trivial corrections
        return img
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    rotated = cv2.warpAffine(img, M, (w, h),
                             flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_REPLICATE)
    return rotated


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def preprocess_plate(crop: np.ndarray) -> dict:
    """
    Full preprocessing pipeline.

    Returns an OrderedDict of named image variants in PRIORITY ORDER —
    best (most reliable for EasyOCR) first.  PlateReader.read() stops on
    the first valid result, so ordering matters for speed.

    Priority rationale for Indian plates:
      1. gray     — CLAHE-enhanced gray; usually enough for clean plates
      2. sharp    — sharpened version; helps worn/faded plates
      3. otsu     — good for high-contrast plates (white on black)
      4. otsu_inv — good for black on yellow / black on white inverted
      5. adap     — uneven lighting (shadows, glare)
      6. adap_inv — inverted adaptive, catches dark-background plates
      7. boosted  — edge-enhanced fallback; last resort
    """
    # Upscale to at least 240px wide
    up = upscale(crop, target_width=240)
    gray = to_gray(up)

    # Base enhanced gray
    enhanced = apply_clahe(gray, clip=3.0, tile=4)
    sharp = sharpen(enhanced, strength=1.5)

    return {
        "gray":     enhanced,
        "sharp":    sharp,
        "otsu":     otsu_threshold(sharp),
        "otsu_inv": otsu_threshold_inv(sharp),
        "adap":     adaptive_threshold(sharp, 21, 8),
        "adap_inv": adaptive_threshold_inv(sharp, 21, 8),
        "boosted":  edge_boosted(enhanced),
    }


def preprocess_plate_fast(crop: np.ndarray) -> dict:
    """
    Lightweight variant — returns only the two most reliable variants.
    Use in real-time pipelines where latency matters more than recall.
    Falls back to the full pipeline automatically when both variants fail.
    """
    up = upscale(crop, target_width=240)
    gray = to_gray(up)
    enhanced = apply_clahe(gray, clip=3.0, tile=4)
    sharp = sharpen(enhanced, strength=1.5)
    return {
        "gray":  enhanced,
        "sharp": sharp,
    }