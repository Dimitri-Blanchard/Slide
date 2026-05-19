# Android App Links (QR login opens the app directly)

When `https://sl1de.xyz/qr-login?...` is verified, Android opens Slide instead of the browser after scanning the QR code.

## Setup

1. Get your **release** signing certificate SHA-256 fingerprint:

   ```bash
   keytool -list -v -keystore your-release.keystore -alias your-alias
   ```

2. Copy `public/.well-known/assetlinks.json.example` to `public/.well-known/assetlinks.json` and replace the fingerprint (colons optional; Google accepts both formats).

3. Deploy so `https://sl1de.xyz/.well-known/assetlinks.json` is served with `Content-Type: application/json`.

4. Reinstall the release APK (not debug) and wait a few minutes for verification, or run:

   ```bash
   adb shell pm verify-app-links --re-verify com.slide.messenger
   ```

Debug builds (`com.slide.messenger.debug`) do not use App Links; use the in-page **Ouvrir Slide** button or scan from the Slide app if testing a debug APK.
