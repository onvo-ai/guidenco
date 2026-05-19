from flask import Blueprint

api = Blueprint("api", __name__, url_prefix="/api")

from .routes_capture import register_routes as _reg_capture
from .routes_action import register_routes as _reg_action
from .routes_test import register_routes as _reg_test
from .routes_settings import register_routes as _reg_settings

_reg_capture(api)

from agent import run as agent_run
_reg_action(api, agent_run)

_reg_test(api)
_reg_settings(api)