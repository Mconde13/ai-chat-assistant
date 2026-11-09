import os
import sys
import json
import logging
from dotenv import load_dotenv
from supabase import create_client
import voyageai

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

KB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "kb_testset.json")
EMBED_BATCH_SIZE = 64

try:
    supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SECRET_KEY"))
    voyage = voyageai.Client(api_key=os.getenv("VOYAGE_API_KEY"))
except Exception as e:
    logger.error(f"Could not set up clients (check your .env): {e}")
    sys.exit(1)

try:
    with open(KB_PATH, "r", encoding="utf-8") as f:
        entries = json.load(f)["knowledge_base"]
except (OSError, KeyError, json.JSONDecodeError) as e:
    logger.error(f"Could not read knowledge_base from {KB_PATH}: {e}")
    sys.exit(1)

all_chunks = []
for entry in entries:
    try:
        all_chunks.append({
            "heading": entry["id"],
            "content": entry["text"],
            "source_file": entry.get("source", "kb_testset.json"),
        })
    except KeyError as e:
        logger.error(f"Knowledge entry is missing {e}: {entry}")
        sys.exit(1)

logger.info(f"Total chunks to embed: {len(all_chunks)}")

# Embed the id + text TOGETHER: the id often carries key terms
# (e.g. "product-adhesive", "policy-late-arrival") that help retrieval.
texts = [f"{c['heading']}\n{c['content']}" for c in all_chunks]

try:
    embeddings = []
    for i in range(0, len(texts), EMBED_BATCH_SIZE):
        result = voyage.embed(texts[i:i + EMBED_BATCH_SIZE], model="voyage-3", input_type="document")
        embeddings.extend(result.embeddings)
except Exception as e:
    logger.error(f"Voyage embedding failed, knowledge base left untouched: {e}")
    sys.exit(1)

# Insert the new rows BEFORE removing the old ones, so a failure part-way
# through never leaves the bot with an empty or partial knowledge base.
try:
    old_ids = [row["id"] for row in supabase.table("knowledge_chunks").select("id").execute().data]

    new_rows = [
        {
            "source_file": chunk["source_file"],
            "heading": chunk["heading"],
            "content": chunk["content"],
            "embedding": embedding
        }
        for chunk, embedding in zip(all_chunks, embeddings)
    ]
    supabase.table("knowledge_chunks").insert(new_rows).execute()
    logger.info(f"Saved {len(new_rows)} new chunks")

    if old_ids:
        supabase.table("knowledge_chunks").delete().in_("id", old_ids).execute()
        logger.info(f"Removed {len(old_ids)} old chunks")
except Exception as e:
    logger.error(f"Supabase update failed: {e}")
    sys.exit(1)

logger.info("Done!")
