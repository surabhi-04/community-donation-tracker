# Community Donation Tracker

A modern, responsive web application designed for community organizers and field volunteer teams to coordinate donation campaigns, manage outreach contacts, and track collection progress in real time.

Built with **React 19**, **TypeScript**, **Vite**, and **Firebase (Authentication & Cloud Firestore)**, featuring high-contrast UI design, team-scoped access control, duplicate person detection, and group organization.

---

## 🎯 Problem It Solves

Community fundraising drives and neighborhood outreach efforts frequently suffer from operational challenges:
- **Disorganized spreadsheets** leading to duplicate visits and outreach overlaps.
- **Ambiguous contact roles** where volunteers confuse donation pledges with event invitation lists.
- **Lack of team coordination** across field volunteers working concurrently in different blocks or neighborhoods.
- **Loss of state & connectivity issues** during active on-ground volunteer workflows.

The **Community Donation Tracker** solves these problems with a unified, real-time platform featuring team-isolated workspaces, smart duplicate warnings, dedicated groups, independent donor/inviter workflows, and one-click reporting.

---

## ✨ Key Features

- **🔐 Google Authentication**: Secure sign-in via Firebase Authentication with automatic session and team membership persistence across reloads.
- **👥 Team Isolation & Joining**: Create isolated team workspaces or join existing teams via secure 12-character invite codes. Multi-team switching is built-in.
- **🏢 Dedicated Groups Management**:
  - Organize community contacts into custom groups (e.g., *Block A*, *Block B*, *Local Residents*, *Friends*).
  - Dedicated Groups landing page with an empty state and group creation dialog.
  - Drill down into group details with group-specific KPI summaries and completion bars.
  - Assign existing unassigned contacts or add new contacts directly to a group.
  - Safe group deletion that unassigns contacts without ever deleting person records.
- **🔍 Smart Duplicate Detection**:
  - Live as-you-type autocomplete and similarity warnings.
  - Matches transposed names (e.g. "John Doe" vs "Doe John") and case/whitespace variations.
  - Non-blocking amber notice that warns volunteers without halting submission when distinct individuals share names.
  - Excludes the current contact from triggering false positives when editing.
- **📋 Independent Donor & Inviter Workflows**:
  - Clear separation between donor pledge collection and event invitation statuses.
  - Both roles start unselected on new contact creation with validation preventing unclassified entries.
  - Quick status updates (Pending, Visited, Collected) directly from contact cards or drawers.
- **📍 Locations & Groups as Independent Dimensions**:
  - Physical locations (streets, buildings) remain separate from social/organizational groups.
- **📊 Real-Time Dashboard & Analytics**:
  - Live metrics for total contacts, pending visits, donations collected, and invitations delivered.
  - Progress breakdowns by location and group.
- **📤 Export & Reporting**:
  - **CSV Export**: UTF-8 BOM encoding for seamless Microsoft Excel opening with telephone numbers formatted as text.
  - **A4 Print / PDF**: Formatted print sheets with repeated headers, progress summaries, and coordinator sign-off blocks.

---

## 📸 Screenshots

| Dashboard & Real-Time KPIs | Dedicated Group Detail View |
| :---: | :---: |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Group Detail](docs/screenshots/group-detail.png) |

| Smart Duplicate Detection | Add / Edit Person Form |
| :---: | :---: |
| ![Duplicate Warning](docs/screenshots/duplicate-detection.png) | ![Add Person](docs/screenshots/add-person-form.png) |

| Team Setup & Join Workspace |
| :---: |
| ![Team Setup](docs/screenshots/team-setup.png) |

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 (`^19.3.1`) | Functional components, hooks, custom context providers |
| **Language** | TypeScript (`~6.0.3`) | Strict type checking, shared domain models |
| **Build Tool & Dev Server**| Vite 8 (`^8.3.4`) | Fast HMR, optimized production asset bundling |
| **Backend & Database** | Google Cloud Firestore | Real-time snapshots (`onSnapshot`), subcollections |
| **Authentication** | Firebase Authentication | Google OAuth provider, token lifecycle |
| **Styling** | Vanilla CSS & Design Tokens | Accessible, high-contrast, Stitch-inspired UI |
| **Linter** | Oxlint (`^1.88.0`) | High-performance static code analysis |
| **Testing** | Node.js Test Runner | Native strip-types testing (`node --test`) |
| **Hosting & Deployment** | Vercel | Production edge CDN, SPA rewrites |

---

## 🏗️ Architecture & Data Model

### Architecture Overview

```mermaid
graph TD
    User([Field Volunteer]) -->|Google Auth| AuthCtx[AuthContext]
    AuthCtx --> TeamCtx[TeamContext]
    
    subgraph UI Components
        Dashboard[DashboardPage]
        People[PeoplePage & PersonForm]
        Groups[GroupsPage & DetailView]
        Locations[LocationsPage]
        Reports[ReportsPage]
    end

    TeamCtx --> UI Components
    
    subgraph Google Cloud Firestore
        TeamsCol[(teams)]
        MembersCol[(teams/{teamId}/members)]
        PeopleCol[(teams/{teamId}/people)]
        GroupsCol[(teams/{teamId}/groups)]
        ConfigDoc[(teams/{teamId}/private/config)]
    end

    TeamCtx <-->|Live onSnapshot / Write| TeamsCol
    TeamCtx <-->|Live onSnapshot / Write| MembersCol
    TeamCtx <-->|Live onSnapshot / Write| PeopleCol
    TeamCtx <-->|Live onSnapshot / Write| GroupsCol
    TeamCtx <-->|Read Invite Code| ConfigDoc
```

### Firestore Hierarchy

```text
teams/{teamId}
  ├── name: string
  ├── description: string
  ├── ownerId: string (UID)
  ├── createdAt: Timestamp
  │
  ├── members/{memberUid}
  │     ├── uid: string
  │     ├── displayName: string
  │     ├── email: string
  │     ├── role: 'owner' | 'member'
  │     └── joinedAt: Timestamp
  │
  ├── groups/{groupId}
  │     ├── id: string
  │     ├── name: string
  │     ├── description?: string
  │     ├── createdByUid: string
  │     └── createdAt: Timestamp
  │
  ├── people/{personId}
  │     ├── fullName: string
  │     ├── phone?: string
  │     ├── location?: string
  │     ├── group?: string
  │     ├── isDonor: boolean
  │     ├── isInviter: boolean
  │     ├── status: 'pending' | 'visited' | 'collected'
  │     ├── inviterStatus: 'pending' | 'invited'
  │     ├── createdByUid: string
  │     └── updatedAt: Timestamp
  │
  └── private/config
        └── inviteCode: string (12-char hex token)
```

---

## 💻 Local Setup & Development

### Prerequisites
- **Node.js**: v20+ or v22+
- **npm**: v10+

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/surabhi-04/community-donation-tracker.git
cd community-donation-tracker
npm install
```

### 2. Environment Variables Configuration
Copy `.env.example` to create your local `.env.local` configuration:
```bash
# On Windows PowerShell
Copy-Item .env.example .env.local

# On macOS / Linux
cp .env.example .env.local
```

Fill in your Firebase credentials in `.env.local`:
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef...
```

> 🔒 **Security Notice**: `.env.local` is listed in `.gitignore` and should **never** be committed to version control.

### 3. Run Development Server
```bash
# Windows / PowerShell
npm.cmd run dev

# macOS / Linux
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing, Linting & Building

The project includes automated regression tests, fast linting, and TypeScript production compilation:

```bash
# Run automated test suites (Team persistence, duplicate detection, groups workflow)
npm test

# Run Oxlint static analysis
npm run lint

# Compile TypeScript and generate production Vite bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 🔥 Firebase Setup Guide

1. Navigate to the [Firebase Console](https://console.firebase.google.com/) and create or select your project.
2. **Authentication**:
   - Go to **Build** → **Authentication** → **Sign-in method**.
   - Enable the **Google** sign-in provider.
   - Under **Authorized domains**, ensure your deployment domain (e.g. `community-donation-tracker-*.vercel.app`) is added.
3. **Firestore Database**:
   - Go to **Build** → **Firestore Database** → **Create database**.
   - Choose production mode and select your region.
4. **Register Web App**:
   - In **Project Settings**, register a Web App and copy the config credentials into your `.env.local` or hosting provider environment settings.

---

## 🚀 Deployment to Vercel

The application is pre-configured for deployment on **Vercel** via `vercel.json` with SPA routing rules.

### Option A: Deploy via Vercel CLI
```bash
# Deploy to preview
npx vercel

# Deploy directly to production
npx vercel --prod
```

### Option B: Deploy via GitHub Integration
1. Push your repository to GitHub.
2. Import the repository in the [Vercel Dashboard](https://vercel.com/new).
3. Select framework preset **Vite**.
4. Add all `VITE_FIREBASE_*` variables from `.env.local` to **Environment Variables**.
5. Click **Deploy**.

---

## 🛡️ Security & Production Considerations

- **Client-Side Credential Safety**: Firebase Web API keys are identifiers meant for browser communication. Real database protection is enforced strictly through **Firestore Security Rules**.
- **No Hardcoded Secrets**: No private service-account keys or server-side credentials exist in the client repository.
- **Team Isolation**: Firestore rules verify that requests originate from authenticated users who belong to the corresponding `teams/{teamId}/members` subcollection.

---

## 📄 License

This repository is maintained as a portfolio project. All rights reserved.
