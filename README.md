# KidLog

**Tell Claude what happened. Show your doctor the timeline.**

KidLog keeps a dated health record for each of your children. You describe what happened to Claude in your own words, and it appears on a timeline you can correct, add appointments to, and share with the doctor as a read-only link.

KidLog has no AI inside. Your own Claude does the reading and writing; KidLog only saves, shows and shares. It records what you say and never gives medical advice.

![A child's health timeline in KidLog](docs/screenshots/timeline.png)

---

# Using KidLog

## What you need

- A Google account and a Claude account.
- The KidLog site: **https://kidlog-mcp.vercel.app**

## Set it up (about 3 minutes)

### 1. Create your family timeline

Open the KidLog site and click **Continue with Google**. Choose your Google account, type a family name, and click **Create my family timeline**.

There is no password to remember. To get back in later, open the KidLog site and click **Continue with Google** or **Sign in**. Only your Google account can open your timeline.

If you created a timeline before sign-in existed, open your old private link once and click **Sign in with Google**. The timeline is then attached to your account and the old link stops working for anyone else.

![The KidLog home page](docs/screenshots/home.png)

### 2. Connect Claude

KidLog's connector address is the same for everyone: `https://kidlog-mcp.vercel.app/mcp`. It is also shown on the **Connect Claude** page.

![The Connect Claude page with the connector address and steps](docs/screenshots/connect.png)

In Claude:

1. Go to **Customize > Connectors**.
2. Click **Add**, then **Add custom connector**.
3. Name it `KidLog`, paste the address as the server URL, and click **Add**.
4. Click **Connect**. A KidLog page opens: sign in with Google if asked, then click **Allow**.
5. In a new chat, open the **+** menu, choose **Connectors**, and make sure KidLog is switched on.

The address is not a secret. Claude can reach your timeline only after you sign in and click **Allow**, and each parent connects their own Claude. To cut Claude off, click **Disconnect Claude** on the **Connect Claude** page.

### 3. Tell Claude what happened

In a chat with KidLog switched on, say it the way you would tell a friend:

> Vedant woke up coughing at 2:15 last night, felt a bit warm but no high fever. Refused his milk and settled around 3. Log this, I want to raise it with the doctor.

Claude saves it as a dated entry, and it appears on the timeline within a few seconds. A child is added automatically the first time you mention them.

## What you can say to Claude

| You want to | Say something like |
|---|---|
| Add your children | "Add my kids to KidLog. Vedant was born on 14 August 2024 and Jay on 22 June 2022." |
| Log a symptom | "Jay had a stomach ache at 7:30 this morning, no fever. Fine by 9." |
| Log medicine and temperature | "Gave Vedant 5 ml paracetamol at 8 AM. Temperature was 100.2 F before." |
| Log a doctor visit or vaccine | "Vedant had his check-up on 3 November. Weight 12.4 kg, height 88 cm." |
| Flag something for the doctor | End with "I want to raise this with the doctor." |
| Correct an entry | "Actually the cough started at 1:30, not 2:15." |
| Add an appointment | "Jay has a follow-up with the paediatrician on 28 January at 5 PM." |
| Prepare for a visit | "Summarise Vedant's last two weeks for the doctor." |

## Using the app

### Edit anything Claude wrote

Every entry has an **Edit entry** button. Change the time, the wording, the temperature or the type, or tick **Raise this with the doctor**. You can also add entries by hand with **Add an entry**.

![Editing an entry](docs/screenshots/edit.png)

### See one child at a time

Use the buttons above the timeline: **All children**, then one per child. **Flagged only** shows just the entries marked for the doctor, and the period menu narrows the list to the last 7, 30 or 90 days.

Manage names and birth dates on the **Children** page. The birth date is used to show the child's age.

![The Children page](docs/screenshots/children.png)

### Keep appointments in view

The **Upcoming appointments** card sits at the top of the right-hand panel. It shows the next doctor or vaccine appointment for the child you are viewing, with its date, time and notes, and how soon it is ("Tomorrow", "2 days to go"). Click **View details** to edit it, **Add appointment** to add as many as you need, or **View all** for the full list.

![The appointments list](docs/screenshots/appointments.png)

### Invite the other parent

Click **Invite** on the **Invite another parent** card beside the timeline, or open **Parents**, and click **Create invite link**, then send the link yourself, for example on WhatsApp. The other parent opens it, signs in with Google, and gets the same timeline with full access to add and edit.

- An invite link works once and expires after 7 days. You can cancel it before it is used.
- A Google account can belong to one family only.
- The parent who created the family can remove other parents. An invited parent can leave.
- Removing a parent also stops their Claude from reading or adding to the timeline.

### Share with your doctor

Open **Share with doctor**, choose whose timeline and what to include, and click **Create link**.

- **Whose timeline:** one child, or all children.
- **What to include:** the entire list, or only entries flagged for the doctor.

![Creating a share link](docs/screenshots/share.png)

The doctor opens the link in any browser. They can read and print it, and cannot change anything. A link for one child never shows another child's entries.

![What the doctor sees](docs/screenshots/doctor-view.png)

Every link you create is listed on the same page with a **Turn off** button. A link that is turned off stops working straight away.

## Good to know

- **Privacy:** your timeline opens only for the Google accounts listed on the **Parents** page. KidLog stores your Google name and email address, never a password. Share links for doctors are separate and read-only. The **Privacy** link at the bottom of every page says what KidLog stores and how to have it deleted.
- **One family per account:** each Google account belongs to one family timeline, either one it created or one it was invited to.
- **Not medical advice:** KidLog stores what you tell it. It does not diagnose, rate urgency or suggest treatment. If you are worried about your child, contact your doctor.
- **Works on your phone:** the connector works in Claude on the web, desktop and mobile, and the KidLog site works in any browser.

## If something isn't working

| Problem | What to do |
|---|---|
| Claude doesn't offer to save anything | Check that KidLog is switched on under **+ > Connectors** in that chat. |
| Claude can log entries but not appointments | Remove the KidLog connector in Claude and add it again with the same link, so it picks up the newest actions. |
| The entry doesn't appear | Refresh the timeline, and check you are viewing the right child or **All children**. |
| Claude says the connection link has been retired | You added KidLog with an old per-family link. Remove the connector in Claude and add `https://kidlog-mcp.vercel.app/mcp` instead. |
| The approval page says it has expired | It is valid for 10 minutes and works once. Go back to Claude and click **Connect** again. |
| I can't find my timeline | Open the KidLog site and click **Sign in** with the Google account you signed up with. |
| "This timeline belongs to a different account" | You are signed in with a different Google account. Click **Sign out** and sign in with the right one. |
| The invite link says it has expired or was already used | Each link works once, for 7 days. Create a new one on the **Parents** page. |
| The invited parent sees "already belongs to the family…" | Their Google account already has its own KidLog family. They need to sign in with a different Google account. |
| Claude stopped saving | Open **Connect Claude**. If it does not say Claude is connected, open your connectors in Claude and connect KidLog again. A connection that is not used for 90 days expires. |

---

# For developers

## How it works

```
Parent types in Claude  ──►  Claude calls a KidLog tool over MCP  ──►  KidLog saves a row in Postgres
                                                                              │
Doctor opens a read-only link  ◄──  Parent edits, flags and shares in the web app
```

One small Node.js service serves both the web pages and the MCP endpoint. There are no AI keys, AI libraries or AI calls anywhere in this code.

| Piece | Choice |
|---|---|
| Runtime | Node.js 20 or newer, Express 5 |
| Storage | Postgres (tables are created automatically on first request) |
| MCP | `@modelcontextprotocol/sdk`, Streamable HTTP, stateless (a fresh server per request, so it runs on serverless hosts) |
| Pages | Server-rendered HTML with inline CSS; no front-end framework or build step |
| Access | Web pages: Google sign-in (OAuth, written by hand with `fetch`) and a session cookie; a family can have several parent accounts, joined by invite link. MCP: OAuth 2.1 with KidLog as the authorization server (endpoints from the MCP SDK). Doctor links: unguessable random keys in the URL |

## MCP tools

Endpoint: `POST /mcp`, the same address for every family. A request without a valid token gets `401` with a pointer to the sign-in details, which is what makes Claude start sign-in.

### Connector sign-in (OAuth)

KidLog is its own OAuth authorization server. The parent signs in with their KidLog account (Google), approves on a KidLog page, and Claude receives tokens tied to that parent. Each request is served from whichever family that parent belongs to at that moment.

| Piece | Detail |
|---|---|
| Discovery | `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server` |
| Client registration | Dynamic Client Registration at `/register`; public clients, no secret needed |
| Authorization | `/authorize` with PKCE (S256) required; the approval form posts to `/oauth/consent` |
| Redirect addresses | Whatever the client registered, e.g. `https://claude.ai/api/mcp/auth_callback`; loopback addresses match on any port |
| Tokens | `/token`; access tokens last 1 hour, refresh tokens 90 days and are replaced on every use; `/revoke` is supported |
| Storage | Only SHA-256 hashes of codes and tokens are stored |

Tool annotations: the three read tools are `readOnlyHint: true`. `update_event` and `save_child_profile` can replace saved values and are `destructiveHint: true`. `log_event` and `add_appointment` only add rows and are `destructiveHint: false`. No tool deletes anything.

### Tools

| Tool | What it does |
|---|---|
| `log_event` | Save one event (symptom, temperature, medicine, feeding, sleep, doctor visit, vaccine, note) |
| `get_timeline` | Read entries, with optional child, date range and flagged-only filters |
| `update_event` | Correct fields of an existing entry |
| `list_children` | List children with birth date, age and entry counts |
| `save_child_profile` | Add a child or set a birth date |
| `add_appointment` | Save an upcoming doctor or vaccine appointment |
| `list_appointments` | List appointments, soonest first |

The server's instructions tell Claude to record only what the parent said, to add no clinical wording or severity, and never to guess a birth date.

## Web routes

| Route | Purpose |
|---|---|
| `/` | Home page; sends a signed-in parent to their timeline |
| `/how-it-works` | Public page explaining the app step by step |
| `/auth/google`, `/auth/google/callback` | Google sign-in; `POST /logout` signs out |
| `/signup` | Family name form shown after the first sign-in; `POST` creates the family |
| `/f/<key>` | Timeline (query: `child`, `flagged=1`, `range=7|30|90`). All `/f/` pages need a parent of that family to be signed in |
| `/f/<key>/e/<id>` | Edit an entry; `/new` adds one |
| `/f/<key>/kids` | Child profiles |
| `/f/<key>/parents` | Parents with access; create or cancel the invite link, remove a parent |
| `/join/<token>` | Invite link: sign in and join the family |
| `/f/<key>/appointments` | Appointments list, add and edit |
| `/f/<key>/share` | Create and turn off doctor share links |
| `/f/<key>/connect` | The connector address and setup steps; `POST /connect/disconnect` ends that parent's Claude connection |
| `/privacy` | Public privacy policy |
| `/authorize`, `/token`, `/register`, `/revoke`, `/oauth/consent` | Connector sign-in (see above) |
| `/d/<token>` | Read-only doctor view, locked to the link's child and flagged-only setting |
| `/healthz` | Returns `ok` when the database is reachable |

## Data model

| Table | Holds |
|---|---|
| `users` | One row per Google account: Google id, email, name |
| `sessions` | Signed-in browsers: hash of the cookie token, user, expiry (30 days) |
| `oauth_clients` | Apps registered to connect (Claude registers itself); unused ones are cleared after 30 days |
| `oauth_grants` | Connector sign-in records: pending approvals, one-time codes, access and refresh tokens, all as hashes with an expiry |
| `spaces` | One row per family: private key, name, the account that created it |
| `space_members` | Which accounts can open which family; one family per account |
| `invites` | Pending invite link per family: token, expiry (7 days); deleted when used |
| `children` | Name and birth date, unique per family |
| `entries` | Health events: child, time, category, title, details, temperature, flag, source |
| `appointments` | Upcoming visits: child, type, time, title, notes |
| `shares` | Doctor links: token, child (or all), flagged-only setting |

A family created before sign-in existed has no owner. The first person to open its `/f/<key>` link and sign in becomes the owner. Families created with the first version of sign-in get their owner added to `space_members` automatically.

Dates and times are stored as local text (`YYYY-MM-DDTHH:MM`) exactly as the parent gave them, with no timezone conversion.

## Run it locally

```
npm install
DATABASE_URL=postgres://user:password@localhost:5432/kidlog \
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm start
```

Then open http://localhost:3000.

## Set up Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and open **Google Auth Platform**. Fill in the app name and support email, and choose **External** as the audience.
2. Under **Clients**, create an OAuth client of type **Web application**.
3. Add an **Authorised redirect URI** for every address the app runs at, ending in `/auth/google/callback`:
   - `https://kidlog-mcp.vercel.app/auth/google/callback`
   - `http://localhost:3000/auth/google/callback`
4. Copy the client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Publish the app (move it out of **Testing**) so that any Google account can sign in, not only the test users you list.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (`POSTGRES_URL` is also accepted) |
| `PORT` | No | Port to listen on; defaults to 3000 |
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID from Google |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret from Google |
| `PUBLIC_URL` | Yes in production | Public https address of the site, e.g. `https://kidlog-mcp.vercel.app`. Used in generated links, the Google redirect address and the connector's sign-in addresses |
| `SUPPORT_EMAIL` | Yes in production | Contact address shown in the privacy policy |

## Deploy

**Vercel with Neon Postgres**

1. Push this repository to GitHub.
2. In Vercel, choose **Add New > Project**, import the repository, and deploy with the default settings.
3. In the project's **Storage** tab, create a **Neon** Postgres database and connect it. This sets `DATABASE_URL`.
4. In **Settings > Environment Variables**, add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL` and `SUPPORT_EMAIL`.
5. Redeploy, then open `/healthz` on your site to confirm it shows `ok`.

`vercel.json` routes every request to `api/index.js`, which exports the Express app.

**Render:** choose **New > Blueprint** and pick the repository; `render.yaml` creates the web service and database, and asks for the two Google values. The free plan sleeps when idle.

## Project files

| File | Contents |
|---|---|
| `app.js` | Express routes for all pages |
| `auth.js` | Google sign-in, sign-out and the session cookie |
| `oauth.js` | Sign-in for the Claude connector: approval step and token rules |
| `mcp.js` | The MCP endpoint, tool definitions and instructions to Claude |
| `db.js` | Tables, queries and input validation |
| `views.js` | HTML pages and CSS |
| `server.js` | Starts the app on a normal host |
| `api/index.js`, `vercel.json` | Entry point and routing for Vercel |
| `render.yaml` | Blueprint for Render |
| `public/` | Logo and icons: `logo.png` (top bar), `favicon.png`, `apple-touch-icon.png`, `icon-512.png` (connector listing) |
| `docs/screenshots/` | Images used in this README |
