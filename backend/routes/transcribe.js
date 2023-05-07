const express = require("express");
const router = express.Router();
const fs = require("fs");
const { of, map, from, throwError, concatMap, subscribe } = require("rxjs");

const ytdl = require("ytdl-core");

const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);

const { Configuration, OpenAIApi } = require("openai");
const { OPEN_AI_API_KEY } = require("../../appsecrets");

const { TranslationServiceClient } = require('@google-cloud/translate');
const { GOOGLE_PROJECT_ID } = require("../../appsecrets");

const configuration = new Configuration({
  apiKey: OPEN_AI_API_KEY,
});
const openai = new OpenAIApi(configuration);
const translationClient = new TranslationServiceClient();

const storagePath = './backend/audio'

router.get("/:videoId", async (req, res) => {
  const videoId = req.params.videoId;

  //test code
  if (videoId === 'test') { 
    res.status(200).json({
      message: "success",
      result: {
        //our extrememely long sample response
        translation: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum bibendum ac ante id molestie. Nam vel enim quis leo egestas facilisis a ac enim. Aliquam diam ligula, volutpat vel nulla non, maximus blandit tellus. Vestibulum condimentum eleifend orci vel dictum. Aenean mollis tempus felis, iaculis ultricies justo tincidunt nec. Duis lobortis quam id ligula suscipit, sit amet porttitor massa sagittis. Phasellus scelerisque, ligula nec ullamcorper consectetur, augue elit consectetur elit, eget tempus ante sapien congue sapien. Ut mollis vulputate ex eget bibendum. Donec sed urna feugiat, pharetra enim vel, maximus ligula. Aenean aliquet nec sapien ultricies ornare.Curabitur et tincidunt urna, sed pulvinar purus. Mauris venenatis neque non dolor consectetur, egestas maximus risus placerat. Suspendisse eget dui commodo, suscipit velit id, pellentesque justo. Suspendisse scelerisque sollicitudin malesuada. Maecenas fermentum sodales ipsum nec condimentum. Donec vitae dolor lacinia, gravida mauris id, mollis turpis. Vivamus rutrum augue nibh, sed convallis leo pulvinar nec. Donec feugiat pellentesque tincidunt. Donec ut ligula a arcu feugiat tempor. Donec ut erat eget lorem rutrum pellentesque. Etiam sit amet efficitur lacus. Morbi quis justo facilisis ligula congue porta. Fusce a ex arcu. Nam tellus justo, laoreet vitae tempus a, tempor sit amet lacus"
      }
    });
    const videoUrl = 'https://www.youtube.com/watch?v=XzLgw2Y8gNw'
    return;
  }

  // const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const options = {
    filter: "audioonly",
    quality: "highestaudio",
    format: "mp3",
  };

  from(ytdl.getInfo(videoUrl, options)).pipe(
    concatMap(async (info) => {
      console.log('Start processing download...')
      const stream = ytdl.downloadFromInfo(info, options);
      const filename = `${info.videoDetails.title}.mp3`;
      const filePath = `${storagePath}/${filename}`;

      ffmpeg(stream)
        .toFormat("mp3")
        .saveToFile(filePath)
        .on("error", function (err) {
          return throwError(() => new Error('🔥' + err));
        }).on("end", async function () {
          console.log("🚀 ~ file: transcribe.js:43 ~ File Downloaded!");
          const transcription = await transcribeAudio(filePath, info.videoDetails.description);
          const translations = await translateText(transcription);

          if (translations !== undefined && translations.length > 0) {
            res.status(200).json({
              message: "success",
              result: {
                translation: translations[0].translatedText,
              }
            });
            // deletefile(filePath)
          } else {
            deletefile(filePath);
            return throwError(() => new Error('🔥' + 'No translation found'));
          }
        })
    })
  ).subscribe({
    error: (err) => {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  })
});

async function translateText(text) {
  // Construct request
  const request = {
    parent: `projects/${GOOGLE_PROJECT_ID}/locations/global`,
    contents: [text],
    mimeType: 'text/plain', // mime types: text/plain, text/html
    sourceLanguageCode: 'en',
    targetLanguageCode: 'fr',
  };

  // Run request
  const [response] = await translationClient.translateText(request);

  for (const translation of response.translations) {
    console.log(`\n\nTranslation: ${translation.translatedText}`);
  }
  return response.translations
}


async function deletefile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`File ${filePath} has been deleted.`);
  });
}

async function transcribeAudio(filePath, description) {
  console.log("🚀 ~ file: transcribe.js:86 ~ transcribeAudio ~ Transcription In Progress!")

  // Call the OpenAI API to transcribe the audio
  const response = await openai.createTranscription(
    fs.createReadStream(filePath),
    "whisper-1",
    description, // The prompt to use for transcription.
    "json", // The format of the transcription.
    1, // Temperature
    "en" // Language
  );

  // Parse the response and extract the transcribed text
  const transcript = response.data.text;
  console.log(
    "🚀 ~ file: transcribe.js:45 ~ transcribeAudio ~ response:",
    transcript
  );

  return transcript;
}

module.exports = router;
