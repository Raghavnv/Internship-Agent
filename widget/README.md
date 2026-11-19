# Menu-bar widget (macOS)

A briefcase in your Mac's menu bar that shows how many **new internships that fit you** were posted in the
last 24 hours. Click it for:

- companies you **watch**, and whether they've opened (with a Mac notification the day one does)
- companies that **usually open this week**, predicted from past seasons
- new matches from the last 24 hours and your best fits (likely ghost listings are skipped), each with an Apply link

You also get a Mac notification when a new strong match appears.

It reads the listings your alert agent publishes every 15 minutes (the `data` branch of this repo), so it
works without the Copilot app being deployed and needs no keys.

## Install (2 minutes)

Open **Terminal** and paste:

```bash
curl -fsSL https://raw.githubusercontent.com/Raghavnv/Internship-Agent/main/widget/install.sh | bash
```

This installs [SwiftBar](https://swiftbar.app) (free, open source) with Homebrew if needed, puts the widget in
`~/SwiftBarPlugins`, and starts it. If SwiftBar asks you to pick a plugin folder, choose `~/SwiftBarPlugins`.

No Homebrew? Download SwiftBar from swiftbar.app, then run the command above again.

The first time it shows a notification, macOS may ask whether SwiftBar can send notifications. Click **Allow**.

## Settings

Click the briefcase, hold **Option**, then choose **Plugin settings** (or edit the `VAR_` values at the top of
`internships.15m.js`):

| Setting | Default | What it does |
|---|---|---|
| `VAR_MIN_FIT` | 60 | Only count roles with at least this fit score |
| `VAR_NOTIFY` | true | Mac notification for new strong matches |
| `VAR_NOTIFY_FIT` | 80 | Only notify for new roles with at least this fit |
| `VAR_APP_URL` | empty | Your deployed Internship Copilot URL, adds an "Open Internship Copilot" item |
| `VAR_WATCH` | empty | Companies to watch, comma separated, e.g. `Stripe, Google, Hugging Face` |

The `15m` in the file name is the refresh interval; rename it (e.g. `internships.5m.js`) to change it.

## Test the logic (any OS)

```bash
node widget/test.js path/to/jobs.json
```

## Briefcase not showing?

Run `~/SwiftBarPlugins/internships.15m.js | head -3` in Terminal. If it prints a number and `sfimage=briefcase`,
the widget works and macOS is hiding the icon: on Macs with a notch, items that don't fit are dropped.
Install [Ice](https://icemenubar.app) (`brew install --cask jordanbaird-ice`) and move the briefcase to its
Visible section, and check System Settings → Menu Bar → Allow in the Menu Bar → SwiftBar.
