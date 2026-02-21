# MetaSync UI - Requirements

## 1. Introduction

MetaSync UI is a multi-tenant web application that provides a complete management interface for [MetaSync](https://github.com/peakedev/metasync), an (a)synchronous LLM processing pipeline. The application uses Supabase (project 'Metasync UI') for authentication, authorization, and tenant management. Each tenant maps 1:1 to a deployed MetaSync backend instance. The UI exposes all MetaSync API capabilities scoped by user role and client API key permissions.

## 2. Alignment with Product Vision

This is the foundational feature of MetaSync UI. It establishes:

- The multi-tenant architecture with Supabase as the identity and tenant management layer
- The role hierarchy: Owner > Tenant Admin > Tenant User
- The proxy pattern where the UI communicates with tenant-specific MetaSync backends
- Full coverage of MetaSync API surface through a web interface

## 3. Roles

| Role | Scope | Description |
|------|-------|-------------|
| **Owner** | Global | Platform owner. Creates and manages tenants. Has access to all tenants. |
| **Tenant Admin** | Tenant | Manages a single tenant's MetaSync backend configuration, clients, API keys, and users. |
| **Tenant User** | Client | Operates within the scope of their assigned client API key. Manages jobs, workers, streams, runs, prompts, and prompt flows. |

## 4. Functional Requirements

### 4.1 Authentication & Authorization

#### FR-AUTH-1: User Authentication
**As a** user, **I want** to sign in with email/password, **so that** I can access the application.

Acceptance Criteria:
- Sign up with email + password via Supabase Auth 
- Sign up via google via Supabase auth
- Sign in / sign out
- Password reset flow
- Session persists across page reloads
- Unauthenticated users are redirected to login

#### FR-AUTH-2: Invitation-Based Onboarding
**As a** tenant admin or owner, **I want** to invite users by email, **so that** they can join the platform with the correct role and tenant assignment.

Acceptance Criteria:
- Owner can invite tenant admins to a specific tenant
- Tenant admins can invite tenant users to their tenant
- Invitation email contains a link to accept and create an account (or log in if account exists)
- Invitation records track status: pending, accepted, expired
- Invitations expire after 7 days
- Accepting an invitation assigns the user to the correct tenant and role

#### FR-AUTH-3: Role-Based Access Control
**As a** user, **I want** the UI to show only the features I have access to, **so that** I am not confused by irrelevant functionality.

Acceptance Criteria:
- Navigation and pages adapt based on user role (owner, tenant admin, tenant user)
- API calls to MetaSync backend include the correct credentials (admin API key or client API key) based on user role
- Tenant users only see data scoped to their assigned client API key
- Tenant users with no client assignment can log in and see the tenant but cannot access any MetaSync operations until assigned to a client by a tenant admin
- Tenant admins see all data within their tenant (admin API key scope)
- RLS policies in Supabase enforce tenant isolation at the database level

---

### 4.2 Tenant Management (Owner)

#### FR-TENANT-1: CRUD Tenants
**As an** owner, **I want** to create, view, edit, and delete tenants, **so that** I can manage the platform's customer base.

Acceptance Criteria:
- Create tenant with: name, slug
- List all tenants with status overview
- Edit tenant name
- Soft-delete (disable) a tenant
- Each tenant has a unique identifier

#### FR-TENANT-2: Tenant Configuration
**As an** owner, **I want** to see the configuration status of each tenant, **so that** I can verify they are properly set up.

Acceptance Criteria:
- View whether a tenant has a MetaSync backend URL configured
- View whether a tenant has an admin API key configured
- View the list of tenant admins assigned to a tenant

#### FR-TENANT-3: Manage Tenant Admins
**As an** owner, **I want** to invite and remove tenant admins, **so that** each tenant has designated administrators.

Acceptance Criteria:
- Invite a user as tenant admin to a specific tenant (via FR-AUTH-2)
- View list of tenant admins per tenant
- Remove a tenant admin from a tenant
- A tenant can have multiple admins

---

### 4.3 Tenant Backend Configuration (Tenant Admin)

#### FR-CONFIG-1: MetaSync Backend URL
**As a** tenant admin, **I want** to configure the MetaSync backend URL for my tenant, **so that** the UI knows where to send API requests.

Acceptance Criteria:
- Set/update the MetaSync backend base URL (e.g., `https://metasync.example.com`)
- Validate the URL by calling the MetaSync `/health` endpoint
- Display connection status (connected / unreachable)
- URL is stored in Supabase, scoped to the tenant

#### FR-CONFIG-2: Admin API Key
**As a** tenant admin, **I want** to configure the MetaSync admin API key for my tenant, **so that** admin-level operations can be performed.

Acceptance Criteria:
- Set/update the admin API key
- Admin API key is stored in Supabase Vault
- Validate the key by making an authenticated request to the MetaSync backend
- Display key status (valid / invalid / not configured)
- Key is never displayed in plaintext after initial entry

---

### 4.4 Client Management (Tenant Admin)

#### FR-CLIENT-1: CRUD Clients
**As a** tenant admin, **I want** to manage MetaSync clients, **so that** I can organize API access for different use cases or teams.

Acceptance Criteria:
- Create a client via MetaSync API `POST /clients` (returns API key once)
- Display the generated API key exactly once after creation with copy-to-clipboard
- List all clients via `GET /clients` showing: name, enabled status, creation date
- View single client details via `GET /clients/{client_id}`
- Update client name and enabled status via `PATCH /clients/{client_id}`
- Soft-delete client via `DELETE /clients/{client_id}`
- Toggle client enabled/disabled via `POST /clients/{client_id}/toggle`
- Rotate client API key via `POST /clients/{client_id}/rotate-key` (display new key once)

#### FR-CLIENT-2: Client API Key Storage
**As a** tenant admin, **I want** client API keys stored securely after creation, **so that** tenant users can authenticate against MetaSync without seeing raw keys.

Acceptance Criteria:
- When a client is created or key is rotated, the returned API key is stored in Supabase Vault
- The stored key is used by the UI to authenticate tenant users' requests to MetaSync
- Tenant admins can see which clients have keys stored
- Tenant admins can trigger key rotation (old vault entry replaced)

#### FR-CLIENT-3: Assign Users to Clients
**As a** tenant admin, **I want** to assign tenant users to clients, **so that** users can operate within the scope of a specific client API key.

Acceptance Criteria:
- Assign a tenant user to one client
- View which users are assigned to which client
- Reassign a user to a different client
- Unassign a user from a client
- A client can have multiple users assigned

#### FR-CLIENT-4: Invite Tenant Users
**As a** tenant admin, **I want** to invite users to my tenant, **so that** they become tenant members and can be assigned to a client to start using MetaSync.

Acceptance Criteria:
- Invite a user by email (via FR-AUTH-2); client assignment is optional at invite time
- On invitation acceptance, the user is always assigned to the tenant and granted the tenant user role
- If a client was specified in the invitation, the user is also assigned to that client on acceptance
- If no client was specified, the user is a tenant member with no client assignment and cannot access MetaSync operations until assigned (see FR-CLIENT-3)
- Tenant admin can view pending invitations, showing the target client if one was specified

---

### 4.5 Model Management (Tenant Admin)

#### FR-MODEL-1: CRUD Models
**As a** tenant admin, **I want** to manage LLM model configurations, **so that** the MetaSync backend can route requests to different providers.

Acceptance Criteria:
- Create model via `POST /models` with: name, sdk, endpoint, apiType, apiVersion, deployment, service, key, maxToken, minTemperature, maxTemperature, cost config
- List all models via `GET /models` (keys excluded from response)
- View single model details via `GET /models/{model_id}`
- Update model configuration via `PATCH /models/{model_id}`
- Soft-delete model via `DELETE /models/{model_id}`
- Display model API key returned at creation exactly once with copy-to-clipboard
- Support all SDK types: ChatCompletionsClient (Azure AI), AzureOpenAI, Anthropic, Gemini, test

---

### 4.6 Prompt Management (Tenant Admin + Tenant User)

#### FR-PROMPT-1: CRUD Prompts
**As a** tenant admin or tenant user, **I want** to manage prompts, **so that** I can create reusable prompt templates for jobs and flows.

Acceptance Criteria:
- Create prompt via `POST /prompts` with: name, type, prompt text, status (DRAFT/PUBLISHED/ARCHIVE)
- Tenant admins create public prompts; tenant users create private prompts scoped to their client
- List prompts via `GET /prompts` with filters: name, type, status, version
- Tenant users see public prompts + their own private prompts
- View single prompt via `GET /prompts/{prompt_id}`
- Update prompt via `PATCH /prompts/{prompt_id}` (tenant users can only update their own)
- Soft-delete prompt via `DELETE /prompts/{prompt_id}` (same ownership rules)
- Display prompt version (auto-incremented by MetaSync)

#### FR-PROMPT-2: Prompt Editor
**As a** user, **I want** a dedicated prompt editing experience, **so that** I can write and iterate on prompts effectively.

Acceptance Criteria:
- Multi-line text editor for prompt content
- Status management: DRAFT -> PUBLISHED -> ARCHIVE transitions
- Display version history (list prompt versions)

---

### 4.7 Prompt Flow Management (Tenant Admin + Tenant User)

#### FR-FLOW-1: CRUD Prompt Flows
**As a** tenant admin or tenant user, **I want** to chain prompts into flows, **so that** I can define multi-step prompt pipelines.

Acceptance Criteria:
- Create prompt flow via `POST /prompt-flows` with: name, ordered list of prompt IDs
- Tenant admins create public flows; tenant users create private flows
- List flows via `GET /prompt-flows`
- View single flow via `GET /prompt-flows/{flow_id}` showing the ordered prompts with their details
- Update flow via `PATCH /prompt-flows/{flow_id}` (ownership rules apply)
- Soft-delete flow via `DELETE /prompt-flows/{flow_id}`

#### FR-FLOW-2: Flow Builder
**As a** user, **I want** to visually build prompt flows by selecting and ordering prompts, **so that** I can easily compose multi-step pipelines.

Acceptance Criteria:
- Select prompts from available list (public + own private)
- Drag-and-drop or manual reordering of prompts in the flow
- Preview individual prompt content within the flow builder

---

### 4.8 Job Management (Tenant Admin + Tenant User)

#### FR-JOB-1: Browse Jobs
**As a** user, **I want** to browse and filter jobs, **so that** I can monitor the processing pipeline.

Acceptance Criteria:
- List jobs via `GET /jobs` with filters: status, operation, model, priority, limit, clientReference
- Display job summary counts via `GET /jobs/summary` (counts per status)
- Paginated list with sortable columns
- Tenant admins see all jobs across all clients; tenant users see jobs for their client

#### FR-JOB-2: Job Details
**As a** user, **I want** to view the full details of a job, **so that** I can inspect input, output, metrics, and status.

Acceptance Criteria:
- View single job via `GET /jobs/{job_id}`
- Display: status, operation, model, temperature, priority, request data, response data, processing metrics (tokens, cost, duration), eval result, client reference
- Display status transition history
- JSON viewer for request/response data

#### FR-JOB-3: Job Status Management
**As a** user, **I want** to update job statuses, **so that** I can manage the job lifecycle.

Acceptance Criteria:
- Update single job status via `PATCH /jobs/{job_id}` respecting valid transitions:
  - PENDING -> CANCELED
  - PROCESSED -> CONSUMED
  - PROCESSED -> ERROR_CONSUMING
- Full job update via `PATCH /jobs/{job_id}/full`
- Batch update jobs via `PATCH /jobs/batch`
- Batch delete jobs via `DELETE /jobs/batch`
- Confirmation dialog before destructive actions

#### FR-JOB-4: Create Jobs
**As a** tenant user, **I want** to create jobs, **so that** I can submit work to the processing pipeline.

Acceptance Criteria:
- Create single job via `POST /jobs` with: operation, model, temperature, priority, prompts/workingPrompts, requestData, clientReference, evalPrompt, evalModel, metaPrompt, metaModel
- Create batch of jobs via `POST /jobs/batch`
- Model and prompt selection from available options
- Form validation for required fields

---

### 4.9 Worker Management (Tenant User)

#### FR-WORKER-1: CRUD Workers
**As a** tenant user, **I want** to manage workers, **so that** I can control how jobs are processed.

Acceptance Criteria:
- Create worker via `POST /workers` with: workerId, config (pollInterval, maxItemsPerBatch, modelFilter, operationFilter, clientReferenceFilters)
- List workers via `GET /workers` showing: workerId, status (STOPPED/RUNNING/ERROR), config summary
- View worker summary counts via `GET /workers/summary`
- View single worker details via `GET /workers/{worker_id}`
- Update worker config via `PATCH /workers/{worker_id}` (must be stopped)
- Delete worker via `DELETE /workers/{worker_id}` (must be stopped)

#### FR-WORKER-2: Worker Lifecycle Control
**As a** tenant user, **I want** to start and stop workers, **so that** I can control processing capacity.

Acceptance Criteria:
- Start worker via `POST /workers/{worker_id}/start`
- Stop worker via `POST /workers/{worker_id}/stop`
- Visual status indicator: STOPPED (grey), RUNNING (green), ERROR (red)
- Bulk start/stop multiple workers at once
- Disable edit/delete actions while worker is running

#### FR-WORKER-3: Bulk Worker Operations
**As a** tenant user, **I want** to manage multiple workers at once, **so that** I can efficiently scale processing.

Acceptance Criteria:
- Select multiple workers via checkboxes
- Bulk start selected workers
- Bulk stop selected workers
- Bulk delete selected workers (stopped only)
- Bulk update config for selected workers (stopped only)

---

### 4.10 Stream / Chat Completion Sessions (Tenant User)

#### FR-STREAM-1: Browse Streams
**As a** tenant user, **I want** to view chat completion sessions, **so that** I can review past streaming interactions.

Acceptance Criteria:
- List streams via `GET /stream` with filters: model, status, limit
- Display stream summary counts via `GET /stream/summary`
- Show: streamId, model, status (STREAMING/COMPLETED/ERROR), creation date, token counts

#### FR-STREAM-2: Stream Details
**As a** tenant user, **I want** to view the full details of a stream session, **so that** I can inspect the request and response.

Acceptance Criteria:
- View single stream via `GET /stream/{stream_id}`
- Display the conversation in chat bubble format: user prompt as a right-aligned bubble, model response as a left-aligned bubble labelled with the model name
- Display processing metrics (tokens, cost, duration) below the conversation
- Display session metadata: model, temperature, status

#### FR-STREAM-3: Create Stream (Chat Interface)
**As a** tenant user, **I want** to interact with an LLM through a chat interface with real-time streaming, **so that** I can have a natural conversation with the model and see its response appear character by character.

Acceptance Criteria:
- The stream creation UI is presented as a chat interface, not a form
- User messages appear as right-aligned chat bubbles
- Model responses appear as left-aligned chat bubbles labelled with the model name
- Characters stream into the response bubble in real-time as they are received (SSE via `X-Stream-Id` header), giving the appearance of the model typing
- A text input area with a send button sits fixed at the bottom of the chat view
- Model and temperature are selectable before sending the first message (e.g., via a toolbar or settings panel above the chat)
- Create stream via `POST /stream` with: model, temperature, userPrompt, additionalPrompts
- Processing metrics (tokens, cost, duration) are displayed below the response bubble once streaming completes
- The input area is disabled while the model is streaming; it re-enables on completion or error
- Errors during streaming are displayed inline in the chat as an error state bubble

---

### 4.11 Run Management (Tenant User)

#### FR-RUN-1: CRUD Runs
**As a** tenant user, **I want** to manage metaprompting optimization runs, **so that** I can iteratively improve prompts across models.

Acceptance Criteria:
- Create run via `POST /runs` with: initialWorkingPromptIds, evalPromptId, evalModel, metaPromptId, metaModel, workingModels, maxIterations, temperature, priority, requestData
- List runs via `GET /runs` with status filter
- View single run via `GET /runs/{run_id}` showing full run details including model runs and iteration results
- Soft-delete run via `DELETE /runs/{run_id}`

#### FR-RUN-2: Run Lifecycle Control
**As a** tenant user, **I want** to pause, resume, and cancel runs, **so that** I can control long-running optimization processes.

Acceptance Criteria:
- Pause run via `PATCH /runs/{run_id}/pause` (only RUNNING runs)
- Resume run via `PATCH /runs/{run_id}/resume` (only PAUSED runs)
- Cancel run via `PATCH /runs/{run_id}/cancel`
- Visual status indicator: PENDING, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED
- Display current iteration progress (currentIteration / maxIterations, currentModelIndex)

#### FR-RUN-3: Run Progress Visualization
**As a** tenant user, **I want** to see the progress of a run, **so that** I can understand how the optimization is proceeding.

Acceptance Criteria:
- Display iteration results per model: iteration number, status, eval result, suggested prompt
- Display aggregated processing metrics per model run
- Display overall run processing metrics
- Link to individual jobs created by the run (via currentJobId)

---

### 4.12 User Management (Tenant Admin)

#### FR-USER-1: Manage Tenant Users
**As a** tenant admin, **I want** to manage users within my tenant, **so that** I can control who has access.

Acceptance Criteria:
- List all users in the tenant with their role and client assignment, including users with no client assignment
- View pending invitations, showing the target client if one was specified
- Remove a user from the tenant
- Change a user's client assignment
- Assign a client to a user who currently has no client assignment
- Revoke pending invitations

---

### 4.13 Dashboard

#### FR-DASH-1: Tenant Dashboard
**As a** tenant admin, **I want** a dashboard overview of my tenant, **so that** I can quickly assess the state of operations.

Acceptance Criteria:
- Job summary: count by status (PENDING, PROCESSING, PROCESSED, CONSUMED, errors, CANCELED)
- Worker summary: count by status (STOPPED, RUNNING, ERROR)
- Stream summary: count by status
- Active runs count
- Number of configured models
- Number of active clients

#### FR-DASH-2: User Dashboard
**As a** tenant user, **I want** a dashboard scoped to my client, **so that** I can see my operational context at a glance.

Acceptance Criteria:
- Job summary for my client
- Worker summary for my client
- Stream summary for my client
- Active runs for my client

---

## 5. Non-Functional Requirements

### 5.1 Architecture

- **NFR-ARCH-1**: The UI is a single-page application (SPA) acting as a proxy to tenant-specific MetaSync backends. All MetaSync API calls are routed through Supabase Edge Functions to avoid exposing MetaSync API keys to the browser.
- **NFR-ARCH-2**: Supabase is used for backend and authentication (Supabase Auth), tenant/user/role data storage (Postgres + RLS), secret storage for MetaSync API keys (Vault), and real-time subscriptions where applicable.
- **NFR-ARCH-3**: Tenant isolation is enforced via Supabase RLS with `tenant_id` on all tenant-scoped tables. JWT custom claims carry `tenant_id` and `role` via Custom Access Token Hook.
- **NFR-ARCH-4**: MetaSync API credentials (admin API key, client API keys) are stored in Supabase Vault and never sent to the browser. The BFF layer retrieves credentials from Vault and proxies requests to the tenant's MetaSync backend.
- **NFR-ARCH-5**: The frontend application requires two environment variables to connect to the Supabase "Metasync UI" project: `NEXT_PUBLIC_SUPABASE_URL` (the project API URL) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the public anon key). Both are available from the Supabase project dashboard and are safe to expose in the browser. A third variable `NEXT_PUBLIC_APP_URL` defines the application's own base URL (used for invitation redirect links).

### 5.2 Performance

- **NFR-PERF-1**: Paginated list views load within 2 seconds for up to 1000 records.
- **NFR-PERF-2**: Streaming chat completions (FR-STREAM-3) display tokens within 200ms of receipt from the MetaSync backend.
- **NFR-PERF-3**: Dashboard summaries use MetaSync summary endpoints (`/jobs/summary`, `/workers/summary`, `/stream/summary`) to avoid client-side aggregation.

### 5.3 Security

- **NFR-SEC-1**: All MetaSync API keys (admin and client) are stored in Supabase Vault, never in plain-text database columns.
- **NFR-SEC-2**: RLS policies enforce that users can only access data for their own tenant. Owner role bypasses tenant scoping.
- **NFR-SEC-3**: The supabase backend validates the user's Supabase session and role before forwarding requests to MetaSync.
- **NFR-SEC-4**: Client API keys shown at creation/rotation are displayed once and require explicit user action to copy. They are not retrievable in plaintext afterward.
- **NFR-SEC-5**: CSRF protection and secure cookie handling for Supabase sessions.
- **NFR-SEC-6**: Every call from the frontend to Supabase — whether a direct Postgres query or an Edge Function invocation — must carry the authenticated user's JWT session token. The Supabase client is initialised with the anon key and the active user session; unauthenticated (anon role) access to any application table is not permitted. RLS policies must not grant any access to the `anon` role.

### 5.4 Reliability

- **NFR-REL-1**: MetaSync backend connectivity is validated before operations. Unreachable backends display a clear error state.
- **NFR-REL-2**: Failed API calls to MetaSync display the error response with status code and message. No silent failures.
- **NFR-REL-3**: Optimistic UI updates are avoided for destructive operations (delete, status changes). Confirm server response before updating UI state.

### 5.5 Usability

- **NFR-UX-1**: Responsive layout supporting desktop (1280px+) and tablet (768px+). Mobile is not a priority.
- **NFR-UX-2**: Destructive actions (delete, cancel, status changes) require confirmation dialogs.
- **NFR-UX-3**: Bulk operations provide a selection mechanism (checkboxes) and a summary of the action before execution.
- **NFR-UX-4**: All list views support search/filter and sortable columns.
- **NFR-UX-5**: Loading states, empty states, and error states are handled for all views.

### 5.6 Documentation

- **NFR-DOC-1**: The repository must maintain a `./docs/` directory containing living documentation, with one file per functional or technical domain area (e.g. `authentication.md`, `tenant-management.md`, `edge-functions.md`, `database.md`). Documentation must be created or updated whenever a task that adds or modifies a feature is completed.
- **NFR-DOC-2**: `./docs/index.md` must always be kept up to date and list every documentation file with a one-line description. It is the single entry point for navigating the docs.
- **NFR-DOC-3**: The repository must have a `README.md` at the root covering: project title and description, how to run the application locally (including all required environment variables), project structure overview, and a link to `./specs/baseline/requirements.md` for the full feature list.
- **NFR-DOC-4**: Architecture diagrams are maintained in `./docs/diagrams/` as draw.io files. Diagrams must be updated when the architecture they depict changes.
