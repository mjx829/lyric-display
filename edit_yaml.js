const fs = require("fs");
const yaml = require("js-yaml");
const midi = require("midi-parser-js");

const midi_data = fs.readFileSync("data/trashed_file.mid");
const midi_base64 = midi_data.toString("base64");
const parced_midi = midi.parse(midi_data);

// for(var i = 0; i < parced_midi["track"].length; i++) {
//  	console.log(parced_midi["track"][i]["event"]);	
// }

function create_notes_list(parced_midi, track_num) {
	// console.log(parced_midi.track[track_num].event);
	
	let absolute_time_tick = 0;
	let tempo = 454545; // デフォルトのテンポ
	const tick_per_beat = parced_midi.timeDivision;

	const notes = [];
	const active_notes = new Map();

	parced_midi.track[track_num].event.forEach(event => {
		absolute_time_tick += event.deltaTime;

		// テンポの再設定
		if (event.type === 255 && event.metaType === 81) {
			tempo = event.data;
		}

		// ノートオンの処理
		if (event.type === 9 && event.data[1] > 0) {
			const note_number = event.data[0];
			const velocity = event.data[1];

			// 重複したノートの除去
			if (active_notes.has(note_number)) {
				const start_time_ticks = active_notes.get(note_number);
				const duration_ticks = absolute_time_tick - start_time_ticks;

				const start_time_ms = (start_time_ticks / tick_per_beat) * (tempo / 1000);
				const duration_ms = (duration_ticks / tick_per_beat) * (tempo / 1000);
				
				notes.push({
					noteNumber: note_number,
					startTimeMs: start_time_ms,
					durationMs: duration_ms,
					status: "Note ended early"
				});
				active_notes.delete(note_number);
			}
			active_notes.set(note_number, absolute_time_tick);
		}

		// ノートオフの処理
		else if (event.type === 8 || (event.type === 9 && event.data[1] === 0)) {
			const note_number = event.data[0];

			// 該当のノートオンに対してのみ処理
			if (active_notes.has(note_number)) {
				const start_time_ticks = active_notes.get(note_number);
				const duration_ticks = absolute_time_tick - start_time_ticks;

				const start_time_ms = (start_time_ticks / tick_per_beat) * (tempo / 1000);
				const duration_ms = (duration_ticks / tick_per_beat) * (tempo / 1000);

				notes.push({
					noteNumber: note_number,
					startTimeMs: start_time_ms,
					durationMs: duration_ms
				});
				active_notes.delete(note_number);
			}
		}
	});

	// トラックの終了後もオンになっているノートをオフとして記録
	active_notes.forEach((start_time_ticks, note_number) => {
		const duration_ticks = absolute_time_tick - start_time_ticks;
		const start_time_ms = (start_time_ticks / tick_per_beat) * (tempo / 1000);
		const duration_ms = (duration_ticks / tick_per_beat) * (tempo / 1000);

		notes.push({
			noteNumber: note_number,
			startTimeMs: start_time_ms,
			durationMs: duration_ms,
			status: "Unfinished note at track end"
		});
	});

	return notes;
}

function display_notes() {
	
}

function create_yaml() {
	const notes = create_notes_list(parced_midi, 2);
	

