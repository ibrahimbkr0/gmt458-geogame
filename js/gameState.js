/**
 * CultureGlobe 3D — Closure-Based Game Engine
 * Rules:
 * - 120s continuous global timer
 * - Time-based difficulty phases: >60s Easy, >30s Medium, <=30s Hard
 * - 2 attempts per country (1st miss gives Haversine km + 8-point bearing)
 * - Flag & Capital hints: -5s timer penalty and -20 pts each (locked if timeLeft <= 5s)
 * - Scoring: 1st try (100 / 80 / 60), 2nd try (60 / 40 / 20), 2nd miss (0)
 */

const TOTAL_TIME_SECONDS = 120;
const MAX_ATTEMPTS = 2;
const BASE_POINTS = 100;
const SECOND_TRY_PENALTY = 40;
const HINT_TIME_PENALTY = 5;
const HINT_SCORE_PENALTY = 20;
const HIGH_SCORE_KEY = "cultureglobe3d_highscore_2min";

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function normalizeId(id) {
  return String(id).padStart(3, "0");
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

export function calculateDistanceKm(fromCoords, toCoords) {
  const [lon1, lat1] = fromCoords;
  const [lon2, lat2] = toCoords;
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function calculateDirection(fromCoords, toCoords) {
  const [lon1, lat1] = fromCoords;
  const [lon2, lat2] = toCoords;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const directions = [
    { label: "North", arrow: "↑" },
    { label: "Northeast", arrow: "↗" },
    { label: "East", arrow: "→" },
    { label: "Southeast", arrow: "↘" },
    { label: "South", arrow: "↓" },
    { label: "Southwest", arrow: "↙" },
    { label: "West", arrow: "←" },
    { label: "Northwest", arrow: "↖" }
  ];

  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

function loadHighScore() {
  try {
    const saved = Number(localStorage.getItem(HIGH_SCORE_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch {
    // Ignore storage restrictions
  }
}

export function createGameState(allCountries) {
  // Private closure state
  let pools = { easy: [], medium: [], hard: [] };
  let score = 0;
  let highScore = loadHighScore();
  let isNewRecord = false;
  let timeLeft = TOTAL_TIME_SECONDS;
  let gameRunning = false;
  let gameOver = false;

  let questionNumber = 0;
  let currentQuestion = null;
  let questionActive = false;
  let attemptsUsed = 0;
  let wrongGuessesThisQuestion = new Set();
  let usedHintsThisQuestion = { flag: false, capital: false };
  let questionHistory = [];

  function getDifficultyByTime(seconds) {
    if (seconds > 60) return "easy";
    if (seconds > 30) return "medium";
    return "hard";
  }

  function getHintsUsedCount() {
    return (usedHintsThisQuestion.flag ? 1 : 0) + (usedHintsThisQuestion.capital ? 1 : 0);
  }

  function computePotentialPoints() {
    if (!currentQuestion || !questionActive) return 0;
    const raw =
      BASE_POINTS -
      attemptsUsed * SECOND_TRY_PENALTY -
      getHintsUsedCount() * HINT_SCORE_PENALTY;
    return Math.max(20, raw);
  }

  function drawNextCountry() {
    const targetDiff = getDifficultyByTime(timeLeft);
    const order =
      targetDiff === "easy"
        ? ["easy", "medium", "hard"]
        : targetDiff === "medium"
          ? ["medium", "hard", "easy"]
          : ["hard", "medium", "easy"];

    for (const diff of order) {
      if (pools[diff].length > 0) {
        return pools[diff].pop();
      }
    }
    return null;
  }

  function prepareQuestion(country) {
    questionNumber += 1;
    currentQuestion = {
      country,
      proverb: pickRandom(country.proverbs),
      famousPerson: pickRandom(country.famousPeople),
      dish: pickRandom(country.dishes),
      difficulty: country.difficulty,
      startedAtTimeLeft: timeLeft
    };
    questionActive = true;
    attemptsUsed = 0;
    wrongGuessesThisQuestion = new Set();
    usedHintsThisQuestion = { flag: false, capital: false };
  }

  function updateHighScoreIfNeeded() {
    if (score > highScore) {
      highScore = score;
      isNewRecord = true;
      saveHighScore(highScore);
    }
  }

  function buildSnapshot() {
    const solvedCount = questionHistory.filter((item) => item.solved).length;
    return {
      totalTime: TOTAL_TIME_SECONDS,
      timeLeft,
      currentPhase: getDifficultyByTime(timeLeft),
      score,
      highScore,
      isNewRecord,
      gameRunning,
      gameOver,
      questionNumber,
      questionActive,
      maxAttempts: MAX_ATTEMPTS,
      attemptsUsed,
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - attemptsUsed),
      potentialPoints: computePotentialPoints(),
      hintTimePenalty: HINT_TIME_PENALTY,
      canUseFlagHint:
        gameRunning &&
        questionActive &&
        !usedHintsThisQuestion.flag &&
        timeLeft > HINT_TIME_PENALTY,
      canUseCapitalHint:
        gameRunning &&
        questionActive &&
        !usedHintsThisQuestion.capital &&
        timeLeft > HINT_TIME_PENALTY,
      usedHints: { ...usedHintsThisQuestion },
      currentQuestion: currentQuestion
        ? {
            countryId: currentQuestion.country.id,
            difficulty: currentQuestion.difficulty,
            proverb: currentQuestion.proverb,
            famousPerson: currentQuestion.famousPerson,
            dish: currentQuestion.dish,
            iso2: currentQuestion.country.iso2,
            capital: currentQuestion.country.capital
          }
        : null,
      solvedCount,
      totalPlayed: questionHistory.length,
      questionHistory: questionHistory.map((item) => ({ ...item }))
    };
  }

  return {
    startNewGame() {
      pools = {
        easy: shuffle(allCountries.filter((c) => c.difficulty === "easy")),
        medium: shuffle(allCountries.filter((c) => c.difficulty === "medium")),
        hard: shuffle(allCountries.filter((c) => c.difficulty === "hard"))
      };

      score = 0;
      isNewRecord = false;
      timeLeft = TOTAL_TIME_SECONDS;
      gameRunning = true;
      gameOver = false;
      questionNumber = 0;
      questionHistory = [];

      const firstCountry = drawNextCountry();
      if (firstCountry) {
        prepareQuestion(firstCountry);
      }

      return buildSnapshot();
    },

    tickTimer() {
      if (!gameRunning || gameOver) {
        return { gameOver: false, snapshot: buildSnapshot() };
      }

      timeLeft = Math.max(0, timeLeft - 1);

      if (timeLeft === 0) {
        let timedOutCountry = null;

        // If player was still guessing when the 2 minutes expired, log it as missed
        if (questionActive && currentQuestion) {
          timedOutCountry = currentQuestion.country;
          const timeSpent = Math.max(1, currentQuestion.startedAtTimeLeft - timeLeft);
          questionHistory.push({
            questionNumber,
            countryName: currentQuestion.country.name,
            iso2: currentQuestion.country.iso2,
            difficulty: currentQuestion.difficulty,
            solved: false,
            attemptsUsed,
            hintsUsed: getHintsUsedCount(),
            points: 0,
            timeSpent,
            outcome: "timeout"
          });
        }

        questionActive = false;
        gameRunning = false;
        gameOver = true;
        updateHighScoreIfNeeded();

        return {
          gameOver: true,
          timedOutCountry,
          snapshot: buildSnapshot()
        };
      }

      return {
        gameOver: false,
        snapshot: buildSnapshot()
      };
    },

    submitGuess(clickedId, clickedName, clickedCoords, targetCoords) {
      if (!gameRunning || !questionActive || !currentQuestion) {
        return { status: "ignored", snapshot: buildSnapshot() };
      }

      const normClicked = normalizeId(clickedId);
      const normTarget = normalizeId(currentQuestion.country.id);

      if (wrongGuessesThisQuestion.has(normClicked)) {
        return {
          status: "duplicate",
          clickedId: normClicked,
          clickedName,
          snapshot: buildSnapshot()
        };
      }

      attemptsUsed += 1;
      const hintsCount = getHintsUsedCount();

      // Correct guess
      if (normClicked === normTarget) {
        const earned = Math.max(
          20,
          BASE_POINTS -
            (attemptsUsed - 1) * SECOND_TRY_PENALTY -
            hintsCount * HINT_SCORE_PENALTY
        );
        score += earned;
        updateHighScoreIfNeeded();

        const timeSpent = Math.max(1, currentQuestion.startedAtTimeLeft - timeLeft);
        questionHistory.push({
          questionNumber,
          countryName: currentQuestion.country.name,
          iso2: currentQuestion.country.iso2,
          difficulty: currentQuestion.difficulty,
          solved: true,
          attemptsUsed,
          hintsUsed: hintsCount,
          points: earned,
          timeSpent,
          outcome: "solved"
        });

        questionActive = false;

        return {
          status: "correct",
          points: earned,
          attemptsUsed,
          hintsUsed: hintsCount,
          targetCountry: currentQuestion.country,
          snapshot: buildSnapshot()
        };
      }

      // Wrong guess
      wrongGuessesThisQuestion.add(normClicked);
      const distanceKm =
        clickedCoords && targetCoords
          ? calculateDistanceKm(clickedCoords, targetCoords)
          : null;
      const direction =
        clickedCoords && targetCoords
          ? calculateDirection(clickedCoords, targetCoords)
          : null;

      // 1st wrong guess -> player gets 2nd try with spatial hint
      if (attemptsUsed < MAX_ATTEMPTS) {
        return {
          status: "wrong_retry",
          clickedId: normClicked,
          clickedName,
          distanceKm,
          direction,
          snapshot: buildSnapshot()
        };
      }

      // 2nd wrong guess -> reveal answer and unlock Next Question
      const timeSpent = Math.max(1, currentQuestion.startedAtTimeLeft - timeLeft);
      questionHistory.push({
        questionNumber,
        countryName: currentQuestion.country.name,
        iso2: currentQuestion.country.iso2,
        difficulty: currentQuestion.difficulty,
        solved: false,
        attemptsUsed,
        hintsUsed: hintsCount,
        points: 0,
        timeSpent,
        outcome: "missed"
      });

      questionActive = false;

      return {
        status: "wrong_failed",
        clickedId: normClicked,
        clickedName,
        distanceKm,
        direction,
        targetCountry: currentQuestion.country,
        snapshot: buildSnapshot()
      };
    },

    useHint(type) {
      if (!gameRunning || !questionActive || !currentQuestion) {
        return { ok: false, reason: "inactive", snapshot: buildSnapshot() };
      }

      if (type !== "flag" && type !== "capital") {
        return { ok: false, reason: "invalid", snapshot: buildSnapshot() };
      }

      if (usedHintsThisQuestion[type]) {
        return { ok: false, reason: "already_used", snapshot: buildSnapshot() };
      }

      if (timeLeft <= HINT_TIME_PENALTY) {
        return { ok: false, reason: "low_time", snapshot: buildSnapshot() };
      }

      timeLeft -= HINT_TIME_PENALTY;
      usedHintsThisQuestion[type] = true;

      return {
        ok: true,
        type,
        penaltySeconds: HINT_TIME_PENALTY,
        value:
          type === "flag"
            ? currentQuestion.country.iso2
            : currentQuestion.country.capital,
        snapshot: buildSnapshot()
      };
    },

    nextQuestion() {
      if (!gameRunning || gameOver || questionActive) {
        return { ok: false, exhausted: false, snapshot: buildSnapshot() };
      }

      const nextCountry = drawNextCountry();
      if (!nextCountry) {
        gameRunning = false;
        gameOver = true;
        updateHighScoreIfNeeded();
        return { ok: false, exhausted: true, snapshot: buildSnapshot() };
      }

      prepareQuestion(nextCountry);
      return { ok: true, exhausted: false, snapshot: buildSnapshot() };
    },

    getSnapshot() {
      return buildSnapshot();
    }
  };
}