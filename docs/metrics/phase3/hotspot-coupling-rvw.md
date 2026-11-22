# Phase 3 Hotspot Analysis — Ratings & Reviews

Chosen module: RVW
Requirements: R-RVW-01 and R-RVW-02
Baseline commit: 9d57c2439cdbacde6b63e222656e6104aa7d554f

## Measurement Method

Tool: Lizard
Raw metrics: docs/metrics/phase3/lizard-raw.csv

The Lizard results are aggregated by source file.

Method NLOC is the sum of measured function NLOC.
Total CCN is the sum of measured function CCN.
Maximum CCN is the highest function CCN in the file.

These file-level aggregates must not be presented as
exact class-level measurements when a file contains
additional functions or classes.

Physical LOC counts every line, including comments
and blank lines.

Manual class coupling counts distinct directly referenced
project-defined classes, including classes declared in
the same file. Interfaces, enums, built-in classes,
external classes, and standalone functions are excluded.

## Hotspots

## Summary of the Five Refactoring Hotspots

| Class | LOC | CCN | Manual Coupling | Code Smell | Module Affected |
|---|---:|---:|---:|---|---|
| `PostgresOrderStore` | 222 | 35 | 1 | Large Class; Long Method | RVW (R-RVW-01) |
| `OrderService` (services) | 182 | 52 | 3 | Long Method | RVW (R-RVW-01) |
| `Order` | 147 | 33 | 1 | Potential Divergent Change | RVW (R-RVW-01) |
| `RestaurantService` | 171 | 27 | 2 | Duplicated Code | RVW (R-RVW-02) |
| `OrderService` (application) | 130 | 18 | 3 | Long Method | RVW (R-RVW-01, indirect) |

The following sections provide source-code evidence for each identified smell and explain how it could make the RVW module harder to implement.

### Hotspot 1: PostgresOrderStore

Source: my-app/server/src/infrastructure/order/PostgresOrderStore.ts

**Metrics**
- Class LOC: 221
- Class method NLOC: 207
- Class CCN: 35
- Maximum method CCN: 8

**Code smell**
Large Class; Long Method

**Evidence**
PostgresOrderStore implements OrderRepository and OrderCatalog. It handles order creation, status updates, order retrieval, event recording, and restaurant and menu queries. The updateStatus method contains 66 NLOC and manages conditional updates, event insertion, transactions, and rollback handling.

**Manual direct class coupling**
Referenced classes: Order

Count: 1

**Impact on RVW**
R-RVW-01 requires verifying that an order was delivered and belongs to the customer submitting the rating. PostgresOrderStore already manages order persistence and retrieval alongside other database responsibilities. Adding rating-related queries directly to this class would increase its responsibilities and make changes harder to isolate.
---

### Hotspot 2: OrderService (services)

Source: my-app/server/src/services/orderService.ts

**Metrics**
- Class LOC: 182
- Class method NLOC: 170
- Class CCN: 52
- Maximum method CCN: 12

**Code smell**
Long Method

**Evidence**
OrderService.placeOrder combines customer authentication, delivery-address validation, restaurant availability checks, menu-item validation, and order creation. Its CCN of 12 reflects multiple conditional paths. These responsibilities are handled in one method.

**Manual direct class coupling**
Referenced classes: Order, OrderLine, OrderServiceError

Count: 3

**Impact on RVW**
R-RVW-01 requires authenticating the customer and verifying ownership of the delivered order. OrderService already contains customer authorization and ownership checks. Separating these responsibilities would help RVW reuse existing behavior without duplicating validation logic.
---

### Hotspot 3: Order

Source: my-app/server/src/domain/ORD/Order.ts

**Metrics**
- Class LOC: 147
- Class method NLOC: 116
- Class CCN: 33
- Maximum method CCN: 7

**Code smell**
Potential Divergent Change

**Evidence**
Order manages order lifecycle transitions, courier assignment, pickup and delivery confirmation, and observer notifications. These responsibilities can change for different reasons. This suggests a risk of Divergent Change, although the source alone does not establish a history of repeated changes.

**Manual direct class coupling**
Referenced classes: OrderLine

Count: 1

**Impact on RVW**
R-RVW-01 needs to check the customer's identity and whether the order has reached DELIVERED status. Introducing rating submission directly into Order would add another responsibility. Keeping rating rules in a separate service would reduce changes to the existing order lifecycle.
---

### Hotspot 4: RestaurantService

Source: my-app/server/src/application/ORD/RestaurantService.ts

**Metrics**
- Class LOC: 171
- Class method NLOC: 144
- Class CCN: 27
- Maximum method CCN: 6

**Code smell**
Duplicated Code

**Evidence**
RestaurantService.getRestaurantForStaff and updateRestaurantStatus both convert restaurant IDs, validate returned restaurant data, retrieve menus, and construct StaffRestaurantSummary objects. This repeats the same mapping and validation responsibilities.

**Manual direct class coupling**
Referenced classes: Restaurant, MenuService

Count: 2

**Impact on RVW**
R-RVW-02 requires displaying the restaurant's average rating on its details panel. Repeated restaurant-summary construction creates a risk that future rating information will be added to one code path but omitted from another. A shared mapping method could make restaurant information easier to extend consistently.
---

### Hotspot 5: OrderService (application)

Source: my-app/server/src/application/ORD/OrderService.ts

**Metrics**
- Class LOC: 130
- Class method NLOC: 110
- Class CCN: 18
- Maximum method CCN: 9

**Code smell**
Long Method

**Evidence**
The application OrderService.placeOrder contains 62 NLOC. It handles order validation, database locking, ID generation, order insertion, order-line insertion, transactions, and rollback handling. These persistence responsibilities are concentrated in one method.

**Manual direct class coupling**
Referenced classes: RestaurantService, MenuService, OrderValidationError

Count: 3

**Impact on RVW**
R-RVW-01 depends on an existing delivered order. Although rating submission should be separate from order creation, this service is part of the order workflow on which rating eligibility relies. Separating order persistence operations would reduce the risk of introducing rating-related changes into an already complex workflow. Its connection to RVW is indirect.
---







