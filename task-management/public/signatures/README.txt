PLACEHOLDER SIGNATURE ASSETS — WS-5 Salary documents
=====================================================

These PNGs are CLEARLY-LABELLED PLACEHOLDERS (blank panel with a red baseline).
The real signature scans are PENDING from Sir.

Mapping (see lib/salary/signatories.ts):
  manan.png     -> Manan Vasa   (Altus Corp, MJV HUF, JSV HUF)
  cmv.png       -> CMV          (Unleashed)
  rutvisha.png  -> Rutvisha     (all other entities)

TO REPLACE: drop the real signature image at the same path/filename (PNG with a
transparent background works best). No code change needed — both the on-screen
Signatory Block and the PDF renderer pick up the file automatically. If a file
is missing at runtime, the code degrades to a ruled line + typed name rather
than showing a broken image.
