export const NAV_ITEMS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "search", label: "Search", icon: "search" },
  { id: "library", label: "Library", icon: "library" },
  {
    id: "messages",
    label: "Messages",
    icon: "mail",
    requiresAuth: true,
  },
  { id: "profile", label: "Profile", icon: "profile" },
];

export const ADMIN_NAV_ITEMS = [
  {
    id: "admin",
    label: "Dashboard",
    icon: "shield",
  },
  {
    id: "admin-uploads",
    label: "Uploads",
    icon: "plus",
  },
  {
    id: "admin-catalog",
    label: "Media Catalog",
    icon: "music",
  },
];

export const LIBRARY_TABS = [
  "Playlists",
  "Artists",
  "Albums",
  "Songs",
];

export const SEARCH_CATEGORIES = [
  {
    id: "trending",
    label: "Trending",
    icon: "chart",
  },
  {
    id: "new",
    label: "New Releases",
    icon: "disc",
  },
  {
    id: "playlists",
    label: "Playlists",
    icon: "playlist",
  },
  {
    id: "genres",
    label: "Genres",
    icon: "mountains",
  },
];

export const SEARCH_SUGGESTIONS = [
  "Pop",
  "Rock",
  "Chill",
  "Rap",
  "Ambient",
  "Electronic",
];

export const PAGE_TITLES = {
  home: "Home",
  search: "Search",
  library: "My Library",
  messages: "Messages",
  profile: "Profile",

  admin: "Admin Dashboard",
  "admin-devices": "Visitor Devices",
  "admin-uploads": "Uploads",
  "admin-catalog": "Media Catalog",
};

export const SEARCH_QUICK_COMMANDS = [
  { id: "pop", label: "Pop", query: "pop", filter: "tracks", focus: false },
  { id: "country", label: "Country", query: "country", filter: "tracks", focus: false },
  { id: "rock", label: "Rock", query: "rock", filter: "tracks", focus: false },
  { id: "electronic", label: "Electronic", query: "electronic", filter: "tracks", focus: false },
  { id: "rap-hip-hop", label: "Rap / Hip-Hop", query: "rap hip hop", filter: "tracks", focus: false },
  { id: "alternative", label: "Alternative", query: "alternative", filter: "tracks", focus: false },
  { id: "chill", label: "Chill", query: "chill", filter: "tracks", focus: false },
  { id: "driving", label: "Driving", query: "driving", filter: "tracks", focus: false },
  { id: "hype", label: "Hype", query: "hype", filter: "tracks", focus: false },
];
