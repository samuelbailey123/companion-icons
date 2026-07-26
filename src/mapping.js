/**
 * Which library icon goes on which button.
 *
 * Keyed by page number, then row, then column, matching the page layout exported from the
 * Companion install this was built for. Adapt it to your own rig by exporting your config
 * and remapping the coordinates.
 *
 * `label` is only given where the existing text needs changing — usually to shorten it now
 * that an icon carries the meaning, or to undo a blank-line padding hack.
 *
 * Deliberate choices worth knowing:
 * - `Stage Notes Macro` and `All Screens Macro` get *different* glyphs. They previously
 *   shared one indistinguishable "M" icon, which is part of what prompted this work.
 * - ATEM program buttons keep their dynamic `$(atem:short_...)` labels; only the icon is
 *   added. Camera numbering follows button position, not ATEM input number, since the
 *   input each button selects is configured in its action rather than its style.
 */

export const MAPPING = {
	// ---- Page 1: Power ----
	1: {
		0: {
			1: { icon: 'projector-on' },
			2: { icon: 'pa-on' },
		},
		1: {
			1: { icon: 'projector-off' },
			2: { icon: 'pa-off' },
		},
	},

	// ---- Page 2: ProPresenter ----
	2: {
		0: {
			1: { icon: 'clear-audio', label: 'Clear Audio' },
			2: { icon: 'clear-slide', label: 'Clear Slide' },
			3: { icon: 'clear-all', label: 'Clear All' },
		},
		1: {
			1: { icon: 'media', label: 'Thunder' },
			2: { icon: 'slide-prev', label: 'Previous' },
			3: { icon: 'slide-next', label: 'Next' },
		},
		2: {
			0: { icon: 'timer-start', label: 'Speaker' },
			1: { icon: 'timer-start', label: 'Worship' },
			2: { icon: 'macro', label: 'All Screens' },
			3: { icon: 'stage-display', label: 'Stage Notes' },
		},
	},

	// ---- Page 3: grandMA2 ----
	3: {
		0: { 1: { icon: 'slide-next', label: 'Go Next' } },
		1: {
			1: { icon: 'slide-prev', label: 'Go Back' },
			3: { icon: 'ftb', label: 'Blackout' },
		},
		2: {
			0: { icon: 'house-lights-on' },
			1: { icon: 'stage-display' },
			2: { icon: 'still', label: 'Background' },
			3: { icon: 'scene-recall', label: 'Wednesday' },
		},
		3: {
			0: { icon: 'fader' },
			1: { icon: 'fader' },
			2: { icon: 'fader' },
			3: { icon: 'fader' },
		},
	},

	// ---- Page 4: ATEM (these six image layers currently exist but are empty) ----
	4: {
		0: {
			1: { icon: 'cam1-idle' },
			2: { icon: 'cam2-idle' },
			3: { icon: 'media' },
		},
		1: {
			1: { icon: 'cam3-idle' },
			3: { icon: 'macro-run', label: 'Setup Sunday' },
		},
	},

	// ---- Page 5: SQ7 ----
	5: {
		0: { 1: { icon: 'mute-on', label: 'Mute DCAs' } },
		2: {
			0: { icon: 'aux-send' },
			1: { icon: 'aux-send' },
			3: { icon: 'mains' },
		},
		3: {
			0: { icon: 'fader', label: 'Stream' },
			1: { icon: 'fader', label: 'Foyer' },
			3: { icon: 'mains', label: 'Main' },
		},
	},

	// ---- Page 6: VideoHub ----
	6: {
		0: { 1: { icon: 'route', label: 'PGM to Proj' } },
		1: { 1: { icon: 'aux', label: 'Aux1 to Proj' } },
	},
}
