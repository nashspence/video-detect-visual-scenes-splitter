#!/usr/bin/env ts-node

import { execSync } from "child_process";
import { dirname, join, basename, extname } from "path";
// tslint:disable:max-line-length no-console

const inputFileName = `${__dirname}/${process.argv[2]}`;
const threshold = process.argv[3] ? process.argv[3] : "0.25";

const dir = dirname(inputFileName);
const ext = extname(inputFileName);
const base = basename(inputFileName, ext);

console.log(`Spliting scenes in ${inputFileName} with ${threshold} threshold...`);
console.log(`ffmpeg -i "${inputFileName}" -filter:v "select='gt(scene,${threshold})',showinfo" -f null -`);
const showinfo = execSync(`ffmpeg -i "${inputFileName}" -filter:v "select='gt(scene,${threshold})',showinfo" -f null - 2>&1`).toString();
const matches = showinfo.match(/pts_time:[0-9.]*/gm);
console.log(matches ? matches : "No Scenes Detected!");
const sceneTimes = matches ? matches.map((match) => match.slice(9)) : [];
console.log(sceneTimes);
const scenes: IScene[] = sceneTimes.map((sceneTime, index) => ({ start: sceneTimes[index - 1] ? sceneTimes[index - 1] : "0.000000", end: sceneTime }));
console.log(JSON.stringify(scenes));

scenes.forEach((scene, index) => {
    console.log(`Spliting Scene ${index}, from ${scene.start} to ${scene.end}...`);
    const outputPath = join(dir, `${base} - Scene ${index + 1}${ext}`);
    console.log(`ffmpeg -i "${inputFileName}" -ss ${scene.start} -strict -2 -to ${scene.end} "${outputPath}"`);
    const output = execSync(`ffmpeg -i "${inputFileName}" -ss ${scene.start} -strict -2 -to ${scene.end} "${outputPath}" 2>&1`).toString();
    console.log(output);
});

export interface IScene {
    readonly start: string;
    readonly end: string;
}
