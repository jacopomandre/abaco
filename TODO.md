# TODO

Per richiedere un fix, citare l'elemento tramite il suo numero.

## Sicurezza — endpoint pubblico senza autenticazione

Contesto: app esposta su EC2 con un solo endpoint anonimo in sola lettura (`GET /api/words/random`), nessun database e nessuno stato lato server. La parola segreta arriva al browser in Base64: e offuscamento, non protezione. Rischio principale: DoS volumetrico.

### Alta

#### #1 — Edge AWS: CloudFront + WAF + ALB davanti all'EC2
Mettere CloudFront + AWS WAF (rate-based rule, es. 100 req / 5 min / IP) davanti a un ALB che termina TLS con certificato ACM. EC2 raggiungibile solo dal Security Group dell'ALB sulla porta dell'app. Da valutare: costo WAF (~5$ + 0.60$/M req) vs alternativa nginx on-EC2 (piu economica ma niente protezione DDoS volumetrica e gestione manuale dei certificati).

#### #2 — SSH: chiudere porta 22, usare SSM Session Manager
Rimuovere ingress su 22 dal Security Group EC2 e accedere via AWS SSM Session Manager (richiede IAM role sull'istanza + agente SSM). Audit gratuito su CloudTrail.

#### #3 — Limiti header e timeout HTTP in `application.properties`
Configurare in Quarkus:
```
quarkus.http.limits.max-header-size=4K
quarkus.http.read-timeout=10s
quarkus.http.idle-timeout=30s
```
Evita slow-loris. Valori da tarare.

### Media

#### #4 — Header di sicurezza HTTP
Configurare in Quarkus:
```
quarkus.http.header."X-Content-Type-Options".value=nosniff
quarkus.http.header."X-Frame-Options".value=DENY
quarkus.http.header."Referrer-Policy".value=no-referrer
quarkus.http.header."Strict-Transport-Security".value=max-age=31536000; includeSubDomains
```
HSTS solo dopo che HTTPS e stabile.

#### #5 — CORS restrittivo
Abilitare CORS con origin esplicita (mai `*` se in futuro si aggiungono cookie/credenziali):
```
quarkus.http.cors=true
quarkus.http.cors.origins=https://<frontend-domain>
quarkus.http.cors.methods=GET
```

#### #6 — Logging strutturato + CloudWatch alarm
Log per ogni richiesta: IP (da `X-Forwarded-For` propagato dall'ALB), endpoint, esito, latenza. Output JSON verso CloudWatch Logs. Alarm su spike 5xx, picco 4xx da singolo IP, error rate sopra soglia.

### Bassa

#### #7 — Bot detection con AWS WAF Bot Control
Se compaiono pattern di scraping/automation, attivare AWS WAF Bot Control (~10$/mese). Non necessario al go-live.

#### #8 — Patch management OS via SSM Patch Manager
Abilitare patching automatico dell'OS sull'EC2 tramite SSM Patch Manager (baseline + maintenance window). Riduce esposizione a CVE kernel/libreria.
