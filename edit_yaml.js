const fs = require("fs");
const yaml = require("js-yaml");
const midi = require("midi-parser-js");
const blessed = require("blessed");

// midi解析
function create_notes_list(parced_midi, default_tempo) {
	const midi_all_notes = {};

	// トラックごとの解析
	for (var i = 0; i < parced_midi.track.length; i++) {
		let track_name = String(i);
		let absolute_time_tick = 0;
		let tempo_mis = default_tempo ? default_tempo : 454545; // デフォルトのテンポ
		let tempo_ms = tempo_mis / 1000;
		const tick_per_beat = parced_midi.timeDivision;

		const notes = [];
		const tempo_changes = [];
		const active_notes = new Map();

		parced_midi.track[i].event.forEach(event => {
			absolute_time_tick += event.deltaTime;

			// トラック名の再設定
			if (event.type === 255 && event.metaType === 3) {
				track_name = String(event.data);
			}

			// テンポの再設定
			if (event.type === 255 && event.metaType === 81) {
				tempo_mis = event.data;
				tempo_ms = tempo_mis / 1000;
				tempo_changes.push(tempo_ms);
				// console.log(tempo_changes);
			}

			// ノートオンの処理
			if (event.type === 9 && event.data[1] > 0) {
				const note_number = event.data[0];
				const velocity = event.data[1];

				// 重複したノートの除去
				if (active_notes.has(note_number)) {
					const start_time_ticks = active_notes.get(note_number);
					const duration_ticks = absolute_time_tick - start_time_ticks;

					const start_time_ms = (start_time_ticks / tick_per_beat) * tempo_ms;
					const duration_ms = (duration_ticks / tick_per_beat) * tempo_ms;
					
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

					const start_time_ms = (start_time_ticks / tick_per_beat) * tempo_ms;
					const duration_ms = (duration_ticks / tick_per_beat) * tempo_ms;

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
			const start_time_ms = (start_time_ticks / tick_per_beat) * tempo_ms;
			const duration_ms = (duration_ticks / tick_per_beat) * tempo_ms;

			notes.push({
				noteNumber: note_number,
				startTimeMs: start_time_ms,
				durationMs: duration_ms,
				status: "Unfinished note at track end"
			});
		});
		
		// console.log(notes);
		
		// display_notes(notes, tempo_mis, tick_per_beat);

		midi_all_notes[track_name] = {
			notes: notes,
			tempo_ms: tempo_ms,
			tick_per_beat: tick_per_beat // midiファイルごとに決まっている値だが、扱いやすさのためにトラックごとに格納する
		};
	}
	return midi_all_notes;
}


// ノートの相対座標を返す
function coordinate_notes(list) {
	// console.log(list);
	const all_coordinates_notes = {};
	// キー(トラック名)を配列化
	Object.keys(list).forEach(track => {
		const track_coordinate_notes = [];
		// console.log(list[track]);

		// トラックごとの処理
		list[track].notes.forEach(note => {
			const ms_per_tick = Math.round(list[track].tempo_ms / list[track].tick_per_beat);
			// console.log(tick_per_beat);
			// console.log(note);

			const pich = note.noteNumber % 12; // オクターブで循環させる
			const start_time_tick = Math.round(note.startTimeMs / ms_per_tick);
			const duraion_tick = Math.round(note.durationMs / ms_per_tick);

			// console.log([[start_time_tick, pich], duraion_tick])
			track_coordinate_notes.push([[start_time_tick, pich], duraion_tick]);
		});

		// console.log(track_coordinate_notes);

		all_coordinates_notes[track] = {
			notes: track_coordinate_notes,
			tempo_ms: list[track].tempo_ms,
			tick_per_beat: list[track].tick_per_beat
		};
		
	});
	return all_coordinates_notes;
}

// TUIの起動
function setup_tui() {
	// スクリーンの作成
	const screen = blessed.screen({
		smartCSR:true
	});

	// 終了時の処理
	screen.key(["escape", "C-c"], () => {
		return process.exit(0);
	});

	// ガイドメッセージ
	const guide = blessed.text({
		bottom: 0,
		left: 0,
		width: "100%",
		height: 1,
		content: "hogehoge",
		style: {fg: "#FFF", bg: "#000", border: {fg: "#FFF", bg: "#000"}}
	});

	// サイドバー
	const sidebar = blessed.box({
		top: 0,
		left: 0,
		width: "25%",
		height: "100%-1",
		content: "track list",
		border: {type: "line"},
		style: {fg: "#FFF", bg: "#000", border: {fg: "#FFF", bg: "#000"}}
	});

	// メイン画面(親専用)
	const main_body = blessed.box({
		top: 0,
		right: 0,
		width: "75%",
		height: "100%-1",
		content: "main",
		style: {fg: "#FFF", bg: "#000"}
	});

	// midiノート表示画面
	const midi_dis = blessed.box({
		parent: main_body,
		top: 0,
		left: "center",
		width: "100%",
		height: "60%",
		content: "midi_display",
		border: {type: "line"},
		style: {fg: "#FFF", bg: "#000", border: {fg: "#FFF", bg: "#000"}}
	});

	// 歌詞のメイン画面(親専用)
	const lyrics_body = blessed.box({
		parent: main_body,
		bottom: 0,
		left: "center",
		width: "100%",
		height: "40%",
		content: "lyrics_main_body",
		style: {fg: "#FFF", bg: "#000"}
	});

	// 歌詞リスト
	const lyrics_list = blessed.box({
		parent: lyrics_body,
		top: 0,
		left: 0,
		width: "34%",
		height: "100%",
		content: "lyrics_list",
		border: {type: "line"},
		style: {fg: "#FFF", bg: "#000", border: {fg: "#FFF", bg: "#000"}}
	});

	// 歌詞編集画面
	const lyrics_edit = blessed.box({
		parent: lyrics_body,
		top: 0,
		right: 0,
		width: "66%",
		height: "100%",
		content: "lyrics_edit_display",
		border: {type: "line"},
		style: {fg: "#FFF", bg: "#000", border: {fg: "#FFF", bg: "#000"}}
	});

	// 初期描画
	screen.append(guide);
	screen.append(sidebar);
	screen.append(main_body);

	guide.setContent("Welcom. No file have been read. Press (C-f).");

	// トラックリスト
	const track_list = blessed.list({
		parent: sidebar,
		top: 1,
		left: 0,
		width: "100%-2",
		height: "100%-3",
		label: "track_list",
		items: [],
		mouse: true,
		keys: true,
		vi: true,
		style: {
			fg: "#FFF", bg: "#000",
			item: {fg: "#FFF",bg: "#000"},
			selected: {fg: "#FFF", bg: "#000"}
		}
	});
	track_list.focus();

	screen.render();

	return {
		screen: screen,

		guide: guide,
		sidebar: sidebar,
		main_body: main_body,
		midi_dis: midi_dis,
		lyrics_body: lyrics_body,
		lyrics_list: lyrics_list,
		lyrics_edit: lyrics_edit,

		track_list: track_list
	}
}

// リストのカーソル付け
function make_prefix(screen, list_widget, original_items) {
	const selected_index = list_widget.selected;
	const prefixed_items = original_items.map((item, index) => {
		if (index === selected_index) {
			return `> ${item}`;
		} else {
			return `  ${item}`;
		}
	});

	list_widget.setItems(prefixed_items);
	list_widget.select(selected_index);
	screen.render();
}


// 統率
function setup(midi_file_path) {
	const raw_midi_data = fs.readFileSync(midi_file_path);
	const base64_midi_data = raw_midi_data.toString("base64");
	const parced_midi_data = midi.parse(base64_midi_data);

	// jsオブジェクト
	const notes_object = coordinate_notes(create_notes_list(parced_midi_data));

	// console.log(notes_object);

	const blessed_objects = setup_tui();
	let read_midi_file = midi_file_path ? midi_file_path : null;

	blessed_objects.screen.key("C-f", () => {
		if (read_midi_file) {
			// 変更の破棄の確認	
			blessed_objects.guide_message.setContent("Are you okay with discarding this edit?");
			blessed_objects.screen.render();
		}
	});

	// トラックリスト設定
	// もとのトラック名
	const original_track_names = Object.keys(notes_object); 
	blessed_objects.track_list.setItems(original_track_names.map(item => `  ${item}`));
	blessed_objects.screen.render();

	make_prefix(blessed_objects.screen, blessed_objects.track_list, original_track_names);
	
	// トラックリストのイベントハンドラ
	blessed_objects.track_list.key(["up", "down"], () => {
		setTimeout(() => { 
			make_prefix(blessed_objects.screen, blessed_objects.track_list, original_track_names);
		}, 0);
	});
}

setup(process.argv[2]);

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
// setup_tui();
