import os
import sys

from flask import Flask

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

app = Flask(__name__)

from .api import api
app.register_blueprint(api)

from .routes_static import register_routes as _reg_static
_reg_static(app)