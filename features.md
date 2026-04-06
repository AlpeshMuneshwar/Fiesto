# Cafe QR Solutions — Role-Based Feature Map

> Complete breakdown of every feature currently implemented per role.

---

## 🧑‍💼 1. Customer (No Login Required for Walk-In)

### QR Scan & Session
- Scan table QR code to start a session
- Exclusive session lock — no other device can hijack the same table
- Same-device reconnect — returning device is auto-resumed
- Join an existing session via 4-digit code (group ordering)
- "Forgot Code" button notifies the waiter, who can look up the code

### Menu & Ordering
- Browse full menu with categories, images, dietary tags (VEG / NON_VEG / VEGAN / EGGETARIAN)
- Search and filter by category
- View item price, description, and image
- Add special instructions per order ("No onions, extra spicy")
- Cart with quantity controls
- Server-side price re-calculation & tamper check (tolerance ± ₹0.05)
- Tax and service charge auto-applied per cafe settings
- Location verification — if ON, order goes directly to Chef; if OFF, order goes to Waiter for approval

### Real-Time Order Tracking
- Live order status updates via WebSocket (PENDING_APPROVAL → RECEIVED → PREPARING → READY → DELIVERED)
- Alert notification when location is off: *"Your order may take time…"*

### Payments
- "Pay and Leave" checkout request — notifies the nearest waiter
- Receives final bill with itemised breakdown, tax, service charge, platform fee, and advance deducted
- Session auto-closes after waiter completes payment

### Reservations & Pre-Booking (Phase 4)
- Discover cafes with available tables (discovery portal)
- View cafe details, logo, address
- Smart table selection (filters by party size, shows optimal capacity fit)
- Pre-book a table for a scheduled time
- Optional pre-order food during booking
- Advance payment (configurable % of total) + platform fee charged at booking
- Automatic session & table lock upon booking

### Authentication (Optional for Reservations)
- Login / Register (required only for pre-booking)
- Forgot password (reset token via email / console mock)
- Reset password

---

## 🍽️ 2. Waiter (Mobile App — Login Required)

### Dashboard
- View all tables and their occupancy status (active sessions)
- See incoming waiter calls from customers (with table number)

### Order Approval Queue
- View all orders in `PENDING_APPROVAL` status (location-off orders)
- Approve or reject orders — approved orders forward to Chef
- Push notification for new pending orders

### Delivery Management
- View all `READY` orders (food ready for pickup from kitchen)
- Mark order as `DELIVERED` — triggers real-time update to customer

### Session Management
- Deactivate ghost/completed sessions manually (frees up the table)
- View session join codes (to help customers who forgot theirs)

### Payment Handling
- Receive "Pay and Leave" checkout alerts
- Generate itemised bill for a session (subtotal, tax, service charge, platform fee, advance deducted)
- Mark payment as complete — closes session, marks all orders as `COMPLETED`, sends `session_finalized` event to customer

### Notifications
- Real-time WebSocket events: new orders, waiter calls, checkout requests, reservation alerts, forgot-code requests
- Push notifications via Expo

---

## 👨‍🍳 3. Chef (Mobile App — Login Required)

### Kitchen Dashboard
- View all active orders: `RECEIVED`, `PREPARING`, `READY`
- Orders displayed with table number, item list, quantities, and special instructions

### Order Status Updates
- Update order status: `RECEIVED` → `PREPARING` → `READY`
- Each update triggers real-time WebSocket event to the customer

### Menu Contribution
- Add new menu items (with image upload)
- Update existing menu items
- Bulk save menu items

### Notifications
- Push notification when a new order is received or approved by waiter
- Real-time WebSocket event `new_order` on Chef room channel

---

## 👑 4. Admin / Cafe Owner (Web Dashboard — Login Required)

### Dashboard & Analytics
- Today's total orders and revenue
- Active sessions count
- Total staff count
- Top 5 selling items

### Reports (Date-Range)
- Custom date range sales report
- Revenue breakdown: subtotal, tax, service charge
- Average order value
- Hourly order & revenue breakdown (for charting)
- Order status distribution
- Top 10 selling items with revenue per item
- Full order list with table numbers and timestamps

### Staff Management
- View all staff (Waiters & Chefs)
- Add new staff members (name, email, password, role)
- Update staff details (name, email, role, active status, password reset)
- Delete staff — graceful deactivation if foreign key constraints exist

### Menu Management
- Add / update / delete menu items with image upload
- Set dietary tags (VEG, NON_VEG, VEGAN, EGGETARIAN)
- Set sort order and categories
- Toggle all items in a category on/off
- Bulk upload via CSV file
- Extract menu from image using OCR (Tesseract.js)
- Bulk save after review

### Table Management
- Add tables with auto QR code URL generation
- Delete tables (blocked if active session exists)
- View all tables with session status

### Cafe Profile
- Update cafe name, address, and logo URL

### Cafe Settings (Feature Toggles)
- Payment mode: `WAITER_AT_TABLE` / `PAY_AT_COUNTER` / `BOTH`
- Tax: enable/disable, rate, label ("GST"), inclusive/exclusive
- Service charge: enable/disable, rate
- Customer can call waiter: on/off
- Special instructions: on/off
- Location verification enforcement: on/off
- Auto-accept orders (skip waiter approval): on/off
- Show prep time to customers: on/off, average minutes
- Dietary tags display: on/off
- Menu images display: on/off
- Currency & symbol selection
- Reservations: enable/disable, platform fee, advance rate %

### Session & Order Oversight
- View all orders (last 50) with table & waiter info
- Deactivate sessions
- Approve/reject orders (same permissions as waiter)
- Deliver orders

### Cafe Registration (Onboarding)
- Register new cafe with slug, owner credentials
- Auto-creates cafe + admin user + default settings in a single transaction

---

## 🛡️ 5. Super Admin (Platform Level — Login Required)

### Platform Dashboard
- Total cafes on the platform
- Total orders across all cafes
- Total revenue across all cafes
- Total active sessions across all cafes

### Cafe Management
- List all cafes with order & user counts
- Suspend / re-enable any cafe (`isActive` toggle)

### User Management
- Register new users (staff/admins) to any cafe

---

## 🔒 6. Cross-Cutting / Platform Features

| Feature | Details |
|---|---|
| **Authentication** | JWT-based (15 min access + 7 day refresh token rotation) |
| **Brute-force Protection** | Account lockout after 5 failed login attempts (15 min cooldown) |
| **Password Reset** | Token-based reset flow (15 min expiry) |
| **Push Notifications** | Expo push token registration, role-targeted notifications |
| **Real-Time Events** | Socket.IO rooms per role per cafe (`WAITER_{cafeId}`, `CHEF_{cafeId}`) |
| **File Uploads** | Multer with MIME type validation (JPEG/PNG/WebP), 5MB limit |
| **Input Validation** | Zod schemas on all endpoints |
| **Multi-Tenancy** | Full tenant isolation — each cafe is a separate data silo |
| **Error Handling** | Async error handler middleware, graceful foreign key fallbacks |
