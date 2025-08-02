const fs = require("fs");
const yaml = require("js-yaml");
const midi = require("midi-parser-js");

const midi_data = fs.readFileSync("data/trashed_file.mid");
const midi_base64 = midi_data.toString("base64");
const parced_midi = midi.parse(midi_data);

// for(var i = 0; i < patced_midi["track"].length; i++) {
//  	console.log(patced_midi["track"][i]["event"]);	
// }

function create_notes_list(midi_file, parced_midi, track_num) {
	console.log(track);
	
	let absolute_time_tick = 0;
	const tempo = 454545; // dafault tempo
	const tick_per_beat = parced_midi.header.ticksPerBeat;

	const notes = [];
	const active_notes = new Map();

	parced_midi.track[track_num].event.forEach(event => {
		absolute_time_tick += event.deltaTime;

		if (event.type === 9 && event.metaType === 81) {
			tempo = event.data;
		}

		if (event.type === 9 && event.data[1] > 0) {
			const note_number = event.data[0];
			const velocity = event.data[1];

			if (active_notes.has(note_number)) {
				const start_time_ticks = active_notes.get(note_number);
				const duration_ticks = absolute_time_tick - start_time_ticks;
			}

	});
}

function display_notes() {
	
}

create_notes_list(parced_midi["track"][1]["event"]);


