import os

from fastapi import FastAPI
from fastapi.params import Form
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import HTMLResponse, RedirectResponse
from .templates import templates
from asgi_csrf import asgi_csrf
from asgi_sessions import SessionMiddleware

SECRET = os.getenv("SESSION_SECRET")

auth_backends = []

app = FastAPI(docs_url=None, redoc_url=None)


async def catch_exceptions_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        return RedirectResponse("/", status_code=302)


app.middleware('http')(catch_exceptions_middleware)


@app.get("/status")
async def status():
    return {"message": "OK"}


@app.get("/")
async def root(request: Request):
    if request.session.get("id", None) != "5":
        return RedirectResponse("/sign-in", status_code=302)
    else:
        return templates.TemplateResponse(
            "home.html.j2",
            {"request": request, "username": "duncan", "csrf": request.scope["csrftoken"]()}
        )


@app.get("/sign-in", response_class=HTMLResponse)
async def signInForm(request: Request):
    print(request.scope)
    response = templates.TemplateResponse(
        "sign-in.html.j2",
        {"request": request, "username": "", "csrf": request.scope["csrftoken"]()}
    )
    return response


@app.post('/sign-in', response_class=HTMLResponse)
async def signInSubmit(
    request: Request,
    username: str = Form(...),
    password: str = Form(...)
):
    request.session["id"] = "5"
    return RedirectResponse("/", status_code=302)


app.mount("/protected", StaticFiles(directory="static/protected"), name="static")
app.mount("/", StaticFiles(directory="static/public"), name="static")

app = asgi_csrf(app, signing_secret=os.getenv("CSRF_SECRET"))
app = SessionMiddleware(app, secret_key=os.getenv("SESSION_SECRET"))
