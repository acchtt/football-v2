import hashlib
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from app.vision.base import ImagePayload

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _matches_signature(content_type: str, content: bytes) -> bool:
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/webp":
        return len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    return False


@dataclass(frozen=True, slots=True)
class SavedUpload:
    storage_path: str
    original_filename: str
    content_type: str
    sha256: str


class LocalUploadStorage:
    def __init__(self, root: str, max_bytes: int, max_files: int) -> None:
        self.root = Path(root)
        self.max_bytes = max_bytes
        self.max_files = max_files

    def validate(self, images: tuple[ImagePayload, ...]) -> None:
        if not images:
            raise ValueError("At least one screenshot is required")
        if len(images) > self.max_files:
            raise ValueError(f"A maximum of {self.max_files} screenshots is allowed")
        for image in images:
            if image.content_type not in ALLOWED_IMAGE_TYPES:
                raise ValueError(f"Unsupported image type: {image.content_type}")
            if not image.content:
                raise ValueError(f"{image.filename} is empty")
            if not _matches_signature(image.content_type, image.content):
                raise ValueError(f"{image.filename} does not match its declared image type")
            if len(image.content) > self.max_bytes:
                raise ValueError(f"{image.filename} exceeds the upload size limit")

    def save(self, fixture_id: str, images: tuple[ImagePayload, ...]) -> tuple[SavedUpload, ...]:
        self.validate(images)
        directory = self.root / fixture_id
        directory.mkdir(parents=True, exist_ok=True)
        saved: list[SavedUpload] = []
        for image in images:
            extension = ALLOWED_IMAGE_TYPES[image.content_type]
            destination = directory / f"{uuid4().hex}{extension}"
            destination.write_bytes(image.content)
            saved.append(
                SavedUpload(
                    storage_path=str(destination),
                    original_filename=Path(image.filename).name,
                    content_type=image.content_type,
                    sha256=hashlib.sha256(image.content).hexdigest(),
                )
            )
        return tuple(saved)
