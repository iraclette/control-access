import datetime as dt
import hashlib
import secrets
from pathlib import Path

import semantic_version

from fastapi import FastAPI, Request, Form, HTTPException, Header, APIRouter, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings
from app.core.security import hash_pin
from app.db.session import SessionLocal
from app.models import Flat, SyncState, Building, Device, FirmwareRelease
from app.api.routes.device import router as device_router
from app.api.routes import admin_router, buildings_router, devices_router, firmware_router

app = FastAPI(title="Building Access API (v1)")
router = APIRouter()
DEVICE_SECRET = "Developeri22_ip20061009"
app.include_router(device_router)
app.include_router(admin_router)
app.include_router(buildings_router)
app.include_router(devices_router)
app.include_router(firmware_router)
app.include_router(router)

FIRMWARE_DIR = Path(__file__).resolve().parents[1] / "firmware"

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
def ui_flats(request: Request, building_id: int | None = None):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        query = select(Flat).order_by(Flat.label.asc())
        if building_id is not None:
            query = query.where(Flat.building_id == building_id)
        flats = db.scalars(query).all()
        buildings = db.scalars(select(Building).order_by(Building.name.asc())).all()
        building_names = {b.id: b.name for b in buildings}
        return templates.TemplateResponse(
            "flats.html",
            {
                "request": request,
                "flats": flats,
                "buildings": buildings,
                "building_names": building_names,
                "selected_building_id": building_id,
            },
        )
    finally:
        db.close()


@app.post("/admin-ui/flats/add")
def ui_flats_add(
    request: Request,
    label: str = Form(...),
    name: str = Form(""),
    building_id: str = Form(""),
):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = Flat(
            label=label.strip(),
            name=name.strip() or None,
            building_id=int(building_id) if building_id else None,
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

        buildings = db.scalars(select(Building).order_by(Building.name.asc())).all()

        return templates.TemplateResponse(
            "flat_edit.html",
            {
                "request": request,
                "flat": flat,
                "buildings": buildings,
                "has_pin": flat.pin_hash is not None,
                "generated_pin": None,
            },
        )
    finally:
        db.close()


@app.post("/admin-ui/flats/{flat_id}/set-building")
def ui_flat_set_building(request: Request, flat_id: int, building_id: str = Form("")):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if not flat:
            raise HTTPException(status_code=404, detail="Flat not found")

        flat.building_id = int(building_id) if building_id else None
        db.commit()
        return RedirectResponse(f"/admin-ui/flats/{flat_id}", status_code=303)
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

# ---------- buildings (UI) ----------

@app.get("/admin-ui/buildings", response_class=HTMLResponse)
def ui_buildings(request: Request):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        buildings = db.scalars(select(Building).order_by(Building.name.asc())).all()
        rows = []
        for b in buildings:
            flat_count = len(db.scalars(select(Flat).where(Flat.building_id == b.id)).all())
            device_count = len(db.scalars(select(Device).where(Device.building_id == b.id)).all())
            rows.append({"name": b.name, "flat_count": flat_count, "device_count": device_count})
        return templates.TemplateResponse("buildings.html", {"request": request, "buildings": rows})
    finally:
        db.close()


@app.post("/admin-ui/buildings/add")
def ui_buildings_add(request: Request, name: str = Form(...)):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        name = name.strip()
        existing = db.scalar(select(Building).where(Building.name == name))
        if existing:
            return RedirectResponse("/admin-ui/buildings?err=dup", status_code=303)

        db.add(Building(name=name))
        db.commit()
        return RedirectResponse("/admin-ui/buildings", status_code=303)
    finally:
        db.close()


# ---------- firmware (UI) ----------

@app.get("/admin-ui/firmware", response_class=HTMLResponse)
def ui_firmware(request: Request):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        releases = db.scalars(select(FirmwareRelease).order_by(FirmwareRelease.created_at.desc())).all()
        active_by_type = {}
        for dt_ in ("door", "elevator"):
            active_by_type[dt_] = db.scalar(
                select(FirmwareRelease).where(FirmwareRelease.device_type == dt_, FirmwareRelease.active.is_(True))
            )
        devices = db.scalars(select(Device).order_by(Device.device_id.asc())).all()
        buildings = db.scalars(select(Building).order_by(Building.name.asc())).all()
        return templates.TemplateResponse(
            "firmware.html",
            {
                "request": request,
                "releases": releases,
                "active_by_type": active_by_type,
                "devices": devices,
                "buildings": buildings,
            },
        )
    finally:
        db.close()


@app.post("/admin-ui/firmware/upload")
async def ui_firmware_upload(
    request: Request,
    device_type: str = Form(...),
    version: str = Form(...),
    file: UploadFile = File(...),
):
    redir = require_ui_login(request)
    if redir:
        return redir

    if device_type not in ("door", "elevator"):
        return RedirectResponse("/admin-ui/firmware?err=bad+device_type", status_code=303)

    try:
        semantic_version.Version(version)
    except ValueError:
        return RedirectResponse("/admin-ui/firmware?err=bad+version", status_code=303)

    db = SessionLocal()
    try:
        existing = db.scalar(
            select(FirmwareRelease).where(
                FirmwareRelease.device_type == device_type, FirmwareRelease.version == version
            )
        )
        if existing:
            return RedirectResponse("/admin-ui/firmware?err=already+uploaded", status_code=303)

        content = await file.read()
        if not content:
            return RedirectResponse("/admin-ui/firmware?err=empty+file", status_code=303)

        sha256 = hashlib.sha256(content).hexdigest()
        filename = f"{device_type}-{version}.bin"

        FIRMWARE_DIR.mkdir(parents=True, exist_ok=True)
        (FIRMWARE_DIR / filename).write_bytes(content)

        db.add(FirmwareRelease(device_type=device_type, version=version, filename=filename, sha256=sha256, active=False))
        db.commit()
        return RedirectResponse("/admin-ui/firmware", status_code=303)
    finally:
        db.close()


@app.post("/admin-ui/firmware/{release_id}/activate")
def ui_firmware_activate(request: Request, release_id: int):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        release = db.get(FirmwareRelease, release_id)
        if not release:
            raise HTTPException(status_code=404, detail="Firmware release not found")

        db.query(FirmwareRelease).filter(
            FirmwareRelease.device_type == release.device_type,
            FirmwareRelease.id != release.id,
        ).update({"active": False})
        release.active = True
        db.commit()
        return RedirectResponse("/admin-ui/firmware", status_code=303)
    finally:
        db.close()


@app.post("/admin-ui/devices/{device_id}/set-type")
def ui_device_set_type(request: Request, device_id: str, device_type: str = Form("")):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        device = db.get(Device, device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")

        device.device_type = device_type or None
        db.commit()
        return RedirectResponse("/admin-ui/firmware", status_code=303)
    finally:
        db.close()


@app.post("/admin-ui/devices/{device_id}/set-building")
def ui_device_set_building(request: Request, device_id: str, building_id: str = Form("")):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        device = db.get(Device, device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")

        device.building_id = int(building_id) if building_id else None
        db.commit()
        return RedirectResponse("/admin-ui/firmware", status_code=303)
    finally:
        db.close()


# ---------- emulate ESP32 ----------

@router.post("/device_logs")
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