let currentData = {
    album: "",
    artists: [],
    context: "",
    deployTime: 0,
    description: "",
    device: "",
    id: "",
    image: "",
    imageColors: {
        averageBrightness: 0.0,
        primary: {
            r: 0,
            g: 0,
            b: 0
        },
        secondary: {
            r: 0,
            g: 0,
            b: 0
        }
    },
    listTracks: [],
    paused: true,
    release: "",
    repeat: "",
    shuffle: false,
    trackListView: "",
    trackNumber: 0,
    timeCurrent: 0,
    timeTotal: 0,
    title: "",
    type: "",
    volume: 0,
    queueTrackNumber: 0,
    queueTrackList: []
};

let useQueue = true;

function setQueueState(state) {
    useQueue = state;

    currentData.queueTrackNumber = 0;
    currentData.queueTrackList = [];
    currentData.listTracks = [];
    currentData.trackListView = "";

    let trackListContainer = document.getElementById("track-list");
    trackListContainer.innerHTML = "";

    singleRequest(true);
}

let idle = false;


///////////////////////////////
// WEB STUFF
///////////////////////////////

const FLUX_URL = "/playback-info-flux";
const INFO_URL = "/playback-info";
const INFO_URL_FULL = INFO_URL + "?full=true";
const RETRY_TIMEOUT_MS = 5 * 1000;

window.addEventListener('load', init);

function init() {
    singleRequest(true);
    closeFlux();
    startFlux();
    createHeartbeatTimeout();
}

function singleRequest(forceFull) {
    let url = forceFull ? INFO_URL_FULL : INFO_URL;
    fetch(url)
        .then(response => response.json())
        .then(json => processJson(json))
        .catch(ex => {
            console.error("Single request", ex);
            setTimeout(() => singleRequest(forceFull), RETRY_TIMEOUT_MS);
        });
}

let flux;

function startFlux() {
    setTimeout(() => {
        try {
            closeFlux();
            flux = new EventSource(FLUX_URL);
            flux.onopen = () => {
                console.info("Flux connected!");
                singleRequest(true);
            };
            flux.onmessage = (event) => {
                try {
                    createHeartbeatTimeout();
                    if (idle) {
                        singleRequest(true);
                    } else {
                        let data = event.data;
                        let json = JSON.parse(data);
                        processJson(json);
                    }
                } catch (ex) {
                    console.error("Flux onmessage", ex);
                    startFlux();
                }
            };
            flux.onerror = (ex) => {
                console.error("Flux onerror", ex);
                startFlux();
            };
        } catch (ex) {
            console.error("Flux creation", ex);
            startFlux();
        }
    }, RETRY_TIMEOUT_MS);
}

function closeFlux() {
    if (flux) {
        flux.close();
    }
}

window.addEventListener('beforeunload', closeFlux);

function processJson(json) {
    if (json.type !== "HEARTBEAT") {
        console.debug(json);
        if (json.type === "DATA") {
            if ('deployTime' in json && currentData.deployTime > 0 && json.deployTime > currentData.deployTime) {
                window.location.reload();
            } else {
                setDisplayData(json)
                    .then(() => startTimers());
            }
        } else if (json.type === "DARK_MODE") {
            toggleDarkMode();
        }
    }
}

const HEARTBEAT_TIMEOUT_MS = 60 * 1000;
let heartbeatTimeout;

function createHeartbeatTimeout() {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = setTimeout(() => {
        console.error("Heartbeat timeout")
        init();
    }, HEARTBEAT_TIMEOUT_MS);
}

///////////////////////////////
// MAIN DISPLAY STUFF
///////////////////////////////

async function setDisplayData(changes) {
    changeImage(changes)
        .then(() => setTextData(changes));
}

function addTrack(trackItem, trackNumPadLength, trackListContainer) {
    let trackElem = document.createElement("div");
    trackElem.className = "track-elem";

    let trackNumberContainer = document.createElement("div");
    trackNumberContainer.innerHTML = padToLength(trackItem.trackNumber, trackNumPadLength);
    trackNumberContainer.className = "track-number"

    let trackArtist = document.createElement("div");
    trackArtist.innerHTML = trackItem.artists[0];
    trackArtist.className = "track-artist";

    let splitTitle = separateUnimportantTitleInfo(trackItem.title);
    let trackName = document.createElement("div");
    trackName.className = "track-name"
    let trackNameMain = document.createElement("span");
    trackNameMain.innerHTML = removeFeaturedArtists(splitTitle.main) + buildFeaturedArtistsString(trackItem.artists);
    let trackNameExtra = document.createElement("span");
    trackNameExtra.className = "extra";
    trackNameExtra.innerHTML = splitTitle.extra;
    trackName.append(trackNameMain, trackNameExtra);

    let trackLength = document.createElement("div");
    trackLength.className = "track-length"
    trackLength.innerHTML = formatTime(0, trackItem.length).total;

    // TODO performance improvement with sliding window (NTS: visibility hidden does not do anything, but display none does)

    trackElem.append(trackNumberContainer, trackArtist, trackName, trackLength);
    trackListContainer.append(trackElem);
}

function setTextData(changes) {
    // Main Info
    let updatedListTracks = changes.listTracks;
    let updatedListTrackNumber = changes.trackNumber;
    if (useQueue && ('queueTrackNumber' in changes || 'queueTrackList' in changes)) {
        updatedListTracks = changes.queueTrackList;
        updatedListTrackNumber = changes.queueTrackNumber;
    }

    let titleContainer = document.getElementById("title");
    let trackListContainer = document.getElementById("track-list");
    let listViewType = 'trackListView' in changes ? changes.trackListView : currentData.trackListView;
    let currentDataListTracks = currentData.listTracks;
    let changesListTracks = updatedListTracks;

    if (useQueue) {
        currentDataListTracks = currentData.queueTrackList;
        // changesListTracks = changes.queueTrackList;
        listViewType = "PLAYLIST";
    }

    let trackCount = (changesListTracks || currentDataListTracks || []).length;
    let trackNumber = 'trackNumber' in changes ? updatedListTrackNumber : currentData.trackNumber;

    if (useQueue) {
        trackNumber = ('queueTrackNumber' in changes ? changes.queueTrackNumber : currentData.queueTrackNumber);
    }

    let isQueue = trackNumber === 0 || ('context' in changes && changes.context.startsWith("Queue >> "));
    let listViewEnabled = listViewType !== "SINGLE"
        && trackCount > 1
        && !isQueue;

    console.log("listViewEnabled", listViewEnabled);
    console.log("trackCount", trackCount);
    console.log("isQueue", isQueue);

    let titleDisplayed = !listViewEnabled || listViewType === "PLAYLIST";
    showHide(titleContainer, titleDisplayed);
    setClass(titleContainer, "compact", listViewType === "PLAYLIST");
    showHide(trackListContainer, listViewEnabled);
    if (listViewEnabled) {
        let onlyOneArtist = false;
        let listTracks = changesListTracks || currentDataListTracks;

        if (listTracks.length > 0) {
            let potentialUniqueArtist = listTracks[0].artists[0];
            onlyOneArtist = listTracks.every((track) => track.artists[0] === potentialUniqueArtist);
        }

        setClass(document.getElementById("track-list"), "playlist-view", !onlyOneArtist)
        trackListContainer.style.setProperty("--track-count", trackCount.toString());
        window.requestAnimationFrame(() => {
            let isOverflowing = trackListContainer.scrollHeight > trackListContainer.clientHeight;
            setClass(trackListContainer, "fit", isOverflowing);
        })
    }

    if (('title' in changes && JSON.stringify(changes.title) !== JSON.stringify(currentData.title))
        || ('trackListView' in changes && !changes.trackListView && currentData.trackListView)) { // todo fix this somehow
        let titleBase = changes.title || currentData.title;
        let normalizedEmoji = convertToTextEmoji(titleBase);
        let titleNoFeat = removeFeaturedArtists(normalizedEmoji);
        let splitTitle = separateUnimportantTitleInfo(titleNoFeat);
        let titleMain = splitTitle.main;
        let titleExtra = splitTitle.extra;
        document.getElementById("title-main").innerHTML = titleMain;
        document.getElementById("title-extra").innerHTML = titleExtra;

        fadeIn(titleContainer);
    }

    if ((('listTracks' in changes && !useQueue) || ('queueTrackList' in changes && useQueue))
        && JSON.stringify(changesListTracks) !== JSON.stringify(currentDataListTracks)) {

        let listTracks = changesListTracks || currentDataListTracks;
        let trackNumPadLength = listTracks.length.toString().length;
        if (!useQueue) {
            trackListContainer.innerHTML = "";

            for (let trackItem of listTracks) {
                addTrack(trackItem, trackNumPadLength, trackListContainer);
            }
        } else {
            trackListContainer.innerHTML = "";

            if (changesListTracks !== undefined) {
                for (let trackItem of updatedListTracks) {
                    addTrack(trackItem, trackNumPadLength, trackListContainer);
                }
            }
        }

        updateScrollPositions(trackNumber);

        fadeIn(trackListContainer);
    }

    if ((('trackNumber' in changes && !useQueue) || ('queueTrackNumber' in changes && useQueue)) || currentData.trackListView !== "SINGLE") {
        updateScrollPositions(trackNumber);
    }

    if ('artists' in changes && JSON.stringify(changes.artists) !== JSON.stringify(currentData.artists)) {
        let artists = changes.artists;
        let artistsString = artists[0] + buildFeaturedArtistsString(artists);
        document.getElementById("artists").innerHTML = convertToTextEmoji(artistsString);

        fadeIn(document.getElementById("artists"));
    }

    if (('album' in changes && changes.album !== currentData.album) || ('release' in changes && changes.release !== currentData.release)) {
        let album = 'album' in changes ? changes.album : currentData.album;
        let normalizedEmoji = convertToTextEmoji(album);
        let splitTitle = separateUnimportantTitleInfo(normalizedEmoji);
        let albumTitleMain = splitTitle.main;
        let albumTitleExtra = splitTitle.extra;
        document.getElementById("album-title-main").innerHTML = albumTitleMain;
        document.getElementById("album-title-extra").innerHTML = albumTitleExtra;

        document.getElementById("album-release").innerHTML = 'release' in changes ? changes.release : currentData.release;

        fadeIn(document.getElementById("album"));
    }

    if ('description' in changes && changes.description !== currentData.description) {
        let descriptionElem = document.getElementById("description");
        let isPodcast = changes.description !== "BLANK";
        descriptionElem.innerHTML = isPodcast ? changes.description : "";
        fadeIn(descriptionElem);
    }

    // Meta Info
    if ('context' in changes && changes.context !== currentData.context) {
        document.getElementById("context").innerHTML = convertToTextEmoji(changes.context);
        fadeIn(document.getElementById("context"));
    }

    if ('device' in changes && changes.device !== currentData.device) {
        document.getElementById("device").innerHTML = convertToTextEmoji(changes.device);
        fadeIn(document.getElementById("device"));
    }

    // Time
    if ('timeCurrent' in changes || 'timeTotal' in changes) {
        updateProgress(changes, true);
        if ('id' in changes) {
            finishAnimations(document.getElementById("progress-current"));
        }
    }

    // States
    if ('paused' in changes && changes.paused !== currentData.paused) {
        let paused = changes.paused != null ? changes.paused : currentData.paused;
        let pauseElem = document.getElementById("play-pause");
        setClass(pauseElem, "paused", paused);
        fadeIn(pauseElem);
    }

    if ('shuffle' in changes && changes.shuffle !== currentData.shuffle) {
        let shuffle = changes.shuffle != null ? changes.shuffle : currentData.shuffle;
        let shuffleElem = document.getElementById("shuffle");
        setClass(shuffleElem, "show", shuffle);
        fadeIn(shuffleElem);
    }

    if ('repeat' in changes && changes.repeat !== currentData.repeat) {
        let repeat = changes.repeat != null ? changes.repeat : currentData.repeat;
        let repeatElem = document.getElementById("repeat");
        setClass(repeatElem, "show", repeat !== "off");
        if (changes.repeat === "track") {
            repeatElem.classList.add("once");
        } else {
            repeatElem.classList.remove("once");
        }
        fadeIn(repeatElem);
        handleAlternateDarkModeToggle();
    }
    if ('volume' in changes && changes.volume !== currentData.volume) {
        let volume = changes.volume != null ? changes.volume : currentData.volume;
        let device = changes.device != null ? changes.device : currentData.device;
        handleVolumeChange(volume, device);
    }

    // Color
    if ('imageColors' in changes) {
        setTextColor(changes.imageColors.primary);
    }

    // Update properties in local storage
    for (let prop in changes) {
        currentData[prop] = changes[prop];
    }

    // Re-balance all updated texts
    let scrollTopTrackListBackup = trackListContainer.scrollTop; // fix to keep scroll position in place
    balanceText.updateWatched();
    trackListContainer.scrollTop = scrollTopTrackListBackup;
}

function setClass(elem, className, state) {
    if (state) {
        elem.classList.add(className);
    } else {
        elem.classList.remove(className);
    }
}

function showHide(elem, show, useInvisibility) {
    if (show) {
        elem.classList.remove("invisible");
        elem.classList.remove("hidden");
    } else {
        if (useInvisibility) {
            elem.classList.add("invisible");
            elem.classList.remove("hidden");
        } else {
            elem.classList.add("hidden");
            elem.classList.remove("invisible");
        }
    }
}

const USELESS_WORDS = ["radio", "anniversary", "bonus", "deluxe", "special", "remaster", "explicit", "extended", "expansion", "expanded", "cover", "original", "motion\\spicture", "re.?issue", "re.?record", "re.?imagine", "\\d{4}"];
const WHITELISTED_WORDS = ["instrumental", "orchestral", "symphonic", "live", "classic", "demo"];

// Two regexes for readability, cause otherwise it'd be a nightmare to decipher brackets from hyphens
const USELESS_WORDS_REGEX_BRACKETS = new RegExp("\\s(\\(|\\[)[^-]*?(" + USELESS_WORDS.join("|") + ").*?(\\)|\\])", "ig");
const USELESS_WORDS_REGEX_HYPHEN = new RegExp("\\s-\\s[^-]*?(" + USELESS_WORDS.join("|") + ").*", "ig");
const WHITELISTED_WORDS_REGEXP = new RegExp("(\\(|\\-|\\[)[^-]*?(" + WHITELISTED_WORDS.join("|") + ").*", "ig");

function separateUnimportantTitleInfo(title) {
    if (title.search(WHITELISTED_WORDS_REGEXP) < 0) {
        let index = title.search(USELESS_WORDS_REGEX_BRACKETS);
        if (index < 0) {
            index = title.search(USELESS_WORDS_REGEX_HYPHEN);
        }
        if (index >= 0) {
            let mainTitle = title.substring(0, index);
            let extraTitle = title.substring(index, title.length);
            return {
                main: mainTitle,
                extra: extraTitle
            };
        }
    }
    return {
        main: title,
        extra: ""
    };
}

function convertToTextEmoji(text) {
    return [...text]
        .map((char) => char.codePointAt(0) > 127 ? `&#${char.codePointAt(0)};&#xFE0E;` : char)
        .join('');
}

function buildFeaturedArtistsString(artists) {
    if (artists.length > 1) {
        let featuredArtists = artists.slice(1).join(" & ");
        return ` (feat. ${featuredArtists})`;
    }
    return "";
}

function removeFeaturedArtists(title) {
    return title.replace(/[(|\[](f(ea)?t|with).+?[)|\]]/ig, "").trim();
}

function finishAnimations(elem) {
    elem.getAnimations().forEach(ani => ani.finish());
}

function fadeIn(elem) {
    finishAnimations(elem);
    elem.classList.add("transparent", "text-glow");
    finishAnimations(elem);
    elem.classList.remove("transparent", "text-glow");
}

const BALANCED_ELEMENTS_TO_WATCH = ["artists", "title", "description", "album", "context", "device"];
window.addEventListener('load', registerWatchedBalanceTextElements);

function registerWatchedBalanceTextElements() {
    for (let id of BALANCED_ELEMENTS_TO_WATCH) {
        let textElem = document.getElementById(id);
        balanceText(textElem, {watch: true});
    }
}

window.addEventListener('load', setupScrollGradients);

function setupScrollGradients() {
    let trackList = document.getElementById("track-list");
    trackList.onscroll = () => updateScrollGradients();
}

const SCROLL_GRADIENTS_TOLERANCE = 4;

function updateScrollGradients() {
    let trackList = document.getElementById("track-list");
    let topGradient = trackList.scrollTop > SCROLL_GRADIENTS_TOLERANCE;
    let bottomGradient = (trackList.scrollHeight - trackList.clientHeight) > (trackList.scrollTop + SCROLL_GRADIENTS_TOLERANCE);
    setClass(trackList, "gradient-top", topGradient);
    setClass(trackList, "gradient-bottom", bottomGradient);
}

function updateScrollPositions(specificTrackNumber) {
    window.requestAnimationFrame(() => {
        let trackListContainer = document.getElementById("track-list");
        let trackNumber = specificTrackNumber ? specificTrackNumber : currentData.trackNumber;
        let currentlyPlayingElem = [...trackListContainer.childNodes].find(node => node.classList.contains("current"));
        if (specificTrackNumber || trackNumber !== currentData.trackNumber || !currentlyPlayingElem) {
            let currentlyPlayingTrackElem = trackListContainer.childNodes[trackNumber - 1];
            if (currentlyPlayingTrackElem) {
                trackListContainer.childNodes.forEach(node => node.classList.remove("current"));
                currentlyPlayingTrackElem.classList.add("current");

                let scrollUnit = trackListContainer.scrollHeight / trackListContainer.childNodes.length;
                let offsetDivider = currentData.trackListView === "PLAYLIST" ? 5 : 2;
                let scrollMiddleApproximation = Math.round((trackListContainer.offsetHeight / scrollUnit) / offsetDivider);
                let scroll = Math.max(0, scrollUnit * (trackNumber - scrollMiddleApproximation));
                trackListContainer.scroll({
                    top: scroll,
                    left: 0,
                    behavior: 'smooth'
                });
                updateScrollGradients();
            }
        }
    });
}

///////////////////////////////
// IMAGE
///////////////////////////////

const EMPTY_IMAGE_DATA = "https://i.scdn.co/image/ab67616d0000b273f292ec02a050dd8a6174cd4e"; // 640x640 black square
const DEFAULT_IMAGE = 'design/img/idle.png';
const DEFAULT_RGB = {
    r: 255,
    g: 255,
    b: 255
};

function changeImage(changes) {
    return new Promise(async (resolve) => {
        if ('image' in changes || 'imageColors' in changes) {
            if (changes.image === "BLANK") {
                changes.image = DEFAULT_IMAGE;
                changes.imageColors = {primary: DEFAULT_RGB, secondary: DEFAULT_RGB};
            }
            let newImage = changes.image != null ? changes.image : currentData.image;
            let colors = changes.imageColors != null ? changes.imageColors : currentData.imageColors;
            if (newImage) {
                let oldImage = document.getElementById("artwork-img").src;
                if (!oldImage.includes(newImage)) {
                    await prerenderAndSetArtwork(newImage, colors, true);
                }
            }
        }
        resolve();
    });
}

function prerenderAndSetArtwork(newImage, colors, refreshArtwork) {
    return new Promise((resolve) => {
        loadBackground(newImage, colors)
            .then(() => renderAndShow())
            .then(() => loadArtwork(newImage, refreshArtwork))
            .then(resolve);
    });
}


function loadArtwork(newImage, refreshArtwork) {
    return new Promise((resolve) => {
        if (!refreshArtwork) {
            resolve();
            return;
        }
        let artwork = document.getElementById("artwork-img");
        setClass(artwork, "transparent", true);
        finishAnimations(artwork);
        artwork.onload = () => {
            setClass(artwork, "transparent", false);
            resolve();
        }
        artwork.src = newImage;
    });
}


function loadBackground(newImage, colors) {
    return new Promise((resolve) => {
        let backgroundCanvasImg = document.getElementById("background-canvas-img");
        backgroundCanvasImg.onload = () => {
            let rgbOverlay = colors.secondary;
            let averageBrightness = colors.averageBrightness;
            let prerenderCanvas = document.getElementById("prerender-canvas");
            let backgroundCanvasOverlay = document.getElementById("background-canvas-overlay");
            let noiseOverlay = document.getElementById("noise");

            setClass(prerenderCanvas, "show", true);
            let backgroundColorOverlay = `rgb(${rgbOverlay.r}, ${rgbOverlay.g}, ${rgbOverlay.b})`;
            backgroundCanvasOverlay.style.setProperty("--background-color", backgroundColorOverlay);
            backgroundCanvasOverlay.style.setProperty("--background-brightness", averageBrightness);
            setClass(backgroundCanvasOverlay, "brighter", averageBrightness < 0.2);
            setClass(backgroundCanvasOverlay, "darker", averageBrightness > 0.7);
            noiseOverlay.style.setProperty("--intensity", averageBrightness);
            resolve();
        };
        backgroundCanvasImg.src = newImage;
    });
}

const SCREENSHOT_SIZE_FACTOR = 0.5;

function renderAndShow() {
    return new Promise((resolve) => {
        let backgroundImg = document.getElementById("background-img");
        let backgroundCrossfade = document.getElementById("background-img-crossfade");
        let prerenderCanvas = document.getElementById("prerender-canvas");

        // While PNG produces the by far largest Base64 image data, the actual conversion process
        // is significantly faster than with JPEG or SVG (still not perfect though)
        let pngData;
        domtoimage
            .toPng(prerenderCanvas, {
                width: window.innerWidth * SCREENSHOT_SIZE_FACTOR,
                height: window.innerHeight * SCREENSHOT_SIZE_FACTOR
            })
            .then((imgDataBase64) => {
                if (imgDataBase64.length < 10) {
                    throw 'Rendered image data is invalid';
                }
                pngData = imgDataBase64;
            })
            .catch((error) => {
                pngData = EMPTY_IMAGE_DATA;
                console.warn("Failed to render background, using black square instead", error);
            })
            .finally(() => {
                setClass(backgroundCrossfade, "show", true);
                backgroundCrossfade.onload = () => {
                    finishAnimations(backgroundCrossfade);
                    backgroundImg.onload = () => {
                        setClass(backgroundCrossfade, "show", false);
                        setClass(prerenderCanvas, "show", false);
                        resolve();
                    };
                    backgroundImg.src = pngData;
                };
                backgroundCrossfade.src = backgroundImg.src ? backgroundImg.src : EMPTY_IMAGE_DATA;
            });
    });
}

function refreshBackgroundRender() {
    if (currentData.image && currentData.imageColors && findPreference("prerender").state) {
        prerenderAndSetArtwork(currentData.image, currentData.imageColors, false).then();
    }
}

function setTextColor(rgbText) {
    document.documentElement.style.setProperty("--color", `rgb(${rgbText.r}, ${rgbText.g}, ${rgbText.b})`);
}


///////////////////////////////
// PROGRESS
///////////////////////////////

function updateProgress(changes, updateProgressBar) {
    let current = 'timeCurrent' in changes ? changes.timeCurrent : currentData.timeCurrent;
    let total = 'timeTotal' in changes ? changes.timeTotal : currentData.timeTotal;
    let paused = 'paused' in changes ? changes.paused : currentData.paused;

    // Text
    let formattedTimes = formatTime(current, total)
    let formattedCurrentTime = formattedTimes.current;
    let formattedTotalTime = formattedTimes.total;

    let elemTimeCurrent = document.getElementById("time-current");
    elemTimeCurrent.innerHTML = formattedCurrentTime;

    let elemTimeTotal = document.getElementById("time-total");
    if (formattedTotalTime !== elemTimeTotal.innerHTML) {
        elemTimeTotal.innerHTML = formattedTotalTime;
    }

    // Title
    let newTitle = "Spotify Big Picture";
    if (!idle && currentData.artists && currentData.title) {
        newTitle = `[${formattedCurrentTime} / ${formattedTotalTime}] ${currentData.artists[0]} - ${removeFeaturedArtists(currentData.title)} | ${newTitle}`;
    }
    document.title = newTitle;

    // Progress Bar
    if (updateProgressBar) {
        setProgressBarTarget(current, total, paused);
    }
}

function setProgressBarTarget(current, total, paused) {
    let progressBarElem = document.getElementById("progress-current");

    let progressPercent = Math.min(1, ((current / total))) * 100;
    if (isNaN(progressPercent)) {
        progressPercent = 0;
    }
    progressBarElem.style.width = progressPercent + "%";

    finishAnimations(progressBarElem);
    if (!paused) {
        let remainingTimeMs = total - current;
        progressBarElem.style.setProperty("--progress-speed", remainingTimeMs + "ms");
        requestAnimationFrame(() => {
            progressBarElem.style.width = "100%";
        });
    }
}

function formatTime(current, total) {
    let currentHMS = calcHMS(current);
    let totalHMS = calcHMS(total);

    let formattedCurrent = `${pad2(currentHMS.seconds)}`;
    let formattedTotal = `${pad2(totalHMS.seconds)}`;
    if (totalHMS.minutes >= 10 || totalHMS.hours >= 1) {
        formattedCurrent = `${pad2(currentHMS.minutes)}:${formattedCurrent}`;
        formattedTotal = `${pad2(totalHMS.minutes)}:${formattedTotal}`;
        if (totalHMS.hours > 0) {
            formattedCurrent = `${currentHMS.hours}:${formattedCurrent}`;
            formattedTotal = `${totalHMS.hours}:${formattedTotal}`;
        }
    } else {
        formattedCurrent = `${currentHMS.minutes}:${formattedCurrent}`;
        formattedTotal = `${totalHMS.minutes}:${formattedTotal}`;
    }

    return {
        current: formattedCurrent,
        total: formattedTotal
    };
}

function calcHMS(ms) {
    let s = Math.round(ms / 1000) % 60;
    let m = Math.floor((Math.round(ms / 1000)) / 60) % 60;
    let h = Math.floor((Math.floor((Math.round(ms / 1000)) / 60)) / 60);
    return {
        hours: h,
        minutes: m,
        seconds: s
    };
}

function pad2(num) {
    return padToLength(num, 2);
}

function padToLength(num, length) {
    return num.toString().padStart(length, '0');
}


///////////////////////////////
// TIMERS
///////////////////////////////

const ADVANCE_CURRENT_TIME_MS = 1000;
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const REQUEST_ON_SONG_END_MS = 2 * 1000;

let autoTimer;
let idleTimeout;

function startTimers() {
    clearTimers();

    startTime = Date.now();
    autoTimer = setInterval(() => advanceCurrentTime(), ADVANCE_CURRENT_TIME_MS);

    idleTimeout = setTimeout(() => setIdleModeState(true), IDLE_TIMEOUT_MS);
    setIdleModeState(false);
}

function clearTimers() {
    clearInterval(autoTimer);
    clearTimeout(idleTimeout);
}

let startTime;

function advanceCurrentTime() {
    if (currentData != null && currentData.timeCurrent != null && !currentData.paused) {
        let now = Date.now();
        let elapsedTime = now - startTime;
        startTime = now;
        let newTime = currentData.timeCurrent + elapsedTime;
        if (newTime > currentData.timeTotal && currentData.timeCurrent < currentData.timeTotal) {
            setTimeout(() => singleRequest(true), REQUEST_ON_SONG_END_MS);
        }
        currentData.timeCurrent = Math.min(currentData.timeTotal, newTime);
        updateProgress(currentData, false);
    }
}

function setIdleModeState(state) {
    let content = document.getElementById("main");
    if (state) {
        if (!idle) {
            idle = true;
            clearTimers();
            showHide(content, false);
            currentData = {};
        }
    } else {
        idle = false;
        showHide(content, true);
    }
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        advanceCurrentTime();
    }
});


///////////////////////////////
// VISUAL PREFERENCES
///////////////////////////////

const PREFERENCES = [
    {
        id: "fullscreen",
        name: "Fullscreen",
        hotkey: "f",
        description: "Toggles fullscreen on and off (can also be toggled by double clicking anywhere on the screen). " +
            "This setting is not persisted between sessions due to browser security limitations",
        state: false,
        callback: () => toggleFullscreen(),
        volatile: true // don't add fullscreen in the URL params, as it won't work (browser security shenanigans)
    },
    {
        id: "bg-artwork",
        name: "Background Artwork",
        hotkey: "b",
        description: "If enabled, uses the release artwork for the background as a blurry, darkened version. Otherwise, only a gradient color will be displayed",
        state: true,
        callback: (state) => {
            setClass(document.getElementById("background-canvas"), "color-only", !state);
            refreshBackgroundRender();
        }
    },
    {
        id: "colored-text",
        name: "Colored Text",
        hotkey: "c",
        description: "If enabled, the dominant color of the current artwork will be used as color for all texts and symbols. Otherwise, plain white will be used",
        state: true,
        callback: (state) => setClass(document.body, "no-colored-text", !state)
    },
    {
        id: "transitions",
        name: "Transitions",
        hotkey: "t",
        description: "Smoothly fade from one song to another. Otherwise, song switches will be displayed immediately",
        state: true,
        callback: (state) => setTransitions(state)
    },
    {
        id: "strip-titles",
        name: "Strip Titles",
        hotkey: "s",
        description: "Hides any kind of unnecessary extra information from song tiles and release names " +
            `(such as 'Remastered Version', 'Anniversary Edition', '${new Date().getFullYear()} Re-Issue', etc.)`,
        state: true,
        callback: (state) => {
            setClass(document.getElementById("title-extra"), "hide", state);
            setClass(document.getElementById("album-title-extra"), "hide", state);
            setClass(document.getElementById("track-list"), "strip", state);
        }
    },
    {
        id: "bg-noise",
        name: "Noise",
        hotkey: "n",
        description: "Adds a subtle layer of noise to the background to increase contrast and prevent color banding for dark images " +
            "(only works when Prerender mode is enabled)",
        state: true,
        callback: (state) => {
            setClass(document.getElementById("noise"), "show", state);
        }
    },
    {
        id: "prerender",
        name: "Prerender Background",
        hotkey: "p",
        description: "Captures a screenshot of the background image and displays that instead of the live background. " +
            "This will save on resources for low-end PCs due to the nature of complex CSS, but it will increase the delay between song switches",
        state: true,
        callback: (state) => {
            showHide(document.getElementById("background-rendered"), state);
            setClass(document.getElementById("prerender-canvas"), "no-prerender", !state);
            refreshBackgroundRender();
        }
    },
    {
        id: "use-queue",
        name: "Use Queue",
        hotkey: "q",
        description: "If enabled, the queue will be used to determine the next song to play. Otherwise, the queue will be ignored and the current playlist will be used instead",
        callback: (state) => {
            setQueueState(state);
        }
    },
    {
        id: "show-volume-change",
        name: "Volume",
        hotkey: "v",
        description: "Shows the current volume whenever it changes (in %)",
        state: true,
        callback: (state) => setClass(document.getElementById("volume"), "show", state)
    },
    {
        id: "show-clock",
        name: "Clock",
        hotkey: "w",
        description: "Displays a clock at the bottom center of the page",
        state: true,
        callback: (state) => setClass(document.getElementById("clock"), "hide", !state)
    },
    {
        id: "show-context",
        name: "Context",
        hotkey: "x",
        description: "Shows context information for the current session (such as the current playlist, the current user, etc.)",
        state: true,
        callback: (state) => {
            setClass(document.getElementById("context"), "hide", !state)
            setClass(document.getElementById("device"), "hide", !state)
        }
    },
    {
        id: "show-playback-controls",
        name: "Playback Controls",
        hotkey: "y",
        description: "Shows the playback controls at the bottom of the page",
        state: true,
        callback: (state) => setClass(document.getElementById("info-symbols"), "hide", !state)
    },
    {
        id: "dark-mode",
        name: "Dark Mode",
        hotkey: "d",
        description: "Darkens the entire screen. This mode will be automatically disabled after 8 hours",
        state: false,
        callback: (state) => {
            const DARK_MODE_AUTOMATIC_DISABLE_TIMEOUT = 8 * 60 * 60 * 1000;
            setClass(document.getElementById("dark-overlay"), "show", state);
            clearTimeout(darkModeTimeout);
            if (state) {
                darkModeTimeout = setTimeout(() => {
                    toggleDarkMode();
                }, DARK_MODE_AUTOMATIC_DISABLE_TIMEOUT);
            }
        }
    },
];

function findPreference(id) {
    return PREFERENCES.find(pref => pref.id === id);
}

const PREFS_URL_PARAM = "p";

window.addEventListener('load', initVisualPreferences);

function initVisualPreferences() {
    const settingsWrapper = document.getElementById("settings-buttons");
    const settingsDescriptionWrapper = document.getElementById("settings-description");
    const urlParams = new URLSearchParams(window.location.search);
    const urlPrefs = urlParams.has(PREFS_URL_PARAM)
        ? unescape(urlParams.get(PREFS_URL_PARAM)).split(" ")
        : null;
    for (let prefIndex in PREFERENCES) {
        let pref = PREFERENCES[prefIndex];

        // Set state on site load
        let state = pref.state;
        if (urlPrefs) {
            state = urlPrefs.includes(pref.id);
        }
        pref.state = state;

        // Create button element
        let prefElem = document.createElement("div");
        prefElem.id = pref.id;
        prefElem.classList.add("setting");
        prefElem.innerHTML = `${pref.name} (${pref.hotkey})`;
        prefElem.onclick = () => toggleVisualPreference(pref);
        settingsWrapper.appendChild(prefElem);

        // Create description element
        let descElem = document.createElement("div");
        descElem.id = pref.id + "-description";
        descElem.innerHTML = pref.description;
        settingsDescriptionWrapper.appendChild(descElem);

        // Init setting
        refreshPreference(pref, state);
    }
    document.querySelector("#fullscreen").onclick = toggleFullscreen;

    refreshPrefsQueryParam();
}

function refreshPrefsQueryParam() {
    let urlPrefs = [];
    for (let pref of PREFERENCES) {
        if (!pref.volatile && pref.state) {
            urlPrefs.push(pref.id);
        }
    }

    const url = new URL(window.location);
    url.searchParams.set(PREFS_URL_PARAM, urlPrefs.join("+"));
    window.history.replaceState({}, 'Spotify Big Picture', unescape(url.toString()));
}

function toggleVisualPreference(pref) {
    if (pref.volatile) {
        pref.callback();
    } else {
        let newState = !pref.state;
        refreshPreference(pref, newState);
        refreshPrefsQueryParam();
    }
}

let darkModeTimeout;

function refreshPreference(preference, state) {
    if (!preference.volatile) {
        preference.state = state;
        preference.callback(state);

        // Toggle Checkmark
        let classList = document.getElementById(preference.id).classList;
        if (state) {
            classList.add("on");
        } else {
            classList.remove("on");
        }
    }
}

function setTransitions(state) {
    setClass(document.body, "transition", state);
    showHide(document.getElementById("background-img-crossfade"), state, true);
}

function toggleFullscreen() {
    if (document.fullscreenEnabled) {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then();
        } else {
            document.exitFullscreen().then();
        }
    }
}

function toggleDarkMode() {
    let darkModePref = findPreference("dark-mode");
    if (darkModePref) {
        toggleVisualPreference(darkModePref);
    }
}

const TOGGLE_DARK_MODE_COUNT = 3;
let toggleDarkModeCount = 0;
let toggleDarkModeTimeout;

function handleAlternateDarkModeToggle() {
    clearTimeout(toggleDarkModeTimeout);
    toggleDarkModeCount++;
    if (toggleDarkModeCount >= TOGGLE_DARK_MODE_COUNT) {
        toggleDarkMode();
        toggleDarkModeCount = 0;
    } else {
        toggleDarkModeTimeout = setTimeout(() => toggleDarkModeCount = 0, 1000 * 3);
    }
}

let volumeTimeout;

function handleVolumeChange(volume, device) {
    let volumeContainer = document.getElementById("volume");

    if (device === "Den") {
        // Display it as dB for my private AVR because I can do what I want lol
        const BASE_DB = 80;
        let db = (volume - BASE_DB).toFixed(1);
        volumeContainer.innerHTML = db + " dB";
    } else {
        volumeContainer.innerHTML = volume + "%";
    }

    volumeContainer.classList.add("active");
    clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(() => {
        volumeContainer.classList.remove("active");
    }, 2000);
}

///////////////////////////////
// REFRESH IMAGE ON RESIZE
///////////////////////////////

const REFRESH_BACKGROUND_ON_RESIZE_DELAY = 250;
let refreshBackgroundEvent;
window.onresize = () => {
    clearTimeout(refreshBackgroundEvent);
    refreshBackgroundEvent = setTimeout(() => {
        refreshBackgroundRender();
    }, REFRESH_BACKGROUND_ON_RESIZE_DELAY);
    updateScrollGradients();
};


///////////////////////////////
// HOTKEYS
///////////////////////////////

document.onkeydown = (e) => {
    let pref = PREFERENCES.find(element => element.hotkey === e.key);
    if (pref) {
        toggleVisualPreference(pref);
    }
};


///////////////////////////////
// MOUSE EVENTS
///////////////////////////////

document.addEventListener("mousemove", handleMouseEvent);
document.addEventListener("click", handleMouseEvent);
let cursorTimeout;
const MOUSE_MOVE_HIDE_TIMEOUT_MS = 500;

function setMouseVisibility(state) {
    setClass(document.documentElement, "hide-cursor", !state);
}

function handleMouseEvent() {
    clearTimeout(cursorTimeout);
    setMouseVisibility(true)
    cursorTimeout = setTimeout(() => {
        setMouseVisibility(false);
    }, MOUSE_MOVE_HIDE_TIMEOUT_MS);
}

window.addEventListener('load', initSettingsMouseMove);

function initSettingsMouseMove() {
    setMouseVisibility(false);
    let settings = document.getElementById("settings-buttons");
    let settingsWrapper = document.getElementById("settings-wrapper");
    let content = document.getElementById("content");
    settings.onmouseenter = () => {
        setClass(settingsWrapper, "show", true);
        setClass(content, "blur", true);
    };
    settings.onmouseleave = () => {
        setClass(settingsWrapper, "show", false);
        setClass(content, "blur", false);
    }
    settings.onmousemove = (event) => {
        requestAnimationFrame(() => clearTimeout(cursorTimeout));
        document.getElementById("settings-description").childNodes
            .forEach(elem => setClass(elem, "show", false));
        if (event.target.classList.contains("setting")) {
            let targetLabel = document.getElementById(event.target.id + "-description");
            setClass(targetLabel, "show", true);
        }
    }
}

document.addEventListener("dblclick", toggleFullscreen);

///////////////////////////////
// CLOCK
///////////////////////////////

const DATE_OPTIONS = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23'
};
let prevTime;
setInterval(() => {
    let date = new Date();
    let time = date.toLocaleDateString('en-UK', DATE_OPTIONS);
    if (time !== prevTime) {
        prevTime = time;
        let clock = document.querySelector("#clock");
        clock.innerHTML = time;
    }
}, 1000);
