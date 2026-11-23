import {useCallback,useEffect,useRef,useState} from "react";
import {resolveArtworkUrl} from "../../artworkUrl.js";
import * as player from "../../audioPlayer.js";
import SectionHeading from "../ui/SectionHeading.jsx";
import TrackActionMenu from "../music/TrackActionMenu.jsx";
import useTrackActionMenu from "../../hooks/useTrackActionMenu.js";
import {readCachedHomeSuggestions,writeCachedHomeSuggestions} from "../../homeSuggestions.js";
import {getSuggestedMusic} from "../../profileApi.js";
import {getHomeRecentlyPlayedForOwner,applyOptimisticRecentlyPlayed,readCachedHomeRecentlyPlayed,writeCachedHomeRecentlyPlayed,subscribeListeningHistoryChanged} from "../../homeRecentlyPlayed.js";
import {QuickPickGrid,MoodFilterBar,TrackTile,TrackRow,ArtistRow,MoodCards} from "../home/HomeFeedSections.jsx";

function matchMood(track,mood){if(mood==="All")return true;const tags=Array.isArray(track?.moods)?track.moods.join(" "):track?.moods??track?.mood_tags??track?.mood??"";return String(tags).toLowerCase().split(/[|, ]+/).filter(Boolean).includes(mood.toLowerCase());}
const SLIDE_LABELS=["Your music","Discover","Quick access","Find your mood"];
function HomeCarousel({recent,suggestions,onNavigate,onRecent,onDiscover,onMood,guest,onOpenAuth,onPlay,onWarm,getMenuProps}){
 const [active,setActive]=useState(0),[paused,setPaused]=useState(false),timer=useRef(null);
 useEffect(()=>{if(paused)return;timer.current=window.setInterval(()=>setActive(current=>(current+1)%4),5000);return()=>window.clearInterval(timer.current);},[paused]);
 const moveTo=index=>{setActive(index);setPaused(true);window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>setPaused(false),10000);};
 const firstRecent=recent[0],discover=suggestions[0],cover=resolveArtworkUrl((active===0?firstRecent:active===1?discover:suggestions[active===2?2:4])?.artwork_url);
 return <section className="home-carousel" aria-label="Featured home slides" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setPaused(false);}}>
  <div className="home-carousel__viewport">
   {SLIDE_LABELS.map((label,index)=><article key={label} className={`home-carousel__slide ${index===active?"is-active":""}`} aria-hidden={index!==active}>
    <div className="home-carousel__art" style={cover?{backgroundImage:`url("${cover}")`}:undefined}/>
    <div className="home-carousel__content">
     <span className="home-carousel__eyebrow">{index===0?"PICK UP WHERE YOU LEFT OFF":index===1?"YOUR NEXT FAVORITE":index===2?"YOUR LIBRARY":"SET THE TONE"}</span>
     <h2>{index===0?(guest?"Welcome to HyperSynced":"Welcome back") :index===1?"Discover something new":index===2?"Everything you love":"Music for the moment"}</h2>
     <p>{index===0?"A quick look at music you've been playing lately.":index===1?"Explore recommendations shaped by listening and music you haven't tried.":index===2?"Jump straight into playlists, favorites, recent listening and more.":"Pick a mood and let the music take it from there."}</p>
     {index===0&&firstRecent?<div className="home-carousel__featured"><TrackTile track={firstRecent} onPlay={onPlay} onWarm={onWarm} menuProps={getMenuProps?.(firstRecent)}/></div>:null}
     {index===1&&discover?<div className="home-carousel__featured"><TrackTile track={discover} onPlay={onPlay} onWarm={onWarm} menuProps={getMenuProps?.(discover)}/></div>:null}
     <button className="home-carousel__action" type="button" onClick={()=>index===0?(firstRecent?onPlay(firstRecent):onOpenAuth?.()):index===1?onDiscover():index===2?onNavigate?.("library"):onMood("Chill")}>{index===0?(firstRecent?"Play recent":"Get started"):index===1?"Explore music":index===2?"Open library":"Explore moods"} <span>→</span></button>
    </div>
   </article>)}
  </div>
  <div className="home-carousel__controls" aria-label="Slide controls">{SLIDE_LABELS.map((label,index)=><button key={label} type="button" aria-label={`Show slide ${index+1}: ${label}`} aria-current={active===index?"true":undefined} className={active===index?"is-active":""} onClick={()=>moveTo(index)}/>)}</div>
  <span className="home-carousel__counter">{active+1} / 4</span>
 </section>;
}
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
 useEffect(()=>subscribeListeningHistoryChanged(event=>{const detail=event?.detail??{};if(detail.owner&&String(detail.owner)!==String(recentOwner??""))return;if(detail.type==="optimistic-play"&&detail.track?.id){const cached=readCachedHomeRecentlyPlayed(recentOwner),instant=applyOptimisticRecentlyPlayed(cached, detail.track, 12, {incrementPlayCount:false});writeCachedHomeRecentlyPlayed(recentOwner,instant);setRecentlyPlayed(instant);return;}setRecentlyPlayed(readCachedHomeRecentlyPlayed(recentOwner));}),[recentOwner]);
 const loadSuggestions=useCallback(async()=>{const requestId=++suggestionsRequestRef.current,cached=readCachedHomeSuggestions(recentOwner);setSuggestionsState({owner:recentOwner,tracks:cached});setLoading(!cached.length);setError("");const contextTrackIds=context.split("|").filter(Boolean).slice(0,12);try{const response=await getSuggestedMusic({currentTrackId:contextTrackIds[0]??null,excludeTrackIds:contextTrackIds,contextTrackIds,limit:12});if(requestId!==suggestionsRequestRef.current)return;const tracks=Array.isArray(response)?response:[];writeCachedHomeSuggestions(recentOwner,tracks);setSuggestionsState({owner:recentOwner,tracks});}catch(err){if(requestId===suggestionsRequestRef.current&&!cached.length)setError(err instanceof Error?err.message:"Suggestions unavailable.");}finally{if(requestId===suggestionsRequestRef.current)setLoading(false);}},[recentOwner,context]);
 useEffect(()=>{if(suggestedTracks.length)player.seedQueueFromSuggestions(suggestedTracks);},[suggestedTracks]);
 useEffect(()=>{void loadSuggestions();return()=>{suggestionsRequestRef.current++;};},[loadSuggestions]);
 const play=async track=>{if(!track?.id)return;try{await player.playTrack(track.id,{audioUrl:track.audio_url??null,artworkUrl:resolveArtworkUrl(track.artwork_url),title:track.title??"",artist:track.artist??"",album:track.album??"",mimeType:track.mime_type??null,fileSize:track.file_size??null,mediaVersion:track.media_version??null,genre:track.genre??"",releaseYear:track.release_year??null});}catch(err){setError(err instanceof Error?err.message:"Playback failed.");}};
 const warm=track=>{if(track?.id)void player.warmTrackForPlayback(track.id,track);};
 const menuProps=track=>menu.getTriggerProps(track),scrollSuggestions=()=>document.getElementById("home-suggested-music")?.scrollIntoView({behavior:"smooth",block:"start"});
 const discovery=suggestedTracks.filter(track=>!recentlyPlayed.some(recent=>String(recent.id)===String(track.id)));
 const releases=suggestedTracks.filter(track=>Number(track.release_year)>=2023).sort((a,b)=>(Number(b.release_year)||0)-(Number(a.release_year)||0));
 return <div className="page-stack home-page">
 <header className="home-page__greeting"><span>YOUR MUSIC, YOUR SPACE</span><h1>{currentUser? `Good to see you, ${currentUser.username??"there"}`:"Welcome to HyperSynced"}</h1></header>
 <HomeCarousel recent={recentlyPlayed} suggestions={suggestedTracks} onNavigate={onNavigate} onRecent={scrollSuggestions} onDiscover={()=>onNavigate?.("search")} onMood={setMood} guest={!currentUser} onOpenAuth={onOpenAuth} onPlay={play} onWarm={warm} getMenuProps={menuProps}/>
 {currentUser?<MoodFilterBar activeMood={mood} onChange={setMood}/>:null}
 {releases.length?<TrackRow title="New & recently released" eyebrow="FRESH MUSIC" tracks={releases} onPlay={play} onWarm={warm} getMenuProps={menuProps}/>:null}
 {discovery.length?<TrackRow title="Fresh for you" eyebrow="DISCOVER" tracks={discovery} onPlay={play} onWarm={warm} getMenuProps={menuProps}/>:null}
 {recentlyPlayed.length?<TrackRow title="Recently played" eyebrow="YOUR LISTENING" tracks={recentlyPlayed} onPlay={play} onWarm={warm} getMenuProps={menuProps}/>:null}
 <ArtistRow tracks={filtered} onNavigate={onNavigate}/>
 <MoodCards tracks={suggestedTracks} onChange={setMood}/>
 <section id="home-suggested-music" className="home-music-section home-feed-row"><SectionHeading title="Suggested Music" actionLabel="Explore" onAction={()=>onNavigate?.("search")}/>
 {filtered.length?<div className="home-horizontal-scroll home-scroll-fade" aria-busy={loading}>{filtered.map(track=><TrackTile key={track.id} track={track} onPlay={play} onWarm={warm} menuProps={menuProps(track)}/>)}</div>:loading?<div className="home-track-grid home-track-grid--loading" aria-busy="true" aria-label="Loading suggestions">{Array.from({length:6},(_,i)=><div className="home-track-card home-track-card--skeleton" key={i} aria-hidden="true"><div className="home-track-card__art home-skeleton-block"/><div className="home-track-card__info"><span className="home-skeleton-line home-skeleton-line--title"/><span className="home-skeleton-line home-skeleton-line--artist"/></div></div>)}</div>:error?<div className="empty-content-card"><div><strong>Suggested music unavailable</strong><p>{error}</p></div></div>:<div className="home-empty-state"><div className="home-empty-state__icon">♫</div><div><strong>Suggestions are warming up</strong><p>Play a few songs to help Hypersynced build a mix that fits your listening.</p></div></div>}
 </section><TrackActionMenu menu={menu.menu} onClose={menu.closeMenu} currentUser={currentUser} onRequireAuth={onOpenAuth}/></div>;
}
export default HomePage;
