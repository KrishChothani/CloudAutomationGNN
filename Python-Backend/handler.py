# handler.py

from mangum import Mangum
from app.main import app  # Import your FastAPI app instance

# This is the core of the adapter. Mangum takes your FastAPI app 
# and creates a handler function that AWS Lambda can understand.
handler = Mangum(app, lifespan="off")