import { createGlobe } from "./globe.js";
import { createGameState } from "./gameState.js";

// --- DOM References ---
const roundDisplay = document.getElementById("round-display");
const difficultyBadge = document.getElementById("difficulty-badge");
const timerDisplay = document.getElementById("timer-display");
const timerBar = document.getElementById("timer-bar");
const livesDisplay = document.getElementById("lives-display");
const scoreDisplay = document.getElementById("score-display");
const highScoreDisplay = document.getElementById("highscore-display");

const clueProverb = document.getElementById("clue-proverb");
const cluePerson = document.getElementById("clue-person");
const clueDish = document.getElementById("clue-dish");

const jokersLeftEl = document.getElementById("jokers-left");
const flagJokerBtn = document.getElementById("joker-flag-btn");
const capitalJokerBtn = document.getElementById("joker-capital-btn");
const jokerRevealArea = document.getElementById("joker-reveal-area");

const feedbackBox = document.getElementById("feedback-box");
const nextRoundBtn = document.getElementById("next-round-btn");

const startModal = document.getElementById("start-modal");
const startGameBtn = document.getElementById("start-game-btn");
const gameOverModal = document.getElementById("gameover-modal");
const gameOverTitle = document.getElementById("gameover-title");
const finalScoreEl = document.getElementById("final-score");
const finalHighScoreEl = document.getElementById("final-highscore");
const roundSummaryList = document.getElementById("round-summary-list");
const playAgainBtn = document.getElementById("play-again-btn");

let globe = null;
let game = null;
let timerInterval = null;

// --- DOM Rendering Helpers ---

function setFeedback(message, type = "neutral") {
  feedbackBox.textContent = message;
  feedbackBox.className = "feedback-box";
  if (type === "success" || type === "error") {
    feedbackBox.classList.add(type);
  }
}

function renderLives(current, max) {
  livesDisplay.innerHTML = "";
  for (let i = 0; i < max; i++) {
    const heart = document.createElement("span");
    heart.textContent = "♥";
    heart.className = i < current ? "heart-active" : "heart-lost";
    livesDisplay.appendChild(heart);
  }
}

function renderHUD(snapshot) {
  roundDisplay.textContent = `${snapshot.roundNumber} / ${snapshot.totalRounds}`;
  scoreDisplay.textContent = snapshot.score;
  highScoreDisplay.textContent = snapshot.highScore;

  // Difficulty badge
  difficultyBadge.textContent = snapshot.currentDifficulty || "READY";
  difficultyBadge.className = "badge";
  if (snapshot.currentDifficulty) {
    difficultyBadge.classList.add(snapshot.currentDifficulty);
  }

  // Timer text & progress bar
  timerDisplay.textContent = `${snapshot.timeLeft}s`;
  const isCritical = snapshot.timeLeft <= 10;
  timerDisplay.classList.toggle("danger", isCritical);
  timerBar.classList.toggle("danger", isCritical);
  timerBar.style.width = `${(snapshot.timeLeft / 30) * 100}%`;

  // Lives & Joker button availability
  renderLives(snapshot.lives, snapshot.maxLives);
  jokersLeftEl.textContent = `${snapshot.jokersLeft} left`;
  flagJokerBtn.disabled = !snapshot.canUseFlagJoker;
  capitalJokerBtn.disabled = !snapshot.canUseCapitalJoker;
}

function renderClues(clues) {
  clueProverb.textContent = `"${clues.proverb}"`;
  cluePerson.textContent = clues.famousPerson;
  clueDish.textContent = clues.dish;
}

function clearJokerReveal() {
  jokerRevealArea.innerHTML = "";
  jokerRevealArea.classList.add("hidden");
}

// --- Timer Lifecycle ---

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    const tick = game.tickTimer();
    const snapshot = game.getSnapshot();
    renderHUD(snapshot);

    if (tick.timedOut) {
      stopTimer();
      globe.highlightCountry(tick.correctCountry.id, "correct");
      setFeedback(
        `Time's up! The mystery country was ${tick.correctCountry.name}.`,
        "error"
      );
      showRoundTransition(tick.gameOver);
    }
  }, 1000);
}

// --- Round & Game Over Flow ---

function showRoundTransition(isGameOver) {
  nextRoundBtn.textContent = isGameOver ? "View Final Results →" : "Next Round →";
  nextRoundBtn.classList.remove("hidden");
}

function setupRoundView(snapshot) {
  globe.resetColors();
  clearJokerReveal();
  nextRoundBtn.classList.add("hidden");
  renderClues(snapshot.currentClues);
  renderHUD(snapshot);
  setFeedback("Rotate the globe and click the matching country.");
  startTimer();
}

function openGameOverModal() {
  stopTimer();
  const snapshot = game.getSnapshot();

  gameOverTitle.textContent =
    snapshot.lives > 0 ? "Expedition Complete!" : "Out of Lives!";
  finalScoreEl.textContent = snapshot.score;
  finalHighScoreEl.textContent = snapshot.highScore;

  roundSummaryList.innerHTML = "";
  snapshot.roundHistory.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.solved ? "solved" : "missed";

    const left = document.createElement("span");
    left.textContent = `R${item.roundNumber}: ${item.countryName} (${item.difficulty})`;

    const right = document.createElement("span");
    right.textContent = item.solved
      ? `+${item.pointsEarned} pts (${item.timeUsed}s)`
      : `Missed (${item.timeUsed}s)`;

    li.append(left, right);
    roundSummaryList.appendChild(li);
  });

  gameOverModal.classList.remove("hidden");
}

// --- Event Handlers ---

// Event Handler 1: Country polygon click on the 3D globe
function handleCountryClick(clickedCountry) {
  if (!game) return;
  const beforeSnap = game.getSnapshot();
  if (!beforeSnap.roundActive || beforeSnap.gameOver) return;

  const targetCentroid = globe.getCountryCentroid(beforeSnap.currentTargetId);
  const result = game.submitGuess(clickedCountry, targetCentroid);
  const afterSnap = game.getSnapshot();
  renderHUD(afterSnap);

  if (result.status === "correct") {
    stopTimer();
    globe.highlightCountry(result.targetCountry.id, "correct");
    setFeedback(
      `Correct! It is ${result.targetCountry.name}. (+${result.pointsEarned} pts)`,
      "success"
    );
    showRoundTransition(result.gameOver);
    return;
  }

  if (result.status === "already_guessed") {
    setFeedback(`You already tried ${result.clickedName}. Try another country!`);
    return;
  }

  if (result.status === "wrong") {
    globe.highlightCountry(clickedCountry.id, "wrong");

    if (result.gameOver) {
      stopTimer();
      globe.highlightCountry(result.targetCountry.id, "correct");
      setFeedback(
        `Wrong (${result.clickedName})! Out of lives. The answer was ${result.targetCountry.name}.`,
        "error"
      );
      showRoundTransition(true);
    } else {
      const spatialHint =
        result.distanceKm !== null && result.direction
          ? ` It is ${result.distanceKm.toLocaleString()} km away — go ${result.direction.label} ${result.direction.arrow}`
          : "";
      setFeedback(`Not ${result.clickedName}!${spatialHint}`, "error");
    }
  }
}

// Event Handler 2: Joker buttons (-10s penalty for Flag or Capital)
function handleJokerClick(type) {
  const result = game.useJoker(type);
  if (!result.allowed) return;

  jokerRevealArea.classList.remove("hidden");
  const item = document.createElement("div");
  item.className = "joker-item";

  if (type === "flag") {
    const img = document.createElement("img");
    img.src = result.value;
    img.alt = "Country flag hint";
    img.className = "joker-flag-img";
    const label = document.createElement("span");
    label.textContent = "Flag revealed (-10s)";
    item.append(img, label);
  } else {
    item.innerHTML = `<strong>Capital:</strong> ${result.value} (-10s)`;
  }

  jokerRevealArea.appendChild(item);
  renderHUD(game.getSnapshot());
}

flagJokerBtn.addEventListener("click", () => handleJokerClick("flag"));
capitalJokerBtn.addEventListener("click", () => handleJokerClick("capital"));

// Event Handler 3: Start, Next Round, Play Again, and Keyboard shortcut (Enter)
startGameBtn.addEventListener("click", () => {
  startModal.classList.add("hidden");
  const snapshot = game.startNewGame();
  setupRoundView(snapshot);
});

function advanceFlow() {
  const snapshot = game.getSnapshot();
  if (snapshot.gameOver) {
    nextRoundBtn.classList.add("hidden");
    openGameOverModal();
  } else {
    const nextSnap = game.nextRound();
    setupRoundView(nextSnap);
  }
}

nextRoundBtn.addEventListener("click", advanceFlow);

playAgainBtn.addEventListener("click", () => {
  gameOverModal.classList.add("hidden");
  const snapshot = game.startNewGame();
  setupRoundView(snapshot);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !nextRoundBtn.classList.contains("hidden")) {
    advanceFlow();
  }
});

// --- Bootstrap ---

async function init() {
  const response = await fetch("./data/countries.json");
  const countries = await response.json();

  game = createGameState(countries);
  globe = await createGlobe("#globe-container", handleCountryClick);

  highScoreDisplay.textContent = game.getSnapshot().highScore;
  startGameBtn.textContent = "Start Game";
  startGameBtn.disabled = false;
}

init().catch((err) => {
  console.error(err);
  startGameBtn.textContent = "Failed to Load Data";
  setFeedback("Initialization error. Please check the browser console (F12).", "error");
});