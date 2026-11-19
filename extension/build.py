"""Zips the extension into the web app's public folder so the Autofill page can offer it for download.
Run after changing anything in extension/:  python extension/build.py"""
import pathlib
import zipfile

here = pathlib.Path(__file__).parent
out = here.parent / "app" / "frontend" / "public" / "internship-copilot-autofill.zip"
files = ["manifest.json", "popup.html", "popup.css", "popup.js", "filler.js", "README.md", "icons/16.png", "icons/48.png", "icons/128.png"]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(here / f, f"internship-copilot-autofill/{f}")
print("wrote", out, out.stat().st_size, "bytes")
