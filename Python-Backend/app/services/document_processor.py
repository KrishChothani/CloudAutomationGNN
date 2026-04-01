
import requests
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_pinecone import PineconeVectorStore
from app.core.config import settings
from .s3_service import download_file_from_s3


def process_document_pipeline(document_id: str, s3_url: str, pinecone_namespace: str):
    """The main RAG ingestion pipeline, designed to run in the background."""
    try:
        print(f"Starting processing for document: {document_id}")
        
        # 1. Download file from S3
        local_path = download_file_from_s3(s3_url)
        print(f"File downloaded to: {local_path}")
        
        # 2. Load the document
        loader = PyPDFLoader(local_path)
        documents = loader.load()
        
        # 3. Split the document into chunks
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, 
            chunk_overlap=200
        )
        chunks = text_splitter.split_documents(documents)
        print(f"Document split into {len(chunks)} chunks.")
        
        # --- CHANGE 2: Use the local HuggingFaceEmbeddings model ---
        # It will be downloaded automatically on the first run.
        print("--------------------------------------------")
        embeddings = HuggingFaceEmbeddings(
            model_name='sentence-transformers/all-MiniLM-L6-v2'
        )
        print("Hugging Face Embeddings ('all-MiniLM-L6-v2') initialized.")
        
        # 5. Upsert to Pinecone (This part remains the same)
        vectorstore = PineconeVectorStore.from_documents(
            documents=chunks,
            embedding=embeddings,
            index_name="cksfinbot",
            namespace=pinecone_namespace
        )
        print(f"Embeddings upserted to Pinecone namespace: {pinecone_namespace}")
        
        # 6. Send 'processed' status back to Node.js backend
        webhook_url = f"{settings.NODE_WEBHOOK_URL}/{document_id}/status"
        requests.patch(webhook_url, json={"status": "processed"}, timeout=10)
        print(f"Successfully processed document: {document_id}")

    except Exception as e:
        print(f"Error processing document {document_id}: {e}")
        # 7. Send 'failed' status back to Node.js backend
        try:
            webhook_url = f"{settings.NODE_WEBHOOK_URL}/{document_id}/status"
            requests.patch(webhook_url, json={"status": "failed"}, timeout=10)
        except Exception as webhook_error:
            print(f"Failed to send webhook notification: {webhook_error}")