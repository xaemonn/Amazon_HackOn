# Implementation Plan: Zero-Touch Returns

## Overview

This plan sequences the Zero-Touch Returns feature for a 48-hour hackathon. It builds the in-process/mock layer first to deliver a working demo hero path as early as possible (initiate → capture → AI grading → disposition → refund + explanation → route to state). The hero-path checkpoint includes a working React UI, API, and seed data. AWS live adapters are stretch tasks that follow. The Bedrock adapter is the one priority AWS task (demo with real grading).

## Tasks

- [x] 1. Project scaffold and domain interfaces
  - [x] 1.1 Create the layered folder structure (presentation/, application/, domain/, infrastructure/) and configure TypeScript project with path aliases
    - Create `src/domain/shared/`, `src/domain/returns/`, `src/domain/grading/`, `src/domain/disposition/`
    - Create `src/application/returns/`, `src/application/grading/`, `src/application/disposition/`
    - Create `src/infrastructure/events/`, `src/infrastructure/ai/`, `src/infrastructure/persistence/`, `src/infrastructure/storage/`, `src/infrastructure/auth/`, `src/infrastructure/config/`
    - Create `src/presentation/api/`, `src/presentation/web/`
    - Set up tsconfig.json with strict mode and path aliases
    - Initialize React app under `src/presentation/web/` (Vite + React + TypeScript)
    - _Requirements: 15.8, 16.5_

  - [x] 1.2 Define domain event types and IEventBus interface
    - Create `DomainEvent` base interface, `IEventBus` interface (publish, subscribe, unsubscribe)
    - Define all event payload interfaces: `ReturnInitiatedEvent`, `ItemGradedEvent`, `DispositionAssignedEvent`, `FraudFlaggedEvent`, `ListingRequestedEvent`, `DeliveryJobCreatedEvent`, `ReturnCancelledEvent`, `ReturnCompletedEvent`, `ManualReviewInitiatedEvent`
    - _Requirements: 14.4, 15.1, 15.3, 15.5, 15.6_

  - [x] 1.3 Define adapter interfaces (IConditionGrader, IIdentityVerifier, IReasonParser, IMediaStorage) and repository interfaces
    - Create `IConditionGrader` with `assessCondition()` method and types (`ConditionGrade`, `Defect`, `ConditionGradeResult`)
    - Create `IIdentityVerifier` with `verifyIdentity()` method and types (`IdentityVerdict`, `IdentityVerificationResult`)
    - Create `IReasonParser` with types (`ParsedClaim`, `ClaimType`, `ClaimVerdict`, `ReasonReconciliation`, `ReconciliationStatus`)
    - Create `IMediaStorage` with `getPresignedUploadUrl()`, `getPresignedDownloadUrl()`, `validateMedia()`, `deleteMedia()`
    - Create repository interfaces: `IReturnRequestRepository`, `IConditionAssessmentRepository`, `IDispositionDecisionRepository`, `IAuditLogRepository`
    - _Requirements: 16.1, 16.2, 5.2, 5.3, 5.5, 4.2, 6.1_

  - [x] 1.4 Define the configurable parameters module with defaults
    - Create a typed config object with all parameters from the design (returnWindow, grading timeouts, fraud threshold, disposition thresholds, refund percentages, event retry settings, media limits)
    - Load from environment/JSON with fallback defaults
    - _Requirements: 10.1, 7.1, 11.1, 12.2_

  - [x] 1.5 Create DI composition root as an incrementally-filled registry
    - Create a registry/container module that each subsystem registers into as it is built
    - Default to in-process/mock implementations; allow config-driven swap to live
    - At this stage: register config, event bus interface placeholder, and repository interface placeholders
    - The composition root will be incrementally filled as each module is implemented in subsequent tasks
    - _Requirements: 16.5_

- [x] 2. ReturnRequest state machine and Returns Module domain
  - [x] 2.1 Implement the ReturnRequest entity and State Pattern state machine
    - Define `ReturnState` type, `ReturnRequestProps` interface, `MediaReference` interface
    - Implement `ReturnStateMachine` class enforcing the legal transition map from the design
    - `transition()` rejects illegal transitions with error specifying current and attempted state
    - `getLegalTransitions()` returns valid next states
    - _Requirements: 14.1, 14.2, 14.3_

   - [x] 2.2 Implement audit logging on state transitions
    - Create `AuditRecord` interface and in-memory `AuditLogRepository`
    - Every successful transition persists an audit record (returnId, previous state, new state, timestamp, actor, trigger)
    - _Requirements: 14.5_

  - [x] 2.3 Implement ReturnRequest value objects (ReturnReason, free-text validation, media completeness check)
    - `ReturnReason` enum with the 6 values
    - Free-text validation: trim, reject >500 chars, whitespace-only → null
    - Media completeness: requires 3 photos (front/back/closeup) + 1 video, valid formats and size limits
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.6, 3.8_

  - [x] 2.4 Implement return eligibility check logic
    - Calculate whether current date is within the Return_Window from delivery date
    - Return eligible status + remaining days or policy expiration date
    - Ownership verification: reject if customer doesn't own order-item
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

- [x] 3. In-process event bus (log-on-failure)
  - [x] 3.1 Implement InProcessEventBus with publish/subscribe and log-on-failure
    - Implement `IEventBus` interface: synchronous in-process pub-sub
    - On subscriber error: log the error with event ID and type; do NOT propagate to publisher or other subscribers
    - Support event deduplication by event ID for idempotent processing
    - Register into DI composition root
    - _Requirements: 15.9, 15.10, 15.11_

- [ ] 4. Grading Module — mock adapters and fraud scoring
  - [x] 4.1 Implement MockConditionGrader (deterministic, seeded)
    - Return predictable grades based on seeded item identifiers (item-grade-a → A/0.95, item-grade-b → B/0.90, etc.)
    - Unknown items → Grade B, confidence 0.70 as default fallback
    - Return defects list and reasoning text within invariant bounds (≤10 defects, ≤500 chars reasoning)
    - Register into DI composition root
    - _Requirements: 5.4, 16.3, 16.6_
q
  - [ ] 4.2 Implement MockIdentityVerifier (deterministic, seeded)
    - Return deterministic verdicts: matching photos → genuine/0.95, different product → mismatch/0.95, ambiguous → inconclusive/0.95
    - Unknown items → inconclusive/0.50 as default fallback
    - Register into DI composition root
    - _Requirements: 4.7, 16.4, 16.6_
goo
  - [ ] 4.3 Implement MockReasonParser (deterministic)
    - Extract mock claims from free-text based on keyword matching
    - Return reconciliation status: aligns / partially_aligns / contradicts / unparseable
    - For demo: keywords "cracked" → damage claim; "missing" → missing component; etc.
    - Register into DI composition root
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [ ] 4.4 Implement FraudScoreCalculator
    - Combine identity verdict, reconciliation status, unsupported claim count, return-history frequency
    - Identity mismatch → score ≥ 0.9 regardless of other signals
    - Each unsupported claim adds configurable increment (default 0.15)
    - Missing signals: compute with remaining, set requires_manual_review
    - Clamp output to [0.0, 1.0]
    - _Requirements: 7.1, 7.3, 7.6_

  - [ ] 4.5 Implement GradingOrchestrator (grading failure fallback + retry logic)
    - Call IIdentityVerifier (5s timeout, 1 retry on failure)
    - Call IConditionGrader (10s timeout, 1 retry on failure)
    - Call IReasonParser for free-text reconciliation
    - Compute fraud score; publish FraudFlagged if ≥ threshold
    - On total failure: produce fallback ConditionAssessment (confidence 0.0, grade null, requires_manual_review=true), do NOT publish FraudFlagged
    - Publish ItemGraded event on completion
    - _Requirements: 5.6, 5.7, 9.1, 9.2, 9.5, 9.6, 7.2, 7.5_

- [ ] 5. Disposition Engine — chain of responsibility + reason-aware refund
  - [ ] 5.1 Implement the 9 routing strategy handlers as individual classes
    - ManualReviewFlagHandler, FraudCheckHandler, LowConfidenceHandler, GradeAInstantMatchHandler, GradeAResaleHandler, GradeBRefurbishmentHandler, GradeCDLowValueHandler, GradeCDHighValueHandler, DefaultFallbackHandler
    - Each implements `IDispositionHandler` with `handle()` and `setNext()`
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11_

  - [ ] 5.2 Wire handlers into a Chain of Responsibility with priority ordering
    - Build the chain in strict priority order (manual-review → fraud → low-confidence → grade-A instant match → grade-A resale → grade-B → grade-C/D low value → grade-C/D high value → default)
    - Unavailable demand signal treated as no nearby demand
    - _Requirements: 10.1, 10.12_

  - [ ] 5.3 Implement reason-aware refund estimate calculation
    - Fault reasons (defective, damaged_in_transit, wrong_item, not_as_described) → 100% refund regardless of route
    - Choice reasons (changed_mind, size_fit) → route-based percentage from config
    - Set isMinimumGuarantee=true for manual_inspection and refurbishment when choice reason
    - _Requirements: 12.1, 12.2, 11.3_

  - [ ] 5.4 Implement plain-language explanation generator
    - Generate single sentence ≤160 chars containing reason + next step
    - No internal identifiers, no jargon, no "fraud"/"suspicious" for manual inspection
    - Manual inspection explanations include review timeframe from config
    - _Requirements: 13.1, 13.2, 13.4, 13.5_

  - [ ] 5.5 Implement DispositionOrchestrator (event listener + publish DispositionAssigned)
    - Subscribe to ItemGraded event
    - Build RoutingContext (assessment + item value + demand signal + return reason)
    - Run chain, produce DispositionDecision
    - Publish DispositionAssigned event
    - Trigger correct state transition on ReturnRequest (→ Listed, → AwaitingPickup, → Completed, → ManualReview)
    - _Requirements: 10.13, 14.2, 14.4, 15.5_

- [ ] 6. In-memory repositories and local media storage
  - [ ] 6.1 Implement InMemoryReturnRequestRepository
    - Implements `IReturnRequestRepository`: save, findById, findByCustomerId, findByOrderItemId, countByCustomerInDays
    - Use a Map<string, ReturnRequest> for storage
    - Register into DI composition root
    - _Requirements: 14.5, 7.1_

  - [ ] 6.2 Implement InMemoryConditionAssessmentRepository and InMemoryDispositionDecisionRepository
    - Simple Map-based storage implementing the repository interfaces
    - Register into DI composition root
    - _Requirements: 5.7, 10.13_

  - [ ] 6.3 Implement LocalFilesystemMediaStorage
    - Implements `IMediaStorage`: store files to a local `./uploads/` directory
    - Generate simple file paths instead of presigned URLs
    - Basic validation: check file size limits and format
    - Register into DI composition root
    - _Requirements: 3.8, 16.5_

  - [ ] 6.4 Implement MockAuthService
    - Simple in-memory user store; always-authenticate mode for demo
    - Provide a seeded customer with a delivered order for the demo flow
    - Register into DI composition root
    - _Requirements: 1.7_

- [ ] 7. Returns Facade, hero-path wiring, and seed data
  - [ ] 7.1 Implement ReturnsFacade (the application service)
    - `checkEligibility()`: validate ownership, check return window
    - `initiateReturn()`: create ReturnRequest in Initiated state, publish ReturnInitiated
    - `submitReason()`: validate and store reason + details
    - `submitMedia()`: accept media references, validate completeness
    - `completeMediaCapture()`: transition Initiated → MediaCaptured → Grading, trigger grading
    - `getReturnById()`: return read-only projection
    - _Requirements: 1.1, 1.7, 2.3, 3.6, 15.1, 15.7_

  - [ ] 7.2 Wire the full event-driven hero path end-to-end
    - ReturnsFacade → publishes ReturnInitiated → GradingOrchestrator subscribes → grades → publishes ItemGraded → DispositionOrchestrator subscribes → routes → publishes DispositionAssigned → ReturnsFacade subscribes → transitions state
    - For instant_match route: state → AwaitingPickup, publish DeliveryJobCreated
    - For list_for_resale route: state → Listed, publish ListingRequested
    - For returnless_refund/donate: state → Completed, publish ReturnCompleted
    - For manual_inspection: state → ManualReview, publish ManualReviewInitiated + DeliveryJobCreated
    - Verify the full chain executes with mock adapters and in-memory repos
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 14.2, 14.4_

  - [ ] 7.3 Finalize DI composition root wiring
    - Now that all modules exist, complete the composition root wiring: event bus subscriptions, facade → orchestrator → adapter dependencies
    - Verify all registrations are complete and the system boots without errors
    - _Requirements: 16.5_

  - [ ] 7.4 Seed demo data (product, order, customer, demand signal)
    - Create a seeded product with catalog image (for identity verification)
    - Create a seeded delivered order owned by the demo customer
    - Create a seeded nearby buyer demand signal (for instant_match path)
    - Create seeded item IDs that map to specific mock grades (A, B, C, D)
    - Load seed data on application startup
    - _Requirements: 16.3, 16.4, 10.3_

- [ ] 8. API layer for the demo
  - [ ] 8.1 Implement Express/Fastify API routes for the return flow
    - POST /returns — initiate a return (eligibility + creation)
    - POST /returns/:id/reason — submit reason
    - POST /returns/:id/media — submit media references
    - POST /returns/:id/complete-capture — trigger grading
    - GET /returns/:id — get return status, assessment, disposition
    - GET /returns/:id/progress — grading progress (mock step progression)
    - Wire routes to ReturnsFacade via DI
    - _Requirements: 1.5, 8.1, 8.4, 12.3_

- [ ] 9. React frontend — hero-path screens
  - [ ] 9.1 Scaffold React app shell and routing
    - Set up React Router with routes for the return flow
    - Create a minimal storefront shell (static nav, stub order-detail page with "Return" button)
    - Mobile-first responsive layout, WCAG AA basics (contrast, focus states, alt text)
    - _Requirements: 1.5_

  - [ ] 9.2 Build the eligibility result screen
    - Display product image, name, order date alongside eligibility status
    - Show remaining days in return window or "no longer eligible" message
    - Error state with retry option if policy retrieval fails
    - _Requirements: 1.2, 1.3, 1.4, 1.6_

  - [ ] 9.3 Build the reason picker screen
    - 6 mutually exclusive reason options (single selection)
    - Free-text input field (1–500 chars, trimmed) shown after selection
    - Inline validation: disable "Next" until a reason is selected
    - Allow changing selection and editing/clearing free-text before proceeding
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [ ] 9.4 Build the guided media capture screen
    - Progressive disclosure: one capture slot at a time (front → back → closeup → video)
    - On-screen framing guides for each slot showing where to position the item
    - Camera-capture and upload-from-gallery toggle/button per slot
    - Retake button for each captured photo before proceeding to next
    - File format/size validation with user-friendly error messages
    - Network error resilience: retain previous captures, allow retry of failed upload
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9_

  - [ ] 9.5 Build the live grading progress screen
    - Show 3–6 named progress steps ("Verifying item…", "Assessing condition…", "Checking for defects…", "Almost done…")
    - Advance steps as sub-step completion events arrive (≤5s between steps)
    - Skeleton loaders / optimistic UI: keep surrounding elements interactive (no full-screen block)
    - 10s delay message: "Taking a bit longer… you can retry or keep waiting" (no data loss)
    - On completion: replace progress with grade, identity verdict, and refund estimate within 1s
    - On failure: show friendly message ("Your return has been submitted, we'll review within 24h") + allow navigation away
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.3, 9.4_

  - [ ] 9.6 Build the disposition result screen (refund estimate + explanation)
    - Display refund estimate with currency symbol and amount, positioned above pickup/action controls
    - Display plain-language explanation alongside refund estimate
    - Pickup scheduling controls disabled until refund estimate is displayed
    - Error state if refund estimate is unavailable (retry or proceed without)
    - _Requirements: 12.3, 12.4, 12.5, 13.3_

  - [ ] 9.7 Wire frontend to API and verify full hero-path flow in browser
    - Connect all screens to the API endpoints from task 8.1
    - Handle API errors gracefully in each screen
    - Verify the full flow works end-to-end in a browser: order detail → return button → eligibility → reason → capture → grading progress → disposition result
    - _Requirements: 1.5_

- [ ] 10. Checkpoint — Demo hero path works locally with UI
  - Ensure all tests pass, ask the user if questions arise.
  - At this point the full hero path (order detail → return → reason → media → grading progress → disposition result with refund + explanation) runs end-to-end in a browser, backed by mock adapters and in-memory repos, zero AWS credentials needed.

- [ ] 11. Core property-based tests and unit tests
  - [ ]* 11.1 Write property test for disposition chain correctness (Property 11)
    - **Property 11: Disposition Chain Produces Correct Route**
    - Generate random RoutingContexts with all combinations of grades, fraud scores, confidence levels, demand signals
    - Assert the chain always assigns the route matching the strict priority order
    - **Validates: Requirements 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.12**

  - [ ]* 11.2 Write property test for fraud score aggregation (Property 9)
    - **Property 9: Fraud Score Aggregation and Bounds**
    - Generate random combinations of identity verdicts, reconciliation statuses, claim counts, history counts
    - Assert: output in [0.0, 1.0]; mismatch → ≥ 0.9; missing signals → requires_manual_review set
    - **Validates: Requirements 7.1, 7.3, 7.6**

  - [ ]* 11.3 Write property test for state machine legal transitions (Property 14)
    - **Property 14: State Machine Enforces Legal Transitions**
    - Generate random (state, targetState) pairs from all possible combinations
    - Assert: legal transitions succeed; illegal transitions preserve state and return error
    - **Validates: Requirements 14.2, 14.3**

  - [ ]* 11.4 Write unit tests for mock adapters and reason-aware refund
    - Test MockConditionGrader returns correct grades for each seeded item
    - Test MockIdentityVerifier returns correct verdicts for each seeded photo set
    - Test MockReasonParser extracts claims and reconciles correctly
    - Test refund calculation: fault reasons → 100%, choice reasons → route percentage
    - Test isMinimumGuarantee flag logic
    - **Validates: Requirements 16.3, 16.4, 16.6, 12.2, 11.3**

- [ ] 12. Checkpoint — Tests pass, demo path verified
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Bedrock live adapter (priority AWS task for real demo grading)
  - [ ] 13.1 Implement BedrockConditionGraderAdapter
    - Implements `IConditionGrader` using Amazon Bedrock (Claude or Nova multimodal model)
    - Send photos as images to the model; extract representative frames from the video (e.g., 3–5 evenly-spaced frames) and send them as additional images, since Bedrock multimodal models accept images but not raw video
    - Structured prompt requesting grade, defects, reasoning, confidence
    - Parse model response into `ConditionGradeResult`
    - Handle Bedrock API errors gracefully (timeout, throttling)
    - _Requirements: 5.1, 16.1_

  - [ ] 13.2 Implement BedrockIdentityVerifierAdapter
    - Implements `IIdentityVerifier` using Amazon Bedrock multimodal
    - Compare submitted photos against catalog image with a prompt for verdict + confidence
    - Parse model response into `IdentityVerificationResult`
    - _Requirements: 4.1, 16.2_

  - [ ] 13.3 Implement BedrockReasonParserAdapter
    - Implements `IReasonParser` using Amazon Bedrock text model
    - Send free-text + observed defects to extract claims and reconcile
    - Parse response into `ReasonReconciliation`
    - _Requirements: 6.1, 6.2_

  - [ ] 13.4 Add configuration toggle to swap between Mock and Bedrock adapters
    - Update DI composition root to read adapter selection from config/env
    - When BEDROCK_ENABLED=true, inject Bedrock adapters; else inject mocks
    - _Requirements: 16.5_

- [ ] 14. Final checkpoint — End-to-end demo runs with mock or Bedrock
  - Ensure all tests pass, ask the user if questions arise.
  - Demo can run fully local (mock) or with Bedrock for real AI grading by setting one env var.

- [ ] 15. Optional/Stretch — Remaining PBT suite
  - [ ]* 15.1 Write property test for eligibility calculation (Property 1)
    - **Property 1: Return Eligibility Calculation Correctness**
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 15.2 Write property test for free-text validation (Property 3)
    - **Property 3: Free-Text Reason Validation and Normalization**
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 15.3 Write property test for media completeness (Property 4)
    - **Property 4: Media Completeness Check**
    - **Validates: Requirements 3.1, 3.6, 3.8**

  - [ ]* 15.4 Write property test for identity-drives-fraud-score (Property 5)
    - **Property 5: Identity Verdict Drives Fraud Score Component**
    - **Validates: Requirements 4.3, 4.4, 4.5**

  - [ ]* 15.5 Write property test for grading failure fallback (Property 7)
    - **Property 7: Grading Failure Produces Valid Fallback**
    - **Validates: Requirements 5.6, 9.1, 9.2**

  - [ ]* 15.6 Write property test for reason reconciliation (Property 8)
    - **Property 8: Reason Reconciliation Verdict Logic**
    - **Validates: Requirements 6.2, 6.3, 6.4**

  - [ ]* 15.7 Write property test for fraud threshold event (Property 10)
    - **Property 10: Fraud Threshold Event Publication**
    - **Validates: Requirements 7.2, 7.5**

  - [ ]* 15.8 Write property test for refund estimate calculation (Property 12)
    - **Property 12: Reason-Aware Refund Estimate Calculation**
    - **Validates: Requirements 12.2, 11.3**

  - [ ]* 15.9 Write property test for explanation format invariants (Property 13)
    - **Property 13: Explanation Format Invariants**
    - **Validates: Requirements 13.1, 13.2, 13.4, 13.5**

  - [ ]* 15.10 Write property test for state-transition events (Property 15)
    - **Property 15: State Transition Publishes Correct Domain Event**
    - **Validates: Requirements 14.4, 14.5**

  - [ ]* 15.11 Write property test for idempotent event processing (Property 16)
    - **Property 16: Idempotent Event Processing**
    - **Validates: Requirements 15.11**

- [ ] 16. Optional/Stretch — Event bus retry/alert machinery
  - [ ]* 16.1 Implement ack-timeout, 3-retry, and system alert on event delivery failure
    - Add 5s acknowledgment timeout to InProcessEventBus
    - Retry delivery up to 3 times on non-acknowledgment
    - Emit system alert with event ID and subscriber on final failure
    - _Requirements: 15.7_

- [ ] 17. Optional/Stretch — AWS adapters (EventBridge, DynamoDB, S3, Cognito)
  - [ ]* 17.1 Implement EventBridgeAdapter (IEventBus → Amazon EventBridge)
    - Publish domain events as EventBridge entries with detail-type matching event type
    - Subscribe via EventBridge rules + Lambda targets
    - _Requirements: 15.1_

  - [ ]* 17.2 Implement DynamoDB repositories (ReturnRequest, ConditionAssessment, DispositionDecision, AuditLog)
    - Implement all repository interfaces against DynamoDB tables per the design's table schemas
    - Use conditional writes for idempotency and uniqueness enforcement
    - _Requirements: 14.5, 15.11_

  - [ ]* 17.3 Implement S3MediaStorageAdapter (IMediaStorage → Amazon S3)
    - Generate presigned upload/download URLs
    - Validate file format and size on upload completion
    - _Requirements: 3.8_

  - [ ]* 17.4 Implement CognitoAuthAdapter (mock auth → Amazon Cognito)
    - Verify JWT tokens from Cognito user pool
    - Map Cognito user to customer ID for ownership checks
    - _Requirements: 1.7_

  - [ ]* 17.5 Implement Step Functions adapter (mirrors in-process state machine)
    - Define the ReturnRequest lifecycle as a Step Functions state machine
    - Adapter translates state-machine transitions to Step Functions task tokens
    - _Requirements: 14.1, 14.2_

  - [ ]* 17.6 Create CDK stack defining all AWS resources
    - DynamoDB tables, S3 bucket, EventBridge bus, Cognito user pool, Lambda functions, API Gateway, Step Functions state machine
    - Configurable via CDK context for dev/staging/prod
    - _Requirements: 16.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP/demo
- The hero path (tasks 1–10) delivers a fully working local demo WITH a React UI and zero AWS dependencies
- Task 13 (Bedrock) is the priority AWS integration — enables real AI grading in the demo
- Tasks 15–17 are stretch goals after the demo works end-to-end
- Event bus retry machinery (R15.7) is intentionally deferred to stretch; log-on-failure is sufficient for demo
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The DI composition root (1.5) is an incrementally-filled registry; final wiring in 7.3 after all modules exist
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
- Bedrock adapter (13.1) extracts frames from video since Bedrock multimodal does not accept raw video

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "2.1", "2.3", "2.4"] },
    { "id": 3, "tasks": ["2.2", "3.1", "4.1", "4.2", "4.3", "4.4", "6.1", "6.2", "6.3", "6.4"] },
    { "id": 4, "tasks": ["4.5", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 6, "tasks": ["5.5", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 10, "tasks": ["9.7"] },
    { "id": 11, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 12, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 13, "tasks": ["13.4"] },
    { "id": 14, "tasks": ["15.1", "15.2", "15.3", "15.4", "15.5", "15.6", "15.7", "15.8", "15.9", "15.10", "15.11", "16.1"] },
    { "id": 15, "tasks": ["17.1", "17.2", "17.3", "17.4", "17.5"] },
    { "id": 16, "tasks": ["17.6"] }
  ]
}
```
