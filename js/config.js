// Réglages du dashboard.
// Si ces deux valeurs sont vides, le site tourne en mode démo :
// les données restent sur l'appareil et ne sont pas synchronisées.
// La clé ci-dessous est la clé PUBLIQUE du projet Supabase (jamais la clé secrète).
export const SUPABASE_URL = "https://rusgzubcppxsfualrgps.supabase.co";
export const SUPABASE_KEY = "sb_publishable_JW7J6KvvjtoInb7IIvJ35A_ZPyIc5oC";

export const APP_NAME = "Régie";

// Connexion Twitch : identifiant public de l'application déclarée sur dev.twitch.tv (pas de secret).
export const TWITCH_CLIENT_ID = "t7ijeiej96btnz157m4fnm945ex24z";
export const TWITCH_REDIRECT = "https://prizmesportcontact-arch.github.io/DashBoard-Video-Stream/";

// Chiffres YouTube : clé publique, acceptée uniquement depuis l'adresse de Régie et pour l'API YouTube.
export const YOUTUBE_API_KEY = "AIzaSyCPf4OZZc9QYANT7FVcuV-Y8QF_74HX3uQ";

// Connexion TikTok : identifiant public (« Client key ») de l'app déclarée sur developers.tiktok.com.
// Le secret, lui, reste dans la fonction Supabase « tiktok ».
export const TIKTOK_CLIENT_KEY = "sbawi32h5ubnaudi28";
