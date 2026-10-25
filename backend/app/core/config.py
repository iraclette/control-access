from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL : str
    PIN_SALT : str
    ADMIN_TOKEN : str
    DEVICE_SECRET : str

    # Firmware up to 1.0.12 buffers and parses the whole /sync response at once and runs
    # out of memory at about 200 tags, before it reads the OTA offer: it can never update
    # itself out of that. A device listed in LEGACY_SYNC_DEVICES (comma-separated IDs),
    # still on such firmware and with an update pending, gets only its building's oldest
    # LEGACY_SYNC_MAX_TAGS enabled tags, so the response parses and the update gets
    # through (all PINs still sent). Unset = off: everyone gets the full list.
    LEGACY_SYNC_MAX_TAGS : int = 0
    LEGACY_SYNC_DEVICES : str = ""

settings = Settings()

