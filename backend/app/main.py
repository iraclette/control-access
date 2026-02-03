import datetime as dt
import secrets

from fastapi import FastAPI, Request, Form, HTTPException, Header, APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings
from app.core.security import hash_pin
from app.db.session import SessionLocal
from app.models import Flat, SyncState

app = FastAPI(title="Building Access API (v1)")
router = APIRouter()
DEVICE_SECRET = "Developeri22_ip20061009" 

# Static + templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Session cookie for admin UI
app.add_middleware(SessionMiddleware, secret_key=settings.ADMIN_TOKEN)


# ---------- helpers ----------

def require_ui_login(request: Request):
    if request.session.get("is_admin") is not True:
        return RedirectResponse("/admin-ui/login", status_code=303)
    return None


def bump_version(db):
    """Bump sync version whenever access-relevant data changes."""
    st = db.get(SyncState, 1)
    if st is None:
        st = SyncState(id=1, version=0)
        db.add(st)
        db.flush()
    st.version += 1
    db.flush()

def generate_numeric_pin(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))

# ---------- misc ----------

@app.get("/health")
def health():
    return {"ok": True, "ts": dt.datetime.utcnow().isoformat()}


# ---------- admin auth (UI) ----------

@app.get("/admin-ui/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@app.post("/admin-ui/login")
def login_submit(request: Request, password: str = Form(...)):
    if password != settings.ADMIN_TOKEN:
        return templates.TemplateResponse("login.html", {"request": request, "error": "Wrong password"})
    request.session["is_admin"] = True
    return RedirectResponse("/admin-ui/flats", status_code=303)


@app.post("/admin-ui/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/admin-ui/login", status_code=303)


# ---------- flats list + add (UI) ----------

@app.get("/admin-ui/flats", response_class=HTMLResponse)
def ui_flats(request: Request):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flats = db.scalars(select(Flat).order_by(Flat.label.asc())).all()
        return templates.TemplateResponse("flats.html", {"request": request, "flats": flats})
    finally:
        db.close()


@app.post("/admin-ui/flats/add")
def ui_flats_add(
    request: Request,
    label: str = Form(...),
    name: str = Form(""),
):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = Flat(
            label=label.strip(),
            name=name.strip() or None,
            access_enabled=True,
        )
        db.add(flat)
        db.commit()
        return RedirectResponse(f"/admin-ui/flats/{flat.id}", status_code=303)
    finally:
        db.close()


# ---------- edit flat (UI) ----------

@app.get("/admin-ui/flats/{flat_id}", response_class=HTMLResponse)
def ui_flat_edit(request: Request, flat_id: int):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if not flat:
            raise HTTPException(status_code=404, detail="Flat not found")

        return templates.TemplateResponse(
            "flat_edit.html",
            {
                "request": request,
                "flat": flat,
                "has_pin": flat.pin_hash is not None,
                "generated_pin": None,
            },
        )
    finally:
        db.close()


@app.post("/admin-ui/flats/{flat_id}/set-label")
def ui_flat_set_label(request: Request, flat_id: int, label: str = Form(...)):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if not flat:
            raise HTTPException(status_code=404, detail="Flat not found")

        flat.label = label.strip()
        db.commit()
        return RedirectResponse(f"/admin-ui/flats/{flat_id}", status_code=303)
    finally:
        db.close()


@app.post("/admin-ui/flats/{flat_id}/set-name")
def ui_flat_set_name(request: Request, flat_id: int, name: str = Form("")):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if not flat:
            raise HTTPException(status_code=404, detail="Flat not found")

        flat.name = name.strip() or None
        db.commit()
        return RedirectResponse(f"/admin-ui/flats/{flat_id}", status_code=303)
    finally:
        db.close()


@app.post("/admin-ui/flats/{flat_id}/toggle-access")
def ui_flat_toggle_access(request: Request, flat_id: int):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if not flat:
            raise HTTPException(status_code=404, detail="Flat not found")

        flat.access_enabled = not flat.access_enabled
        bump_version(db)
        db.commit()
        return RedirectResponse(f"/admin-ui/flats/{flat_id}", status_code=303)
    finally:
        db.close()


@app.post("/admin-ui/flats/{flat_id}/set-pin")
def ui_flat_set_pin(request: Request, flat_id: int, pin: str = Form(...)):
    redir = require_ui_login(request)
    if redir:
        return redir

    pin = pin.strip()
    if len(pin) < 4 or len(pin) > 12 or not pin.isdigit():
        return RedirectResponse(f"/admin-ui/flats/{flat_id}?err=badpin", status_code=303)

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if not flat:
            raise HTTPException(status_code=404, detail="Flat not found")

        new_hash = hash_pin(pin)

        # Simple policy: no duplicate PINs
        other = db.scalar(select(Flat).where(Flat.pin_hash == new_hash, Flat.id != flat_id))
        if other:
            return RedirectResponse(f"/admin-ui/flats/{flat_id}?err=dup", status_code=303)

        flat.pin_hash = new_hash
        bump_version(db)
        db.commit()
        return RedirectResponse(f"/admin-ui/flats/{flat_id}", status_code=303)
    finally:
        db.close()


@app.post("/admin-ui/flats/{flat_id}/delete")
def ui_flat_delete(request: Request, flat_id: int):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if not flat:
            return RedirectResponse("/admin-ui/flats", status_code=303)

        db.delete(flat)
        bump_version(db)
        db.commit()
        return RedirectResponse("/admin-ui/flats", status_code=303)
    finally:
        db.close()

@app.post("/admin-ui/flats/{flat_id}/generate-pin", response_class=HTMLResponse)
def ui_flat_generate_pin(request: Request, flat_id: int):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if not flat:
            raise HTTPException(status_code=404, detail="Flat not found")

        # generate unique pin
        for _ in range(10):
            pin = generate_numeric_pin(6)
            pin_hash = hash_pin(pin)

            other = db.scalar(select(Flat).where(Flat.pin_hash == pin_hash, Flat.id != flat_id))
            if not other:
                break
        else:
            raise HTTPException(status_code=500, detail="Could not generate a unique PIN")

        flat.pin_hash = pin_hash
        bump_version(db)
        db.commit()

        # show the generated pin once
        return templates.TemplateResponse(
            "flat_edit.html",
            {
                "request": request,
                "flat": flat,
                "has_pin": True,
                "generated_pin": pin,
            },
        )
    finally:
        db.close()

# ---------- emulate ESP32 ----------

@app.get("/device/sync")
def device_sync(x_device_secret: str | None = Header(default=None)):
    # Optional: enforce a shared secret for now
    # if x_device_secret != settings.DEVICE_SECRET:
    #     raise HTTPException(status_code=401, detail="Bad device secret")

    db = SessionLocal()
    try:
        st = db.get(SyncState, 1)
        version = st.version if st else 0

        flats = db.scalars(select(Flat)).all()

        return {
            "version": version,
            "flats": [
                {
                    "id": f.id,
                    "label": f.label,
                    "pin_hash": f.pin_hash,
                    "access_enabled": f.access_enabled,
                }
                for f in flats
                if f.pin_hash is not None
            ],
        }
    finally:
        db.close()

@router.post("/device/log")
async def device_log(
    request: Request,
    x_device_secret: str = Header(None)
):
    if x_device_secret != DEVICE_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    body = await request.json()
    msg = body.get("msg", "")

    print(f"[ESP LOG] {msg}")

    return {"ok": True}