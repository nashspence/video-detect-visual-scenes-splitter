# Video Detect Visual Scene Split
A script written in typescript that will use ffmpeg in order to split a video file into multiple clips based off of the analysis and detection of a visual scene change. This is very useful for old home video footage that has no scene detection metadata on it.

In order for anyone to use this script:
1. download the repository
2. install yarn (https://classic.yarnpkg.com/en/docs/install/), ts-node (https://typestrong.org/ts-node/docs/installation), and ffmpeg (https://ffmpeg.org) on your system
3. enter the repo on the command line and run `yarn install`
4. enter the src directory of the repo on the commandline and run `ts-node script.ts <path_to_video> <path_to_output_directory>`

***There are some other options available that you can discover by looking at the source code of the script
