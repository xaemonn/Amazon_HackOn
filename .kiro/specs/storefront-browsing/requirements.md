# Requirements Document

## Introduction

Storefront Browsing is the Amazon-like catalog, search, and home surface of the Second Life Commerce platform. It provides customers with a credible product discovery and detail experience, including condition-variant pricing (New, Certified Renewed, Open Box, Used-Like New) on each Product Detail Page. Critically, it subscribes to the `ListingRequested` domain event from the Zero-Touch Returns module and creates second-life ProductVariants with the AI condition report and actual unit photos — closing the "returned item reappears for sale" loop visible on camera. The module exposes a CatalogService facade and IProductRepository / IVariantRepository interfaces consumed by other modules, with in-memory implementations for local demo and DynamoDB adapters as stretch.

## Glossary

- **Catalog_Module**: The module responsible for managing the product catalog, product variants, categories, and ingesting second-life listings from the Returns module via the event bus.
- **CatalogService**: The application-layer facade through which other modules and the presentation layer interact with catalog data. The single entry point for all catalog operations.
- **IProductRepository**: The repository interface for persisting and retrieving Product aggregate roots. In-memory implementation for demo; DynamoDB adapter as stretch.
- **IVariantRepository**: The repository interface for persisting and retrieving ProductVariant entities. In-memory implementation for demo; DynamoDB adapter as stretch.
- **Product**: A domain entity representing a sellable item in the catalog. Fields: id, title, brand, catalogImageUrl, category, basePrice, fitMetadata (optional). The catalogImageUrl is the reference image the Returns module's identity verification matches against. The fitMetadata field (when present) contains brand/category fit information (e.g., sizeOffsetIndicator, offsetMagnitude) consumed by the FitGuard module.
- **ProductVariant**: A domain entity representing a specific condition-priced instance of a Product. Fields: id, productId, condition, price, stock, sourceReturnId (optional), conditionReport (optional, plain text from the AI assessment summary), unitPhotos (optional, MediaReference[] that the presentation layer resolves to displayable image URLs/paths).
- **Condition**: A discriminator on ProductVariant, one of: New, Certified_Renewed, Open_Box, Used_Like_New.
- **Category**: A domain entity representing a product department or classification used for navigation and filtering.
- **ListingRequested_Event**: A domain event published by the Returns module when a graded item is routed to resale. Payload includes returnRequestId, productId, conditionGrade, assessmentSummary, and mediaReferences.
- **Event_Bus**: The internal pub-sub mechanism (Amazon EventBridge in production, in-process bus locally) through which modules communicate via domain events.
- **PDP**: Product Detail Page — the page displaying full product information, image gallery, variants, pricing, and purchase actions.
- **Search_Module**: The subsystem providing keyword search, autocomplete, and filtered results across the product catalog.
- **Home_Page**: The landing surface showing navigation, search, category tiles, deals rail, and the Second Life / Renewed rail.
- **Customer**: The user role browsing and purchasing products on the storefront.

## Requirements

### Requirement 1: Product Detail Page Display

**User Story:** As a Customer, I want to view complete product information on a detail page, so that I can make an informed purchase decision.

#### Acceptance Criteria

1. WHEN a Customer navigates to a Product Detail Page, THE Catalog_Module SHALL display the product title, brand name, base price with currency symbol (₹), category, and a delivery estimate (expressed as a date range, e.g., "Delivery by Jun 18–20") within 2 seconds of navigation.
2. WHEN a Customer navigates to a Product Detail Page, THE Catalog_Module SHALL display an image gallery containing the catalogImageUrl as the primary image, with support for additional product images, and allow the Customer to cycle through images via swipe (mobile) or thumbnail selection (desktop).
3. WHEN a Customer navigates to a Product Detail Page, THE Catalog_Module SHALL display an "Add to Cart" button and a "Buy Now" button positioned below the price, both enabled when at least one variant has stock greater than zero; WHEN all variants have stock equal to zero, both buttons SHALL be disabled and a "Currently Unavailable" message SHALL be displayed.
4. WHEN a Customer navigates to a Product Detail Page that has associated ratings, THE Catalog_Module SHALL display a ratings summary showing the average star rating (1–5, one decimal place) and the total number of reviews.
5. WHEN a Customer navigates to a Product Detail Page for a Product with no ratings, THE Catalog_Module SHALL display "No ratings yet" in place of the ratings summary without rendering empty stars or a zero count.
6. THE Catalog_Module SHALL render the Product Detail Page using a mobile-first responsive layout with WCAG AA compliant contrast ratios (minimum 4.5:1 for normal text), alt text on all images, visible focus states, and keyboard-navigable interactive elements.
7. IF the Product data fails to load due to a network error or the requested product ID does not exist in the IProductRepository, THEN THE Catalog_Module SHALL display a user-friendly error message ("This product could not be found" or "Something went wrong — please try again") and provide a link to return to the home page or retry, without showing a raw error or blank screen.

### Requirement 2: Condition Variants on PDP

**User Story:** As a Customer, I want to see all available condition options (New, Certified Renewed, Open Box, Used-Like New) for a product on one page, so that I can compare prices and choose the best value.

#### Acceptance Criteria

1. WHEN a Customer views the PDP for a Product that has multiple ProductVariants, THE Catalog_Module SHALL display a condition selector listing each available condition (New, Certified_Renewed, Open_Box, Used_Like_New) with its price and stock count, ordered by price ascending (lowest first).
2. WHEN a Customer selects a condition variant from the selector, THE Catalog_Module SHALL update the displayed price, stock availability text, and Add to Cart / Buy Now target to reflect the selected ProductVariant within 200 milliseconds.
3. WHEN a ProductVariant has a sourceReturnId (indicating a second-life item) and both conditionReport and unitPhotos are present, THE Catalog_Module SHALL display a "Second Life" badge, the AI condition report text (conditionReport), and a thumbnail gallery showing up to 5 of the actual unit photos (unitPhotos, resolved from MediaReferences to displayable image URLs by the presentation layer) alongside the variant selector entry.
4. IF a ProductVariant has a sourceReturnId but conditionReport is absent or unitPhotos is empty, THEN THE Catalog_Module SHALL display the "Second Life" badge without the condition report or thumbnail gallery, and SHALL still allow the variant to be selected and purchased.
5. WHEN a ProductVariant has stock equal to zero, THE Catalog_Module SHALL display that condition option as "Out of Stock" in the selector, disable selection of that variant, and disable Add to Cart / Buy Now buttons if it is the currently viewed variant.
6. WHEN a Product has only one ProductVariant (single condition), THE Catalog_Module SHALL display the price and stock directly without rendering a condition selector.
7. WHEN the PDP loads, THE Catalog_Module SHALL default the selected variant to the lowest-priced in-stock condition variant, so the Customer sees the best available price first.
8. THE Catalog_Module SHALL render the condition selector as a keyboard-navigable control with visible focus states, sufficient contrast (WCAG AA), and an accessible label identifying it as a condition chooser, so that assistive technology users can browse and select variants.

### Requirement 3: Second-Life Listing Ingestion

**User Story:** As the platform, I want to automatically create an Open Box or Renewed ProductVariant when a return is graded and routed to resale, so that the returned item reappears for sale with full condition transparency.

#### Acceptance Criteria

1. WHEN the Event_Bus delivers a ListingRequested_Event with conditionGrade A, THE Catalog_Module SHALL subscribe to the event and create a new ProductVariant for the referenced productId with condition set to Open_Box, price set to a configurable percentage discount from the Product basePrice (default: 15% off), stock set to 1, sourceReturnId set to the event's returnRequestId, conditionReport set to the event's assessmentSummary (plain text), and unitPhotos populated from the event's mediaReferences (MediaReference[], storing up to 10 references; additional beyond 10 SHALL be ignored). Note: In the current returns flow, ListingRequested is published only for Grade A items routed to "list for resale, hold-at-home." Grade B items are routed to a refurbishment partner and do not emit ListingRequested. A Grade B → Certified_Renewed branch is retained as harmless forward-compatibility but will not fire in the current flow. Certified_Renewed variants exist in the catalog only via seed data (see R7.2).
2. WHEN the Catalog_Module successfully creates the second-life ProductVariant, THE Catalog_Module SHALL publish a ListingCreated domain event on the Event_Bus containing the new variant ID, the source product ID, the condition, and the sourceReturnId.
3. IF a ListingRequested_Event arrives with a productId that does not exist in the catalog, THEN THE Catalog_Module SHALL log a structured warning including the returnRequestId and productId, discard the event without creating a variant, and publish no ListingCreated event.
4. IF a ListingRequested_Event arrives with a conditionGrade that is not A (including B, C, D, null, empty, or any unrecognized value), THEN THE Catalog_Module SHALL discard the event without creating a variant, log a structured message including the returnRequestId and the received conditionGrade value, and publish no ListingCreated event. (Grade B is accepted as forward-compatibility but does not fire in the current returns flow; if received, the module MAY create a Certified_Renewed variant or discard — implementors choose.)
5. WHEN a second-life ProductVariant is created, THE Catalog_Module SHALL make the new variant visible on the Product Detail Page on the next page load or navigation to that PDP. [STRETCH] Live push or polling to update the PDP without a page refresh for customers currently viewing it is optional.
6. THE Catalog_Module SHALL process ListingRequested_Events idempotently: IF a ProductVariant with the same sourceReturnId already exists for the referenced productId, THEN THE Catalog_Module SHALL skip creation and log an informational message.
7. IF a ListingRequested_Event arrives with any required field missing or malformed (returnRequestId, productId, conditionGrade, assessmentSummary, or mediaReferences is null, empty, or not of the expected type), THEN THE Catalog_Module SHALL log a structured error including the available event identifiers and the name of the invalid field, discard the event without creating a variant, and publish no ListingCreated event.

### Requirement 4: Product Search

**User Story:** As a Customer, I want to search for products by keyword and see relevant results with filtering options, so that I can quickly find what I am looking for.

#### Acceptance Criteria

1. THE Search_Module SHALL display a search bar in the global navigation header, accessible from every page, with a text input that accepts keyword queries up to 200 characters.
2. WHEN a Customer types 2 or more characters in the search bar, THE Search_Module SHALL display an autocomplete dropdown within 300 milliseconds containing up to 8 suggestions based on matching product titles, brands, and category names; WHEN the Customer clears the input to fewer than 2 characters or blurs the search bar, THE Search_Module SHALL dismiss the autocomplete dropdown.
3. WHEN a Customer submits a search query (via Enter key or search button), THE Search_Module SHALL display a results page listing matching products as cards (paginated at 20 products per page) showing the product title, brand, catalogImageUrl thumbnail, lowest available price across all in-stock variants, and average star rating.
4. WHEN search results are displayed, THE Search_Module SHALL provide filter controls for: price range (min/max inputs accepting positive numeric values), brand (multi-select checkboxes), average rating (minimum star threshold), and condition (multi-select: New, Certified_Renewed, Open_Box, Used_Like_New).
5. WHEN search results are displayed, THE Search_Module SHALL provide sort options: relevance (default), price low-to-high, price high-to-low, and average rating high-to-low.
6. WHEN a Customer applies one or more filters, THE Search_Module SHALL update the results within 500 milliseconds to show only products matching all active filter criteria simultaneously.
7. WHEN a search query matches zero products, THE Search_Module SHALL display a "No results found" message with the searched query echoed back, and suggest the Customer try different keywords or browse categories.
8. THE Search_Module SHALL perform keyword matching against product title, brand, and category fields using case-insensitive substring matching. Full relevance-ranking is not required.
9. IF a Customer submits an empty or whitespace-only query, THEN THE Search_Module SHALL not execute a search and SHALL display no results page; the search bar SHALL retain focus for the Customer to enter a valid query.

### Requirement 5: Home and Landing Page

**User Story:** As a Customer, I want an Amazon-like home page with navigation, categories, deals, and a dedicated Second Life section, so that I can discover products and second-life deals immediately.

#### Acceptance Criteria

1. THE Home_Page SHALL display a global navigation bar containing the site logo, a search bar, a category menu (dropdown or hamburger on mobile), an account icon, and a cart icon with item count badge that displays the numeric count for values 1–99 and displays "99+" for counts exceeding 99.
2. THE Home_Page SHALL display a grid or row of category tiles (up to 12), each showing a category name and representative image, linking to a filtered product listing for that category.
3. THE Home_Page SHALL display a horizontal scrollable "Deals" rail containing up to 10 ProductVariants whose price is below the Product basePrice (i.e., the variant has a discount relative to the base price), each card showing the product thumbnail, title, original base price (struck through), and discounted variant price.
4. THE Home_Page SHALL display a horizontal scrollable "Second Life / Renewed" rail containing up to 10 ProductVariants with condition Open_Box or Certified_Renewed, each card showing the unit photo (or catalogImageUrl if no unit photos exist), product title, condition badge, and variant price.
5. WHEN a Customer taps a product card in any rail or tile, THE Home_Page SHALL navigate to the Product Detail Page for that product within 1 second.
6. THE Home_Page SHALL render in a mobile-first responsive layout that adapts from single-column (mobile, viewport width below 768px) to multi-column (tablet and desktop, viewport width 768px and above) without horizontal overflow or content clipping, with WCAG AA compliant contrast ratios, alt text on all images, and keyboard-navigable interactive elements.
7. WHEN the "Second Life / Renewed" rail contains zero items (no second-life variants exist in the catalog), THE Home_Page SHALL hide the rail section entirely rather than showing an empty container.
8. WHEN the "Deals" rail contains zero qualifying products (no variants with a price below the Product basePrice exist), THE Home_Page SHALL hide the Deals rail section entirely rather than showing an empty container.
9. WHEN a Customer navigates to the Home_Page, THE Home_Page SHALL render above-the-fold content (navigation bar and at least the category tiles) within 2 seconds of navigation, using skeleton loaders for any rails whose data has not yet loaded.

### Requirement 6: CatalogService Facade and Repository Interfaces

**User Story:** As a developer, I want a clean CatalogService facade and repository interfaces with in-memory implementations, so that other modules can consume catalog data without coupling to storage details and the system runs locally without external dependencies.

#### Acceptance Criteria

1. THE Catalog_Module SHALL expose a CatalogService facade as the single application-layer entry point for all catalog operations including: getProductById, getVariantsByProductId, searchProducts, getCategories, and createVariantFromListing.
2. THE Catalog_Module SHALL define an IProductRepository interface with methods: findById(id), findByCategory(categoryId), searchByKeyword(keyword, limit) (default limit 50), and findAll(limit) (default limit 100), each returning Product entities or arrays of Product entities.
3. THE Catalog_Module SHALL define an IVariantRepository interface with methods: findByProductId(productId), findById(id), save(variant), and findByCondition(condition), each returning ProductVariant entities or arrays of ProductVariant entities.
4. THE Catalog_Module SHALL provide InMemoryProductRepository and InMemoryVariantRepository implementations that store data in JavaScript Map structures, enabling the system to run end-to-end locally with no external database or AWS credentials.
5. THE Catalog_Module SHALL accept repository implementations via constructor injection in the CatalogService, following the Dependency Inversion principle, so that DynamoDB adapters can replace in-memory implementations via configuration.
6. THE CatalogService SHALL validate all inputs (non-empty IDs, valid condition enums, positive prices) and return descriptive error objects with a consistent structure (containing type, field, and message properties) for invalid requests rather than throwing unhandled exceptions; for not-found cases (e.g., getProductById with a non-existent ID), the facade SHALL return null rather than throwing.
7. THE CatalogService createVariantFromListing method SHALL accept a ListingRequested_Event payload (returnRequestId, productId, conditionGrade, assessmentSummary, mediaReferences) as input and return the created ProductVariant entity (with conditionReport populated from assessmentSummary and unitPhotos populated from mediaReferences) on success, or a descriptive error object on failure (unknown product, invalid grade, duplicate sourceReturnId).

### Requirement 7: Seed Data

**User Story:** As a developer and demo presenter, I want the catalog pre-seeded with representative products including condition variants and a "runs small" footwear item, so that the demo is immediately functional and showcases second-life and FitGuard features.

#### Acceptance Criteria

1. THE Catalog_Module SHALL seed the in-memory repositories at startup with at least 6 products spanning at least 3 distinct categories (e.g., Electronics, Footwear, Home), where each product has a non-empty title, a non-empty brand, a basePrice greater than zero, and a catalogImageUrl that resolves to a reachable placeholder image URL or a local asset path existing in the project's static assets directory.
2. THE Catalog_Module SHALL seed at least one Product with three ProductVariants: a New variant (with stock of at least 1 and a price equal to or greater than the product's basePrice), an Open_Box variant (with sourceReturnId, conditionReport containing sample assessment text, unitPhotos containing at least 3 media references, stock of at least 1, and a price lower than the New variant), and a Certified_Renewed variant (with sourceReturnId, conditionReport containing sample assessment text, unitPhotos containing at least 3 media references, stock of at least 1, and a price between the Open_Box and New variant prices).
3. THE Catalog_Module SHALL seed at least one footwear Product in a "Footwear" category with an optional fitMetadata field on the Product entity containing at minimum a sizeOffsetIndicator field set to "runs_small" and an offsetMagnitude field (e.g., 1 representing one size small), so that the FitGuard module can consume this metadata to generate size recommendations. The Product entity definition is extended with: fitMetadata (optional, object with sizeOffsetIndicator and offsetMagnitude).
4. THE Catalog_Module SHALL seed each Product with a catalogImageUrl pointing to a placeholder image URL (using a deterministic URL pattern such as "/assets/products/{productId}.jpg" or a public placeholder service) that the Returns module's IIdentityVerifier mock can reference for comparison during identity verification.
5. THE Catalog_Module SHALL seed at least 3 Category entities, each with a unique name and a representative image reference, that are referenced by the seeded Products and displayed on the Home Page category tiles.
6. WHEN the application starts, THE Catalog_Module SHALL complete all seed data loading synchronously before the application accepts HTTP requests or renders the Home Page, ensuring no empty-state flicker on initial load.
7. THE Catalog_Module SHALL seed at least one Product with a basePrice below the configurable returnless-refund threshold (default ₹500) and at least one Product with a basePrice at or above that threshold, so that both the Returnless_Refund and warehouse-routing disposition paths can be demonstrated.

### Requirement 8: Out-of-Stock Variant Handling

**User Story:** As a Customer, I want clear feedback when a condition variant is unavailable, so that I do not attempt to purchase an out-of-stock item.

#### Acceptance Criteria

1. WHEN a Customer navigates to or loads a PDP and a ProductVariant has stock equal to zero, THE Catalog_Module SHALL display "Out of Stock" on the condition selector entry for that variant and disable selection of that variant. [STRETCH] Live updates while the Customer is viewing the page (via polling or push within 30 seconds of the stock change) are optional.
2. WHEN the only remaining in-stock variant goes out of stock (all variants for a Product have stock zero), THE Catalog_Module SHALL disable both "Add to Cart" and "Buy Now" buttons and display a message indicating the product is currently unavailable.
3. WHEN a Customer is viewing the PDP and the currently selected variant goes out of stock (stock transitions from a positive value to zero), THE Catalog_Module SHALL display an inline notification indicating the variant is no longer available and automatically switch the selection to the next lowest-priced in-stock variant if one exists, or IF no in-stock variant exists, THEN THE Catalog_Module SHALL disable both "Add to Cart" and "Buy Now" buttons and display a message indicating the product is currently unavailable.
4. WHEN search results include a Product where all variants have zero stock, THE Search_Module SHALL display the product card with an "Out of Stock" badge overlaid on the thumbnail and position that card after all in-stock results when the sort order is set to the default relevance sort; WHILE a non-default sort order is active (e.g., price, rating), THE Search_Module SHALL retain the out-of-stock product in its natural sort position with the "Out of Stock" badge visible.
5. WHEN a Customer navigates to or loads a PDP and a previously out-of-stock ProductVariant now has stock greater than zero, THE Catalog_Module SHALL display that variant as available, remove the "Out of Stock" label from the condition selector entry, and re-enable the "Add to Cart" and "Buy Now" buttons if they were disabled due to all variants being out of stock. [STRETCH] Live re-stock updates while viewing the page (within 30 seconds) are optional.
6. WHEN a Customer attempts to add a variant to the cart but the variant stock reaches zero between page load and the add-to-cart action, THE Catalog_Module SHALL reject the add-to-cart request, display an inline notification indicating the variant is no longer available, and update the PDP to reflect the current stock state.

### Requirement 9: Search with No Results

**User Story:** As a Customer, I want helpful feedback when my search returns no products, so that I am not left on a blank page without guidance.

#### Acceptance Criteria

1. WHEN a search query matches zero products after applying all active filters, THE Search_Module SHALL display a "No results found for '[query]'" message that echoes the Customer's search term (up to 200 characters, matching the search input limit) in quotation marks.
2. WHEN no results are found and at least one filter is active, THE Search_Module SHALL display the recovery suggestions "Try different keywords" and "Remove filters" as actionable controls (tappable links or buttons), plus a link to browse all categories.
3. WHEN no results are found and no filters are active, THE Search_Module SHALL display the recovery suggestions "Try different keywords" and a link to browse all categories, omitting "Remove filters" since no filters are applied.
4. IF no results are found and at least one ProductVariant with condition Open_Box or Certified_Renewed exists in the catalog, THEN THE Search_Module SHALL display the "Second Life / Renewed" rail below the no-results message containing up to 10 second-life variants, and IF zero second-life variants exist in the catalog, THEN THE Search_Module SHALL hide the rail section entirely rather than showing an empty container.
5. WHEN a Customer clears all filters on a no-results page, THE Search_Module SHALL re-execute the search with no filters within 500 milliseconds and display any matching results, and IF the re-executed search still yields zero results, THEN THE Search_Module SHALL display the no-results state per criteria 1 and 3.

### Requirement 10: ListingRequested Event for Unknown Product

**User Story:** As the platform, I want graceful handling when a ListingRequested event references a product not in the catalog, so that the system does not crash or enter an inconsistent state.

#### Acceptance Criteria

1. IF a ListingRequested_Event arrives with a productId that does not match any Product in the IProductRepository, THEN THE Catalog_Module SHALL log a structured warning with severity level "warn" containing the eventId, returnRequestId, unrecognized productId, and a discard reason field set to "unknown_productId".
2. IF a ListingRequested_Event references an unknown productId, THEN THE Catalog_Module SHALL discard the event without creating a ProductVariant and without publishing a ListingCreated event.
3. IF a ListingRequested_Event references an unknown productId, THEN THE Catalog_Module SHALL not throw an exception or crash; the event handler SHALL return successfully and continue processing subsequent events.
4. IF a ListingRequested_Event is discarded due to an unknown productId, THEN THE Catalog_Module SHALL emit the structured warning log from criterion 1 as a domain log entry with a consistent schema (eventId, returnRequestId, productId, discardReason, timestamp) consumable by the Admin ops console, enabling operations teams to query and aggregate catalog-gap occurrences.
