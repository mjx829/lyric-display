const fs = require("fs");
const yaml = require("js-yaml");
const midi = require("midi-parser-js");
const blessed = require("blessed");

const midi_data = fs.readFileSync("data/trashed_file.mid");
const midi_base64 = midi_data.toString("base64");
const parced_midi = midi.parse(midi_data);

// console.log(parced_midi);

// for(var i = 0; i < parced_midi["track"].length; i++) {
//  	console.log(parced_midi["track"][i]["event"]);	
// }

// midi解析
function create_notes_list(parced_midi, default_tempo) {
	const midi_all_notes = {};
	for (var i = 0; i < parced_midi.track.length; i++) {
		let absolute_time_tick = 0;
		let tempo_mis = default_tempo ? default_tempo : 454545; // デフォルトのテンポ
		const tick_per_beat = parced_midi.timeDivision;

		const notes = [];
		const tempo_changes = [];
		const active_notes = new Map();

		parced_midi.track[i].event.forEach(event => {
			absolute_time_tick += event.deltaTime;

			// テンポの再設定
			if (event.type === 255 && event.metaType === 81) {
				tempo_mis = event.data;
				const tempo_ms = event.data / tick_per_beat;
				tempo_changes.push(tempo_ms);
				console.log(tempo_changes);
			}

			// ノートオンの処理
			if (event.type === 9 && event.data[1] > 0) {
				const note_number = event.data[0];
				const velocity = event.data[1];

				// 重複したノートの除去
				if (active_notes.has(note_number)) {
					const start_time_ticks = active_notes.get(note_number);
					const duration_ticks = absolute_time_tick - start_time_ticks;

					const start_time_ms = (start_time_ticks / tick_per_beat) * (tempo_mis / 1000);
					const duration_ms = (duration_ticks / tick_per_beat) * (tempo_mis / 1000);
					
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

					const start_time_ms = (start_time_ticks / tick_per_beat) * (tempo_mis / 1000);
					const duration_ms = (duration_ticks / tick_per_beat) * (tempo_mis / 1000);

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
			const start_time_ms = (start_time_ticks / tick_per_beat) * (tempo_mis / 1000);
			const duration_ms = (duration_ticks / tick_per_beat) * (tempo_mis / 1000);

			notes.push({
				noteNumber: note_number,
				startTimeMs: start_time_ms,
				durationMs: duration_ms,
				status: "Unfinished note at track end"
			});
		});
		
		// console.log(notes);
		
		// display_notes(notes, tempo_mis, tick_per_beat);

		midi_all_notes[i] = notes;
	}
	console.log(midi_all_notes);
}


// ノートの相対座標を返す
function display_notes(notes_list, tempo_mis, tick_per_beat) {
	const ms_per_tick = Math.round((tempo_mis / 1000) / tick_per_beat);
	const display_notes_list = [];

	notes_list.forEach(note => {
		const pich = note.noteNumber % 12; // オクターブで循環させる
		const start_time_tick = Math.round(note.startTimeMs / ms_per_tick);
		const duraion_tick = Math.round(note.durationMs / ms_per_tick);

		display_notes_list.push([[start_time_tick, pich], duraion_tick]);
	});
	console.log(display_notes_list);
}

// TUIの起動
function setup_tui() {
	// スクリーンの作成
	const screen = blessed.screen({
		smartCSR: true
	});

	// 終了時の処理
	screen.key(["escape", "C-c"], function(ch, key) {
		return process.exit(0)
	});

	const box_style = {
			fg: "#FFF",
			bg: "#000",
			border: {
				fg: "#FFF",
			}
		}

	// サイドバー(曲名、トラック)
	const side_bar = blessed.box({
		top: "0",
		left: "0",
		width: "25%",
		height: "100%",
		content: "tracks",
		border: {
			type: "line"
		},
		style: box_style
	});

	// サイドバーテキスト
	const side_bar_board = blessed.text({
		parent: side_bar,
		top: 0,
		left: 0,
		height: 3,
		content:"",
		style: box_style
	});

	// メイン画面
	const body = blessed.box({
		top: "0",
		right: "0",
		width: "75%",
		height: "100%",
	});

	// midi編集画面
	const midi_edit = blessed.box({
		parent: body,
		top: "0",
		left: "center",
		width: "100%",
		height: "61%",
		border: {
			type: "line"
		},
		style: box_style
	});

	// 歌詞操作画面
	const lyrics_body = blessed.box({
		parent: body,
		bottom: "0",
		right: "0",
		width: "100%",
		height: "40%"
	});

	// 歌詞リスト
	const lyrics_list = blessed.box({
		parent: lyrics_body,
		top: "0",
		left: "0",
		width: "34%",
		height: "100%",
		border: {
			type: "line"
		},
		style: box_style
	});
	
	const lyrics_editor = blessed.box({
		parent: lyrics_body,
		top: "0",
		right: "0",
		width: "66%",
		height: "100%",
		border: {
			type: "line"
		},
		style: box_style
	});
	
	// 初期描画
	screen.append(side_bar);
	screen.append(body);
	
	// welcome画面
	side_bar_board.setContent("Welcome. No file have been read. Press (C-f).");

	// リスト(トラックリスト、歌詞リスト)
	const track_list = blessed.list({
		parent: side_bar,
		top: 3,
		left: 0,
		height: "100% - 3",
		label: "track_list",
		items: ["track1", "track2"],
		style: box_style
	});

	// スクリーンの描画
	screen.render();
}

const test_event_trigger = [1, 15, 29, 33, 37, 47, 56, 70];
const test_lyrics = ["カンデラに差し掛かる突き当り。", "物乞いに集る毒蛾。", "ここから、", "そこから。", "動き始めたのです。", "あなたは在すか。", "この狼藉跋扈の褻に。", "わたしは見ています。"]

function create_yaml() {
	const notes = create_notes_list(parced_midi, 2);
	
	const created_yaml = {
		description: {
			title: "BIN2",
			artist: "無音。"
		},
		lyrics: []
	}
	for (var i = 0; i < test_event_trigger.length; i++) {
		const line_lyric = {
			lyric: test_lyrics[i],
			has_newline: true
		}

		if(i === 0) {
			line_lyric.time = notes[test_event_trigger[i]].startTimeMs;
		} else {
			line_lyric.time = notes[test_event_trigger[i]].startTimeMs - notes[test_event_trigger[i - 1]].startTimeMs;
		}

		created_yaml.lyrics.push(line_lyric);
	}
	// console.log(yaml.dump(created_yaml));
}

// create_yaml();
create_notes_list(parced_midi);
// setup_tui();
