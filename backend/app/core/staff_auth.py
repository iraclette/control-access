from functools import lru_cache

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db

# Staff sign in to the website with Supabase Auth; the website forwards their access token.
# A token proves who they are; their row in site.staff (same database) says what they may do.


@lru_cache(maxsize=1)
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True)


def verify_supabase_token(token: str) -> str:
    """Returns the user id (sub) of a valid Supabase access token, or raises 401."""
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256":
            if not settings.SUPABASE_JWT_SECRET:
                raise HTTPException(status_code=401, detail="invalid token")
            key = settings.SUPABASE_JWT_SECRET
        elif alg in ("ES256", "RS256") and settings.SUPABASE_URL:
            key = _jwks_client().get_signing_key_from_jwt(token).key
        else:
            raise HTTPException(status_code=401, detail="invalid token")
        claims = jwt.decode(token, key, algorithms=[alg], audience="authenticated")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="invalid token")
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="invalid token")
    return sub


def staff_role(db: Session, user_id: str) -> str | None:
    try:
        return db.execute(text("select role from site.staff where user_id = cast(:id as uuid)"), {"id": user_id}).scalar()
    except ProgrammingError:
        # site schema not created in this database yet
        db.rollback()
        return None


def require_dev(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> str:
    if not settings.SUPABASE_URL and not settings.SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=503, detail="staff login not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing token")
    user_id = verify_supabase_token(authorization.split(" ", 1)[1].strip())
    if staff_role(db, user_id) != "dev":
        raise HTTPException(status_code=403, detail="developer access only")
    return user_id
