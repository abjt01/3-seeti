#!/bin/sh
# Builds public/demo/kitchen-session.mp3: three and a half minutes of a kitchen with exactly three
# pressure cooker whistles, plus things that must not count (talking, frying, TV, a kettle, a mixer).
# Every source is CC0 on freesound.org; see public/demo/CREDITS.md. Needs ffmpeg.
# Usage: scripts/make-demo-session.sh <folder with the downloaded clips as 16 kHz mono wav>
set -e
C="$1"
ffmpeg -y -loglevel error \
  -i "$C/neg-kitchen2.wav" \
  -ss 1.45 -t 1.6 -i "$C/jibanshil-whistle.wav" \
  -ss 7.05 -t 1.3 -i "$C/jibanshil-whistle.wav" \
  -ss 23.8 -t 5.4 -i "$C/jibanshil-whistle.wav" \
  -ss 10 -t 22 -i "$C/neg-talk1.wav" \
  -ss 2 -t 16 -i "$C/neg-sizzle1.wav" \
  -ss 0 -t 28 -i "$C/neg-tv1.wav" \
  -ss 30 -t 12 -i "$C/neg-kettle2.wav" \
  -ss 2 -t 12 -i "$C/neg-mixer.wav" \
  -filter_complex "\
[0]atrim=0:210,asetpts=PTS-STARTPTS,volume=1.0[bg];\
[1]adelay=62000|62000,volume=0.8[w1];\
[2]adelay=118000|118000,volume=0.8[w2];\
[3]adelay=176000|176000,volume=0.8[w3];\
[4]adelay=18000|18000,volume=0.5[talk];\
[5]adelay=44000|44000,volume=0.6[fry];\
[6]adelay=84000|84000,volume=0.4[tv];\
[7]adelay=140000|140000,volume=0.5[kettle];\
[8]adelay=192000|192000,volume=0.5[mixer];\
[bg][w1][w2][w3][talk][fry][tv][kettle][mixer]amix=inputs=9:duration=first:normalize=0,alimiter=limit=0.95" \
  -ac 1 -ar 16000 -b:a 64k public/demo/kitchen-session.mp3
echo "wrote public/demo/kitchen-session.mp3"
