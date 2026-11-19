# Internship Copilot Autofill

A Chrome extension (Manifest V3) that fills internship application forms from your Internship Copilot profile:
Workday, Greenhouse, Lever, Ashby, SmartRecruiters and most plain HTML forms.

**Install:** unzip, open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, choose this folder.
**Connect:** in the web app open **Autofill**, click **Copy profile code**, paste it into the extension.
**Use:** on an application page click the extension, then **Fill this page**. On Workday, click **Add** under Work
Experience and Education first so the empty boxes exist.

Privacy: the extension has no host permissions. It only runs on a tab when you click **Fill this page**
(`activeTab`), stores your profile in `chrome.storage.local` on this device, and sends nothing anywhere.
It fills empty fields only and never submits a form.

Rebuild the download in the web app after changes: `python extension/build.py`.
