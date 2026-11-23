import {useCallback,useEffect,useRef,useState} from "react";
import {resolveArtworkUrl} from "../../artworkUrl.js";
import * as player from "../../audioPlayer.js";
import SectionHeading from "../ui/SectionHeading.jsx";
import TrackActionMenu from "../music/TrackActionMenu.jsx";
import useTrackActionMenu from "../../hooks/useTrackActionMenu.js";
import {readCachedHomeSuggestions,writeCachedHomeSuggestions} from "../../homeSuggestions.js";
import {getSuggestedMusic} from "../../profileApi.js";
import {getHomeRecentlyPlayedForOwner,applyOptimisticRecentlyPlayed,readCachedHomeRecentlyPlayed,writeCachedHomeRecentlyPlayed,subscribeListeningHistoryChanged} from "../../homeRecentlyPlayed.js";
import {QuickPickGrid,MoodFilterBar,TrackTile,ArtistRow,MoodCards} from "../home/HomeFeedSections.jsx";

function matchMood(track,mood){if(mood==="All")return true;const tags=Array.isArray(track?.moods)?track.moods.join(" "):track?.moods??track?.mood_tags??track?.mood??"";return String(tags).toLowerCase().split(/[|, ]+/).filter(Boolean).includes(mood.toLowerCase());}
function HomePage({currentUser,onNavigate,onOpenAuth}){
 const menu=useTrackActionMenu(),recentOwner=currentUser?.id??currentUser?.username??"guest-device";
 const [recentlyPlayedState,setRecentlyPlayedState]=useState(()=>({owner:recentOwner,tracks:readCachedHomeRecentlyPlayed(recentOwner)}));
 const recentlyPlayed=getHomeRecentlyPlayedForOwner(recentOwner,recentlyPlayedState.owner,recentlyPlayedState.tracks);
 const setRecentlyPlayed=next=>setRecentlyPlayedState(current=>({owner:recentOwner,tracks:typeof next==="function"?next(current.owner===recentOwner?current.tracks:readCachedHomeRecentlyPlayed(recentOwner)):next}));
 const [suggestionsState,setSuggestionsState]=useState(()=>({owner:recentOwner,tracks:readCachedHomeSuggestions(recentOwner)}));
 const suggestedTracks=suggestionsState.owner===recentOwner?suggestionsState.tracks:readCachedHomeSuggestions(recentOwner);
 const [loading,setLoading]=useState(!suggestedTracks.length),[error,setError]=useState(""),[mood,setMood]=useState("All");
 const suggestionsRequestRef=useRef(0),context=recentlyPlayed.map(track=>String(track.id)).join("|"),filtered=suggestedTracks.filter(track=>matchMood(track,mood));
 useEffect(()=>{setRecentlyPlayed(readCachedHomeRecentlyPlayed(recentOwner));},[recentOwner]);
 useEffect(()=>subscribeListeningHistoryChanged(event=>{const detail=event?.detail??{};if(detail.owner&&String(detail.owner)!==String(recentOwner??""))return;if(detail.type==="optimistic-play"&&detail.track?.id){const cached=readCachedHomeRecentlyPlayed(recentOwner),instant=applyOptimisticRecentlyPlayed(cached, detail.track, 12,{incrementPlayCount:false});writeCachedHomeRecentlyPlayed(recentOwner, instant);setRecentlyPlayed(instant);return;}setRecentlyPlayed(readCachedHomeRecentlyPlayed(recentOwner));}),[recentOwner]);
 const loadSuggestions=useCallback(async()=>{const requestId=++suggestionsRequestRef.current,cached=readCachedHomeSuggestions(recentOwner);setSuggestionsState({owner:recentOwner,tracks:cached});setLoading(!cached.length);setError("");const contextTrackIds=context.split("|").filter(Boolean).slice(0,12);try{const response=await getSuggestedMusic({currentTrackId:contextTrackIds[0]??null,excludeTrackIds:contextTrackIds,contextTrackIds,limit:12});if (requestId !== suggestionsRequestRef.current) return;const tracks=Array.isArray(response)?response:[];writeCachedHomeSuggestions(recentOwner,tracks);setSuggestionsState({owner:recentOwner,tracks});}catch(err){if(requestId===suggestionsRequestRef.current&&!cached.length)setError(err instanceof Error?err.message:"Suggestions unavailable.");}finally{if(requestId===suggestionsRequestRef.current)setLoading(false);}},[recentOwner,context]);
 useEffect(()=>{if(suggestedTracks.length)player.seedQueueFromSuggestions(suggestedTracks);},[suggestedTracks]);
 useEffect(()=>{void loadSuggestions();return()=>{suggestionsRequestRef.current++;};},[loadSuggestions]);
 const play=async track=>{if(!track?.id)return;try{await player.playTrack(track.id,{audioUrl:track.audio_url??null,artworkUrl:resolveArtworkUrl(track.artwork_url),title:track.title??"",artist:track.artist??"",album:track.album??"",mimeType:track.mime_type??null,fileSize:track.file_size??null,mediaVersion:track.media_version??null,genre:track.genre??"",releaseYear:track.release_year??null});}catch(err){setError(err instanceof Error?err.message:"Playback failed.");}};
 const warm=track=>{if(track?.id)void player.warmTrackForPlayback(track.id,track);};
 const menuProps=track=>menu.getTriggerProps(track),scrollSuggestions=()=>document.getElementById("home-suggested-music")?.scrollIntoView({behavior:"smooth",block:"start"});
 return <div className="page-stack home-page">
 {!currentUser?<section className="home-hero-image home-hero-image--guest" aria-label="Welcome to Hypersynced"><div className="home-hero-image__welcome"><strong>Welcome to Hypersynced</strong><p>Find music for every mood, discover new favorites, and keep your listening in sync.</p><button type="button" className="home-hero-button home-hero-button--primary" onClick={onOpenAuth}>Sign in or create an account</button></div><div className="home-hero-image__status"><span><i/> GUEST MODE</span><button type="button" onClick={onOpenAuth}>Sign in →</button></div></section>:<><MoodFilterBar activeMood={mood} onChange={setMood}/><QuickPickGrid onNavigate={onNavigate} onRecent={scrollSuggestions}/></>}
 <ArtistRow tracks={filtered} onNavigate={onNavigate}/>
 <MoodCards tracks={suggestedTracks} onChange={setMood}/>
 <section id="home-suggested-music" className="home-music-section home-feed-row"><SectionHeading title="Suggested Music" actionLabel="Explore" onAction={()=>onNavigate?.("search")}/>
 {filtered.length?<div className="home-horizontal-scroll home-scroll-fade" aria-busy={loading}>{filtered.map(track=><TrackTile key={track.id} track={track} onPlay={play} onWarm={warm} menuProps={menuProps(track)}/>)}</div>:loading?<div className="home-track-grid home-track-grid--loading" aria-busy="true" aria-label="Loading suggestions">{Array.from({length:6},(_,i)=><div className="home-track-card home-track-card--skeleton" key={i} aria-hidden="true"><div className="home-track-card__art home-skeleton-block"/><div className="home-track-card__info"><span className="home-skeleton-line home-skeleton-line--title"/><span className="home-skeleton-line home-skeleton-line--artist"/></div></div>)}</div>:error?<div className="empty-content-card"><div><strong>Suggested music unavailable</strong><p>{error}</p></div></div>:<div className="home-empty-state"><div className="home-empty-state__icon">♫</div><div><strong>Suggestions are warming up</strong><p>Play a few songs to help Hypersynced build a mix that fits your listening.</p></div></div>}
 </section><TrackActionMenu menu={menu.menu} onClose={menu.closeMenu} currentUser={currentUser} onRequireAuth={onOpenAuth}/></div>;
}
export default HomePage;
