# The Video Split Script
A script written in typescript that will use ffmpeg to split a video file into multiple clips based off of either the chapter marker embedded into the video file or an analysis and detection of a visual hard cut. This is very useful for old home video footage that you may need to split up in various ways or in breaking down large video files into smaller clips to edit them into something else.

In order for anyone to use this script:
1. download the repository
2. install yarn (https://classic.yarnpkg.com/en/docs/install/), ts-node (https://typestrong.org/ts-node/docs/installation), and ffmpeg (https://ffmpeg.org) on your system
3. enter the repo on the command line and run `yarn install`
4. enter the src directory of the repo on the commandline and run `ts-node script.ts` for usage instructions

***There are some other options available that you can discover by looking at the source code of the script
