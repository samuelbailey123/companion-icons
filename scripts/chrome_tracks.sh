#!/bin/sh
# Play/pause the tracks that Chrome plays on the ProPresenter iMac, from the Companion Pi.
#
# Usage: chrome_tracks.sh toggle|state
#
# Runs a JavaScript-for-Automation snippet on the iMac over SSH (key auth, no password). The
# snippet finds the Chrome tab that holds the player and either toggles it or reports it.
# Prints exactly one word — Playing, Paused, Toggled or -- — so a key can show it.
#
# The player is Spotify or YouTube. Spotify's web player hides its media element behind
# DRM, so it is driven through its own play/pause button and read back from that button's
# label; anything else is driven through the page's <audio>/<video> element.
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
  const SPOTIFY = "(()=>{const b=document.querySelector(\"[data-testid=control-button-playpause]\");if(!b)return \"none\";const playing=/pause/i.test(b.getAttribute(\"aria-label\")||\"\");if(TOGGLE){b.click();return playing?\"Paused\":\"Playing\"}return playing?\"Playing\":\"Paused\"})()"
  const MEDIA = "(()=>{const m=document.querySelector(\"audio,video\");if(!m)return \"none\";const p=m.paused;if(TOGGLE){p?m.play():m.pause();return p?\"Playing\":\"Paused\"}return p?\"Paused\":\"Playing\"})()"
  const js = (src, toggle) => src.replace(/TOGGLE/g, toggle ? "true" : "false")
  const isPlayer = (url) => /open\.spotify\.com|youtube\.com/.test(url)
  let tab = null, fallback = null
  for (const w of chrome.windows()) {
    for (const t of w.tabs()) {
      const url = String(t.url())
      if (wanted ? url.indexOf(wanted) >= 0 : isPlayer(url)) { tab = t; break }
      if (!wanted && !fallback) {
        try { if (String(t.execute({ javascript: js(MEDIA, false) })) !== "none") fallback = t } catch (e) {}
      }
    }
    if (tab) break
  }
  tab = tab || fallback || (chrome.windows().length ? chrome.windows[0].activeTab() : null)
  if (!tab) return "--"
  const src = /open\.spotify\.com/.test(String(tab.url())) ? SPOTIFY : MEDIA
  const out = String(tab.execute({ javascript: js(src, verb === "toggle") }))
  return out === "none" ? "--" : out
}'

out=$(ssh -i "$KEY" -o IdentitiesOnly=yes -o UserKnownHostsFile="$KNOWN" \
	-o BatchMode=yes -o ConnectTimeout=3 -o StrictHostKeyChecking=accept-new "$IMAC" \
	"osascript -l JavaScript -e '$JXA' -- '$VERB' '$TRACKS_URL'" 2>"$DIR/.chrome_tracks.err") || out="--"
printf '%s' "${out:---}"
