#!/bin/sh
set -e

# Replace placeholders in config.js with env vars (or defaults)
: "${USER_URL:=http://localhost:3001}"
: "${ACCOUNT_URL:=http://localhost:3002}"
: "${TX_URL:=http://localhost:3003}"
: "${LOAN_URL:=http://localhost:3005}"
: "${REPORT_URL:=http://localhost:3010}"
# Simple sed replacements
sed -i "s#__USER_URL__#${USER_URL}#g" /usr/share/nginx/html/config.js
sed -i "s#__ACCOUNT_URL__#${ACCOUNT_URL}#g" /usr/share/nginx/html/config.js
sed -i "s#__TX_URL__#${TX_URL}#g" /usr/share/nginx/html/config.js
sed -i "s#__LOAN_URL__#${LOAN_URL}#g" /usr/share/nginx/html/config.js
sed -i "s#__REPORT_URL__#${REPORT_URL}#g" /usr/share/nginx/html/config.js

exec "$@"
