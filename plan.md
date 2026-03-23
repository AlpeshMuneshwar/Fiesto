# Cafe QR Solutions - Project Plan

## 1. Platform & Architecture
- **Primary Focus:** Mobile Application (e.g., React Native or Flutter) to ensure native features like location services, camera access, and VoIP calling work seamlessly.
- **Extensibility:** The architecture will be designed to easily extend to a Web Application (e.g., React.js, Next.js, or Flutter Web) sharing the same backend ecosystem.

## 2. Core User Roles
- **Customer:** Places orders, tracks live status, and requests to pay.
- **Waiter:** Approves off-location orders, verifies payments, captures transaction records, and answers calls from the Chef.
- **Chef:** Receives orders, updates preparation status in real-time, and calls the Waiter when food is ready.

## 3. Location-Based Ordering System
To prevent abuse and outside ordering, the ordering flow enforces location checks:
- **Location ON:** Direct order placement. Orders go straight to the Chef's application.
- **Location OFF (Fallback):** 
  - If the customer's location is turned off or not provided, an order can still be placed.
  - **Customer Alert:** The app will display a prominent message: *"Your order may take time if location is off to prevent outside ordering."*
  - **Waiter Approval Flow:** The order is routed to a "Pending Waiter Approval" queue. The Chef *does not* see this order yet.
  - **Acceptance:** Once a Waiter manually verifies the table and approves the order on their device, it is forwarded to the Chef.

## 4. Real-Time Order Status
- **Chef Updates:** The Chef uses their portal to update the order's state (e.g., "Preparation Started", "Ready"). 
- **Customer View:** The Customer app subscribes to live updates (via WebSockets or SSE) and displays the real-time status of their food preparation.

## 5. Waiter Notification & In-App Calling System (VoIP)
- **Order Completion:** When the food is fully prepared, the Chef needs to notify the Waiter rapidly.
- **In-App Calling:** A built-in Internet Calling feature (VoIP) will be implemented using **WebRTC**. 
  - The Chef can trigger an in-app voice call to the Waiter's device.
  - It will ring like a standard phone call (similar to WhatsApp) without relying on any external platforms.
  - This ensures guaranteed attention from the Waiter in a noisy restaurant environment.

## 6. Managed Payment Flow
Instead of automated direct payments handling everything, the Waiter manages the final transaction:
- **Checkout Request:** The customer taps "Pay and Leave" on their app.
- **Waiter Alert:** The Waiter receives an immediate notification to attend to the customer's table.
- **Verification:** The Waiter takes the payment (cash, external QR, POS) and verifies the status as `Done` or `Pending` on their device.
- **Proof of Transaction:** The Waiter uses their app's camera to snap a picture of the customer's payment success screen or terminal receipt (to capture the Transaction ID).
- **System Storage:** This image is uploaded and attached to the order record in the database for future auditing and reconciliation.

## 7. QR Session Management
To ensure a secure and reliable ordering experience without annoying timeouts, the QR sessions will follow these rules:
- **Exclusive Access:** Once a session is active (a customer has scanned the QR code and started their session), it becomes locked. No one else can access this active session from outside or by scanning the same QR code again until it is completed or cleared.
- **Manual Session Control:** Waiters have full visibility of active sessions per table.
  - **Ghost Sessions (Edge Case):** If someone scams the QR from outside the cafe and activates a session, the waiter will see an active session on an empty table. The waiter can manually **deactivate/clear** the session at any time.
  - Deactivating an active session will mark the past session as completed, instantly freeing up the table.
- **No Inactivity Timeouts:** Sessions will not automatically expire due to inactivity, preventing legitimate customers from losing their session mid-meal.
- **QR Code Regeneration:** The client/restaurant has the ability to generate a new QR code for a table and immediately discard/disable the old QR code if needed (e.g., if a printed QR gets leaked).
