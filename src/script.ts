#!/usr/bin/env ts-node
import { execSync } from "child_process";
import { dirname, join, basename, extname } from "path";
import { existsSync, writeJsonSync, readJsonSync, removeSync, statSync } from "fs-extra";
import { mkdirSync } from "fs";
// tslint:disable:max-line-length no-console

const execOptions = { maxBuffer: 1073741824 };
const framesToTrimFromEachClipEnd = 2;

const inputFileName = process.argv[2];
const outputDirectory = process.argv[3] ? process.argv[3] : dirname(inputFileName);
const threshold = process.argv[4] ? process.argv[4] : "0.07";
const minimumDesiredClipLength = process.argv[5] ? process.argv[5] : 0.5;
const removeAudio = (process.argv[6] ? process.argv[6] : false) as boolean;

const inputFileStat = statSync(inputFileName);

const ext = extname(inputFileName);
const base = basename(inputFileName, ext);
const containerDirectory = join(outputDirectory, `${base}.${inputFileStat.mtime.getTime() + (inputFileStat.mtime.getTimezoneOffset() * 60 * 1000) }`);
const resumeDataPath = join(containerDirectory, "resume.json");

let scenes: IScene[];
if (existsSync(resumeDataPath)) {
    console.log(`Resumable job found at ${resumeDataPath}. Resuming the previously unfinished job...`);
    scenes = readJsonSync(resumeDataPath);
} else {
    console.log(`Detecting probable hard cuts in ${inputFileName} using ffmpeg (threshold = ${threshold}, minimum clip length = ${minimumDesiredClipLength} seconds)...`);

    if(!existsSync(containerDirectory)) {
        mkdirSync(containerDirectory, { recursive: true });
    }

    const detectScenesExec = `ffmpeg -i "${inputFileName}" -filter:v "select='gt(scene,${threshold})',showinfo" -f null - 2>&1`;
    const detectTotalDurationExec = `ffprobe -v quiet -print_format json -show_format -show_streams "${inputFileName}"`;
    const videoContainerInformation = JSON.parse(execSync(detectTotalDurationExec, execOptions).toString());
    const videoStreamInformation = (videoContainerInformation.streams as any[]).find((x) => x.codec_type === "video");
    const videoFormatInformation = videoContainerInformation.format;
    const videoTotalDuration = videoFormatInformation.duration;
    const videoAverageFrameLength = +eval(videoStreamInformation.avg_frame_rate) / 60;

    const detectScenesResult = execSync(detectScenesExec, execOptions).toString();
    const matches = detectScenesResult.match(/pts_time:[0-9.]*/gm);
    const sceneTimes = matches ? matches.map((match) => match.slice(9)) : [];

    scenes = [];
    for (let index = 0; index < sceneTimes.length; index++) {
        const start = sceneTimes[index - 1] !== undefined ? sceneTimes[index - 1] : "0.000000";
        const end = `${+sceneTimes[index] - (framesToTrimFromEachClipEnd * videoAverageFrameLength)}`;

        if (+end - +start >= minimumDesiredClipLength) {
            scenes.push({
                start,
                end,
                target: join(containerDirectory, `${base} - Clip ${scenes.length + 1}.mp4`),
            });

            if (index === sceneTimes.length - 1) {
                if (+videoTotalDuration - +end >= minimumDesiredClipLength) {
                    scenes.push({
                        start: end,
                        end: videoTotalDuration,
                        target: join(containerDirectory, `${base} - Clip ${scenes.length + 1}.mp4`),
                    });
                } else {
                    if(scenes[scenes.length - 1]) {
                        scenes[scenes.length - 1].end = videoTotalDuration;
                    }
                }
            }
        } else {
            if(scenes[scenes.length - 1]) {
                scenes[scenes.length - 1].end = end;
            }
        }
    }

    console.log(`Creating ${resumeDataPath} with detected probable hard cut data...`);
    writeJsonSync(resumeDataPath, scenes);
}

console.log(`Beginning split and re-encode clips to ${containerDirectory}. If you need to pause or something goes wrong before the job completes, you can resume the job by re-running this script again with the same input.`);
scenes.forEach((scene, index) => {
    if (!existsSync(scene.target)) {
        try {
            const startDate = new Date(0);
            const endDate = new Date(0);
            startDate.setSeconds(+scene.start);
            endDate.setSeconds(+scene.end);
            const splitSceneExec = `ffmpeg -i "${inputFileName}" -ss ${scene.start} -to ${scene.end} -c:v libx264 -crf 18${removeAudio ? " -an" : ""} -strict -2 "${scene.target}" 2>&1`;
            console.log(`Encoding probable clip ${index} of ${scenes.length} from ${startDate.toISOString().substr(11, 8)} to ${endDate.toISOString().substr(11, 8)} as ${scene.target}...`);
            execSync(splitSceneExec, execOptions).toString();
        } catch (e) {
            const error: Error = e;
            console.log(`${error.message}. Skipping to next scene...`);
        }
    }
});

console.log(`Encoding job completed successfully. Removing ${resumeDataPath}...`);
removeSync(resumeDataPath);

console.log(`DONE!`);

export interface IScene {
    readonly start: string;
    end: string;
    readonly target: string;
}
