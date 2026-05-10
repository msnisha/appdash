# appdash — static dashboard served by Caddy
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY public /srv

EXPOSE 80
