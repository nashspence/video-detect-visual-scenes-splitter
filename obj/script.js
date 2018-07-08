#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var child_process_1 = require("child_process");
// tslint:disable:max-line-length no-console
var inputFileName = __dirname + "/process.argv[0]";
var threshold = process.argv[1] ? process.argv[1] : "0.25";
var showinfo = child_process_1.execSync("ffmpeg -i \"" + inputFileName + "\" -filter:v \"select='gt(scene," + threshold + ")',showinfo\" -f null -").toString();
var matches = showinfo.match(/pts_time:[0-9.]*/g);
var sceneTimes = matches ? matches.map(function (x) { return x.match(/[0-9.]*/g); }).flatMap(function (x) { return x ? x : []; }) : [];
var scenes = sceneTimes.map(function (sceneTime, index) { return ({ start: sceneTimes[index - 1] ? sceneTimes[index - 1] : "0.000000", end: sceneTime }); });
scenes.forEach(function (scene, index) {
    child_process_1.execSync("ffmpeg -i \"" + inputFileName + "\" -ss " + scene.start + " -strict -2 -to " + scene.end + " \"" + inputFileName + " - Scene " + index + "\"");
});
//# sourceMappingURL=script.js.map