"""
config.py — Central configuration for the Parking ANPR system.

Import anywhere with:
    from config import cfg
"""

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ModelConfig:
    best_weights: Path = Path("models/best.pt")
    img_size: int = 640
    conf_thresh: float = 0.50
    iou_thresh: float = 0.45
    whole_image_fraction: float = 0.70


@dataclass
class OCRConfig:
    gpu: bool = False            # Set False if no NVIDIA GPU — avoids slow auto-fallback
    languages: list = field(default_factory=lambda: ["en"])
    min_conf: float = 0.15

    # ── Speed vs accuracy trade-off ───────────────────────────────────────
    # fast_mode=True  → only 2 preprocessing variants tried (gray + sharp).
    #                   ~3-5× faster; works on clean, well-lit plates.
    # fast_mode=False → all 7 variants tried (stops on first hit).
    #                   Slower but handles poor lighting, worn plates, angles.
    fast_mode: bool = True


@dataclass
class VideoConfig:
    nth_frame: int = 3            # Process every Nth frame (raise to 3-4 to reduce CPU)
    motion_thresh: float = 12.0
    cooldown_frames: int = 20
    confirm_frames: int = 2       # Tracker frames before emitting event
    max_lost: int = 15
    async_db: bool = False


@dataclass
class CameraConfig:
    entry_camera: object = 0
    exit_camera: object = 1

    entry_label: str = "GATE_ENTRY"
    exit_label: str = "GATE_EXIT"

    width: int = 1280
    height: int = 720


@dataclass
class ParkingConfig:
    total_slots: int = 100
    zone: str = "A"


@dataclass
class StorageConfig:
    bucket_url: str = ""
    save_local_snapshots: bool = True
    snapshot_dir: Path = Path("outputs/snapshots")


@dataclass
class Config:
    model:   ModelConfig   = field(default_factory=ModelConfig)
    ocr:     OCRConfig     = field(default_factory=OCRConfig)
    video:   VideoConfig   = field(default_factory=VideoConfig)
    camera:  CameraConfig  = field(default_factory=CameraConfig)
    parking: ParkingConfig = field(default_factory=ParkingConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)


cfg = Config()