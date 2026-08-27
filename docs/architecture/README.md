# Architecture

**Product:** TaskRing AI Secretary  
**Architecture:** Greenfield  
**Legacy:** `Inertia77/task-ring` is reference / migration source only  
**Master State:** Supabase  
**Frontend:** React + TypeScript + Vite  
**Local-first:** IndexedDB + optimistic queue (future)  
**AI:** Secretary API (future)

## Direction

Human → ChatGPT AI Secretary → Supabase → TaskRing Frontend → Human Feedback → Supabase History → AI Planning

WP001 intentionally defines only the foundation. Formal task-domain tables, AI scheduling, adapters, and data migration are outside this work package.
