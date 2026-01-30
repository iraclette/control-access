import hashlib
from .config import settings


def hash_pin(pin: str) -> str:
    # IMPORTANT: store only hashes, never plaintext
    data = (settings.PIN_SALT + pin).encode("utf-8")
    return hashlib.sha256(data).hexdigest()