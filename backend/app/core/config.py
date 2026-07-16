from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL : str
    PIN_SALT : str
    ADMIN_TOKEN : str
    DEVICE_SECRET : str

settings = Settings()

