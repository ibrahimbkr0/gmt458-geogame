/**
 * CultureGlobe 3D — Main Controller & DOM Orchestration
 * Connects the closure-based 2-minute game engine, D3 3D globe, and Chart.js summary.
 */

import { createGameState } from "./gameState.js";
import { createGlobe } from "./globe.js";
import { renderResultsChart } from "./chart.js";

const els = {
  // HUD
  questionBadge: document.getElementById("question-badge"),
  difficultyBadge: document.getElementById("difficulty-badge"),
  phaseIndicator: document.getElementById("phase-indicator"),
  timerDisplay: document.getElementById("timer-display"),
  timerPenaltyToast: document.getElementById("timer-penalty-toast"),
  timerBarFill: document.getElementById("timer-bar-fill"),
  scoreValue: document.getElementById("score-value"),
  solvedCount: document.getElementById("solved-count"),
  highscoreValue: document.getElementById("highscore-value"),

  // Clue Panel
  cluePanel: document.getElementById("clue-panel"),
  btnTogglePanel: document.getElementById("btn-toggle-panel"),
  attemptsDisplay: document.getElementById("attempts-display"),
  potentialPoints: document.getElementById("potential-points"),
  clueProverb: document.getElementById("clue-proverb"),
  cluePerson: document.getElementById("clue-person"),
  clueDish: document.getElementById("clue-dish"),

  // Hints
  btnHintFlag: document.getElementById("btn-hint-flag"),
  btnHintCapital: document.getElementById("btn-hint-capital"),
  revealedHints: document.getElementById("revealed-hints"),
  revealedFlagBox: document.getElementById("revealed-flag-box"),
  revealedCapitalBox: document.getElementById("revealed-capital-box"),
  revealedCapitalText: document.getElementById("revealed-capital-text"),

  // Feedback & Next
  feedbackBox: document.getElementById("feedback-box"),
  feedbackIcon: document.getElementById("feedback-icon"),
  feedbackTitle: document.getElementById("feedback-title"),
  feedbackDetail: document.getElementById("feedback-detail"),
  btnNext: document.getElementById("btn-next"),

  // Globe Controls
  btnZoomIn: document.getElementById("btn-zoom-in"),
  btnZoomOut: document.getElementById("btn-zoom-out"),
  btnResetView: document.getElementById("btn-reset-view"),

  // Modals
  startModal: document.getElementById("start-modal"),
  btnStart: document.getElementById("btn-start"),
  gameoverModal: document.getElementById("gameover-modal"),
  gameoverSubtitle: document.getElementById("gameover-subtitle"),
  newRecordBadge: document.getElementById("new-record-badge"),
  finalScore: document.getElementById("final-score"),
  finalHighscore: document.getElementById("final-highscore"),
  finalSolved: document.getElementById("final-solved"),
  finalAccuracy: document.getElementById("final-accuracy"),
  resultsChart: document.getElementById("results-chart"),
  summaryList: document.getElementById("summary-list"),
  btnPlayAgain: document.getElementById("btn-play-again")
};

let game = null;
let globe = null;
let timerInterval = null;

function formatClock(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function setFeedback(tone, icon, title, detail) {
  els.feedbackBox.className = `feedback-box ${tone}`;
  els.feedbackIcon.textContent = icon;
  els.feedbackTitle.textContent = title;
  els.feedbackDetail.textContent = detail;
}

function triggerPenaltyToast() {
  els.timerPenaltyToast.classList.remove("pop");
  void els.timerPenaltyToast.offsetWidth;
  els.timerPenaltyToast.classList.add("pop");
}

function renderTimer(snapshot) {
  const { timeLeft, totalTime, currentPhase } = snapshot;
  els.timerDisplay.textContent = formatClock(timeLeft);

  const pct = Math.max(0, (timeLeft / totalTime) * 100);
  els.timerBarFill.style.width = `${pct}%`;

  const phaseText =
    currentPhase === "easy"
      ? "Phase 1 · Easy"
      : currentPhase === "medium"
        ? "Phase 2 · Medium"
        : "Phase 3 · Hard";
  els.phaseIndicator.textContent = phaseText;

  els.timerBarFill.classList.remove("phase-medium", "phase-hard");
  els.timerDisplay.classList.remove("phase-medium", "phase-hard", "critical");

  if (currentPhase === "medium") {
    els.timerBarFill.classList.add("phase-medium");
    els.timerDisplay.classList.add("phase-medium");
  } else if (currentPhase === "hard") {
    els.timerBarFill.classList.add("phase-hard");
    els.timerDisplay.classList.add("phase-hard");
  }

  if (timeLeft <= 15 && snapshot.gameRunning) {
    els.timerDisplay.classList.add("critical");
  }
}

function renderAttempts(snapshot) {
  els.attemptsDisplay.innerHTML = "";
  for (let i = 0; i < snapshot.maxAttempts; i++) {
    const dot = document.createElement("span");
    dot.className =
      i < snapshot.attemptsLeft ? "attempt-dot active" : "attempt-dot used";
    els.attemptsDisplay.appendChild(dot);
  }
}

function renderHintButtons(snapshot) {
  els.btnHintFlag.disabled = !snapshot.canUseFlagHint;
  els.btnHintCapital.disabled = !snapshot.canUseCapitalHint;
  els.btnHintFlag.classList.toggle("used", snapshot.usedHints.flag);
  els.btnHintCapital.classList.toggle("used", snapshot.usedHints.capital);

  const hasRevealed = snapshot.usedHints.flag || snapshot.usedHints.capital;
  els.revealedHints.classList.toggle("hidden", !hasRevealed);
  els.revealedFlagBox.classList.toggle("hidden", !snapshot.usedHints.flag);
  els.revealedCapitalBox.classList.toggle("hidden", !snapshot.usedHints.capital);
}

function renderSnapshot(snapshot) {
  els.questionBadge.textContent = `Q #${Math.max(1, snapshot.questionNumber)}`;
  els.scoreValue.textContent = String(snapshot.score);
  els.solvedCount.textContent = String(snapshot.solvedCount);
  els.highscoreValue.textContent = String(snapshot.highScore);

  const diff = snapshot.currentQuestion?.difficulty || "easy";
  els.difficultyBadge.textContent = diff.toUpperCase();
  els.difficultyBadge.className = `diff-badge diff-${diff}`;

  renderTimer(snapshot);
  renderAttempts(snapshot);

  els.potentialPoints.textContent = snapshot.questionActive
    ? `+${snapshot.potentialPoints} pts`
    : "—";

  if (snapshot.currentQuestion) {
    els.clueProverb.textContent = `"${snapshot.currentQuestion.proverb}"`;
    els.cluePerson.textContent = snapshot.currentQuestion.famousPerson;
    els.clueDish.textContent = snapshot.currentQuestion.dish;
  }

  renderHintButtons(snapshot);
}

function setMobilePanelCollapsed(collapsed) {
  if (!els.cluePanel || !els.btnTogglePanel) return;
  els.cluePanel.classList.toggle("collapsed", collapsed);
  els.btnTogglePanel.textContent = collapsed ? "CLUES" : "HIDE";
  els.btnTogglePanel.setAttribute("aria-expanded", String(!collapsed));
  globe?.setMobilePanelCollapsed(collapsed);
}

function resetQuestionUI() {
  setMobilePanelCollapsed(false);
  els.revealedFlagBox.innerHTML = "";
  els.revealedCapitalText.textContent = "";
  els.revealedHints.classList.add("hidden");
  els.revealedFlagBox.classList.add("hidden");
  els.revealedCapitalBox.classList.add("hidden");
  els.btnNext.classList.add("hidden");
  setFeedback(
    "neutral",
    "◎",
    "Find the country on the globe",
    "You have 2 guesses. First miss reveals distance (km) and direction."
  );
}

function stopTimerLoop() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimerLoop() {
  stopTimerLoop();
  timerInterval = setInterval(() => {
    const tick = game.tickTimer();
    renderTimer(tick.snapshot);
    renderHintButtons(tick.snapshot);

    if (tick.gameOver) {
      stopTimerLoop();
      if (tick.timedOutCountry) {
        globe.markCountry(tick.timedOutCountry.id, "correct");
      }
      openGameOverModal(tick.snapshot, "Time's up! Your 2-minute run has finished.");
    }
  }, 1000);
}

function handleStartGame() {
  stopTimerLoop();
  els.startModal.classList.add("hidden");
  els.gameoverModal.classList.add("hidden");

  globe.stopIdleSpin();
  globe.clearHighlights();
  globe.setInteractive(true);

  const snapshot = game.startNewGame();
  resetQuestionUI();
  renderSnapshot(snapshot);
  startTimerLoop();
}

function handleCountryClick({ id, name, centroid }) {
  const current = game.getSnapshot().currentQuestion;
  if (!current) return;

  const targetCoords = globe.getCentroid(current.countryId);
  const result = game.submitGuess(id, name, centroid, targetCoords);

  if (result.status === "ignored") return;

  if (result.status === "duplicate") {
    setFeedback(
      "info",
      "!",
      `Already guessed ${result.clickedName}`,
      "Try a different country on the globe — no attempt was deducted."
    );
    return;
  }

  if (result.status === "correct") {
    globe.markCountry(result.targetCountry.id, "correct");
    globe.setInteractive(false);
    globe.focusCountry(result.targetCountry.id);

    const tryLabel = result.attemptsUsed === 1 ? "1st try" : "2nd try";
    const hintLabel =
      result.hintsUsed === 0
        ? "no hints"
        : `${result.hintsUsed} hint${result.hintsUsed > 1 ? "s" : ""}`;

    setFeedback(
      "correct",
      "✓",
      `Correct! ${result.targetCountry.name} (+${result.points} pts)`,
      `Capital: ${result.targetCountry.capital} · Solved on ${tryLabel} (${hintLabel}).`
    );

    renderSnapshot(result.snapshot);
    els.btnNext.classList.remove("hidden");
    return;
  }

  if (result.status === "wrong_retry") {
    globe.markCountry(result.clickedId, "wrong");

    const spatialText =
      result.distanceKm !== null && result.direction
        ? `Head ${result.direction.arrow} ${result.direction.label} · approx. ${result.distanceKm.toLocaleString()} km away.`
        : "Try another region on the globe.";

    setFeedback(
      "wrong",
      result.direction ? result.direction.arrow : "✕",
      `Not ${result.clickedName} — 1 guess left`,
      spatialText
    );

    renderSnapshot(result.snapshot);
    return;
  }

  if (result.status === "wrong_failed") {
    globe.markCountry(result.clickedId, "wrong");
    globe.markCountry(result.targetCountry.id, "correct");
    globe.setInteractive(false);
    globe.focusCountry(result.targetCountry.id);

    setFeedback(
      "wrong",
      "✕",
      `Missed! It was ${result.targetCountry.name}`,
      `Capital: ${result.targetCountry.capital} · Click Next Question to keep going.`
    );

    renderSnapshot(result.snapshot);
    els.btnNext.classList.remove("hidden");
  }
}

function handleUseHint(type) {
  const res = game.useHint(type);
  if (!res.ok) return;

  triggerPenaltyToast();

  if (type === "flag") {
    els.revealedFlagBox.innerHTML = "";
    const img = document.createElement("img");
    img.src = `https://flagcdn.com/w80/${res.value}.png`;
    img.alt = "Country flag hint";
    els.revealedFlagBox.appendChild(img);
  } else if (type === "capital") {
    els.revealedCapitalText.textContent = res.value;
  }

  renderSnapshot(res.snapshot);
}

function handleNextQuestion() {
  const res = game.nextQuestion();
  if (res.exhausted) {
    stopTimerLoop();
    openGameOverModal(
      res.snapshot,
      "Unbelievable! You played through all 66 countries before time ran out."
    );
    return;
  }

  if (!res.ok) return;

  globe.clearHighlights();
  globe.setInteractive(true);
  resetQuestionUI();
  renderSnapshot(res.snapshot);
}

function openGameOverModal(snapshot, subtitleText) {
  globe.setInteractive(false);
  globe.startIdleSpin();
  els.btnNext.classList.add("hidden");

  const total = snapshot.totalPlayed;
  const accuracy = total > 0 ? Math.round((snapshot.solvedCount / total) * 100) : 0;

  els.gameoverSubtitle.textContent = subtitleText;
  els.finalScore.textContent = String(snapshot.score);
  els.finalHighscore.textContent = String(snapshot.highScore);
  els.finalSolved.textContent = `${snapshot.solvedCount} / ${total}`;
  els.finalAccuracy.textContent = `${accuracy}%`;
  els.newRecordBadge.classList.toggle("hidden", !snapshot.isNewRecord);

  els.summaryList.innerHTML = "";
  if (snapshot.questionHistory.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "summary-row";
    emptyLi.textContent = "No questions completed during this run.";
    els.summaryList.appendChild(emptyLi);
  } else {
    snapshot.questionHistory.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "summary-row";

      const left = document.createElement("div");
      left.className = "summary-row-left";

      const badge = document.createElement("span");
      badge.className = `diff-badge diff-${entry.difficulty}`;
      badge.textContent = `Q${entry.questionNumber}`;

      const info = document.createElement("div");
      const nameEl = document.createElement("div");
      nameEl.className = "summary-row-name";
      nameEl.textContent = entry.countryName;

      const metaEl = document.createElement("div");
      metaEl.className = "summary-row-meta";
      const statusText = entry.solved
        ? `Try #${entry.attemptsUsed}`
        : entry.outcome === "timeout"
          ? "Timed out"
          : "Missed";
      metaEl.textContent = `${statusText} · ${entry.timeSpent}s · ${entry.hintsUsed} hint${entry.hintsUsed === 1 ? "" : "s"}`;

      info.appendChild(nameEl);
      info.appendChild(metaEl);
      left.appendChild(badge);
      left.appendChild(info);

      const pts = document.createElement("span");
      pts.className = `summary-row-pts mono ${entry.points > 0 ? "pts-win" : "pts-zero"}`;
      pts.textContent = entry.points > 0 ? `+${entry.points}` : "0";

      li.appendChild(left);
      li.appendChild(pts);
      els.summaryList.appendChild(li);
    });
  }

  els.gameoverModal.classList.remove("hidden");
  renderResultsChart(els.resultsChart, snapshot.questionHistory);
}

function bindEvents() {
  els.btnStart.addEventListener("click", handleStartGame);
  els.btnPlayAgain.addEventListener("click", handleStartGame);
  els.btnNext.addEventListener("click", handleNextQuestion);

  els.btnTogglePanel?.addEventListener("click", () => {
    const isCollapsed = els.cluePanel.classList.contains("collapsed");
    setMobilePanelCollapsed(!isCollapsed);
  });

  els.btnHintFlag.addEventListener("click", () => handleUseHint("flag"));
  els.btnHintCapital.addEventListener("click", () => handleUseHint("capital"));

  els.btnZoomIn.addEventListener("click", () => globe?.zoomIn());
  els.btnZoomOut.addEventListener("click", () => globe?.zoomOut());
  els.btnResetView.addEventListener("click", () => globe?.resetView());

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !game) return;
    const snap = game.getSnapshot();
    if (snap.gameRunning && !snap.questionActive && !els.btnNext.classList.contains("hidden")) {
      event.preventDefault();
      handleNextQuestion();
    }
  });
}

async function init() {
  bindEvents();

  try {
    const [countriesResponse, globeController] = await Promise.all([
      fetch("data/countries.json").then((res) => {
        if (!res.ok) throw new Error("Could not load countries.json");
        return res.json();
      }),
      createGlobe("#globe-svg", { onCountryClick: handleCountryClick })
    ]);

    globe = globeController;
    game = createGameState(countriesResponse);

    els.highscoreValue.textContent = String(game.getSnapshot().highScore);
    globe.startIdleSpin();

    els.btnStart.disabled = false;
    els.btnStart.textContent = "Start 2-Minute Challenge";
  } catch (err) {
    console.error("Initialization error:", err);
    els.btnStart.textContent = "Failed to load game data";
  }
}

init();