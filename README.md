# 🔔 Internship Alert Agent (WhatsApp) + ✈️ Internship Copilot

This repo has two parts:
- **`agent/`**: checks for new internships every 15 minutes and sends matches to WhatsApp (this page).
- **`app/`**: Internship Copilot, an AI chat app over all the live listings. See [app/README.md](app/README.md).


Checks for new internships **every 15 minutes** and sends matching ones straight to your WhatsApp,
so you can apply within minutes of a posting going live.

**Tuned for:** Raghav Venkat · CS @ RVCE · AI/ML, backend, full stack, SWE (no frontend-only roles)
- **Onsite / hybrid, Summer 2027:** Austin · Dallas (+ Plano, Irving, Richardson, Frisco) · Houston · Bay Area · Bangalore
- **Remote, Jan–June 2027:** remote roles in India or the US
- Roles without visa sponsorship are **included** (you're work-authorised and will relocate)
- Master's/PhD/MBA-only roles, hardware, PM, sales etc. are filtered out. Listings that ask you to pay are blocked.

## What you'll get

| When | What |
|---|---|
| First run | A "you're live" message + the top ~9 roles open right now |
| Within ~15 min of a posting | 🔥 **Instant alert** for strong matches (your cities or remote, relevant role) |
| Every evening at 8 PM IST | 📰 **Digest** of weaker matches (other US/India cities, generic titles) |
| Always | `MATCHES.md` in this repo: every open matching role, ranked, with links |

Each alert shows the role, company, location, dates, stipend (if listed), why it fits you, a 0–100 match score and the apply link.
On today's data that works out to about **4–6 instant alerts/day and ~10 digest roles/day**.

## Where it looks

1. **SimplifyJobs Summer 2027 list:** a community-maintained feed of 5,000+ live internships at US companies (Google, Microsoft, Amazon, Nvidia, TikTok, ServiceNow...). Updated many times a day.
2. **Company career boards** (`companies.yaml`): direct Greenhouse / Lever / Ashby boards. These mainly add India/Bangalore roles at companies like Databricks, Stripe, Postman, Rubrik, CRED, Sarvam.
3. **Internshala:** Bangalore + work-from-home CS/ML/software listings. Because it's noisy, these only trigger instant alerts if the stipend is ≥ ₹10,000/month. The rest go to the digest.

LinkedIn and Naukri block bots, so for those, turn on their own **job alerts** (search → "Set alert") and get them by email/push.

---

## Setup with Meta WhatsApp Cloud API (recommended: free, no second SIM)

Meta gives every developer app a **free test business number** that can message up to 5 verified numbers, with no payment method and no business verification. Alerts come from that number to your own WhatsApp.

How messages are sent: WhatsApp only allows free-form messages within 24 hours of *you* messaging the business number. Outside that window it requires **approved templates**. The agent handles this for you: it tries a normal (rich, grouped) message first, and if the window is closed it automatically sends one template message per job.

### Step 1: Create the Meta app (~10 min)
1. Go to **developers.facebook.com** → log in with Facebook → **My Apps → Create app**.
   Pick the use case **"Connect with customers through WhatsApp"** (or type *Business*), and create/select a business portfolio when asked (just your name is fine).
2. In the app, open **WhatsApp → API Setup**. Meta has created a test number (`+1 555…`).
   - Copy the **Phone number ID** (a long number, *not* the phone number itself).
   - Under **To → Manage phone number list**, add `+91 8762537925` and enter the code WhatsApp sends you.
   - Click **Send message** to receive Meta's `hello_world` test. If it arrives, the connection works.

### Step 2: Create two templates (~5 min plus approval)
Open **WhatsApp Manager → Message templates → Create template** (link on the API Setup page, or business.facebook.com/wa/manage/message-templates).

**Template 1**: Category **Utility**, name `job_alert`, language **English** (`en`). Body:
```
New internship match for you!
Role: {{1}}
Company: {{2}}
Location: {{3}}
Details: {{4}}
Apply: {{5}}
Good luck!
```
Samples: `Software Engineer Intern` · `PayPal` · `Austin, TX` · `Summer 2027 · match 92/100` · `https://paypal.eightfold.ai/careers/job/274922982814`

**Template 2**: Category **Utility**, name `agent_update`, language **English**. Body:
```
Update from your internship alert agent: {{1}}
- Sent automatically
```
Sample: `Agent is live. 1100 open roles match you right now.`

Wait until both show **Active/Approved**. If you chose "English (US)" instead of "English", add a secret `META_WA_TEMPLATE_LANG` = `en_US`.

### Step 3: Make a permanent access token
The token on the API Setup page expires in 24 hours, so make one that doesn't:
1. **business.facebook.com → Settings → Users → System users → Add**. Name it `alert-bot`, role **Admin**.
2. **Assign assets**: add your **app** (full control) and your **WhatsApp account** (full control).
3. **Generate new token** → pick your app → expiry **Never** → tick `whatsapp_business_messaging` and `whatsapp_business_management` → copy the token. You won't be able to see it again.

### Step 4: Put the code on GitHub
1. New repository on github.com, e.g. `internship-alerts`, **Public** (free unlimited Actions minutes; secrets stay secret). If Private, change `*/15` to `*/30` in `.github/workflows/alerts.yml`.
2. **Add file → Upload files**, then drag in everything from this folder, including the hidden `.github` folder (Mac: `Cmd+Shift+.`; Windows: View → Show → Hidden items).

### Step 5: Add secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `META_WA_TOKEN` | the permanent token from Step 3 |
| `META_WA_PHONE_NUMBER_ID` | the Phone number ID from Step 1 |
| `META_WA_TO` | `918762537925` |

### Step 6: Turn it on
1. **Actions** tab → enable workflows → **Internship alerts → Run workflow → mode `test`**. You should get the "Update from your internship alert agent" message.
2. Run again with mode **`run`** for the "live" message and today's top roles.

**Tip:** save the test number in your contacts and send it "hi" now and then. For the next 24 hours, alerts arrive in the richer grouped format instead of the template format.

**Cost:** messages from Meta's test number are free. If Meta ever limits the test number, add a real business number on the same API Setup page (it needs a SIM that isn't on WhatsApp). The code doesn't change, and utility messages then cost about ₹0.145 each in India.

---

## Alternative: Setup with AiSensy

AiSensy uses the **official** WhatsApp Business API, so it's very reliable. In exchange, WhatsApp requires that:
- messages come from a **business number** (not your personal WhatsApp) and go to your personal number
- every message uses a **template approved by Meta**. You create two short templates once (below), and the agent fills in the blanks.

### Step 1: Set up AiSensy (~20 min plus template approval)
1. Sign up at **aisensy.com** and connect a WhatsApp Business API number. AiSensy's onboarding walks you through it (Facebook login → create/select a Meta Business → add a number).
   - The number must **not** already be in use on the WhatsApp app. Use a spare SIM, or AiSensy's virtual number if they offer it to you.
   - It can't be the same as your personal number `+91 8762537925`, because that's where the alerts go.
2. Check that your plan includes **API Campaigns**. If the free plan doesn't, you'll need Basic.
3. **Create template 1**: Manage → Templates → New. Name: `job_alert`, Category: **Utility**, Language: English. Body:
   ```
   New internship match for you!
   Role: {{1}}
   Company: {{2}}
   Location: {{3}}
   Details: {{4}}
   Apply: {{5}}
   Good luck!
   ```
   Sample values (Meta asks for them): `Software Engineer Intern`, `PayPal`, `Austin, TX`, `Summer 2027 · match 92/100`, `https://paypal.eightfold.ai/careers/job/274922982814`
4. **Create template 2**: name `agent_update`, Category **Utility**. Body:
   ```
   Update from your internship alert agent: {{1}}
   - Sent automatically
   ```
   Sample value: `Agent is live. 1100 open roles match you right now.`
5. Wait for both to show **Approved** (often minutes, sometimes up to a day). If Meta reclassifies them as *Marketing*, they still work, just at the higher per-message price.
6. **Create two API campaigns**: Campaigns → + Launch → **API Campaign**. Create `job_alert_api` using template `job_alert`, and `agent_update_api` using `agent_update`. Click **Set Live** on both.
7. Copy your **API key**: Manage → API Key.
8. Optional but recommended: send any message *from your personal WhatsApp to the business number* once, so it's a known contact.

### Step 2: Put the code on GitHub
1. Create a new repository on github.com, e.g. `internship-alerts`. **Make it Public** (free unlimited Actions minutes; your keys stay secret). If you prefer Private, edit `.github/workflows/alerts.yml` and change `*/15` to `*/30`.
2. **Add file → Upload files**, then drag in everything from this folder, including the hidden `.github` folder. (Mac: `Cmd+Shift+.` shows hidden files; Windows: View → Show → Hidden items.)

### Step 3: Add secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `AISENSY_API_KEY` | the key from Step 1.7 |
| `AISENSY_JOB_CAMPAIGN` | `job_alert_api` (the exact API campaign name) |
| `AISENSY_TEXT_CAMPAIGN` | `agent_update_api` |
| `AISENSY_DESTINATION` | `918762537925` (your personal number, country code, no +) |

### Step 4: Turn it on
1. **Actions** tab → enable workflows if asked.
2. **Internship alerts → Run workflow → mode `test`**. You should get the "Update from your internship alert agent" message within a minute.
3. Run again with mode **`run`**. You'll get the "live" message plus today's top roles (one message each).

From then on it runs every 15 minutes by itself.

### Cost
AiSensy bills Meta's per-message charge. In India a utility message is about ₹0.145 (marketing ≈ ₹1.09). Each instant alert is one message, and the digest is packed into a single message, so ~5–8 messages a day is roughly **₹25–35/month** on utility pricing, plus your AiSensy plan if the free one doesn't include API campaigns.

### Free alternative: CallMeBot
Don't want a business number? Skip AiSensy and add the secrets `CALLMEBOT_PHONE` (`+918762537925`) and `CALLMEBOT_APIKEY` instead. To get the key, save the bot number from callmebot.com's WhatsApp page and send it `I allow callmebot to send me messages`. With CallMeBot, alerts come grouped (3 per message) in a richer format.

## Tweaking it
Edit these files directly on GitHub (pencil icon); changes apply on the next run.

- **`config.yaml`**: cities, role keywords, excluded words, the instant-alert threshold (`instant_min_score`), digest time, list of well-known companies.
- **`companies.yaml`**: add any company's careers board (instructions inside). Check **`STATUS.md`** after a run to see which boards worked; a wrong name just shows `HTTP 404` and is skipped.

### Other delivery options (optional)
All channels can run at the same time; each alert goes to every channel you've configured.
- **Twilio WhatsApp:** more robust than CallMeBot. Add secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_TO` (`+918762537925`) and optionally `TWILIO_WHATSAPP_FROM`. Note: the free sandbox needs you to re-send the join code every 72h.
- **Telegram:** most reliable and free. Create a bot via @BotFather and add `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.
You can enable several channels at once; each message goes to all of them.

## Troubleshooting
- **Meta error `131030`/`131056`?** Your number isn't in the test recipient list (Step 1). **`132000`** means the template variable count doesn't match (job_alert needs 5, agent_update needs 1). **`132001`** means the template name or language is wrong. **`190`** means the token expired or is wrong, so redo Step 3.
- **AiSensy error in the log?** `campaign not found` means the campaign name secret doesn't match or the campaign isn't *Live*. A template-parameter error means the template doesn't have exactly 5 (job) / 1 (update) variables.
- **No messages?** Actions tab → open the latest run → read the log. "No WhatsApp/Telegram secrets set" means a secret name is misspelled.
- **GitHub sometimes delays scheduled runs** by 5–20 minutes at busy times. That's normal.
- **Too many / too few alerts?** Raise or lower `instant_min_score` in `config.yaml` (default 60).
- A source breaking for 24h triggers a one-time ⚠️ WhatsApp warning.
- GitHub pauses scheduled workflows in repos with no activity for 60 days. This bot commits its state every run, which normally keeps it active. If it ever stops, just re-enable it in the Actions tab.

## Run locally (optional)
```bash
pip install -r requirements.txt
python -m agent.main --dry-run   # prints messages instead of sending
python -m pytest tests           # offline tests
```
