from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.flat import Flat
from sqlalchemy import select

from app.core.security import hash_pin
from app.models import Flat, SyncState
from app.db.session import SessionLocal

from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Building Access API (v1)")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Session cookie (for browser login)
app.add_middleware(SessionMiddleware, secret_key=settings.ADMIN_TOKEN)

templates = Jinja2Templates(directory="templates")



def require_ui_login(request: Request):
    if request.session.get("is_admin") is not True:
        return RedirectResponse("/admin-ui/login", status_code=303)
    return None

@app.get("/health")
def health():
    return {"ok": True}

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


@app.get("/admin-ui/flats", response_class=HTMLResponse)
def flats_page(request: Request):
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
def flats_add(request: Request, label: str = Form(...)):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = Flat(label=label.strip(), access_enabled=True)
        db.add(flat)
        db.commit()
    finally:
        db.close()

    return RedirectResponse("/admin-ui/flats", status_code=303)


@app.post("/admin-ui/flats/{flat_id}/toggle")
def flats_toggle(request: Request, flat_id: int):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if flat:
            flat.access_enabled = not flat.access_enabled
            db.commit()
    finally:
        db.close()

    return RedirectResponse("/admin-ui/flats", status_code=303)

# --- helper: bump sync version whenever access-relevant data changes ---
def bump_version(db):
    st = db.get(SyncState, 1)
    if st is None:
        st = SyncState(id=1, version=0)
        db.add(st)
        db.flush()
    st.version += 1
    db.flush()

# --- list page ---
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
def ui_flats_add(request: Request, label: str = Form(...)):
    redir = require_ui_login(request)
    if redir:
        return redir

    db = SessionLocal()
    try:
        flat = Flat(label=label.strip(), access_enabled=True)
        db.add(flat)
        db.commit()
        return RedirectResponse(f"/admin-ui/flats/{flat.id}", status_code=303)
    finally:
        db.close()

# --- edit page ---
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
        # keep it simple: numeric pins only
        return RedirectResponse(f"/admin-ui/flats/{flat_id}?err=badpin", status_code=303)

    db = SessionLocal()
    try:
        flat = db.get(Flat, flat_id)
        if not flat:
            raise HTTPException(status_code=404, detail="Flat not found")

        new_hash = hash_pin(pin)

        # forbid duplicate PINs across flats (simple policy)
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
        bump_version(db)  # removing a pin affects access lists
        db.commit()
        return RedirectResponse("/admin-ui/flats", status_code=303)
    finally:
        db.close()