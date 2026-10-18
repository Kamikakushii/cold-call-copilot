# Cold Call Co-Pilot

A full-stack application designed to guide sales representatives through the 8 stages of a cold call, minimizing typing and maximizing active listening.

## Live Links
* **Frontend (Vercel):** https://cold-call-copilot-mu.vercel.app/
* **Backend Health Check (Render):** https://cold-call-copilot-backend.onrender.com

## Database Schema
The PostgreSQL schema (`schema.sql`) is located in the root of this repository. It includes two relational tables (`calls` and `call_stages`) using `gen_random_uuid()` for primary keys.

## LLM Integration: Gemini 2.5 Flash
This application uses Google's `gemini-3.8-flash` model via the Google GenAI SDK. 
* **Function:** When a call concludes, the backend extracts all free-text notes ("prospect_words") logged across the various stages of that specific `call_id`. 
* **Why Gemini:** Gemini instantly processes this unstructured, fragmented conversational data and generates a clean, single-sentence summary of the final outcome. This removes the administrative burden from the caller, ensuring CRM logs are accurate and deterministic without requiring the caller to manually type a post-call summary.
