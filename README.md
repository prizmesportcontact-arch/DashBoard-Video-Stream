# Régie

Un seul site pour suivre mes vidéos et mes streams (TikTok, Instagram, Twitch) : accueil, vidéos, calendrier, idées, todo.

## Comment ça marche

- Le site est statique (HTML, CSS, JavaScript) et hébergé sur GitHub Pages.
- Les données vivent dans Supabase ; chaque compte ne voit que ses propres données.
- Tant que `js/config.js` ne contient pas l'adresse et la clé publique du projet Supabase, le site tourne en mode démo : les données restent sur l'appareil.

## Mise en service

1. Exécuter `supabase/schema.sql` une fois dans l'éditeur SQL du projet Supabase.
2. Renseigner `SUPABASE_URL` et `SUPABASE_KEY` (clé publique uniquement) dans `js/config.js`.
3. Dans Supabase, déclarer l'adresse du site comme adresse de redirection pour la connexion.

Aucune clé secrète ne doit se trouver dans ce dépôt : il est public.
