#!/bin/sh
# Drive the tracks that Chrome plays on the PP1 (ProPresenter) iMac, from the Companion Pi.
#
# Usage: chrome_tracks.sh toggle|play|state|next|up|down|volume
#
# Runs a JavaScript-for-Automation snippet on the iMac over SSH (key auth, no password). The
# snippet finds the Chrome tab that holds the player and acts on it. Prints exactly one word so
# a key can show it: Playing, Paused or Toggled for the play verbs, Skipped for `next`, the
# volume as NN% for `up`, `down` and `volume`, and -- when nothing answered.
#
# PLAY NEVER PAUSES. `toggle` is for a hand on the key; `play` starts the player only if it is
# paused and otherwise just reports it, so a scheduled trigger can run it without stopping
# tracks that someone already started.
#
# The player is YouTube Music; Spotify and YouTube also play and skip. Spotify's web player
# hides its media element behind DRM, so it is driven through its own play/pause button and
# read back from that button's label; anything else is driven through the page's <audio>/<video>
# element.
#
# VOLUME GOES THROUGH YOUTUBE MUSIC'S OWN SLIDER, on its 0-100 scale, one click to the next
# multiple of 5 (46 goes up to 50 and down to 45), so the readout never shows 51, 56, 61. The slider
# is perceptual: YouTube Music maps it through a curve onto the player (40 on the slider is 13
# on the player). Setting the player directly leaves the slider showing the old level, and the
# app puts its own level back on the next track. Moving the slider and firing its `change` is
# the path a drag takes, so the level sticks. Other players have no volume here and print --.
#
# ONLY THE DOM IS SHARED. Chrome runs `execute javascript` in an isolated world: the page's
# elements, attributes and events are visible, its JavaScript properties are not. So the slider
# is read from `aria-valuenow` and written through its `value` attribute, never `.value`, which
# is undefined from here. Native properties (a media element's `paused`) are fine.
#
# THE KEY LIVES BESIDE THIS SCRIPT, NOT IN A HOME DIRECTORY. Companion runs its exec actions
# as the `companion` user, which has no SSH identity, so the key (.chrome_tracks_key) and
# the known-hosts file sit next to the script, owned by samuelbailey and readable by group
# `users`, which both accounts share. OpenSSH only enforces 0600 on keys the caller owns,
# so the group-readable key is accepted when `companion` presents it.
#
# The iMac needs, once: Remote Login on; the .pub in tcmedia's ~/.ssh/authorized_keys; the
# "allow sshd to control Google Chrome" prompt approved on its screen; and Chrome's
# browser.allow_javascript_apple_events pref true in each profile's Preferences (the
# View > Developer menu item writes it, or set it with Chrome quit — Local State is ignored).
#
# TRACKS_URL: a substring of the player tab's URL. Empty means "a Spotify or YouTube tab,
# else the first tab with an <audio>/<video> element, else the front tab".
DIR=$(cd "$(dirname "$0")" && pwd)
IMAC="${IMAC:-tcmedia@iMac-PP1.local}"
KEY="$DIR/.chrome_tracks_key"
KNOWN="$DIR/.chrome_tracks_known_hosts"
TRACKS_URL="${TRACKS_URL:-}"
VERB="${1:-state}"

JXA='
function run(argv) {
  const verb = argv[0], wanted = argv[1] || ""
  const chrome = Application("Google Chrome")
  if (!chrome.running()) return "--"
  const SPOTIFY = "(()=>{const b=document.querySelector(\"[data-testid=control-button-playpause]\");if(!b)return \"none\";const playing=/pause/i.test(b.getAttribute(\"aria-label\")||\"\");const paused=!playing;if(ACT){b.click();return playing?\"Paused\":\"Playing\"}return playing?\"Playing\":\"Paused\"})()"
  const MEDIA = "(()=>{const m=document.querySelector(\"audio,video\");if(!m)return \"none\";const paused=m.paused;if(ACT){paused?m.play():m.pause();return paused?\"Playing\":\"Paused\"}return paused?\"Paused\":\"Playing\"})()"
  const ACTS = { toggle: "true", play: "paused" }
  const js = (src, verb) => src.replace(/ACT/g, ACTS[verb] || "false")
  const NEXT = "(()=>{const b=document.querySelector(\"ytmusic-player-bar .next-button, .ytp-next-button, [data-testid=control-button-skip-forward]\");if(!b)return \"none\";(b.querySelector(\"button\")||b).click();return \"Skipped\"})()"
  const VOLUME = "(()=>{const s=document.querySelector(\"ytmusic-player-bar #volume-slider\");const a=s&&s.getAttribute(\"aria-valuenow\");if(a===null||a===undefined)return \"none\";const now=Number(a);if(!STEP)return now+\"%\";const g=Math.abs(STEP),next=Math.max(0,Math.min(100,STEP>0?Math.floor(now/g)*g+g:Math.ceil(now/g)*g-g));s.setAttribute(\"value\",String(next));s.dispatchEvent(new CustomEvent(\"change\"));return next+\"%\"})()"
  const STEPS = { up: 5, down: -5, volume: 0 }
  const isPlayer = (url) => /open\.spotify\.com|youtube\.com/.test(url)
  let tab = null, fallback = null
  for (const w of chrome.windows()) {
    for (const t of w.tabs()) {
      const url = String(t.url())
      if (wanted ? url.indexOf(wanted) >= 0 : isPlayer(url)) { tab = t; break }
      if (!wanted && !fallback) {
        try { if (String(t.execute({ javascript: js(MEDIA, "state") })) !== "none") fallback = t } catch (e) {}
      }
    }
    if (tab) break
  }
  tab = tab || fallback || (chrome.windows().length ? chrome.windows[0].activeTab() : null)
  if (!tab) return "--"
  const src = /open\.spotify\.com/.test(String(tab.url())) ? SPOTIFY : MEDIA
  const code = verb === "next" ? NEXT
    : STEPS.hasOwnProperty(verb) ? VOLUME.replace(/STEP/g, String(STEPS[verb]))
    : js(src, verb)
  const out = String(tab.execute({ javascript: code }))
  return out === "none" ? "--" : out
}'

out=$(ssh -i "$KEY" -o IdentitiesOnly=yes -o UserKnownHostsFile="$KNOWN" \
	-o BatchMode=yes -o ConnectTimeout=3 -o StrictHostKeyChecking=accept-new "$IMAC" \
	"osascript -l JavaScript -e '$JXA' -- '$VERB' '$TRACKS_URL'" 2>"$DIR/.chrome_tracks.err") || out="--"
printf '%s' "${out:---}"
