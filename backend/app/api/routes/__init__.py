from .admin import router as admin_router
from .device import router as device_router
from .buildings import router as buildings_router
from .devices import router as devices_router
from .firmware import router as firmware_router
from .tags import router as tags_router
from .scans import router as scans_router

__all__ = [
    "admin_router", "device_router", "buildings_router", "devices_router", "firmware_router", "tags_router",
    "scans_router",
]
