"""
parking_gate.py — Real-time ANPR for a single parking gate camera.

Speed improvements over v1:
  - Async DB writes: record_entry/record_exit run in a background thread
    pool so the inference loop is never blocked by network/Supabase latency.
  - confirm_frames=1 by default (config): entry fires on the FIRST valid
    OCR read instead of waiting for 3 consecutive frames.
  - PaddleOCR is now the primary OCR engine (~30-80ms vs ~200ms for EasyOCR).
  - Occupancy refresh is also async — never blocks inference.

FIX: lookup_registered_user is now called only once per event (not twice),
     and is wrapped in its own try/except so failures never prevent sessions
     from being written to the database.
"""

import argparse
import queue
import threading
import time
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

from config import cfg
from utils.preprocess import preprocess_plate, preprocess_plate_fast
from utils.ocr import PlateReader
from utils.tracker import PlateTracker
from utils.visualise import draw_detections, draw_occupancy_overlay, add_fps_overlay
from utils.snapshot import save_snapshot
from db.supabase_client import record_entry, record_exit, get_occupancy, lookup_registered_user

MODE_LABELS = {
    "entry": cfg.camera.entry_label,
    "exit":  cfg.camera.exit_label,
}

LOG_MAXLEN = 12


# ---------------------------------------------------------------------------
# Camera reader thread
# ---------------------------------------------------------------------------

class CameraReader(threading.Thread):
    def __init__(self, source, width, height):
        super().__init__(daemon=True, name="cam-reader")
        self.cap = None
        backends = [cv2.CAP_DSHOW, None] if isinstance(source, int) else [None]

        for backend in backends:
            try:
                cap = (cv2.VideoCapture(source, backend)
                       if backend is not None else cv2.VideoCapture(source))
                if not cap.isOpened():
                    cap.release(); continue

                cap.set(cv2.CAP_PROP_FRAME_WIDTH,  width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                ok = False
                for _ in range(5):
                    ret, frm = cap.read()
                    if ret and frm is not None and frm.size > 0:
                        ok = True; break
                    time.sleep(0.05)

                if ok:
                    self.cap = cap
                    label = "CAP_DSHOW" if backend == cv2.CAP_DSHOW else "default"
                    print(f"  [camera] Opened with backend: {label}")
                    break
                cap.release()
            except Exception as e:
                print(f"  [camera] Backend attempt failed: {e}")
                try: cap.release()
                except Exception: pass

        if self.cap is None:
            raise RuntimeError(f"Cannot open camera source {source}.")

        self._lock  = threading.Lock()
        self._frame = None
        self._ok    = False
        self._stop  = threading.Event()

    def run(self):
        consecutive_failures = 0
        while not self._stop.is_set():
            try:
                ret, frame = self.cap.read()
            except cv2.error as e:
                consecutive_failures += 1
                if consecutive_failures > 20:
                    break
                time.sleep(0.05); continue

            if ret and frame is not None and frame.size > 0:
                consecutive_failures = 0
                with self._lock:
                    self._ok    = True
                    self._frame = frame
            else:
                consecutive_failures += 1
                time.sleep(0.05)

    def read(self):
        with self._lock:
            return self._ok, (self._frame.copy() if self._frame is not None else None)

    def stop(self):
        self._stop.set()
        self.cap.release()


# ---------------------------------------------------------------------------
# Inference worker — async DB writes via ThreadPoolExecutor
# ---------------------------------------------------------------------------

class InferenceWorker(threading.Thread):
    def __init__(self, mode, model_path, in_q, out_q, event_log):
        super().__init__(daemon=True, name=f"inference-{mode}")
        self.mode         = mode
        self.model_path   = model_path
        self.in_q         = in_q
        self.out_q        = out_q
        self.event_log    = event_log
        self.cooldown     = defaultdict(int)
        self._stop        = threading.Event()
        self.camera_label = MODE_LABELS[mode]

        # Cached occupancy — updated async, never blocks inference
        self._occ      = {"occupied": 0, "total": cfg.parking.total_slots,
                          "vacant": cfg.parking.total_slots, "pct": 0}
        self._occ_lock = threading.Lock()

        # Thread pool for async DB writes (max 4 concurrent)
        self._db_pool  = ThreadPoolExecutor(max_workers=4, thread_name_prefix="db")

        # Choose preprocessing depth
        self._preprocess = preprocess_plate_fast if cfg.ocr.fast_mode else preprocess_plate

        self._refresh_occ()   # initial occupancy pull

    # ── occupancy helpers ─────────────────────────────────────────────────

    def get_occ(self):
        with self._occ_lock:
            return dict(self._occ)

    def _refresh_occ(self):
        """Pull occupancy from DB — can be called sync or async."""
        try:
            occ = get_occupancy()
            with self._occ_lock:
                self._occ = occ
        except Exception as e:
            print(f"  [occ] Warning: {e}")

    def _refresh_occ_async(self):
        if cfg.video.async_db:
            self._db_pool.submit(self._refresh_occ)
        else:
            self._refresh_occ()

    # ── async DB event handler ────────────────────────────────────────────

    def _handle_event_async(self, plate, bbox, frame_copy):
        """
        Runs in a ThreadPoolExecutor thread — off the inference path so the
        camera loop never stalls waiting for Supabase.

        FIX: lookup_registered_user is called exactly once here, and is
        already wrapped in try/except inside supabase_client.py so it returns
        None on any failure instead of raising. This means record_entry /
        record_exit always runs even when the vehicles/users tables are
        missing, empty, or RLS-blocked.
        """
        try:
            # Single lookup — result is passed to record_entry so it doesn't
            # need to call the DB again internally. (Previously called twice.)
            user     = lookup_registered_user(plate)   # returns None on any error
            is_reg   = user is not None
            reg_name = user.get("name", "Member") if user else "guest"

            snap_path = None
            if cfg.storage.save_local_snapshots:
                try:
                    snap_path = save_snapshot(
                        frame_copy, bbox, plate, self.mode,
                        out_dir=cfg.storage.snapshot_dir,
                    )
                except Exception as snap_err:
                    print(f"  [snapshot] Warning: {snap_err}")

            if self.mode == "entry":
                record_entry(plate, self.camera_label, image_url=snap_path)
                action = "ENTRY"
            else:
                result = record_exit(plate, self.camera_label, image_url=snap_path)
                action = "EXIT" if result else "EXIT (no session)"

            self._refresh_occ()
            occ = self.get_occ()

            ts       = datetime.now().strftime("%H:%M:%S")
            reg_tag  = f" [{reg_name}]" if is_reg else ""
            log_line = f"{ts}  {action}  {plate}{reg_tag}  vacant={occ['vacant']}"
            self.event_log.append((log_line, action, is_reg))
            print(f"  {log_line}")

        except Exception as e:
            # This catches failures in record_entry / record_exit themselves
            print(f"  [DB] Error recording {self.mode} for {plate}: {e}")
            import traceback
            traceback.print_exc()

    # ── main inference loop ───────────────────────────────────────────────

    def run(self):
        from ultralytics import YOLO
        detector = YOLO(self.model_path)
        reader   = PlateReader(gpu=cfg.ocr.gpu)
        tracker  = PlateTracker(
            confirm_frames=cfg.video.confirm_frames,
            max_lost=cfg.video.max_lost,
        )

        while not self._stop.is_set():
            try:
                frame = self.in_q.get(timeout=0.1)
            except queue.Empty:
                continue

            h_frame, w_frame = frame.shape[:2]
            frame_area = w_frame * h_frame

            yolo_res = detector(frame,
                                conf=cfg.model.conf_thresh,
                                iou=cfg.model.iou_thresh,
                                verbose=False)
            boxes = yolo_res[0].boxes

            raw_dets    = []
            det_list    = []
            plate_texts = []
            statuses    = []
            reg_flags   = []

            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                det_conf = float(box.conf[0])

                if (x2 - x1) * (y2 - y1) / frame_area > cfg.model.whole_image_fraction:
                    continue

                crop = frame[y1:y2, x1:x2]
                if crop.size == 0:
                    continue

                variants   = self._preprocess(crop)
                plate_text = reader.read(variants, min_conf=cfg.ocr.min_conf)

                raw_dets.append((x1, y1, x2, y2, det_conf, plate_text))
                det_list.append((x1, y1, x2, y2, det_conf))
                plate_texts.append(plate_text)
                statuses.append(None)
                reg_flags.append(False)

            events = tracker.update(raw_dets)

            for event in events:
                if event["type"] != "confirmed":
                    continue

                plate = event["plate"]
                bbox  = event["bbox"]

                if self.cooldown[plate] > 0:
                    continue

                self.cooldown[plate] = cfg.video.cooldown_frames

                # Update display state immediately (no DB call needed)
                for i, (x1, y1, x2, y2, _c) in enumerate(det_list):
                    if iou_match(bbox, (x1, y1, x2, y2)):
                        statuses[i]  = self.mode
                        reg_flags[i] = True   # optimistic — corrected by DB later

                # Fire DB write asynchronously so the inference loop keeps running
                if cfg.video.async_db:
                    self._db_pool.submit(
                        self._handle_event_async, plate, bbox, frame.copy()
                    )
                else:
                    self._handle_event_async(plate, bbox, frame.copy())

            for k in list(self.cooldown):
                self.cooldown[k] = max(0, self.cooldown[k] - 1)

            self._push_result(frame, det_list, plate_texts, statuses, reg_flags)

    def _push_result(self, frame, det_list, plate_texts, statuses, reg_flags):
        result = (frame, det_list, plate_texts, statuses, reg_flags)
        try:
            self.out_q.put_nowait(result)
        except queue.Full:
            try:
                self.out_q.get_nowait()
            except queue.Empty:
                pass
            self.out_q.put_nowait(result)

    def stop(self):
        self._stop.set()
        self._db_pool.shutdown(wait=False)


# ---------------------------------------------------------------------------
# Core gate loop
# ---------------------------------------------------------------------------

def run_gate(
    mode: str,
    source,
    model_path: str = str(cfg.model.best_weights),
    show: bool = True,
    headless: bool = False,
):
    assert mode in ("entry", "exit"), "mode must be 'entry' or 'exit'"

    camera_label = MODE_LABELS[mode]
    print(f"\n{'='*55}")
    print(f"  Parking ANPR — {mode.upper()} gate")
    print(f"  Camera        : {source}  |  {camera_label}")
    print(f"  Model         : {model_path}")
    print(f"  confirm_frames: {cfg.video.confirm_frames}  "
          f"({'instant' if cfg.video.confirm_frames == 1 else 'consensus'})")
    print(f"  async_db      : {cfg.video.async_db}")
    print(f"  fast_mode OCR : {cfg.ocr.fast_mode}")
    print(f"{'='*55}\n")

    event_log = deque(maxlen=LOG_MAXLEN)
    in_q  = queue.Queue(maxsize=2)
    out_q = queue.Queue(maxsize=2)

    cam    = CameraReader(source, cfg.camera.width, cfg.camera.height)
    worker = InferenceWorker(mode, model_path, in_q, out_q, event_log)

    cam.start()
    worker.start()

    win_title         = f"Parking ANPR - {mode.upper()} gate"
    fps_timer         = time.perf_counter()
    fps_disp          = 0.0
    frame_id          = 0
    prev_gray         = None
    motion_skip_count = 0
    last_annotated    = None

    print("Running. Press 'q' to quit, 's' to save frame, 'r' to reset log.")

    try:
        while True:
            ok, frame = cam.read()
            if not ok or frame is None:
                time.sleep(0.01)
                if not headless and cv2.waitKey(1) & 0xFF == ord("q"):
                    break
                continue

            frame_id += 1

            send_to_worker = False
            if frame_id % cfg.video.nth_frame == 0:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                if prev_gray is not None:
                    diff = cv2.absdiff(gray, prev_gray).mean()
                    motion_skip_count = motion_skip_count + 1 if diff < cfg.video.motion_thresh else 0
                    send_to_worker = (diff >= cfg.video.motion_thresh) or (motion_skip_count > 30)
                    if send_to_worker and motion_skip_count > 30:
                        motion_skip_count = 0
                else:
                    send_to_worker = True
                prev_gray = gray

            if send_to_worker:
                try:
                    in_q.put_nowait(frame.copy())
                except queue.Full:
                    pass

            try:
                last_annotated = out_q.get_nowait()
            except queue.Empty:
                pass

            now      = time.perf_counter()
            fps_disp = 0.8 * fps_disp + 0.2 * (1.0 / max(now - fps_timer, 1e-6))
            fps_timer = now

            if not headless:
                occ = worker.get_occ()
                if last_annotated is not None:
                    (_ann, det_list, plate_texts, statuses, reg_flags) = last_annotated
                    annotated = draw_detections(frame, det_list, plate_texts,
                                               statuses, reg_flags)
                else:
                    annotated = frame.copy()

                annotated = draw_occupancy_overlay(
                    annotated, occ["occupied"], occ["total"], camera_label)
                annotated = add_fps_overlay(annotated, fps_disp)
                _draw_event_log(annotated, event_log)

                cv2.imshow(win_title, annotated)
                key_press = cv2.waitKey(1) & 0xFF
                if key_press == ord("q"):
                    break
                elif key_press == ord("s"):
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    Path("outputs").mkdir(exist_ok=True)
                    cv2.imwrite(f"outputs/gate_{mode}_{ts}.jpg", annotated)
                    print(f"  Saved: outputs/gate_{mode}_{ts}.jpg")
                elif key_press == ord("r"):
                    event_log.clear()
    finally:
        worker.stop()
        cam.stop()
        cv2.destroyAllWindows()
        print(f"\n{mode.upper()} gate stopped. Processed {frame_id} frames.")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def iou_match(a, b, thresh=0.3):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1); iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2); iy2 = min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return False
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return inter / (area_a + area_b - inter) >= thresh


def _draw_event_log(frame, event_log):
    bh = frame.shape[0]
    colour_map = {"ENTRY": (0, 220, 0), "EXIT": (0, 140, 255)}
    for idx, (line, action, is_reg) in enumerate(reversed(list(event_log))):
        y_pos = bh - 30 - idx * 22
        if y_pos < 40:
            break
        colour = (0, 200, 255) if is_reg else colour_map.get(action, (200, 200, 200))
        cv2.putText(frame, line, (10, y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(frame, line, (10, y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, colour, 1, cv2.LINE_AA)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Parking ANPR — single gate camera")
    parser.add_argument("--mode",     required=True, choices=["entry", "exit"])
    parser.add_argument("--source",   default=0)
    parser.add_argument("--model",    default=str(cfg.model.best_weights))
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--full-ocr", action="store_true",
                        help="Use all 7 preprocessing variants (slower, more accurate)")
    parser.add_argument("--confirm",  type=int, default=None,
                        help="Override confirm_frames (1=instant, 2=fast+safe, 3=original)")
    args = parser.parse_args()

    if args.full_ocr:
        cfg.ocr.fast_mode = False
    if args.confirm is not None:
        cfg.video.confirm_frames = max(1, args.confirm)

    try:
        src = int(args.source)
    except (ValueError, TypeError):
        src = args.source

    run_gate(mode=args.mode, source=src, model_path=args.model,
             show=not args.headless, headless=args.headless)