/* Auth tokens are memory-only; refresh cookie and DB session are authoritative. */
export const ACCESS_TOKEN_KEY = "hypersync_access_token";
export const SESSION_ACTIVE_KEY = "hypersync_session_active";
export const REMEMBER_ME_KEY = "hypersync_remember_me";
export const CACHED_USER_KEY = "hypersync_user_profile";
let memoryAccessToken = null, memorySessionActive = false, memoryUserProfile = null, sessionOnlyAuthBlocked = false;
function safeStorage(name) { try { return globalThis[name] ?? null; } catch { return null; } }
function sanitizeProfile(user) {
 if (!user || typeof user !== "object") return null;
 const allowed=["id","username","display_name","role","account_type","is_active"], profile={};
 for (const key of allowed) { const value=user[key]; if(typeof value==="string"||typeof value==="boolean"||typeof value==="number") profile[key]=value; }
 return profile.id ? profile : null;
}
function clearLegacyAuth() { try { const local=safeStorage("localStorage"); local?.removeItem(ACCESS_TOKEN_KEY); local?.removeItem(SESSION_ACTIVE_KEY); local?.removeItem(REMEMBER_ME_KEY); } catch {} try { const session=safeStorage("sessionStorage"); session?.removeItem(ACCESS_TOKEN_KEY); session?.removeItem(SESSION_ACTIVE_KEY); } catch {} }
function loadCachedProfile() { try { memoryUserProfile=sanitizeProfile(JSON.parse(safeStorage("localStorage")?.getItem(CACHED_USER_KEY)??"null")); } catch { memoryUserProfile=null; try{safeStorage("localStorage")?.removeItem(CACHED_USER_KEY);}catch{} } }
clearLegacyAuth(); loadCachedProfile();\nsessionOnlyAuthBlocked = (() => { try { return safeStorage("sessionStorage")?.getItem(REMEMBER_ME_KEY) === "false"; } catch { return false; } })();
export function shouldRememberSession(){ if(sessionOnlyAuthBlocked)return false; try{return safeStorage("sessionStorage")?.getItem(REMEMBER_ME_KEY)!=="false";}catch{return true;} }
export function getActiveStorage(){return null;}
export function getAccessToken(){return memoryAccessToken;}
export function hasStoredSession(){return memorySessionActive;}
export function readCachedUserProfile(){return memoryUserProfile;}
export function cacheUserProfile(user,{remember=shouldRememberSession()}={}){
 const profile=sanitizeProfile(user); if(!profile)return; memoryUserProfile=profile;
 const local=safeStorage("localStorage"), session=safeStorage("sessionStorage");
 try { if(remember){local?.setItem(CACHED_USER_KEY,JSON.stringify(profile));session?.removeItem(CACHED_USER_KEY);session?.removeItem(REMEMBER_ME_KEY);}else{local?.removeItem(CACHED_USER_KEY);session?.setItem(CACHED_USER_KEY,JSON.stringify(profile));session?.setItem(REMEMBER_ME_KEY,"false");} }catch{}
}
export function clearCachedUserProfile(){memoryUserProfile=null;for(const storage of [safeStorage("localStorage"),safeStorage("sessionStorage")]){try{storage?.removeItem(CACHED_USER_KEY);}catch{}}}
export function shouldRestoreSession(){return shouldRememberSession();}
export function saveAuthSession(accessToken,{remember=true}={}){memoryAccessToken=accessToken||null;memorySessionActive=Boolean(accessToken);sessionOnlyAuthBlocked=!remember;try{const ss=safeStorage("sessionStorage");if(remember)ss?.removeItem(REMEMBER_ME_KEY);else ss?.setItem(REMEMBER_ME_KEY,"false");}catch{}}
export function clearAuthSession(){memoryAccessToken=null;memorySessionActive=false;clearCachedUserProfile();sessionOnlyAuthBlocked=true;try{safeStorage("sessionStorage")?.removeItem(REMEMBER_ME_KEY);}catch{}}
