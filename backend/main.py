from fastapi import FastAPI, Header, HTTPException, Depends
import os
from dotenv import load_dotenv
from supabase import create_client
import voyageai
from anthropic import Anthropic

load_dotenv()

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://blinks-ai-assistant-two.vercel.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
voyage = voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))
claude = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

from fastapi import Header, HTTPException

def require_login(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not logged in")
    token = authorization.replace("Bearer ", "")
    user = supabase.auth.get_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid login")
    return user

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/test-db")
def test_db():
    response = supabase.table("test_connection").select("*").execute()
    return response.data

@app.get("/ask")
def ask(question: str):
    # Step 1: turn the question into an embedding
    result = voyage.embed([question], model="voyage-3", input_type="query")
    question_embedding = result.embeddings[0]

    # Step 2: search Supabase for the closest matching chunks
    matches = supabase.rpc("match_knowledge_chunks", {
        "query_embedding": question_embedding,
        "match_count": 3
    }).execute()

    chunks = matches.data

    # Step 3: build context from the matched chunks
    context = "\n\n".join([f"{c['heading']}: {c['content']}" for c in chunks])

    # Step 4: ask Claude to answer using ONLY that context
    message = claude.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=300,
        messages=[{
            "role": "user",
            "content": f"""You are a helpful assistant for a lash extension business called Example Lash Studio. Answer the customer's question using ONLY the information below. If the information contains a placeholder like [NEED ANSWER FROM JANE], tell the customer you don't have that confirmed yet and they should reach out directly.

Business information:
{context}

Customer question: {question}

Answer:"""
        }]
    )

    return {
        "question": question,
        "answer": message.content[0].text,
        "sources": [c["heading"] for c in chunks]
    }

@app.get("/draft-text")
def draft_text(customer_name: str, purpose: str, user=Depends(require_login)):
    message = claude.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"""You are helping a lash extension business owner named Jane draft a text message to a customer. Keep it warm, brief, and professional.

Customer name: {customer_name}
Purpose of the text: {purpose}

Write just the text message itself, nothing else."""
        }]
    )

    draft = message.content[0].text

    result = supabase.table("owner_messages").insert({
        "customer_name": customer_name,
        "purpose": purpose,
        "draft_text": draft,
        "status": "pending_approval"
    }).execute()

    return {"draft": draft, "status": "pending_approval"}

@app.get("/owner-messages")
def list_owner_messages(user=Depends(require_login)):
    result = supabase.table("owner_messages").select("*").order("created_at", desc=True).execute()
    return result.data

@app.post("/owner-messages/{message_id}/approve")
def approve_message(message_id: int, user=Depends(require_login)):
    result = supabase.table("owner_messages").update({"status": "approved"}).eq("id", message_id).execute()
    return result.data