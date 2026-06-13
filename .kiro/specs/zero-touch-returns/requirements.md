# Requirements Document

## Introduction

Zero-Touch Returns is the core differentiating feature of the Second Life Commerce platform. It moves item grading and disposition from a warehouse (days/weeks later) to the customer's phone at the moment they tap "Return." The feature encompasses three tightly integrated subsystems: return initiation (item selection, reason capture, guided media capture), AI-powered grading (identity verification, condition assessment, defect detection, reason parsing), and the Disposition Engine (instant routing decision, refund estimate, plain-language explanation). The system operates behind adapter interfaces with deterministic mocks so that it runs without live API keys.

## Glossary

- **Returns_Module**: The module responsible for orchestrating the return initiation flow, collecting customer input, and managing the ReturnRequest lifecycle state machine.
- **Grading_Module**: The module responsible for AI-powered condition assessment, identity verification, defect detection, and reason parsing. Communicates via the IConditionGrader and IIdentityVerifier adapter interfaces.
- **Disposition_Engine**: The module that receives a graded item and applies an ordered chain of routing handlers (Strategy + Chain of Responsibility) to determine the item's next life.
- **ReturnRequest**: The domain entity representing a customer's return, with a state machine lifecycle: Initiated → MediaCaptured → Grading → Graded → DispositionAssigned → AwaitingPickup → Completed (with additional paths: DispositionAssigned → Completed for no-pickup routes, DispositionAssigned → Listed for hold-at-home resale, and side-branch: Cancelled). On any uncertainty (identity inconclusive, low confidence, unparseable reason, or grading failure), the item still proceeds to the Graded state carrying a requires_manual_review flag, and the Disposition_Engine assigns the manual-inspection route — there is no separate ManualReview state transition from Grading.
- **Manual_Inspection_Route**: A disposition route assigned by the Disposition_Engine when the ConditionAssessment carries a requires_manual_review flag, a low confidence score, or a high fraud score. The item reaches DispositionAssigned and is routed to the warehouse for manual inspection. This is distinct from the ManualReview state, which is entered only post-disposition (from Graded or DispositionAssigned) when an admin or fraud review overrides the automated decision.
- **ConditionAssessment**: The output of AI grading — includes grade (A/B/C/D), defects list, identity match verdict, confidence score, fraud score, and reasoning text.
- **DispositionDecision**: The output of the Disposition Engine — includes the routing choice, refund estimate, and a plain-language explanation sentence.
- **IConditionGrader**: The adapter interface for condition grading. Implementations include a live AI provider and a deterministic mock.
- **IIdentityVerifier**: The adapter interface for verifying that submitted photos match the catalog item. Implementations include a live AI provider and a deterministic mock.
- **Return_Window**: The configurable time period after delivery during which a customer may initiate a return for a given item category.
- **Confidence_Score**: A numeric value (0.0–1.0) representing how certain the AI grading system is about its assessment.
- **Fraud_Score**: A numeric value (0.0–1.0) representing the likelihood that a return is fraudulent, derived from identity mismatch, reason inconsistency, and return history.
- **Instant_Match**: A disposition route where a Grade A item is shipped directly to a nearby buyer, bypassing the warehouse.
- **Returnless_Refund**: A disposition route where the customer keeps the item and receives a refund, applied to low-value items with Grade C/D.
- **Event_Bus**: The internal pub-sub mechanism through which modules communicate via domain events without importing each other's internals.
- **Customer**: The user role initiating a return from a delivered order.

## Requirements

### Requirement 1: Return Eligibility Check

**User Story:** As a Customer, I want to see immediately whether my delivered item is eligible for return, so that I do not waste time on an ineligible request.

#### Acceptance Criteria

1. WHEN a Customer selects "Return" on a delivered order item, THE Returns_Module SHALL retrieve the item's return policy and calculate whether the current date falls within the configured Return_Window, measured from the item's delivery date, and display the eligibility result within 2 seconds.
2. WHEN the eligibility check determines the current date is within the Return_Window for the selected item, THE Returns_Module SHALL display the item as eligible with the number of remaining days in the Return_Window and allow the Customer to proceed with the return flow.
3. IF the current date is past the Return_Window for the selected item, THEN THE Returns_Module SHALL display a message stating the item is no longer eligible for return and provide the policy expiration date.
4. THE Returns_Module SHALL display the product image, name, and order date alongside the eligibility status so the Customer can confirm the correct item without recalling order identifiers.
5. WHEN a Customer navigates from an order detail to begin the return flow (reaching the first step of the return initiation), THE Returns_Module SHALL require no more than 3 taps.
6. IF the return policy cannot be retrieved due to a service or configuration error, THEN THE Returns_Module SHALL display an error message indicating the eligibility check is temporarily unavailable and offer the Customer an option to retry.
7. WHEN a Customer initiates a return, THE Returns_Module SHALL verify that the requesting Customer owns the referenced order-item before allowing the return flow to proceed, and IF the Customer does not own the order-item, THEN THE Returns_Module SHALL reject the request and display an error indicating the item does not belong to the Customer's account.

### Requirement 2: Return Reason Selection

**User Story:** As a Customer, I want to select a structured reason for my return and optionally add details, so that the system has context to grade the item accurately.

#### Acceptance Criteria

1. WHEN a Customer proceeds past the eligibility check, THE Returns_Module SHALL present a structured reason picker with exactly these mutually exclusive options (single selection only): defective, damaged in transit, wrong item, size/fit, not as described, changed mind.
2. WHEN a Customer selects a reason, THE Returns_Module SHALL display a free-text input field allowing the Customer to optionally enter additional details, accepting between 1 and 500 characters (leading and trailing whitespace trimmed before validation and storage; a whitespace-only entry is treated as empty).
3. WHEN the Customer confirms their reason selection and optional details, THE Returns_Module SHALL store the selected structured reason and the trimmed free-text input (or null if not provided) as part of the ReturnRequest entity.
4. IF the Customer has not selected a reason, THEN THE Returns_Module SHALL disable the navigation control to the media capture step and display an inline validation message indicating that a reason selection is required.
5. WHEN a Customer has already selected a reason but has not yet proceeded to the media capture step, THE Returns_Module SHALL allow the Customer to change their selected reason and edit or clear the free-text details.

### Requirement 3: Guided Media Capture

**User Story:** As a Customer, I want clear guidance on what photos and video to capture, so that the AI can accurately grade my item without requiring additional input later.

#### Acceptance Criteria

1. WHEN a Customer proceeds past reason selection, THE Returns_Module SHALL present a guided media capture flow requesting exactly 3 photos (front view, back view, defect or label close-up) and one video of 5 to 30 seconds in duration.
2. THE Returns_Module SHALL display on-screen framing guides for each photo and video step, showing the Customer where to position the item.
3. WHEN a Customer captures a photo, THE Returns_Module SHALL allow the Customer to retake that photo before proceeding to the next capture step.
4. THE Returns_Module SHALL present one capture request at a time using progressive disclosure, not all four simultaneously.
5. THE Returns_Module SHALL provide both a camera-capture option and an upload-from-gallery option for each media slot, allowing the Customer to select either method via an explicit on-screen toggle or button.
6. WHEN a Customer has completed all required media captures (3 photos and 1 video), THE Returns_Module SHALL transition the ReturnRequest state from Initiated to MediaCaptured.
7. IF a captured photo is detected as too blurry or too dark to be usable, THEN THE Returns_Module SHALL prompt the Customer to retake that specific photo with a message explaining the detected issue.
8. THE Returns_Module SHALL accept photos in JPEG or PNG format up to 10 MB each and video in MP4 or MOV format up to 50 MB, and IF a file exceeds these limits or is in an unsupported format, THEN THE Returns_Module SHALL reject the file and display a message indicating the accepted formats and size limits.
9. IF a media upload fails due to a network error, THEN THE Returns_Module SHALL retain any previously captured media, display a message indicating the failure, and allow the Customer to retry the failed upload without restarting the capture flow.

### Requirement 4: Identity Verification

**User Story:** As the platform, I want to verify that the photos show the actual item from the order, so that fraudulent returns (wrong item, empty box) are detected.

#### Acceptance Criteria

1. WHEN the ReturnRequest transitions to the Grading state, THE Grading_Module SHALL invoke the IIdentityVerifier adapter to compare submitted photos against the catalog product image for the ordered item.
2. WHEN the IIdentityVerifier adapter completes comparison, THE adapter SHALL return a verdict of genuine, mismatch, or inconclusive, along with a confidence score between 0.0 and 1.0.
3. WHEN the IIdentityVerifier returns a verdict of mismatch with a confidence score above 0.8, THE Grading_Module SHALL set the Fraud_Score to a value of 0.75 or above (on a 0.0 to 1.0 scale) and include "identity mismatch" in the assessment reasoning.
4. WHEN the IIdentityVerifier returns a verdict of genuine with a confidence score above 0.8, THE Grading_Module SHALL set the Fraud_Score to 0.1 or below for the identity component and proceed to condition grading without flagging identity fraud.
5. WHEN the IIdentityVerifier returns a verdict of inconclusive or a confidence score of 0.8 or below for any verdict, THE Grading_Module SHALL set the identity verdict to inconclusive, include "identity inconclusive" in the assessment reasoning, and set a requires_manual_review flag on the ConditionAssessment. The item SHALL still proceed to the Graded state so the Disposition_Engine can assign the manual-inspection route.
6. IF the IIdentityVerifier adapter fails to respond within 5 seconds or returns an error, THEN THE Grading_Module SHALL set the identity verdict to inconclusive, set a requires_manual_review flag on the ConditionAssessment, and proceed with condition grading. The item SHALL still advance to the Graded state so the Disposition_Engine can route it to manual inspection.
7. THE Grading_Module SHALL include a deterministic mock implementation of IIdentityVerifier that returns genuine for items whose seeded photo set matches the catalog image, mismatch for items whose seeded photo set depicts a different product, and inconclusive for items with ambiguous seeded data, each with a fixed confidence score of 0.95.

### Requirement 5: Condition Grading

**User Story:** As the platform, I want to assign a condition grade to the returned item based on its photos, so that the Disposition Engine can route it to the appropriate next life.

#### Acceptance Criteria

1. WHEN the ReturnRequest is in the Grading state, THE Grading_Module SHALL invoke the IConditionGrader adapter to assess the item's physical condition from the submitted photos and video, and SHALL complete the assessment within 10 seconds of invocation.
2. THE IConditionGrader adapter SHALL return a grade of A (like-new), B (good with minor wear), C (fair with visible damage), or D (poor/non-functional), along with a text explanation of the reasoning no longer than 500 characters.
3. THE IConditionGrader adapter SHALL return a list of up to 10 detected defects, each with a location description and a severity classification of minor, moderate, or severe.
4. THE Grading_Module SHALL include a deterministic mock implementation of IConditionGrader that returns predictable grades based on seeded test data, enabling the system to run without live AI API keys.
5. THE ConditionAssessment entity SHALL include the grade, defects list, reasoning text, and a confidence score between 0.0 and 1.0.
6. IF the IConditionGrader adapter fails to return a result within 10 seconds or returns an error, THEN THE Grading_Module SHALL retry the invocation once after a configurable delay (default 2 seconds), and IF the retry also fails, THEN THE Grading_Module SHALL produce a fallback ConditionAssessment (confidence 0.0, no grade, requires_manual_review flag set) and publish an ItemGraded event so the item proceeds to the Graded state and the Disposition_Engine assigns the manual-inspection route. A grading timeout SHALL NOT publish a FraudFlagged event, since a timeout is not indicative of fraud. See Requirement 9 for the complete grading-failure handling including customer messaging.
7. WHEN the Grading_Module receives a successful ConditionAssessment, THE Grading_Module SHALL publish an ItemGraded domain event containing the ReturnRequest identifier and the complete ConditionAssessment.

### Requirement 6: Reason Parsing and Reconciliation

**User Story:** As the platform, I want to parse the customer's free-text reason and reconcile it with what the photos show, so that inconsistencies contributing to fraud detection are surfaced.

#### Acceptance Criteria

1. WHEN the Customer has provided free-text in the return reason (up to 500 characters), THE Grading_Module SHALL parse the free-text to extract one or more structured claims, each categorized by claim type (e.g., damage description, missing component, cosmetic issue, functional defect) and the item area referenced.
2. WHEN structured claims have been extracted from the free-text, THE Grading_Module SHALL compare each parsed claim against the defects and condition observed in the photos and produce a per-claim verdict of "supported," "unsupported," or "inconclusive."
3. WHEN the parsed reason conflicts with the photographic evidence (for example, Customer claims "screen cracked" but photos show an intact screen), THE Grading_Module SHALL flag a reason mismatch and increase the Fraud_Score by a configurable increment (default: 0.15) for each unsupported claim.
4. THE ConditionAssessment entity SHALL include a reconciliation summary indicating whether the stated reason aligns with (all claims supported), partially aligns with (at least one claim supported and at least one unsupported or inconclusive), or contradicts (no claims supported) the photographic evidence.
5. IF the Grading_Module fails to parse the free-text or produces no extractable claims, THEN THE Grading_Module SHALL record the reconciliation status as "unparseable," retain the raw free-text in the ConditionAssessment, and set a requires_manual_review flag on the ConditionAssessment without increasing the Fraud_Score. The item SHALL still proceed to the Graded state so the Disposition_Engine can assign the manual-inspection route.

### Requirement 7: Fraud and Anomaly Detection

**User Story:** As the platform, I want to aggregate identity mismatch, reason inconsistency, and return-history signals into a fraud score, so that suspicious returns are flagged before a refund is issued.

#### Acceptance Criteria

1. THE Grading_Module SHALL compute a Fraud_Score between 0.0 and 1.0 for each ReturnRequest by combining the identity verification confidence, reason reconciliation result, and the Customer's return-history frequency (defined as the number of returns initiated within the past 90 days).
2. WHEN the computed Fraud_Score exceeds a configurable threshold (default 0.7), THE Grading_Module SHALL include a fraud anomaly signal in the ConditionAssessment and publish a FraudFlagged domain event on the Event_Bus.
3. WHEN the identity verification returns a verdict of mismatch (the "box of rocks" scenario), THE Grading_Module SHALL set the Fraud_Score to at least 0.9 regardless of other signals.
4. THE Grading_Module SHALL not block the return flow for the Customer when a fraud signal is detected; the signal is consumed downstream by the Disposition_Engine and Admin module.
5. IF the Fraud_Score is exactly equal to the configurable threshold (default 0.7), THEN THE Grading_Module SHALL treat it as exceeding the threshold and publish the FraudFlagged event.
6. IF any input signal (identity verification, reason reconciliation, or return-history) is unavailable due to a service failure, THEN THE Grading_Module SHALL compute the Fraud_Score using the remaining available signals, set a requires_manual_review flag on the ConditionAssessment indicating which signal was missing, and proceed to publish the ItemGraded event so the Disposition_Engine can assign the manual-inspection route.

### Requirement 8: AI Grading Progress Visibility

**User Story:** As a Customer, I want to see live progress during AI grading, so that I know the system is working and I am not left staring at a frozen screen.

#### Acceptance Criteria

1. WHILE the ReturnRequest is in the Grading state, THE Returns_Module SHALL display a progress indicator showing a minimum of 3 and a maximum of 6 named steps (for example: "Verifying item…", "Assessing condition…", "Checking for defects…", "Almost done…"), with no more than 5 seconds elapsing between visible step transitions.
2. WHEN a grading sub-step completes, THE Returns_Module SHALL advance the progress indicator to the next named step within 1 second of receiving the sub-step completion event.
3. WHILE the ReturnRequest is in the Grading state, THE Returns_Module SHALL keep all surrounding page elements interactive and navigable, using skeleton loaders or optimistic UI patterns so that no user action is blocked by the asynchronous grading call.
4. WHEN grading completes successfully, THE Returns_Module SHALL replace the progress indicator with the grading result (grade, identity verdict, and refund estimate) within 1 second of the final sub-step completing.
5. IF no progress update is received for more than 10 seconds during grading, THEN THE Returns_Module SHALL display a message indicating a delay and offer the customer an option to retry or continue waiting without losing any previously captured return data.

### Requirement 9: AI Grading Failure Fallback

**User Story:** As a Customer, I want a graceful experience if the AI grading service is unavailable, so that my return is not lost and I receive clear next steps.

#### Acceptance Criteria

1. IF the IConditionGrader adapter call fails (timeout exceeding 10 seconds, network error, or HTTP 5xx service error), THEN THE Grading_Module SHALL retry the call once after a configurable delay (default 2 seconds).
2. IF the retry also fails, THEN THE Grading_Module SHALL produce a fallback ConditionAssessment with confidence score 0.0, no grade, and a requires_manual_review flag. THE Grading_Module SHALL then publish an ItemGraded event containing this fallback assessment so the item proceeds to the Graded state and the Disposition_Engine assigns the manual-inspection route. A grading failure SHALL NOT publish a FraudFlagged event.
3. IF grading fails, THEN THE Returns_Module SHALL confirm the return as submitted and display a message to the Customer indicating that automatic assessment could not be completed, the return has been submitted, and their request will be manually reviewed within a stated timeframe (configurable, default 24 hours).
4. IF grading fails, THEN THE Returns_Module SHALL allow the Customer to navigate away from the return flow without waiting for grading resolution.
5. IF the IIdentityVerifier adapter call fails (timeout exceeding 10 seconds, network error, or HTTP 5xx service error) while the IConditionGrader call succeeds, THEN THE Grading_Module SHALL retry the IIdentityVerifier call once after a configurable delay (default 2 seconds), and IF the retry also fails, THEN THE Grading_Module SHALL proceed with condition grading alone, set the identity verdict to inconclusive, and set a requires_manual_review flag on the ConditionAssessment.
6. IF both the IConditionGrader and IIdentityVerifier adapter calls fail after their respective retries, THEN THE Grading_Module SHALL produce a fallback ConditionAssessment with confidence score 0.0, no grade, and requires_manual_review flags for both condition and identity, and SHALL publish an ItemGraded event so the Disposition_Engine assigns the manual-inspection route.

### Requirement 10: Disposition Engine Routing Decision

**User Story:** As the platform, I want to instantly determine the best next life for a graded returned item, so that recovery value is maximized and reverse-logistics cost is minimized.

#### Acceptance Criteria

1. WHEN the Grading_Module publishes an ItemGraded domain event, THE Disposition_Engine SHALL consume the event and evaluate the item through an ordered chain of routing handlers within 2 seconds, where the chain is evaluated in the following priority order: manual-review flag check first, then fraud check, then low-confidence check, then grade-A with nearby demand, then grade-A without demand, then grade-B, then grade-C/D by value.
2. THE Disposition_Engine SHALL use the following inputs to determine the route: condition grade (A/B/C/D or null for fallback assessments), item monetary value in ₹, local buyer demand signal (defined as an active buyer order or wishlist entry for the same SKU within the search radius), distance to potential buyers in km, Fraud_Score (a value from 0.0 to 1.0), and the requires_manual_review flag.
3. WHEN the ConditionAssessment carries a requires_manual_review flag (due to identity inconclusive, unparseable reason, missing fraud signal, or grading failure), THE Disposition_Engine SHALL assign the "route to warehouse for manual inspection" route regardless of grade or other inputs.
3. WHEN the grade is A and a buyer with matching demand (active order or wishlist for the same SKU) exists within a configurable distance radius (default 25 km), THE Disposition_Engine SHALL assign the Instant_Match route (ship direct to the nearby buyer, bypassing the warehouse).
4. WHEN the grade is A and no buyer demand exists within the configured distance radius, THE Disposition_Engine SHALL assign the "list for resale, hold-at-home" route.
5. WHEN the grade is B, THE Disposition_Engine SHALL assign the "route to refurbishment partner" route.
6. WHEN the grade is C or D and the item value is below a configurable threshold (default ₹500), THE Disposition_Engine SHALL assign the Returnless_Refund route ("keep it and receive a refund").
7. WHEN the grade is C or D and the item value is at or above the returnless threshold, THE Disposition_Engine SHALL assign the "donate or recycle" route.
8. IF the Fraud_Score meets or exceeds the configurable fraud threshold (default 0.7 on the 0.0–1.0 scale), THEN THE Disposition_Engine SHALL override all other routing and assign the "route to warehouse for manual inspection" route, regardless of grade.
9. THE Disposition_Engine SHALL implement each routing option as a separate Strategy, allowing new routes to be added without modifying existing handlers.
10. THE Disposition_Engine SHALL implement the decision evaluation as a Chain of Responsibility, where each handler either makes a decision or passes to the next handler in the chain.
11. IF no handler in the chain claims the item, THEN THE Disposition_Engine SHALL assign a default "route to warehouse for manual inspection" route and publish a DispositionAssigned event indicating a fallback was triggered.
12. IF a required input (demand signal or distance data) is unavailable due to a service failure, THEN THE Disposition_Engine SHALL proceed with evaluation using the remaining available inputs, treating the unavailable input as non-matching (no nearby demand, infinite distance), and log the degraded evaluation.
13. WHEN the Disposition_Engine assigns a route, THE Disposition_Engine SHALL produce a DispositionDecision containing the assigned route identifier, the refund estimate in ₹, and a one-sentence plain-language explanation of the routing reason.

### Requirement 11: Low-Confidence Grade Handling

**User Story:** As the platform, I want to handle cases where the AI grading confidence is too low to make an automated routing decision, so that items are not misrouted based on uncertain assessments.

#### Acceptance Criteria

1. WHEN the ConditionAssessment confidence score (range 0.0 to 1.0) is below a configurable threshold (default 0.6) and the requires_manual_review flag is not already set, THE Disposition_Engine SHALL assign the "route to warehouse for manual inspection" route regardless of the reported grade.
2. WHEN a low-confidence assessment triggers manual inspection routing, THE Disposition_Engine SHALL include a plain-language explanation indicating that the item requires manual inspection due to insufficient grading confidence in the disposition explanation shown to the Customer.
3. WHEN an item is routed to manual inspection due to low confidence, THE Disposition_Engine SHALL provide a refund estimate to the Customer based on the lowest-refund-amount tier applicable to the item's category and value, displayed before pickup is scheduled.
4. IF the confidence score is exactly equal to the configured threshold, THEN THE Disposition_Engine SHALL treat the assessment as sufficient confidence and proceed with normal disposition routing based on the reported grade.

### Requirement 12: Instant Refund Estimate

**User Story:** As a Customer, I want to see my estimated refund amount immediately after grading completes, so that I can make an informed decision before pickup is scheduled.

#### Acceptance Criteria

1. WHEN the Disposition_Engine assigns a route, THE Disposition_Engine SHALL compute a refund estimate within 2 seconds based on the item's original price, the assigned route, and the condition grade.
2. THE Disposition_Engine SHALL compute the refund estimate using configurable refund-percentage rules per route (for example: Instant_Match and Returnless_Refund yield 100% refund, refurbishment route yields 80%). For routes where the final refund is not predetermined, the estimate SHALL display a specific minimum guaranteed percentage with a qualifier (for example: "up to ₹1,299 — final amount confirmed after review").
3. WHEN the refund estimate is computed, THE Returns_Module SHALL display the estimate on-device with the currency symbol and numeric amount, positioned above any pickup scheduling controls, before the Customer can confirm or schedule a pickup.
4. IF the Disposition_Engine cannot compute a refund estimate due to missing price data or an unrecognized route, THEN THE Returns_Module SHALL display an error message indicating that the estimate is temporarily unavailable and provide the Customer with the option to proceed without an estimate or to retry.
5. WHILE the refund estimate has not yet been displayed to the Customer, THE Returns_Module SHALL keep pickup scheduling controls disabled.

### Requirement 13: Plain-Language Disposition Explanation

**User Story:** As a Customer, I want a one-sentence plain-language explanation of why my return is being handled in a particular way, so that I trust the process and understand what happens next.

#### Acceptance Criteria

1. WHEN the Disposition_Engine assigns a route, THE Disposition_Engine SHALL generate a single-sentence plain-language explanation that contains both the reason for the routing decision and the immediate next step for the customer, not exceeding 160 characters in length.
2. THE Disposition_Engine SHALL use customer-friendly language and SHALL NOT include internal system identifiers, module names, route codes, raw grade labels (e.g., "Grade A"), confidence scores, or any term not found in common consumer vocabulary.
3. WHEN the Disposition_Engine assigns a disposition, THE Returns_Module SHALL display the plain-language explanation alongside the refund estimate within 2 seconds of the disposition being assigned.
4. IF the disposition route is manual inspection (due to fraud flag or confidence score below the configured threshold), THEN THE Disposition_Engine SHALL generate an explanation that states a team review is required and includes an expected response timeframe, without using words such as "fraud", "suspicious", "flagged", "violation", "denied", or "penalty".
5. WHEN the disposition route is manual inspection, THE Disposition_Engine SHALL include in the explanation a specific maximum review duration matching the configured SLA (for example: "within 24 hours").

### Requirement 14: ReturnRequest State Machine

**User Story:** As the platform, I want the ReturnRequest to follow a strict state machine with enforced legal transitions, so that the return lifecycle is predictable, auditable, and free of invalid state jumps.

#### Acceptance Criteria

1. THE Returns_Module SHALL model the ReturnRequest lifecycle as a state machine with these states: Initiated, MediaCaptured, Grading, Graded, DispositionAssigned, AwaitingPickup, Listed, Completed, Cancelled, ManualReview.
2. THE Returns_Module SHALL enforce these legal transitions: Initiated → MediaCaptured → Grading → Graded → DispositionAssigned → AwaitingPickup → Completed; DispositionAssigned → Completed (for no-pickup routes: Returnless_Refund, donate-via-keep); DispositionAssigned → Listed (for "list for resale, hold-at-home" route), triggered by publishing a ListingRequested event that the Marketplace module consumes; DispositionAssigned → AwaitingPickup (for pickup routes: Instant_Match, refurbishment), triggered by publishing a DeliveryJobCreated event that the Logistics module consumes; DispositionAssigned → ManualReview (for the manual-inspection warehouse route), triggered by publishing a ManualReviewInitiated event and a DeliveryJobCreated event so the item ships to the warehouse for human review; Listed → Completed (driven by ListingSold event from Marketplace); Initiated → Cancelled; MediaCaptured → Cancelled; AwaitingPickup → Cancelled; Graded → ManualReview (admin override before disposition); ManualReview → Graded (re-grade path); ManualReview → Cancelled (reject path).
3. IF a state transition is attempted that is not in the set of legal transitions, THEN THE Returns_Module SHALL reject the transition, preserve the current state unchanged, return an error indication specifying the current state and the attempted invalid target state, and log the invalid attempt.
4. WHEN a state transition occurs, THE Returns_Module SHALL publish domain events on the Event_Bus mapped as follows: Initiated → ReturnInitiated; Grading → Graded triggers ItemGraded; Graded → DispositionAssigned triggers DispositionAssigned; DispositionAssigned → AwaitingPickup triggers DeliveryJobCreated; DispositionAssigned → Listed triggers ListingRequested; DispositionAssigned → ManualReview triggers ManualReviewInitiated and DeliveryJobCreated (both events published for manual-inspection route so the item ships to warehouse); Graded → ManualReview triggers ManualReviewInitiated; transitions to Cancelled trigger ReturnCancelled; transitions to Completed trigger ReturnCompleted.
5. WHEN a state transition occurs, THE Returns_Module SHALL persist an audit record containing the ReturnRequest identifier, the previous state, the new state, a timestamp, and the actor or system trigger that caused the transition.
6. WHEN a ReturnRequest is in the Listed state, THE Returns_Module SHALL transition to Completed only upon receiving a ListingSold event from the Marketplace module (the Marketplace listing lifecycle is out of scope for this spec).
7. WHEN a Customer initiates a multi-item return, THE Returns_Module SHALL create one separate ReturnRequest per item, each following its own independent state machine lifecycle.
8. On any grading uncertainty (identity inconclusive, grading failure, unparseable reason, missing signal), the item SHALL still proceed through Grading → Graded → DispositionAssigned via the Disposition_Engine's manual-inspection route, and the Returns_Module SHALL then transition to ManualReview (emitting ManualReviewInitiated + DeliveryJobCreated). The item SHALL NOT transition directly from Grading to ManualReview.

### Requirement 15: Module Communication via Events and Facades

**User Story:** As the platform, I want modules to communicate only through domain events and facade interfaces, so that the system remains loosely coupled and independently testable.

#### Acceptance Criteria

1. WHEN a return is successfully initiated with all media captured, THE Returns_Module SHALL publish a ReturnInitiated event on the Event_Bus containing the ReturnRequest ID, customer ID, order-item reference, reason code, and media reference list.
2. WHEN a ReturnInitiated event is received from the Event_Bus, THE Grading_Module SHALL begin grading within 1 second of receipt without importing any internal class from the Returns_Module.
3. WHEN grading is complete, THE Grading_Module SHALL publish an ItemGraded event on the Event_Bus containing the ReturnRequest ID, grade (A/B/C/D), defect descriptions, identity-match verdict, confidence score, and fraud score.
4. WHEN an ItemGraded event is received from the Event_Bus, THE Disposition_Engine SHALL begin routing within 1 second of receipt without importing any internal class from the Grading_Module.
5. WHEN a routing decision is made, THE Disposition_Engine SHALL publish a DispositionAssigned event on the Event_Bus containing the ReturnRequest ID, disposition route, refund estimate, and plain-language explanation.
6. WHEN the disposition route is "list for resale, hold-at-home", THE Returns_Module SHALL publish a ListingRequested event on the Event_Bus (triggered by the DispositionAssigned → Listed transition) containing the ReturnRequest ID, item identifier, condition grade, ConditionAssessment summary, and media references, which the Marketplace module consumes to create the resale listing.
7. THE Returns_Module, Grading_Module, and Disposition_Engine SHALL each expose a facade interface that supports at minimum querying the current state of any entity they own by ID, returning a read-only projection without exposing internal classes.
7. IF an event published to the Event_Bus is not acknowledged by a subscriber within 5 seconds, THEN THE Event_Bus SHALL retry delivery up to 3 times and, if all retries fail, log the failure and emit a system alert indicating the affected event ID and subscriber.
8. THE system SHALL enforce module isolation such that no module's source files contain import statements referencing another module's internal classes, verified by a static-analysis check or architectural test that fails the build on violation.
9. IF an event consumer encounters an error while processing a received event, THEN THE consuming module SHALL log the error with the event ID and event type, and SHALL NOT propagate the failure to the publishing module or other subscribers.
10. THE Returns_Module, Grading_Module, and Disposition_Engine event consumers SHALL be idempotent, deduplicating by event ID, so that redelivery of the same event does not cause duplicate processing (such as issuing duplicate refunds or creating duplicate ReturnRequests).

### Requirement 16: Adapter Pattern with Deterministic Mocks

**User Story:** As a developer, I want all external AI service calls behind adapter interfaces with deterministic mocks, so that the system can be developed, tested, and demonstrated without live API keys.

#### Acceptance Criteria

1. THE Grading_Module SHALL access AI grading functionality exclusively through the IConditionGrader interface, with no direct dependency on any specific AI provider SDK.
2. THE Grading_Module SHALL access identity verification functionality exclusively through the IIdentityVerifier interface, with no direct dependency on any specific AI provider SDK.
3. THE system SHALL include a MockConditionGrader implementation that returns deterministic grades based on configurable rules tied to seeded item identifiers, covering all four grade values (A, B, C, D) across different seeded items.
4. THE system SHALL include a MockIdentityVerifier implementation that returns deterministic identity verdicts (genuine, mismatch, inconclusive) based on configurable rules tied to seeded item identifiers, with a fixed confidence score of 0.95.
5. THE system SHALL select between mock and live adapter implementations via dependency injection configuration, requiring no code changes to switch providers.
6. IF a seeded item identifier is not recognized by the mock implementation, THEN the mock SHALL return a default response (grade B with confidence 0.7 for MockConditionGrader; inconclusive with confidence 0.5 for MockIdentityVerifier) rather than throwing an error.

### Requirement 17: No Nearby Buyer for Grade A Item

**User Story:** As the platform, I want a clear fallback when a Grade A item has no nearby buyer, so that high-quality returned items are still recovered efficiently through resale listing.

#### Acceptance Criteria

1. WHEN a Grade A item has no buyer with an active order or wishlist entry for the same SKU within the configurable distance radius (default 25 km), THE Disposition_Engine SHALL assign the "list for resale, hold-at-home" route and publish a DispositionAssigned event containing the assigned route, the item identifier, and the refund estimate within 2 seconds of grading completion.
2. WHEN the "list for resale" route is assigned, THE Disposition_Engine SHALL include in the plain-language explanation (maximum 200 characters) that the item will be listed for resale and the Customer keeps it at home until sold (for example: "Your item is like-new. We will list it for resale and you keep it at home until a buyer is found. Refund: ₹1,299 once sold.").
3. WHEN the "list for resale" route is assigned, THE Disposition_Engine SHALL provide a refund estimate containing the numeric refund amount in the order's currency, the refund condition ("upon sale"), and the refund method (original payment method or store credit) so the Customer knows exactly what they will receive and when.
4. IF the Disposition_Engine cannot determine a refund estimate due to missing pricing data, THEN THE Disposition_Engine SHALL assign the "list for resale, hold-at-home" route with a refund estimate marked as "pending" and include in the explanation that the refund amount will be confirmed once the item is listed.
