# app/services/multi_modal_processor.py

import pymupdf as fitz  # Import the library by its official name and alias it to fitz
import base64
import requests
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import settings
from .s3_service import download_file_from_s3
from langchain_core.messages import HumanMessage
from app.core.model_loader import llm_model, embedding_model

# Models are now loaded from core.model_loader

def get_image_caption(image_bytes: bytes, llm: ChatGoogleGenerativeAI) -> str:
    """Uses Gemini Vision to generate a caption for an image."""
    try:
        print(f"🖼️  Processing image: {len(image_bytes)} bytes")
        
        # Encode the image bytes to a base64 string
        b64_image = base64.b64encode(image_bytes).decode('utf-8')
        print(f"🔄 Image encoded to base64, length: {len(b64_image)} characters")
        
        print("🤖 Calling Gemini Vision API for image description...")
        msg = llm.invoke(
            [
                HumanMessage(
                    content=[
                        {
                            "type": "text",
                            "text": "Describe this financial chart, table, or image from a document in detail. Focus on key data, trends, and conclusions presented. Be factual and objective."
                        },
                        {
                            "type": "image_url",
                            "image_url": f"data:image/jpeg;base64,{b64_image}"
                        },
                    ]
                )
            ]
        )
        
        caption = msg.content if msg.content else "Description could not be generated for the image."
        print(f"✅ Image caption generated: {caption[:100]}...")
        return caption
        
    except Exception as e:
        print(f"❌ Error generating image caption: {e}")
        return "Could not describe the image due to an error."


# try:

print(f"✅ Embeddings model loaded: sentence-transformers/all-MiniLM-L6-v2")
# except Exception as e:
#     print(f"⚠️  Failed to load sentence-transformers model, trying alternative: {e}")
#     # Fallback to a different model if the first one fails
#     embeddings = HuggingFaceEmbeddings(
#         model_name='sentence-transformers/paraphrase-MiniLM-L6-v2',
#         model_kwargs={'device': 'cpu', 'trust_remote_code': True},
#         encode_kwargs={'normalize_embeddings': True}
#     )
#     print(f"✅ Fallback embeddings model loaded: sentence-transformers/paraphrase-MiniLM-L6-v2")
def smart_chat_ingestion_pipeline(document_id: str, s3_url: str, pinecone_namespace: str):
    """A multi-modal ingestion pipeline that extracts and embeds both text and image descriptions."""
    try:
        print(f"\n🚀 ===== STARTING SMART CHAT INGESTION =====")
        print(f"📄 Document ID: {document_id}")
        print(f"🔗 S3 URL: {s3_url}")
        print(f"📍 Pinecone Namespace: {pinecone_namespace}")
        
        print(f"\n⬇️  Downloading file from S3...")
        local_path = download_file_from_s3(s3_url)
        print(f"✅ File downloaded to: {local_path}")
        
        print(f"\n🔧 Initializing components...")
        # Use a more reliable embeddings model that doesn't have meta tensor issues
        # embeddings = HuggingFaceEmbeddings(
        #     model_name='sentence-transformers/all-MiniLM-L6-v2',
        #     model_kwargs={'device': 'cpu'},
        #     encode_kwargs={'normalize_embeddings': True}
        # )
            
        
        # Using global LLM model for vision tasks
        vision_llm = llm_model
        print(f"✅ Vision LLM initialized: Global Model")
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        print(f"✅ Text splitter configured: chunk_size=1000, overlap=150")
        
        print(f"\n📖 Opening PDF document...")
        doc = fitz.open(local_path)
        total_pages = len(doc)
        print(f"✅ PDF opened successfully: {total_pages} pages")
        
        all_chunks = []
        text_chunks_count = 0
        image_chunks_count = 0
        
        for page_num, page in enumerate(doc):
            print(f"\n📄 Processing page {page_num + 1}/{total_pages}...")
            
            # 1. Process Text
            print(f"📝 Extracting text from page {page_num + 1}...")
            text = page.get_text("text")
            if text.strip():
                text_chunks = text_splitter.create_documents([text], metadatas=[{"page": page_num + 1, "type": "text"}])
                all_chunks.extend(text_chunks)
                text_chunks_count += len(text_chunks)
                print(f"✅ Text extracted: {len(text_chunks)} chunks, {len(text)} characters")
            else:
                print(f"⚠️  No text found on page {page_num + 1}")
            
            # 2. Process Images
            images = page.get_images(full=True)
            print(f"🖼️  Found {len(images)} images on page {page_num + 1}")
            
            for img_index, img in enumerate(images):
                print(f"🖼️  Processing image {img_index + 1}/{len(images)} on page {page_num + 1}...")
                
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                
                caption = get_image_caption(image_bytes, vision_llm)
                caption_with_context = f"Context from an image on page {page_num + 1}: {caption}"
                
                image_chunk = text_splitter.create_documents([caption_with_context], metadatas=[{"page": page_num + 1, "type": "image"}])
                all_chunks.extend(image_chunk)
                image_chunks_count += len(image_chunk)
                print(f"✅ Image processed: {len(image_chunk)} chunks created")

        print(f"\n📊 PROCESSING SUMMARY:")
        print(f"📝 Text chunks: {text_chunks_count}")
        print(f"🖼️  Image chunks: {image_chunks_count}")
        print(f"📦 Total chunks: {len(all_chunks)}")

        if not all_chunks:
            raise ValueError("Document processing resulted in no text or image chunks.")

        print(f"\n🔄 Upserting embeddings to Pinecone...")
        print(f"🎯 Target index: cksfinbot")
        print(f"📍 Target namespace: {pinecone_namespace}")
        
        PineconeVectorStore.from_documents(
            documents=all_chunks,
            embedding=embedding_model,
            index_name="cksfinbot",
            namespace=pinecone_namespace
        )
        print(f"✅ SMART CHAT embeddings upserted successfully!")

        print(f"\n📡 Sending success webhook to Node.js backend...")
        webhook_response = requests.patch(
            f"{settings.NODE_WEBHOOK_URL}/api/v1/documents/{document_id}/status/webhook", 
            json={"status": "processed"}, 
            timeout=100
        )
        print(f"✅ Webhook sent successfully: {webhook_response.status_code}")
        
        print(f"\n🎉 ===== DOCUMENT PROCESSING COMPLETED =====")
        print(f"📄 Document ID: {document_id}")
        print(f"✅ Status: PROCESSED")

    except Exception as e:
        print(f"\n❌ ===== DOCUMENT PROCESSING FAILED =====")
        print(f"📄 Document ID: {document_id}")
        print(f"❌ Error: {str(e)}")
        print(f"📡 Sending failure webhook...")
        
        try:
            webhook_response = requests.patch(
                f"{settings.NODE_WEBHOOK_URL}/api/v1/documents/{document_id}/status/webhook", 
                json={"status": "failed", "errorMessage": str(e)}, 
                timeout=100
            )
            print(f"✅ Failure webhook sent: {webhook_response.status_code}")
        except Exception as webhook_error:
            print(f"❌ Failed to send webhook: {webhook_error}")
        
        print(f"❌ ===== PROCESSING ENDED WITH ERROR =====")