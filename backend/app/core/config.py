from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL : str
    PIN_SALT : str
    ADMIN_TOKEN : str
    DEVICE_SECRET : str

    # Staff logins for the /v2 endpoints come from Supabase Auth. Optional so the service
    # still starts without them; the /v2 endpoints then answer 503.
    SUPABASE_URL : str | None = None          # tokens verified via its JWKS (ES256/RS256 keys)
    SUPABASE_JWT_SECRET : str | None = None   # legacy HS256 projects

settings = Settings()

