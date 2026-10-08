"""
Shared pytest setup.

TestClient(app) only runs FastAPI's lifespan startup handler when used as a
context manager (`with TestClient(app) as client:`) — on Starlette 0.35.1
(the version fastapi==0.109.0 pins), plain `client = TestClient(app)` does
not trigger it at all. Several test files construct the client at module
level without a `with` block, so `init_db()` (normally run during the app's
lifespan) never executes, and every DB-backed test fails immediately with
`sqlite3.OperationalError: no such table: users`. Verified directly against
Starlette 0.35.1 before writing this fix — it isn't a guess.

Running init_db() here, once, before the test session starts, fixes this
without needing to change how every existing test file constructs its
client.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from backend.app.db.database import init_db

init_db()
