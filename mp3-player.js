(function () {
  "use strict";
  var USE_BLOB_URL = false;   

  var TRACKS = window.MP3_TRACKS || [];

  if (!TRACKS.length) {
    console.warn("[MP3 Player] Chưa có window.MP3_TRACKS. Hãy định nghĩa trước khi load script.");
    // Hiện thông báo lên khung player
    var titleElWarn = document.getElementById("mp3-title");
    if (titleElWarn) titleElWarn.textContent = "⚠ Chưa có danh sách chương";
    return; // Dừng init
  }

  /* ========== DOM ========== */
  var audio          = document.getElementById("mp3-audio");
  var playBtn        = document.getElementById("mp3-play-btn");
  var playIcon       = document.getElementById("mp3-play-icon");
  var pauseIcon      = document.getElementById("mp3-pause-icon");
  var titleEl        = document.getElementById("mp3-title");
  var timeEl         = document.getElementById("mp3-time");
  var progressWrap   = document.getElementById("mp3-progress-wrap");
  var progressFill   = document.getElementById("mp3-progress-fill");
  var progressHandle = document.getElementById("mp3-progress-handle");
  var prevBtn        = document.getElementById("mp3-prev");
  var nextBtn        = document.getElementById("mp3-next");
  var volumeBtn      = document.getElementById("mp3-volume-btn");
  var volIcon        = document.getElementById("mp3-vol-icon");
  var volumeSlider   = document.getElementById("mp3-volume");
  var speedDownBtn   = document.getElementById("mp3-speed-down");
  var speedUpBtn     = document.getElementById("mp3-speed-up");
  var speedLabel     = document.getElementById("mp3-speed-label");
  var loopBtn        = document.getElementById("mp3-loop");
  var back30Btn      = document.getElementById("mp3-back30");
  var fwd30Btn       = document.getElementById("mp3-fwd30");
  var playlistEl     = document.getElementById("mp3-playlist");
  var playlistToggle = document.getElementById("mp3-playlist-toggle");
  var loadingEl      = document.getElementById("mp3-loading");
  var loadingPctEl   = document.getElementById("mp3-loading-pct");

  /* ========== STATE ========== */
  var currentIndex  = -1;
  var isLooping     = false;
  var lastVolume    = 1;
  var speedSteps    = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  var speedIdx      = 2;
  var currentBlobUrl = null;    // blob URL hiện tại
  var blobCache      = {};       // cache: { base64Src: blobUrl }
  var loadingTrack   = false;    // đang fetch file?

  /* ========== HELPERS ========== */
  function formatTime(sec) {
    if (!isFinite(sec) || isNaN(sec) || sec < 0) return "0:00:00";
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    return h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function decodeSrc(b64) {
    try { return atob(b64); }
    catch (e) { console.error("Base64 decode lỗi:", e); return null; }
  }
  function showLoading(show, pct) {
    if (show) {
      loadingEl.classList.add("show");
      loadingPctEl.textContent = Math.round((pct || 0) * 100) + "%";
    } else {
      loadingEl.classList.remove("show");
    }
  }

  /* ========== PLAYLIST UI ========== */
  function renderPlaylist() {
    playlistEl.innerHTML = "";
    TRACKS.forEach(function (track, i) {
      var item = document.createElement("div");
      item.className = "mp3-item";
      item.dataset.index = i;
      var num = document.createElement("span");
      num.className = "mp3-item-num";
      num.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
      var title = document.createElement("span");
      title.className = "mp3-item-title";
      title.textContent = track.title;
      item.appendChild(num);
      item.appendChild(title);
      item.addEventListener("click", function () { playTrack(i); });
      playlistEl.appendChild(item);
    });
  }
  function updatePlaylistActive() {
    var items = playlistEl.querySelectorAll(".mp3-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("active", i === currentIndex);
    }
  }

  /* ========== TẢI FILE QUA BLOB (CHE LINK) ========== */
  async function fetchAsBlobUrl(url, onProgress) {
    var response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("HTTP " + response.status);

    var total = parseInt(response.headers.get("Content-Length") || "0", 10);
    var reader = response.body.getReader();
    var chunks = [];
    var received = 0;

    while (true) {
      var res = await reader.read();
      if (res.done) break;
      chunks.push(res.value);
      received += res.value.length;
      if (onProgress && total > 0) onProgress(received / total);
    }

    var blob = new Blob(chunks, { type: "audio/mpeg" });
    return URL.createObjectURL(blob);
  }

  /* ========== CORE ========== */
  async function loadTrack(index, autoPlay) {
    if (index < 0 || index >= TRACKS.length) return;
    if (loadingTrack) return;

    currentIndex = index;
    var track = TRACKS[index];
    var url = decodeSrc(track.src);
    if (!url) { titleEl.textContent = "Lỗi: link không hợp lệ"; return; }

    updatePlaylistActive();

    /* --- Mode 1: Blob URL (che link) --- */
    if (USE_BLOB_URL) {
      // Nếu đã cache, dùng luôn
      if (blobCache[track.src]) {
        if (currentBlobUrl && currentBlobUrl !== blobCache[track.src]) {
          URL.revokeObjectURL(currentBlobUrl);
        }
        currentBlobUrl = blobCache[track.src];
        audio.src = currentBlobUrl;
        titleEl.textContent = track.title;
        if (autoPlay) audio.play().catch(function(){});
        return;
      }

      // Chưa cache → fetch
      loadingTrack = true;
      titleEl.textContent = track.title + " (đang tải...)";
      showLoading(true, 0);

      try {
        var blobUrl = await fetchAsBlobUrl(url, function (p) {
          showLoading(true, p);
        });

        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = blobUrl;
        blobCache[track.src] = blobUrl;

        audio.src = currentBlobUrl;
        titleEl.textContent = track.title;
        showLoading(false);
        loadingTrack = false;

        if (autoPlay) audio.play().catch(function(){});
      } catch (err) {
        loadingTrack = false;
        showLoading(false);
        titleEl.textContent = "⚠ Lỗi tải: " + err.message + " (thử tắt USE_BLOB_URL)";
        console.error(err);
      }
      return;
    }

    /* --- Mode 2: Gán src trực tiếp (link sẽ lộ) --- */
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
    audio.src = url;
    titleEl.textContent = track.title;
    if (autoPlay) audio.play().catch(function(){});
  }

  function playTrack(index) { loadTrack(index, true); }

  function togglePlay() {
    if (currentIndex === -1) { playTrack(0); return; }
    if (!audio.src) { playTrack(currentIndex); return; }
    if (audio.paused) audio.play().catch(function(){});
    else audio.pause();
  }

  function updatePlayIcon() {
    if (audio.paused) { playIcon.style.display = ""; pauseIcon.style.display = "none"; }
    else { playIcon.style.display = "none"; pauseIcon.style.display = ""; }
  }

  /* ========== EVENTS ========== */
  playBtn.addEventListener("click", togglePlay);
  audio.addEventListener("play",  updatePlayIcon);
  audio.addEventListener("pause", updatePlayIcon);

  prevBtn.addEventListener("click", function () {
    if (currentIndex > 0) playTrack(currentIndex - 1);
    else if (currentIndex === 0) audio.currentTime = 0;
  });
  nextBtn.addEventListener("click", function () {
    if (currentIndex < TRACKS.length - 1) playTrack(currentIndex + 1);
  });

  audio.addEventListener("ended", function () {
    if (isLooping) {
      audio.currentTime = 0;
      audio.play().catch(function(){});
    } else if (currentIndex < TRACKS.length - 1) {
      playTrack(currentIndex + 1);
    } else {
      updatePlayIcon();
    }
  });

  audio.addEventListener("timeupdate", function () {
    if (!audio.duration || !isFinite(audio.duration)) return;
    var pct = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = pct + "%";
    progressHandle.style.left  = pct + "%";
    timeEl.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
  });

  audio.addEventListener("loadedmetadata", function () {
    timeEl.textContent = "00:00 / " + formatTime(audio.duration);
  });

  audio.addEventListener("error", function () {
    if (!loadingTrack) titleEl.textContent = "⚠ Không tải được file";
  });

  /* ===== Seek ===== */
  function seekTo(clientX) {
    if (!audio.duration || !isFinite(audio.duration)) return;
    var rect = progressWrap.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
    progressFill.style.width = (pct * 100) + "%";
    progressHandle.style.left = (pct * 100) + "%";
  }
  var seeking = false;
  progressWrap.addEventListener("mousedown", function (e) { seeking = true; seekTo(e.clientX); });
  document.addEventListener("mousemove", function (e) { if (seeking) seekTo(e.clientX); });
  document.addEventListener("mouseup",   function () { seeking = false; });
  progressWrap.addEventListener("touchstart", function (e) { seekTo(e.touches[0].clientX); }, { passive: true });
  progressWrap.addEventListener("touchmove",  function (e) { seekTo(e.touches[0].clientX); }, { passive: true });

  /* ===== Volume ===== */
  audio.volume = 1;
  volumeSlider.addEventListener("input", function () {
    audio.volume = volumeSlider.value / 100;
    if (audio.volume > 0) lastVolume = audio.volume;
  });
  volumeBtn.addEventListener("click", function () {
    if (audio.volume > 0) {
      lastVolume = audio.volume; audio.volume = 0; volumeSlider.value = 0;
    } else {
      audio.volume = lastVolume || 1; volumeSlider.value = (lastVolume || 1) * 100;
    }
  });

  /* ===== Speed (dùng 'x' thay vì '×' để tránh lỗi blogger) ===== */
  function applySpeed() {
    audio.playbackRate = speedSteps[speedIdx];
    speedLabel.textContent = "x" + speedSteps[speedIdx];
  }
  speedUpBtn.addEventListener("click", function () {
    if (speedIdx < speedSteps.length - 1) { speedIdx++; applySpeed(); }
  });
  speedDownBtn.addEventListener("click", function () {
    if (speedIdx > 0) { speedIdx--; applySpeed(); }
  });

  /* ===== Loop ===== */
  loopBtn.addEventListener("click", function () {
    isLooping = !isLooping;
    loopBtn.classList.toggle("active", isLooping);
  });

  /* ===== Skip ±30s ===== */
  back30Btn.addEventListener("click", function () {
    audio.currentTime = Math.max(0, audio.currentTime - 30);
  });
  fwd30Btn.addEventListener("click", function () {
    if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 30);
  });

  /* ===== Toggle playlist ===== */
  playlistToggle.addEventListener("click", function () {
    playlistEl.classList.toggle("collapsed");
  });

  /* ===== Phím tắt ===== */
  document.addEventListener("keydown", function (e) {
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.code === "Space")      { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowLeft")  { audio.currentTime = Math.max(0, audio.currentTime - 10); }
    else if (e.code === "ArrowRight") { if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); }
  });

  /* ===== Init ===== */
  renderPlaylist();
  loadTrack(0, false);   // ← Chọn sẵn chương 1, KHÔNG tự phát
  
  /* ===== Chặn chuột phải CHỈ trong khung player ===== */
  var playerEl = document.getElementById("mp3-player");
  if (playerEl) {
    playerEl.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      return false;
    });
  }
})();
