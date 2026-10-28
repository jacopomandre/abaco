// Abaco Zuzzurellone - release checklist, printed after every release build.
// npm runs it by itself after `npm run android:bundle` and `npm run android:release` (the "post" scripts
// of package.json), so the reminder shows up whoever starts the build.
'use strict';

const fs = require('fs');
const path = require('path');

// The version being built, read from where it is set (see appVersion in android/app/build.gradle)
const gradle  = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'build.gradle'), 'utf8');
const match   = gradle.match(/^def appVersion = '([^']+)'/m);
const version = match ? match[1] : '?';

console.log(`
==================== RELEASE ${version}: PROMEMORIA ====================
1. Screenshot dello Store: rispecchiano ancora l'app? Se la grafica di home,
   partita o temi e' cambiata, vanno rifatti (release/store/).
2. Versione: appVersion in android/app/build.gradle e' piu' alta dell'ultima
   caricata su Play? Play rifiuta un versionCode gia' usato.
3. Copia AAB e APK in release/ e verifica firma e versione prima di caricarli.
========================================================================
`);
