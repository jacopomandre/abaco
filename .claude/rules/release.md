---
description: Release builds of the Android app — what to tell the user after each one
---

# Release builds

- After every release build (`npm run android:bundle` or `npm run android:release`), the build ends with
  a checklist printed by `tools/release-reminder.js` (npm runs it as the `post` script).
- ALWAYS relay that checklist to the user in the reply, in Italian, even when they only asked for the build:
  - whether the Play Store screenshots in `release/store/` still match the app (home, game screen, themes);
  - whether `appVersion` in `android/app/build.gradle` is higher than the last one uploaded to Play;
  - that AAB and APK were copied to `release/` and their signature and version verified.
- Why: the user asked to be reminded of the store screenshots every time an APK is generated.
