# Tronic World Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Catalog Integrity (`products`, `projects`)**: Only verified Tronic World administrators (`itzz.nischit@gmail.com` with `email_verified == true` or an explicitly listed document in `/admins/{uid}`) may create, delete, or arbitrarily modify inventory items or college project kits. Verified customers may atomically decrement `stock` (`incoming.stock < existing.stock`), update `inStock`, and attach `lastOrderId` solely when bound via `getAfter()` to an order document created by them (`userId == request.auth.uid`, `status == 'pending'`, `createdAt == request.time`) in the same Firestore transaction/batch.
2. **Order Ownership & Pricing Integrity (`orders`)**: Every order MUST belong to the authenticated, email-verified user (`userId == request.auth.uid`), start in `status == 'pending'`, include at least 1 and at most 25 bounded line items, and use server timestamps (`createdAt == request.time`, `updatedAt == request.time`). Customers cannot mutate order totals, items, or fulfillment status to `'confirmed'`/`'completed'` — they may only cancel a `'pending'` order.
3. **PII Isolation (`orders`, `users`)**: Customer phone numbers, email addresses, and Pune delivery addresses are strictly isolated. Non-owners cannot `get` or `list` another customer's orders or user profile.
4. **No Self-Assigned Roles (`users`, `admins`)**: User profiles cannot carry `role` or `isAdmin` fields; admin privileges derive exclusively from verified token identity or `/admins/{uid}` managed by the bootstrapped store owner.
5. **Path & Volumetric Guards**: Every document ID matches `^[a-zA-Z0-9_-]+$` (`<= 128` chars), every string has explicit `.size()` bounds, and every array has a strict upper bound (`items <= 25`, `componentsList <= 12`).
6. **Admin Operational Settings (`settings`)**: Only verified administrators (`isAdmin()`) may read or modify `/settings/inventoryAlerts` controlling automated low-stock email notifications and recipient email addresses.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Product Creation**: Anonymous client attempts `POST /products/hack1` -> `PERMISSION_DENIED`.
2. **Customer Price Tampering**: Non-admin authenticated customer attempts `UPDATE /products/arduino-uno` setting `price: 1` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Product**: Admin or customer sends `{ ...validProduct, isVerified: true }` -> `PERMISSION_DENIED` (`hasOnly` blocks unknown keys).
4. **Unverified Admin Email Spoof**: Token with `email: 'itzz.nischit@gmail.com'` and `email_verified: false` attempts write -> `PERMISSION_DENIED`.
5. **Order Identity Spoofing**: User A creates `/orders/ord1` with `userId: 'userB'` -> `PERMISSION_DENIED`.
6. **Order Status Shortcutting**: Customer creates `/orders/ord1` with `status: 'completed'` -> `PERMISSION_DENIED`.
7. **Post-Checkout Total Tampering**: Customer updates `/orders/ord1` changing `totalAmount: 1` -> `PERMISSION_DENIED`.
8. **Cross-User Order PII Read**: Customer A calls `get /orders/userB_order` -> `PERMISSION_DENIED`.
9. **Blanket Order List Scraping**: Non-admin customer queries `/orders` without `where('userId', '==', uid)` -> `PERMISSION_DENIED`.
10. **Terminal State Mutation**: Customer tries to update an order already marked `'completed'` back to `'cancelled'` -> `PERMISSION_DENIED`.
11. **1MB Path / String Poisoning**: Attacker writes document ID of 500 chars or `description` of 5,000 chars -> `PERMISSION_DENIED`.
12. **Self-Assigned Admin Escalation**: Customer writes `/admins/{ownUid}` or injects `isAdmin: true` into `/users/{ownUid}` -> `PERMISSION_DENIED`.
13. **Unbacked Product Stock Tampering**: Customer updates `/products/{id}` without an atomic `getAfter()` `pending` order created in the same transaction -> `PERMISSION_DENIED`.
14. **Customer Settings Tampering**: Non-admin authenticated customer attempts `SET /settings/inventoryAlerts` to disable low-stock emails or change `recipientEmail` -> `PERMISSION_DENIED`.
