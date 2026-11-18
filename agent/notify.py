"""WhatsApp (CallMeBot or Twilio) and optional Telegram delivery."""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

import requests

log = logging.getLogger("notify")
FLAG = {"preferred": "📍", "remote": "🏠", "other_us": "🇺🇸", "other_india": "🇮🇳"}


def format_job(job, ev, n=None):
    head = f"{n}. " if n else ""
    lines = [f"{head}*{job['title']}*", f"🏢 {job['company'] or 'Unknown company'}"]
    loc = ev["loc"] or ", ".join(job["locations"][:2])
    extra = f" (+{len(job['locations']) - 1} more)" if len(job["locations"]) > 1 else ""
    lines.append(f"{FLAG.get(ev['bucket'], '📍')} {loc}{extra}")
    if job.get("terms"):
        lines.append("🗓 " + ", ".join(job["terms"][:3]))
    if job.get("stipend"):
        lines.append("💰 " + job["stipend"])
    if job.get("posted"):
        d = datetime.fromtimestamp(job["posted"], tz=timezone.utc).strftime("%d %b")
        lines.append(f"🕒 posted {d}")
    if ev["reasons"]:
        lines.append("✅ " + "; ".join(ev["reasons"]))
    for t in ev["tags"]:
        lines.append("ℹ️ " + t)
    lines.append(f"⭐ match {ev['score']}/100")
    lines.append(f"👉 {job['url']}")
    return "\n".join(lines)


def build_messages(header, items, per_msg):
    msgs, chunk = [], []
    for i, (job, ev) in enumerate(items, 1):
        chunk.append(format_job(job, ev, i if len(items) > 1 else None))
        if len(chunk) == per_msg:
            msgs.append(chunk)
            chunk = []
    if chunk:
        msgs.append(chunk)
    out = []
    for k, c in enumerate(msgs):
        h = header if k == 0 else f"{header} (cont. {k + 1}/{len(msgs)})"
        out.append(h + "\n\n" + "\n\n".join(c))
    return out


class Notifier:
    def __init__(self, dry_run=False):
        self.dry = dry_run
        self.cmb_phone = os.getenv("CALLMEBOT_PHONE")
        self.cmb_key = os.getenv("CALLMEBOT_APIKEY")
        self.tw_sid = os.getenv("TWILIO_ACCOUNT_SID")
        self.tw_token = os.getenv("TWILIO_AUTH_TOKEN")
        self.tw_from = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
        self.tw_to = os.getenv("TWILIO_WHATSAPP_TO")
        self.tg_token = os.getenv("TELEGRAM_BOT_TOKEN")
        self.tg_chat = os.getenv("TELEGRAM_CHAT_ID")
        # AiSensy (official WhatsApp Business API via approved templates)
        self.ais_key = os.getenv("AISENSY_API_KEY")
        self.ais_job = os.getenv("AISENSY_JOB_CAMPAIGN")      # template with 5 variables, one job each
        self.ais_text = os.getenv("AISENSY_TEXT_CAMPAIGN")    # template with 1 variable, for updates/digests
        self.ais_to = (os.getenv("AISENSY_DESTINATION") or "").replace("+", "").replace(" ", "")
        self.ais_name = os.getenv("AISENSY_USERNAME", "Raghav")
        # Meta WhatsApp Cloud API (direct, free test number)
        self.meta_token = os.getenv("META_WA_TOKEN")
        self.meta_pnid = os.getenv("META_WA_PHONE_NUMBER_ID")
        self.meta_to = (os.getenv("META_WA_TO") or "").replace("+", "").replace(" ", "")
        self.meta_job_tpl = os.getenv("META_WA_JOB_TEMPLATE", "job_alert")
        self.meta_text_tpl = os.getenv("META_WA_TEXT_TEMPLATE", "agent_update")
        self.meta_lang = os.getenv("META_WA_TEMPLATE_LANG", "en")
        self.meta_ver = os.getenv("META_WA_API_VERSION", "v25.0")
        # Free-form text is only delivered inside the 24h window, and Meta reports the failure
        # asynchronously (webhook), so by default always use approved templates.
        self.meta_prefer_text = os.getenv("META_WA_PREFER_TEXT", "").lower() in ("1", "true", "yes")
        self.sent = 0

    def text_channels(self):
        c = []
        if self.cmb_phone and self.cmb_key:
            c.append("callmebot")
        if self.tw_sid and self.tw_token and self.tw_to:
            c.append("twilio")
        if self.tg_token and self.tg_chat:
            c.append("telegram")
        return c

    def aisensy_on(self):
        return bool(self.ais_key and self.ais_to and (self.ais_job or self.ais_text))

    def meta_on(self):
        return bool(self.meta_token and self.meta_pnid and self.meta_to)

    def channels(self):
        return (self.text_channels() + (["aisensy"] if self.aisensy_on() else [])
                + (["meta"] if self.meta_on() else []))

    @staticmethod
    def _retry(name, fn, *a):
        for attempt in range(3):
            try:
                fn(*a)
                return True
            except Exception as e:
                log.warning("%s send failed (try %d): %s", name, attempt + 1, e)
                time.sleep(5 * (attempt + 1))
        return False

    def send(self, text):
        """Free-form update (intro, digest summary, warnings)."""
        if self.dry or not self.channels():
            print("\n──── message ────\n" + text)
            return True
        ok = False
        for ch in self.text_channels():
            ok |= self._retry(ch, getattr(self, f"_{ch}"), text)
        if self.aisensy_on():
            if self.ais_text:
                ok |= self._retry("aisensy", self._aisensy, self.ais_text, [flatten(text, 900)])
            else:  # reuse the job template
                ok |= self._retry("aisensy", self._aisensy, self.ais_job,
                                  ["Update from your alert agent", "Internship Alert Agent", "-",
                                   flatten(text, 300), "-"])
        if self.meta_on():
            ok |= self._meta_text_or_template(text, self.meta_text_tpl, [flatten(text, 900)])
        self.sent += 1
        time.sleep(3)  # CallMeBot rate limits rapid-fire messages
        return ok

    def send_jobs(self, header, items, per_msg, compact_fallback=False):
        """Job alerts: grouped text messages for CallMeBot/Twilio/Telegram, one template message per job for AiSensy."""
        if not items:
            return
        if self.dry or not self.channels():
            for m in build_messages(header, items, per_msg):
                print("\n──── message ────\n" + m)
            return
        if self.text_channels():
            for m in build_messages(header, items, per_msg):
                for ch in self.text_channels():
                    self._retry(ch, getattr(self, f"_{ch}"), m)
                time.sleep(3)
        if self.aisensy_on():
            if self.ais_job:
                for job, ev in items:
                    self._retry("aisensy", self._aisensy, self.ais_job, job_params(job, ev))
                    time.sleep(1)
            else:  # only a text template: pack the jobs into it
                lines = [f"{j['title']} @ {j['company']} ({ev['loc']}) {j['url']}" for j, ev in items]
                self._retry("aisensy", self._aisensy, self.ais_text, [flatten(header + ": " + " • ".join(lines), 900)])

        if self.meta_on():
            msgs = build_messages(header, items, per_msg)
            if self._meta_try_text(msgs[0]):
                for m in msgs[1:]:
                    self._meta_try_text(m)
            elif compact_fallback:  # digest: one template message, not 15
                lines = [f"{j['title']} @ {j['company']} ({ev['loc']}) {j['url']}" for j, ev in items[:6]]
                self._retry("meta", self._meta_template, self.meta_text_tpl,
                            [flatten(header + ": " + " • ".join(lines), 900)])
            else:  # 24h window closed -> one approved template message per job
                for job, ev in items:
                    self._retry("meta", self._meta_template, self.meta_job_tpl, job_params(job, ev))

    # ── Meta Cloud API ──
    def _meta_post(self, payload):
        r = requests.post(f"https://graph.facebook.com/{self.meta_ver}/{self.meta_pnid}/messages",
                          headers={"Authorization": f"Bearer {self.meta_token}"},
                          json={"messaging_product": "whatsapp", "to": self.meta_to, **payload}, timeout=30)
        if r.status_code >= 300:
            raise MetaError(r.status_code, r.text[:400])
        return r

    def _meta_try_text(self, text):
        """Free-form message: only works inside the 24h window after you last messaged the number."""
        if not self.meta_prefer_text:
            return False
        try:
            self._meta_post({"type": "text", "text": {"preview_url": False, "body": text[:4000]}})
            return True
        except MetaError as e:
            if not e.window_closed:
                log.warning("meta text failed: %s", e)
            return False
        except Exception as e:
            log.warning("meta text failed: %s", e)
            return False

    def _meta_template(self, name, params):
        langs = [self.meta_lang] + [l for l in ("en", "en_US", "en_GB") if l != self.meta_lang]
        for i, lang in enumerate(langs):
            try:
                self._meta_post({"type": "template", "template": {
                    "name": name, "language": {"code": lang},
                    "components": [{"type": "body", "parameters": [{"type": "text", "text": p} for p in params]}]}})
                if lang != self.meta_lang:
                    log.info("template %s works with language %s; remembering it", name, lang)
                    self.meta_lang = lang
                return
            except MetaError as e:
                # 132001 = this name/language pair doesn't exist; try the next English variant
                if "132001" not in str(e) or i == len(langs) - 1:
                    raise

    def _meta_text_or_template(self, text, tpl, params):
        if self._meta_try_text(text):
            return True
        return self._retry("meta", self._meta_template, tpl, params)

    def _aisensy(self, campaign, params):
        r = requests.post("https://backend.aisensy.com/campaign/t1/api/v2", json={
            "apiKey": self.ais_key, "campaignName": campaign, "destination": self.ais_to,
            "userName": self.ais_name, "source": "internship-alert-agent",
            "templateParams": params}, timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"AiSensy {r.status_code}: {r.text[:300]}")

    def _callmebot(self, text):
        r = requests.get("https://api.callmebot.com/whatsapp.php",
                         params={"phone": self.cmb_phone, "text": text[:3500], "apikey": self.cmb_key},
                         timeout=30)
        if r.status_code != 200 or "error" in r.text.lower()[:300]:
            raise RuntimeError(f"CallMeBot {r.status_code}: {r.text[:200]}")

    def _twilio(self, text):
        to = self.tw_to if self.tw_to.startswith("whatsapp:") else f"whatsapp:{self.tw_to}"
        r = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{self.tw_sid}/Messages.json",
                          data={"From": self.tw_from, "To": to, "Body": text[:1550]},
                          auth=(self.tw_sid, self.tw_token), timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"Twilio {r.status_code}: {r.text[:200]}")

    def _telegram(self, text):
        r = requests.post(f"https://api.telegram.org/bot{self.tg_token}/sendMessage",
                          json={"chat_id": self.tg_chat, "text": text.replace("*", ""),
                                "disable_web_page_preview": True}, timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"Telegram {r.status_code}: {r.text[:200]}")


class MetaError(RuntimeError):
    def __init__(self, status, body):
        super().__init__(f"Meta {status}: {body}")
        # 131047 = re-engagement required (24h window closed); 131026/470 older variants
        self.window_closed = any(c in body for c in ("131047", "131026", '"code":470'))


def flatten(text, limit):
    """WhatsApp template variables can't contain newlines, tabs or 4+ spaces in a row."""
    import re
    t = text.replace("*", "")
    t = re.sub(r"\s*\n\s*", " | ", t)
    t = re.sub(r"[\t ]{2,}", " ", t).strip(" |")
    return t[: limit - 1] + "…" if len(t) > limit else t or "-"


def job_params(job, ev):
    """5 variables for the AiSensy job template: {{1}} role, {{2}} company, {{3}} location,
    {{4}} details (dates, match score, notes), {{5}} apply link."""
    loc = ev["loc"] or ", ".join(job["locations"][:2])
    if len(job["locations"]) > 1:
        loc += f" (+{len(job['locations']) - 1} more)"
    bits = []
    if job.get("terms"):
        bits.append(", ".join(job["terms"][:3]))
    if job.get("stipend"):
        bits.append(job["stipend"])
    bits.append(f"match {ev['score']}/100")
    bits += ev["reasons"][:1] + ev["tags"][:2]
    return [flatten(job["title"], 200), flatten(job.get("company") or "Unknown", 100),
            flatten(loc, 120), flatten(" · ".join(bits), 300), job["url"] or "-"]
