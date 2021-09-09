#!/usr/bin/env ts-node
import { execSync } from "child_process";
import { dirname, join, basename, extname } from "path";
import { existsSync, writeJsonSync, readJsonSync, removeSync, statSync } from "fs-extra";
import { mkdirSync } from "fs";
import { OptionDefinition } from "command-line-args";
import commandLineArgs = require("command-line-args");
// tslint:disable:max-line-length no-console

const execOptions = { maxBuffer: 1073741824 };

const optionDefinitions: Array<OptionDefinition> = [
    { name: "source", alias: "s", type: String, defaultOption: true },
    { name: "output_directory", alias: "o", type: String, multiple: false },
    { name: "clip_detection_threshold", alias: "t", type: Number, multiple: false, defaultValue: 0.07 },
    { name: "minimum_clip_length", alias: "m", type: Number, multiple: false, defaultValue: 0.5 },
    { name: "remove_audio", alias: "a", type: Boolean, multiple: false, defaultValue: false },
    { name: "split_by_clip_detection", alias: "d", type: Boolean, multiple: false, defaultValue: false },
    { name: "remove_frames_from_clip_ends", alias: "f", type: Number, multiple: false, defaultValue: 0 },
];

const options = commandLineArgs(optionDefinitions) as { source?: string, output_directory?: string, clip_detection_threshold: number, minimum_clip_length: number, remove_audio: boolean, split_by_clip_detection: boolean, remove_frames_from_clip_ends: number };

if(!options.source) {
    console.log("\nYou must specify a source video file using the -s or --source flag or as the default argument.\n");
    console.log("   --output_directory (-o) : the directory to output the splitted clips to, the same as source if not specified\n");
    console.log("   --clip_detection_threshold (-t) : the threshold of pixels changing in a single frame that counts as a clip change (only for clip detection)\n");
    console.log("   --minimum_clip_length (-m) : the minimum length of a clip (only for clip detection\n");
    console.log("   --remove_audio (-a) : removes all audio from the outputted video clips\n");
    console.log("   --split_by_clip_detection (-d) : splits the video at detected hard cuts instead of chapters using a pixel change threshold\n");
    console.log("   --remove_frames_from_clip_ends (-f) : removes the specified number of frames from the end of each encode clip\n");
    process.exit(0);
}

const inputFileName = options.source!;
const outputDirectory = options.output_directory ? options.output_directory : dirname(inputFileName);
const threshold = options.clip_detection_threshold;
const minimumDesiredClipLength = options.minimum_clip_length;
const removeAudio = options.remove_audio;
const isChapterSplit = !options.split_by_clip_detection;
const framesToTrimFromEachClipEnd = options.remove_frames_from_clip_ends;

const inputFileStat = statSync(inputFileName);

const ext = extname(inputFileName);
const base = basename(inputFileName, ext);
const containerDirectory = join(outputDirectory, `${base}.${inputFileStat.mtime.getTime() + (inputFileStat.mtime.getTimezoneOffset() * 60 * 1000) }`);
const resumeDataPath = join(containerDirectory, "resume.json");

let scenes: IScene[];
if (existsSync(resumeDataPath)) {
    console.log(`Resumable job found at ${resumeDataPath}. Resuming the previously unfinished job...`);
    scenes = readJsonSync(resumeDataPath);
    scenes.forEach((scene, index) => {
        if (!existsSync(scene.target)) {
            if(scenes[index - 1]) {
                console.log(`Removing uncomplete file at ${scenes[index - 1].target}...`);
                removeSync(scenes[index - 1].target);
            }
        }
    });
} else {
    if(!existsSync(containerDirectory)) {
        mkdirSync(containerDirectory, { recursive: true });
    }

    const detectTotalDurationExec = `ffprobe -v quiet -print_format json -show_format -show_streams "${inputFileName}"`;
    const videoContainerInformation = JSON.parse(execSync(detectTotalDurationExec, execOptions).toString());
    const videoStreamInformation = (videoContainerInformation.streams as any[]).find((x) => x.codec_type === "video");
    const videoAverageFrameLength = +eval(videoStreamInformation.avg_frame_rate) / 60;

    scenes = [];
    if(isChapterSplit) {
        console.log(`Detecting chapters in ${inputFileName}...`);
        const detectChaptersExec = `ffprobe -i "${inputFileName}" -print_format json -show_chapters -loglevel error`;
        const videoChapterInformation = JSON.parse(execSync(detectChaptersExec, execOptions).toString()) as ChapterData;
        scenes = videoChapterInformation.chapters.map((x) => ({ start: x.start_time, end: `${+x.end_time - (framesToTrimFromEachClipEnd * videoAverageFrameLength)}`, target: join(containerDirectory, `${base} - ${x.tags.title}.mp4`) }))
    } else {
    console.log(`Detecting probable hard cuts in ${inputFileName} using ffmpeg (threshold = ${threshold}, minimum clip length = ${minimumDesiredClipLength} seconds)...`);
    const detectScenesExec = `ffmpeg -i "${inputFileName}" -filter:v "select='gt(scene,${threshold})',showinfo" -f null - 2>&1`;
    
    const videoFormatInformation = videoContainerInformation.format;
    const videoTotalDuration = videoFormatInformation.duration;
    const detectScenesResult = execSync(detectScenesExec, execOptions).toString();
    const matches = detectScenesResult.match(/pts_time:[0-9.]*/gm);
    const sceneTimes = matches ? matches.map((match) => match.slice(9)) : [];
    
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
    } }

    console.log(`Creating ${resumeDataPath} with detected clip start and end times...`);
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
            console.log(`Encoding clip ${index} of ${scenes.length} from ${startDate.toISOString().substr(11, 8)} to ${endDate.toISOString().substr(11, 8)} as ${scene.target}...`);
            execSync(splitSceneExec, execOptions).toString();
        } catch (e) {
            const error: Error = e as Error;
            console.log(`${error.message}. Skipping to next scene...`);
        }
    }
});

console.log(`Encoding job completed successfully. Removing ${resumeDataPath}...`);
removeSync(resumeDataPath);

console.log(`DONE!`);

export interface ChapterData { 
    chapters: Array<{
    id: string;
    time_base: string;
    start: string;
    start_time: string;
    end: string;
    end_time: string;
    tags: { title: string }
}> }

export interface IScene {
    readonly start: string;
    end: string;
    readonly target: string;
}
