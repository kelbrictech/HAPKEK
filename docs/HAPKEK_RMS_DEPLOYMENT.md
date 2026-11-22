# HAPKEK RMS deployment

Cloudflare Pages project: `hapkek-rms`
Production branch: `rms/foundation-v1`
Dashboard: `https://rms.kelbric.com/`
Staff voucher scanner: `https://rms.kelbric.com/staff-app/`
API: `https://api.kelbric.com`

The Pages build publishes the RMS dashboard at the site root and the staff scanner under `/staff-app/`. It does not publish the game entrypoint and does not change the existing `kelbric.com` Pages project.

The API runs in the existing `hapkek-leaderboard` Worker and keeps the existing game score and leaderboard routes. Production D1 migrations `0002` through `0006` were applied in order to the existing HAPKEK database.

The Pages build command copies the RMS and staff app static files into the Pages output directory and sets both browser API origins to `https://api.kelbric.com`. The Worker allows authenticated cookie requests only from `https://rms.kelbric.com`.

Initial staff provisioning is a separate secure operation: Ana's account receives a one-time PIN; Ana changes it at first login, then issues Anmer's temporary PIN from the RMS staff access screen. Do not place either PIN in repository files or chat logs.
