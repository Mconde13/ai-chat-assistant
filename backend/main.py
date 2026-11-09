from fastapi import FastAPI
import os
from dotenv import load_dotenv
from supabase import create_client
import voyageai
from anthropic import Anthropic

load_dotenv()

app = FastAPI()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
voyage = voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))
claude = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

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