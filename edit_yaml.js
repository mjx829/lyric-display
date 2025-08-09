const fs = require("fs");
const fsP = require("fs").promises;
const util = require("util");
const yaml = require("js-yaml");
const midi = require("midi-parser-js");
const blessed = require("blessed");

// midi解析
function create_notes_list(parced_midi, default_tempo) {
	const midi_all_notes = {};
	const tempo_info = {};
	tempo_info.tick_per_beat = parced_midi.timeDivision;
	tempo_info.tempo_change = {
		time: 0,
		tempo: default_tempo ? default_tempo : 454545 // デフォルトのテンポ
	}

	// トラックごとの解析
	for (var i = 0; i < parced_midi.track.length; i++) {
		let track_name = String(i);
		let absolute_time_tick = 0;

		const notes = [];
		const active_notes = new Map();

		parced_midi.track[i].event.forEach(event => {
			absolute_time_tick += event.deltaTime;

			// トラック名の再設定
			if (event.type === 255 && event.metaType === 3) {
				track_name = String(event.data);
			}

			// テンポの再設定
			if (event.type === 255 && event.metaType === 81) {
				tempo_info.tempo_change = {
					time: absolute_time_tick,
					tempo: event.data
				}
			}

			// ノートオンの処理
			if (event.type === 9 && event.data[1] > 0) {
				const note_number = event.data[0];
				const velocity = event.data[1];

				// 重複したノートの除去
				if (active_notes.has(note_number)) {
					const start_time_tick = active_notes.get(note_number);
					const duration_tick = absolute_time_tick - start_time_tick;

					notes.push({
						note_number: note_number,
						start_time_tick: start_time_tick,
						duration_tick: duration_tick,
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
					const start_time_tick = active_notes.get(note_number);
					const duration_tick = absolute_time_tick - start_time_tick;

					notes.push({
						note_number: note_number,
						start_time_tick: start_time_tick,
						duration_tick: duration_tick
					});
					active_notes.delete(note_number);
				}
			}
		});

		// トラックの終了後もオンになっているノートをオフとして記録
		active_notes.forEach((start_time_tick, note_number) => {
			const duration_tick = absolute_time_tick - start_time_tick;

			notes.push({
				note_number: note_number,
				start_time_tick: start_time_tick,
				duration_tick: duration_tick,
				status: "Unfinished note at track end"
			});
		});
		
		// console.log(notes);
		
		// display_notes(notes, tempo_mis, tick_per_beat);

		midi_all_notes[track_name] = notes; 
	}
	return [midi_all_notes, tempo_info];
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
		list[track].forEach(note => {
			const pich = note.note_number % 12; // オクターブで循環させる

			track_coordinate_notes.push([[note.start_time_tick, pich], note.duration_tick]);
		});

		all_coordinates_notes[track] = track_coordinate_notes;
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
		scrollable: true,
		warp: false,
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

// midi描画
async function draw_midi(screen, midi_dis, notes_array, tempo_info) {
    const notes = notes_array;
    const tick_per_beat = tempo_info.tick_per_beat;
	const NOTE_BEAT = 4; // 一つのグリッドの拍子

	// console.dir(notes, {depth:null});
    // console.log(tick_per_beat);
    // console.log(midi_dis.width);

    class midi_canvas {
        constructor(width, height) {
            this.width = width;
            this.height = height;
            this.grid = Array(height).fill().map(() => Array(width).fill(' '));    
        }

        setPixel(x, y, char) {
            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                this.grid[y][x] = char;
            }
        }

        render(widget) {
            const content = this.grid.map(row => row.join("")).join("\n");
            widget.setContent(content);
        }
    }

    // キャンバスの作成
    const canvas = new midi_canvas(midi_dis.width - 3, 12);
    
    // ノートの描画
    let i = 0;
    let current_x = 0;
    
    while (current_x < canvas.width && i < notes.length) {
        const x = notes[i][0][0] / (tick_per_beat / NOTE_BEAT);
        const y = Math.max(0, Math.min(11, 11 - notes[i][0][1]));
        const dur = notes[i][1] / (tick_per_beat / NOTE_BEAT);
        
		// console.log(`${x}, ${y}, ${dur}`)

        // duration部分に "-" を描画
        for (let dur_i = 0; dur_i < dur && (x + dur_i) < midi_dis.width; dur_i++) {
            canvas.setPixel(x + dur_i, y, "-");
        }

        // ノート開始位置に "=" を描画
        if (x < midi_dis.width) {
            canvas.setPixel(x, y, "=");
        }
        
        current_x = x + dur;
        i++;
    }

//	for (var j = 0; j < 12; j++) {
//		canvas.setPixel(0, j, (j % 2) === 1 ? "A" : "B");
//	}
	
	// await fsP.writeFile("output.txt", util.inspect(canvas.grid, {showHidden: false, depth: null, colors: false}), "utf-8");
    canvas.render(midi_dis);
    screen.render();
}

// 統率
function setup(midi_file_path) {
	const raw_midi_data = fs.readFileSync(midi_file_path);
	const base64_midi_data = raw_midi_data.toString("base64");
	const parced_midi_data = midi.parse(base64_midi_data);

	// console.dir(parced_midi_data, {depth: null});

	// jsオブジェクト
	const midi_info_return = create_notes_list(parced_midi_data);

	const notes_object = coordinate_notes(midi_info_return[0]);
	const tempo_info = midi_info_return[1];

	// console.dir(notes_object, {depth: null});

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
	blessed_objects.track_list.key(["up", "down", "k", "j"], () => {
		setTimeout(() => { 
			make_prefix(blessed_objects.screen, blessed_objects.track_list, original_track_names);
		}, 0);
	});

	// トラック選択後のイベントハンドラ
	blessed_objects.track_list.on("select", (item, index) => {
		draw_midi(blessed_objects.screen, blessed_objects.midi_dis, notes_object[item.content.slice(2)], tempo_info);
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
