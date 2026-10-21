# Manual Testing Checklist: Cardstock Auth & Collaboration

This checklist covers end-to-end manual verification for user registration, authentication, data isolation, drag-and-drop board manipulation, real-time multi-window sync, logout, and session expiration.

---

### Prerequisites
1. Start the server:
   ```bash
   cd server && npm run dev
   ```
2. Start the client:
   ```bash
   cd client && npm run dev
   ```
3. Open two browser windows:
   - **Window 1**: Regular browser window (e.g., Chrome) at `http://localhost:5173`.
   - **Window 2**: Incognito/Private window (or separate profile/browser) at `http://localhost:5173`.

---

### 1. Register Two Users
- [ ] **Register User A (Window 1)**:
  - Navigate to `http://localhost:5173/register`.
  - Enter email `alice@example.com` and password `password123`.
  - Click **Sign Up**.
  - **Verify**: You are redirected to `/boards`, the header displays `alice@example.com`, and a welcoming empty board prompt appears.
- [ ] **Register User B (Window 2)**:
  - In the incognito window, navigate to `http://localhost:5173/register`.
  - Enter email `bob@example.com` and password `password123`.
  - Click **Sign Up**.
  - **Verify**: You are redirected to `/boards` in Window 2, and the header displays `bob@example.com`.

---

### 2. Create Boards
- [ ] **Create Board as User A (Window 1)**:
  - Click **Create Board**.
  - Give it a title: `Alice Project Alpha`.
  - Click **Create**.
  - **Verify**: Redirected to `/boards/:boardId` with initial columns (e.g. *To Do*, *In Progress*, *Done*).
  - Add a card in *To Do*: `Deploy backend to Render`.
  - Add another card in *To Do*: `Configure Vercel rewrites`.
- [ ] **Create Board as User B (Window 2)**:
  - Click **Create Board**.
  - Give it a title: `Bob Personal Roadmap`.
  - Click **Create**.
  - Add a card in *To Do*: `Buy groceries`.

---

### 3. Confirm Isolation Between Users
- [ ] **Board List Isolation**:
  - In Window 2 (Bob), navigate to `/boards`.
  - **Verify**: Only `Bob Personal Roadmap` is listed. `Alice Project Alpha` is **not** visible.
- [ ] **Direct URL Access Isolation**:
  - Copy the URL of Alice's board from Window 1 (e.g., `http://localhost:5173/boards/<aliceBoardId>`).
  - Paste the URL into Window 2 (Bob's session) and press Enter.
  - **Verify**:
    - Bob is denied access.
    - An error banner or message displays: *"The board could not be loaded"* (backend responded with `404 Not Found` rather than `403 Forbidden` to prevent board ID enumeration).
    - None of Alice's columns or cards are rendered.

---

### 4. Drag and Drop Interaction
- [ ] **Mouse Drag and Drop (Window 1)**:
  - In `Alice Project Alpha`, grab the card `Deploy backend to Render` with the mouse pointer.
  - Drag and drop it into the *In Progress* column.
  - **Verify**: The card snaps into *In Progress*, position order updates smoothly, and no errors appear.
- [ ] **Keyboard Reordering (Accessibility)**:
  - Focus a card using the `Tab` key.
  - Press `Space` or `Enter` to lift the card.
  - Use `Arrow` keys (`Down`, `Right`) to move it within or across columns.
  - Press `Space` or `Enter` to drop.
  - **Verify**: The card settles into the new position and retains order across page refresh.

---

### 5. Real-Time Sync Across Two Windows (Same User)
- [ ] **Multi-Tab / Multi-Window Sync**:
  - Open a **second tab** in Window 1 (both tabs authenticated as User A).
  - Navigate both tabs to `Alice Project Alpha`.
  - In Tab 1: Create a new card `Setup MongoDB Atlas` in *Done*.
  - **Verify in Tab 2**: The card `Setup MongoDB Atlas` appears in *Done* instantly without refreshing the page.
  - In Tab 2: Drag `Deploy backend to Render` from *In Progress* to *Done*.
  - **Verify in Tab 1**: The card moves to *Done* in real time via WebSocket broadcast.
  - In Tab 1: Edit the title or delete a card.
  - **Verify in Tab 2**: The update reflects immediately.

---

### 6. Logout
- [ ] **Standard Logout (Window 1, Tab 1)**:
  - Click the user menu / **Log out** button in the header.
  - **Verify**:
    - The session is cleared; you are redirected to `/login`.
    - Navigating back to `/boards` redirects back to `/login`.
    - Active WebSocket connection closes cleanly.
- [ ] **Session Termination Verification**:
  - In Tab 2 (which was left open), attempt to add a card or reload.
  - **Verify**: With the refresh cookie revoked on logout, Tab 2 fails auth refresh and redirects to `/login`.

---

### 7. Expired Session Behavior
- [ ] **Transparent Token Refresh**:
  - Log back in as User A.
  - The in-memory access token expires every 15 minutes.
  - Trigger any board mutation (create or move a card).
  - **Verify**: The action succeeds seamlessly because `api.ts` transparently fetches a new access token via `POST /api/auth/refresh` using the HttpOnly cookie.
- [ ] **Revoked / Expired Refresh Cookie**:
  - In Developer Tools -> **Application** -> **Cookies** (`http://localhost:5173` or `localhost:4000`), delete the `refreshToken` cookie.
  - Attempt to perform an action or reload `/boards`.
  - **Verify**:
    - The request returns `401 Unauthorized`.
    - The client catches the failed refresh, clears local state, and immediately redirects to `/login` with the message *"Session expired. Please log in again."*.
