var audioContext;
var audioEngine;
var audioRecorder;
var audioRecorderDestination;
var audioTestConfig;
var audioTestResult;
var audioTestSounds = [];
var BABYLON;

const SilenceAudioOutput = true;

class AudioV2Test {
    static AddSound(sound) {
        audioTestSounds.push(sound);

        // Start the audio recorder after the sound loads to avoid capturing silence while we wait.
        if (audioRecorder.state === "inactive") {
            audioRecorder.start();
        }
    }

    static async AfterEachAsync() {
        audioContext = null;
        audioRecorder = null;
        audioRecorderDestination = null;
        audioTestConfig = null;
        audioTestResult = null;

        audioTestSounds.length = 0;

        audioEngine?.dispose();
        audioEngine = null;
    }

    static async BeforeEachAsync() {
        audioContext = new AudioContext();

        // Firefox doesn't always start the audio context immediately, so wait for it to start here.
        await new Promise((resolve) => {
            const onStateChange = () => {
                if (audioContext.state === "running") {
                    audioContext.removeEventListener("statechange", onStateChange);
                    resolve();
                }
            };
            audioContext.addEventListener("statechange", onStateChange);
        });
    }

    static async CreateAudioEngineAsync(options = {}) {
        options.audioContext = audioContext;
        audioEngine = await BABYLON.CreateAudioEngineAsync(options);

        audioRecorderDestination = new MediaStreamAudioDestinationNode(audioContext);
        audioRecorder = new MediaRecorder(audioRecorderDestination.stream);
        const nodeToCapture = audioEngine.mainOut._inNode;
        nodeToCapture.connect(audioRecorderDestination);

        if (SilenceAudioOutput) {
            nodeToCapture.disconnect(audioContext.destination);
        }

        return audioEngine;
    }

    static async CreateSoundAsync(source, options = {}) {
        if (typeof source === "string") {
            source = audioTestConfig.soundsUrl + source;
        } else if (source instanceof Array) {
            for (let i = 0; i < source.length; i++) {
                if (typeof source[i] === "string") {
                    source[i] = audioTestConfig.soundsUrl + source[i];
                }
            }
        }
        const sound = await BABYLON.CreateSoundAsync("", source, options);
        AudioV2Test.AddSound(sound);

        return sound;
    }

    static CreateAbstractSoundAsync(soundType, source, options = {}) {
        if (soundType === "Static") {
            return AudioV2Test.CreateSoundAsync(source, options);
        } else if (soundType === "Streaming") {
            return AudioV2Test.CreateStreamingSoundAsync(source, options);
        } else {
            throw new Error(`Unknown sound type: ${soundType}`);
        }
    }

    static async CreateStreamingSoundAsync(source, options = {}) {
        if (typeof source === "string") {
            source = audioTestConfig.soundsUrl + source;
        } else if (source instanceof Array) {
            for (let i = 0; i < source.length; i++) {
                if (typeof source[i] === "string") {
                    source[i] = audioTestConfig.soundsUrl + source[i];
                }
            }
        }
        const sound = await BABYLON.CreateStreamingSoundAsync("", source, options);
        AudioV2Test.AddSound(sound);

        return sound;
    }

    static async GetResultAsync() {
        if (audioTestResult) {
            return audioTestResult;
        }

        // Wait for sounds to finish playing.
        for (let i = 0; i < audioTestSounds.length; i++) {
            const sound = audioTestSounds[i];
            if (sound.state !== BABYLON.SoundState.Stopped) {
                await new Promise((resolve) => {
                    sound.onEndedObservable.addOnce(() => {
                        resolve();
                    });
                });
            }
        }

        // Get rendered audio.
        let renderedBuffer;
        await new Promise((resolve) => {
            audioRecorder.addEventListener(
                "dataavailable",
                async (event) => {
                    const arrayBuffer = await event.data.arrayBuffer();
                    if (arrayBuffer.byteLength === 0) {
                        throw new Error("No audio data.");
                    }

                    renderedBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    resolve();
                },
                { once: true }
            );
            audioRecorder.stop();
        });

        if (!renderedBuffer) {
            throw new Error("No buffer rendered.");
        }

        if (renderedBuffer.length === 0) {
            throw new Error("No audio data in rendered buffer.");
        }

        const capturedAudio = new Array(renderedBuffer.numberOfChannels);

        for (let i = 0; i < renderedBuffer.numberOfChannels; i++) {
            capturedAudio[i] = renderedBuffer.getChannelData(i);
        }

        audioTestResult = {
            length: renderedBuffer.length,
            numberOfChannels: renderedBuffer.numberOfChannels,
            sampleRate: renderedBuffer.sampleRate,
            samples: capturedAudio,
        };

        return new Promise((resolve) => {
            resolve(audioTestResult);
        });
    }

    static async WaitAsync(seconds) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, seconds * 1000);
        });
    }
}
