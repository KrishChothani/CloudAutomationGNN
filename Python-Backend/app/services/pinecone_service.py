from pinecone import Pinecone
from app.core.config import settings

def get_pinecone_client():
    return Pinecone(api_key=settings.PINECONE_API_KEY)