#!/usr/bin/env ts-node
import { execSync } from "child_process";
import { dirname, join, basename, extname } from "path";
import { existsSync, writeJsonSync, readJsonSync } from "fs-extra";
// tslint:disable:max-line-length no-console

const inputFileName = `${__dirname}/${process.argv[2]}`;
const threshold = process.argv[3] ? process.argv[3] : "0.25";
const minimumSceneTime = process.argv[4] ? process.argv[4] : 2;

const dir = dirname(inputFileName);
const ext = extname(inputFileName);
const base = basename(inputFileName, ext);

let scenes: IScene[];
if (existsSync("scenes.json")) {
    scenes = readJsonSync("scenes.json");
} else {
    const detectScenesExec = `ffmpeg -i "${inputFileName}" -filter:v "select='gt(scene,${threshold})',showinfo" -f null - 2>&1`;
    console.log(detectScenesExec);
    const detectScenesResult = execSync(detectScenesExec).toString();
    const matches = detectScenesResult.match(/pts_time:[0-9.]*/gm);
    const sceneTimes = matches ? matches.map((match) => match.slice(9)) : [];

    scenes = sceneTimes.map((sceneTime, index) => ({ 
        start: sceneTimes[index - 1] ? sceneTimes[index - 1] : "0.000000", 
        end: sceneTime,
        target: join(dir, `${base} - Scene ${index + 1}${ext}`),
    }));

    writeJsonSync("scenes.json", scenes);
}

console.log(JSON.stringify(scenes));
scenes.forEach((scene, index) => {
    if (!existsSync(scene.target)) {
        if ((+scene.end - +scene.start) >= minimumSceneTime) {
            try{
                const splitSceneExec = `(${index + 1} of ${scenes.length}) ffmpeg -i "${inputFileName}" -ss ${scene.start} -strict -2 -to ${scene.end} "${scene.target}" 2>&1`;
                console.log(splitSceneExec);
                execSync(splitSceneExec).toString();
            } catch(e) {
                const error: Error = e;
                console.log(`${error.message}. Skipping to next scene...`);
            }
        } else {
            console.log(`(${index + 1} of ${scenes.length}) ${scene.target} is less than the minimum scene time. Skipping to next scene...`);
        }
    } else {
        console.log(`(${index + 1} of ${scenes.length}) ${scene.target} already encoded. Skipping to next scene...`);
    }
});

export interface IScene {
    readonly start: string;
    readonly end: string;
    readonly target: string;
}
