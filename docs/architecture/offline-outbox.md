# Offline action outbox

WP008 adds a browser-local durability layer for the WP007 execution command boundary. It does not create a second server mutation API and it does not add a cloud outbox table.

## Scope

Only these commands may enter the offline outbox:

- `record_task_action_v01`
- `add_plan_item_feedback_v01`

Daily Plan publication, Task/Project CRUD, management cancellation, Goals, and Inbox mutations remain online-only because they do not yet have the same server-side idempotency contract.

## Storage

TaskRing uses Dexie over IndexedDB with two user-scoped stores:

- `outbox`: durable command envelopes ordered by an auto-increment sequence.
- `todaySnapshots`: the minimum published Today plan snapshot required to display the real plan offline.

IndexedDB is local persistence, not a cryptographic vault. The stores can contain private task titles, execution state, notes, feedback, and timing information. They never contain access tokens, refresh tokens, privileged keys, or server secrets.

## Durable command envelope

A command stores its local command ID, authenticated owner ID, command type, server idempotency UUID (`event_id` or `feedback_id`), Plan Item, plan date, expected execution state, action details, action-time `occurred_at`, retry metadata, error text, and sync state.

The UUID and `occurred_at` are generated once at enqueue time. Retries reuse them unchanged. A Done action performed at 10:00 and synchronized at 11:30 therefore creates a server Event whose `occurred_at` remains 10:00.

## Ordering

Commands are read in stable user FIFO order. The sync engine sends one command at a time. Commands for the same Plan Item are therefore strictly serialized. An earlier conflict blocks later commands for that same Plan Item from being sent until the user resolves or discards the conflict.

The local optimistic projection derives the next `expected_state` from the projected state after earlier local commands. This supports offline sequences such as:

`Start -> Partial -> Done`

without inventing a second state machine.

## Optimistic projection

After durable enqueue, Today immediately projects the execution state locally. This is visual optimism only. Every unsynchronized item is marked `Pending Sync`; a rejected command is marked `Sync issue`.

Local pending commands are never rendered as immutable server Events. History keeps them in a separate Pending Sync section. If the server already contains the same Event/Feedback UUID after a lost response, History suppresses the local duplicate representation.

## Today snapshot

After an online authoritative Today read, the active plan, Plan Items, task display fields, project title, and execution projection are saved to IndexedDB. Offline Today reads only this snapshot.

If no snapshot exists, the UI says:

`No offline Today plan is available.`

It does not substitute all active Tasks or fabricate a plan.

## Synchronization and reconciliation

Sync triggers are:

- authenticated app shell startup while online;
- a browser network transition back online;
- `Sync Now` from the UI;
- continuation after a successful command.

Each command follows:

1. durable IndexedDB enqueue;
2. optional optimistic projection;
3. authenticated WP007 RPC;
4. server acknowledgement;
5. authoritative Today readback and TanStack Query invalidation for Today, Tasks, History, and Feedback;
6. local snapshot replacement;
7. acknowledged command deletion.

The command is deliberately not deleted between steps 3 and 5. If the RPC succeeds but the response or reconciliation read is lost, the next attempt reuses the same UUID and relies on WP007 idempotency. The authoritative server remains the final source of truth.

## Retry and conflict policy

Transient network/transport failures remain in `retry` with bounded exponential backoff. There is no high-frequency polling loop and no server scheduler.

State conflicts, unavailable Plan Items/Tasks, idempotency conflicts, validation failures, and auth/ownership failures become durable `conflict` records. They are not retried forever and are never silently dropped. The user can discard a local pending command explicitly, then refresh/re-execute against current server state.

## Authentication and logout

Every outbox query and sync engine instance is scoped to the current authenticated `user_id`. A user switch cannot display or send another user's pending commands.

Signing out does not delete pending commands. They remain on the device under the original user ID. Settings provides a destructive `Clear offline data` flow with an explicit warning that pending commands will be lost.

## PWA boundary

Workbox continues to precache only static application assets. `runtimeCaching` remains empty. Supabase Auth, REST, RPC, Task Events, Feedback, and other private responses are never placed in the service-worker runtime cache.

Offline private state lives only in the IndexedDB application layer.
