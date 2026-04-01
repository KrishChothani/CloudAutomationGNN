# # app/services/llm_service.py
# import math
# import asyncio
# from lib2to3.fixes.fix_input import context
# from click import prompt
# from langchain_google_genai import ChatGoogleGenerativeAI
# from langchain_huggingface import HuggingFaceEmbeddings
# from langchain_pinecone import PineconeVectorStore
# from langchain_core.prompts import PromptTemplate
# from langchain_core.runnables import RunnableParallel, RunnablePassthrough
# from langchain_core.output_parsers import StrOutputParser
# from operator import itemgetter

# from app.core.config import settings
# from app.prompts import (
#     SMART_CHAT_PROMPT_TEMPLATE,
#     DOCUMENT_ANALYSIS_PROMPT_TEMPLATE,
#     ANALYTICAL_INSIGHTS_PROMPT_TEMPLATE,
#     GENERAL_CONVERSATION_PROMPT_TEMPLATE
# )

# from .pinecone_service import get_pinecone_client

# def format_docs(docs: list) -> str:
#     """Helper function to format retrieved documents into a single string."""
#     return "\n---\n".join([doc.page_content for doc in docs])

# def format_chat_history(chat_history: list) -> str:
#     """Formats chat history into a readable string."""
#     if not chat_history:
#         return "No previous conversation."
#     return "\n".join([f"{msg.get('role', 'unknown').capitalize()}: {msg.get('content', '')}" for msg in chat_history])

# # --- RAG Pipeline Implementations using LCEL ---
# # async def retrieve_from_multiple_namespaces(embeddings, question: str, namespaces: list):
# #     """
# #     Creates a retriever for each namespace, searches them concurrently,
# #     and returns a combined list of relevant documents.
# #     """
# #     if not namespaces:
# #         return []

# #     # Create a list of retrieval tasks
# #     tasks = []
# #     for ns in namespaces:
# #         try:
# #             vectorstore = PineconeVectorStore(index_name="cksfinbot", embedding=embeddings, namespace=ns)
# #             retriever = vectorstore.as_retriever(search_kwargs={"k": 50}) # Get top 5 from each doc
# #             # Add the async retrieval task to the list
# #             tasks.append(retriever.ainvoke(question))
# #         except Exception as e:
# #             print(f"Warning: Could not create retriever for namespace {ns}. Skipping. Error: {e}")

# #     # Run all retrieval tasks concurrently
# #     all_docs_nested = await asyncio.gather(*tasks)
    
# #     # Flatten the list of lists into a single list of documents
# #     combined_docs = [doc for sublist in all_docs_nested for doc in sublist]
    
# #     # Optional: You could add a re-ranking step here to find the best docs from the combined list.
# #     # For now, we'll just return the combined list.
# #     return combined_docs

# async def retrieve_from_multiple_namespaces(embeddings, question: str, namespaces: list):
#     """
#     Dynamically determines search 'k' by using the existing get_pinecone_client() helper
#     to get namespace stats, then runs retrievals concurrently.
#     """
#     if not namespaces:
#         return []

#     namespace_stats = {}
#     try:
#         # Step 1: Use your existing helper function to get a Pinecone client.
#         print("📊 Fetching index stats from Pinecone using the client helper...")
#         pinecone_client = get_pinecone_client()
#         pinecone_index = pinecone_client.Index("cksfinbot")
        
#         # Now, use this client to get the stats.
#         stats = pinecone_index.describe_index_stats()
#         namespace_stats = stats.get('namespaces', {})
#         print("✅ Successfully fetched index stats.")

#     except Exception as e:
#         print(f"❌ Error fetching Pinecone stats: {e}. Falling back to a fixed k=10 for all retrievals.")
#         # namespace_stats will remain an empty dict, triggering the fallback logic below.

#     # The rest of the function remains the same, as its logic is correct.
#     tasks = []
#     for ns in namespaces:
#         try:
#             chunk_count = namespace_stats.get(ns, {}).get('vector_count', 0)
            
#             if chunk_count > 0:
#                 # Heuristic for calculating 'k'.
#                 k = math.ceil(chunk_count * 0.15)
#                 # dynamic_k = max(5, min(k, 50))
#                 dynamic_k = max(5, k)
#                 print(f"🔍 Retrieving from '{ns}' with dynamic k={dynamic_k} (based on {chunk_count} chunks)")
#             else:
#                 # Fallback if stats call failed or the namespace is new/empty.
#                 print(f"⚠️  Could not find stats for namespace '{ns}'. Using default k=10.")
#                 dynamic_k = 10

#             # Here we use LangChain's PineconeVectorStore for retrieval, as it's designed for this.
#             vectorstore = PineconeVectorStore(
#                 index_name="cksfinbot", 
#                 embedding=embeddings, 
#                 namespace=ns
#             )
#             retriever = vectorstore.as_retriever(
#                 search_kwargs={"k": dynamic_k} # <-- The dynamic value is used here
#             )
            
#             tasks.append(retriever.ainvoke(question))
            
#         except Exception as e:
#             print(f"Warning: Could not create retriever for namespace {ns}. Skipping. Error: {e}")

#     if not tasks:
#         print("No valid retrieval tasks could be created.")
#         return []
        
#     all_docs_nested = await asyncio.gather(*tasks)
    
#     combined_docs = [doc for sublist in all_docs_nested for doc in sublist]
#     print(f"Retrieved a total of {len(combined_docs)} documents from {len(namespaces)} namespaces.")
    
#     return combined_docs

# async def smart_chat_pipeline(llm, embeddings, question: str, chat_history: str, namespaces: list):
#     """The RAG pipeline for the multi-modal Smart Chat feature, built with LCEL."""
#     print("Executing Smart Chat Pipeline with LCEL")
#     if not namespaces:
#         return "I can't answer this question without any documents to analyze. Please upload a document first."
    
#     relevant_docs = await retrieve_from_multiple_namespaces(embeddings, question, namespaces)
#     if not relevant_docs:
#         return "I couldn't find any relevant information in the uploaded documents to answer your question."
        
#     context = format_docs(relevant_docs)

#     prompt = PromptTemplate.from_template(SMART_CHAT_PROMPT_TEMPLATE)

#     # 3. Build the LCEL RAG Chain
#     # This chain defines the precise flow of data.
#     rag_chain = (
#         {
#             "context": lambda _: context,
#             "question": itemgetter("question"),
#             "chat_history": itemgetter("chat_history"),
#         }
#         | prompt
#         | llm
#         | StrOutputParser()
#     )
#     # 4. Invoke the chain with the required inputs
#     return rag_chain.invoke({"question": question, "chat_history": chat_history})

# # --- Placeholder Pipelines (can be easily built out using the same LCEL pattern) ---
# async def document_analysis_pipeline(llm, embeddings, question: str, chat_history: str, namespaces: list):
#     print("Executing Document Analysis Pipeline")
#     # Example: you could change the retriever settings or use a different prompt
#     # retriever = vectorstore.as_retriever(search_type="mmr", search_kwargs={"k": 7})
#     # prompt = PromptTemplate.from_template(DOCUMENT_ANALYSIS_PROMPT_TEMPLATE)
#     # ... build chain ...
#     return "The Document Analysis feature is under development. Please try the Smart Chat for now."

# async def analytical_insights_pipeline(llm, embeddings, question: str, chat_history: str, namespaces: list):
#     print("Executing Analytical Insights Pipeline")
#     return "The Analytical Insights feature is under development. Please try the Smart Chat for now."

# async def general_conversation_pipeline(llm, question: str, chat_history: str):
#     """A simple conversational chain without document retrieval, built with LCEL."""
#     print("Executing General Conversation Pipeline with LCEL")
    
#     prompt = PromptTemplate.from_template(GENERAL_CONVERSATION_PROMPT_TEMPLATE)
    
#     # Simple chain: prompt -> llm -> output parser
#     conversation_chain = prompt | llm | StrOutputParser()
    
#     return conversation_chain.invoke({"question": question, "chat_history": chat_history})


# # --- The Main Router Function (Entry Point) ---
# async def get_answer_from_rag(question: str, chat_history: list, pinecone_namespaces: list, feature_mode: str) -> str:
#     """
#     Initializes models and routes the request to the correct RAG pipeline.
#     """
#     # Initialize models once per request
#     llm = ChatGoogleGenerativeAI(
#         model="gemini-2.5-flash-lite", 
#         temperature=0, 
#         google_api_key=settings.GOOGLE_API_KEY, 
#         convert_system_message_to_human=True
#     )
#     embeddings = HuggingFaceEmbeddings(
#         model_name='sentence-transformers/all-MiniLM-L6-v2',
#         model_kwargs={'device': 'cpu'},
#         encode_kwargs={'normalize_embeddings': True}
#     )
#     print("Models initialized." , embeddings)
    
#     # Format chat history once
#     formatted_history = format_chat_history(chat_history)

#     # Router logic to select and execute the correct pipeline
#     if feature_mode == "Smart_Chat":
#         return await smart_chat_pipeline(llm, embeddings, question, formatted_history, pinecone_namespaces)
    
#     elif feature_mode == "Document_Analysis":
#         return document_analysis_pipeline(llm, embeddings, question, formatted_history, pinecone_namespaces)
        
#     elif feature_mode == "Analytical_Insights":
#         return analytical_insights_pipeline(llm, embeddings, question, formatted_history, pinecone_namespaces)
        
#     elif feature_mode == "General_Conversation":
#         return general_conversation_pipeline(llm, question, formatted_history)
        
#     else: # Fallback to the default Smart Chat mode
#         print(f"Unknown feature mode '{feature_mode}', defaulting to Smart_Chat.")
#         return smart_chat_pipeline(llm, embeddings, question, formatted_history, pinecone_namespaces)

# app/services/llm_service.py
import math
import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableParallel, RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from operator import itemgetter

from app.core.config import settings
from app.prompts import (
    SMART_CHAT_PROMPT_TEMPLATE,
    DOCUMENT_ANALYSIS_PROMPT_TEMPLATE,
    ANALYTICAL_INSIGHTS_PROMPT_TEMPLATE,
    GENERAL_CONVERSATION_PROMPT_TEMPLATE
)

from .pinecone_service import get_pinecone_client
from app.core.model_loader import llm_model, embedding_model


def format_docs(docs: list) -> str:
    if not docs:
        return "No relevant documents found."
    return "\n---\n".join([doc.page_content for doc in docs])

def format_chat_history(chat_history: list) -> str:
 
    if not chat_history:
        return "No previous conversation."
    return "\n".join([f"{msg.get('role', 'unknown').capitalize()}: {msg.get('content', '')}" for msg in chat_history])

async def retrieve_from_multiple_namespaces(embeddings, question: str, namespaces: list):
   
    if not namespaces:
        print("⚠️  No namespaces provided for retrieval.")
        return []

    namespace_stats = {}
    try:
        print("📊 Fetching index stats from Pinecone using the client helper...")
        pinecone_client = get_pinecone_client()
        pinecone_index = pinecone_client.Index("cksfinbot")
        
        stats = pinecone_index.describe_index_stats()
        namespace_stats = stats.get('namespaces', {})
        print("✅ Successfully fetched index stats.")

    except Exception as e:
        print(f"❌ Error fetching Pinecone stats: {e}. Falling back to a fixed k=10 for all retrievals.")

    tasks = []
    for ns in namespaces:
        try:
            chunk_count = namespace_stats.get(ns, {}).get('vector_count', 0)
            
            if chunk_count > 0:
                k = math.ceil(chunk_count * 0.15)
                dynamic_k = max(5, k)
                print(f"🔍 Retrieving from '{ns}' with dynamic k={dynamic_k} (based on {chunk_count} chunks)")
            else:
                print(f"⚠️  Namespace '{ns}' is empty or doesn't exist. Skipping retrieval.")
                continue  # Skip empty namespaces

            vectorstore = PineconeVectorStore(
                index_name="cksfinbot", 
                embedding=embeddings, 
                namespace=ns
            )
            retriever = vectorstore.as_retriever(
                search_kwargs={"k": dynamic_k}
            )
            
            tasks.append(retriever.ainvoke(question))
            
        except Exception as e:
            print(f"⚠️  Warning: Could not create retriever for namespace {ns}. Skipping. Error: {e}")

    if not tasks:
        print("⚠️  No valid retrieval tasks could be created. Returning empty results.")
        return []
        
    all_docs_nested = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter out any exceptions that occurred during retrieval
    combined_docs = []
    for result in all_docs_nested:
        if isinstance(result, Exception):
            print(f"⚠️  Retrieval error: {result}")
        else:
            combined_docs.extend(result)
    
    print(f"✅ Retrieved a total of {len(combined_docs)} documents from {len(namespaces)} namespaces.")
    
    return combined_docs

async def smart_chat_pipeline(llm, embeddings, question: str, chat_history: str, namespaces: list):
    """
    The RAG pipeline for the multi-modal Smart Chat feature, built with LCEL.
    Always sends query to LLM even if no documents are found, allowing the prompt
    to handle general queries and missing context scenarios.
    """
    print("🚀 Executing Smart Chat Pipeline with LCEL")
    
    # Try to retrieve documents, but don't block if none exist
    relevant_docs = []
    if namespaces:
        relevant_docs = await retrieve_from_multiple_namespaces(embeddings, question, namespaces)
    else:
        print("⚠️  No namespaces provided. Proceeding with empty context.")
    
    # Format context (will be empty string or "No relevant documents found" if no docs)
    context = format_docs(relevant_docs) if relevant_docs else "No financial documents have been uploaded yet."

    # Create prompt template
    prompt = PromptTemplate.from_template(SMART_CHAT_PROMPT_TEMPLATE)

    # Build the LCEL RAG Chain - ALWAYS executes, even with empty context
    rag_chain = (
        {
            "context": lambda _: context,
            "question": itemgetter("question"),
            "chat_history": itemgetter("chat_history"),
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    
    # Invoke the chain with the required inputs
    print("📤 Sending query to Gemini...")
    response = await rag_chain.ainvoke({"question": question, "chat_history": chat_history})
    print("✅ Response received from Gemini")
    return response

async def document_analysis_pipeline(llm, embeddings, question: str, chat_history: str, namespaces: list):
    """Document Analysis Pipeline - Currently under development."""
    print("🚀 Executing Document Analysis Pipeline")
    
    # Similar structure - always send to LLM
    relevant_docs = []
    if namespaces:
        relevant_docs = await retrieve_from_multiple_namespaces(embeddings, question, namespaces)
    
    context = format_docs(relevant_docs) if relevant_docs else "No financial documents have been uploaded yet."
    
    prompt = PromptTemplate.from_template(DOCUMENT_ANALYSIS_PROMPT_TEMPLATE)
    
    chain = (
        {
            "context": lambda _: context,
            "question": itemgetter("question"),
            "chat_history": itemgetter("chat_history"),
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    
    return await chain.ainvoke({"question": question, "chat_history": chat_history})

async def analytical_insights_pipeline(llm, embeddings, question: str, chat_history: str, namespaces: list):
    """Analytical Insights Pipeline - Currently under development."""
    print("🚀 Executing Analytical Insights Pipeline")
    
    # Similar structure - always send to LLM
    relevant_docs = []
    if namespaces:
        relevant_docs = await retrieve_from_multiple_namespaces(embeddings, question, namespaces)
    
    context = format_docs(relevant_docs) if relevant_docs else "No financial documents have been uploaded yet."
    
    prompt = PromptTemplate.from_template(ANALYTICAL_INSIGHTS_PROMPT_TEMPLATE)
    
    chain = (
        {
            "context": lambda _: context,
            "question": itemgetter("question"),
            "chat_history": itemgetter("chat_history"),
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    
    return await chain.ainvoke({"question": question, "chat_history": chat_history})

async def general_conversation_pipeline(llm, question: str, chat_history: str):
    print("🚀 Executing General Conversation Pipeline with LCEL")
    
    prompt = PromptTemplate.from_template(GENERAL_CONVERSATION_PROMPT_TEMPLATE)
    
    conversation_chain = prompt | llm | StrOutputParser()
    
    return await conversation_chain.ainvoke({"question": question, "chat_history": chat_history})



async def get_answer_from_rag(question: str, chat_history: list, pinecone_namespaces: list, feature_mode: str) -> str:
    print(f"🎯 Router: Processing query with feature_mode='{feature_mode}'")
    
    # Use global models
    llm = llm_model
    embeddings = embedding_model
    print("✅ Global Models used.")
    
    # Format chat history once
    formatted_history = format_chat_history(chat_history)

    # Router logic to select and execute the correct pipeline
    if feature_mode == "Smart_Chat":
        return await smart_chat_pipeline(llm, embeddings, question, formatted_history, pinecone_namespaces)
    
    elif feature_mode == "Document_Analysis":
        return await document_analysis_pipeline(llm, embeddings, question, formatted_history, pinecone_namespaces)
        
    elif feature_mode == "Analytical_Insights":
        return await analytical_insights_pipeline(llm, embeddings, question, formatted_history, pinecone_namespaces)
        
    elif feature_mode == "General_Conversation":
        return await general_conversation_pipeline(llm, question, formatted_history)
        
    else:  # Fallback to the default Smart Chat mode
        print(f"⚠️  Unknown feature mode '{feature_mode}', defaulting to Smart_Chat.")
        return await smart_chat_pipeline(llm, embeddings, question, formatted_history, pinecone_namespaces)