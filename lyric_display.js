const yaml = require("js-yaml");
const fs = require("fs");
const test_yaml = `
description:
 title: BIN2
 artist: 無音。
lyrics:
 - lyric: カンデラに差し掛かる突き当り。
   time: 1000
   has_newline: true
 - lyric: 物乞いに集る毒蛾。
   time: 1000
   has_newline: true
 - lyric: ここから、
   time: 1000
   has_newline: false
 - lyric: そこから。
   time: 1000
   has_newline: true
 - lyric: 動き始めたのです。
   time: 1000
   has_newline: true
 - lyric: あなたは在すか。
   time: 2000
   has_newline: true
 - lyric: この狼藉跋扈の褻に。
   time: 1000
   has_newline: true
 - lyric: わたしは見ています。
   time: 1000
   has_newline: true
`;

// const parced_jsob = yaml.load(test_yaml);
// console.log(parced_jsob);
const test_file_path = "test_buin2.yaml";

function display_lyrics(lyrics) {
	// process.stdout.write('\x1Bc');
	let delay = 0;
	// console.log(lyrics);
	for(let i = 0; i < lyrics.length; i++) {
		delay += lyrics[i]["time"];
		setTimeout(() => {
			process.stdout.write(lyrics[i]["lyric"] + (lyrics[i]["has_newline"] === true ? "\n" : ""));
		}, delay);

	}
}

fs.readFile(test_file_path, "utf8", (err, data) => {
	if (err) {
		console.error("ファイルの読み込みに失敗しました。\n${err}");
		return;
	}
	// console.log(data);
	display_lyrics(yaml.load(data).lyrics);
});
