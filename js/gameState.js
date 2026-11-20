const HIGH_SCORE_KEY = "geogame_3d_high_score";
const ROUND_TIME_LIMIT = 30;
const JOKER_TIME_PENALTY = 10;
const INITIAL_LIVES = 3;
const INITIAL_JOKERS = 2;
const TOTAL_ROUNDS = 5;

// --- Spatial Math Helpers (Haversine distance & compass bearing) ---

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

export function calculateDistanceKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371; // Earth radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function calculateDirection([lon1, lat1], [lon2, lat2]) {
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const dLon = toRadians(lon2 - lon1);

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
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

// --- Randomization Helpers ---

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function buildOrderedRounds(allCountries) {
  const easy = shuffle(allCountries.filter((c) => c.difficulty === "easy"));
  const medium = shuffle(allCountries.filter((c) => c.difficulty === "medium"));
  const hard = shuffle(allCountries.filter((c) => c.difficulty === "hard"));

  // Progressive difficulty: 2 easy -> 2 medium -> 1 hard
  const selected = [
    ...easy.slice(0, 2),
    ...medium.slice(0, 2),
    ...hard.slice(0, 1)
  ];

  // Fallback if dataset has fewer items in a specific bucket
  if (selected.length < TOTAL_ROUNDS) {
    const selectedIds = new Set(selected.map((c) => c.id));
    const remaining = shuffle(allCountries.filter((c) => !selectedIds.has(c.id)));
    selected.push(...remaining.slice(0, TOTAL_ROUNDS - selected.length));
  }

  return selected.map((country) => ({
    country,
    clues: {
      proverb: pickRandom(country.proverbs),
      famousPerson: pickRandom(country.famousPeople),
      dish: pickRandom(country.dishes)
    }
  }));
}

// --- Main Closure-Based Game State Manager ---

export function createGameState(allCountries) {
  // Private encapsulated state (inaccessible from outside)
  let score = 0;
  let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  let lives = INITIAL_LIVES;
  let jokersLeft = INITIAL_JOKERS;
  let timeLeft = ROUND_TIME_LIMIT;
  let currentRoundIndex = 0;
  let rounds = [];
  let roundActive = false;
  let gameOver = false;
  let usedJokersThisRound = new Set();
  let wrongGuessesThisRound = new Set();
  let roundHistory = [];

  function saveHighScoreIfBeaten() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    }
  }

  function recordRoundResult(solved, pointsEarned) {
    const current = rounds[currentRoundIndex];
    roundHistory.push({
      roundNumber: currentRoundIndex + 1,
      countryName: current.country.name,
      difficulty: current.country.difficulty,
      solved,
      pointsEarned,
      timeUsed: ROUND_TIME_LIMIT - timeLeft,
      wrongAttempts: wrongGuessesThisRound.size
    });
  }

  function canUseJoker(type) {
    return (
      roundActive &&
      !gameOver &&
      jokersLeft > 0 &&
      timeLeft > JOKER_TIME_PENALTY &&
      !usedJokersThisRound.has(type)
    );
  }

  return {
    startNewGame() {
      score = 0;
      lives = INITIAL_LIVES;
      jokersLeft = INITIAL_JOKERS;
      currentRoundIndex = 0;
      rounds = buildOrderedRounds(allCountries);
      roundHistory = [];
      gameOver = false;
      this.startRound();
      return this.getSnapshot();
    },

    startRound() {
      timeLeft = ROUND_TIME_LIMIT;
      roundActive = true;
      usedJokersThisRound = new Set();
      wrongGuessesThisRound = new Set();
      return this.getSnapshot();
    },

    tickTimer() {
      if (!roundActive || gameOver) return { timedOut: false, timeLeft };

      timeLeft = Math.max(0, timeLeft - 1);

      if (timeLeft === 0) {
        roundActive = false;
        lives = Math.max(0, lives - 1);
        recordRoundResult(false, 0);

        if (lives === 0 || currentRoundIndex >= rounds.length - 1) {
          gameOver = true;
          saveHighScoreIfBeaten();
        }

        return {
          timedOut: true,
          timeLeft: 0,
          correctCountry: rounds[currentRoundIndex].country,
          gameOver
        };
      }

      return { timedOut: false, timeLeft };
    },

    submitGuess(clickedCountry, targetCentroid) {
      if (!roundActive || gameOver) {
        return { status: "ignored" };
      }

      const target = rounds[currentRoundIndex].country;

      // Correct guess
      if (clickedCountry.id === target.id) {
        roundActive = false;
        const pointsEarned = 100 + timeLeft * 10;
        score += pointsEarned;
        recordRoundResult(true, pointsEarned);
        saveHighScoreIfBeaten();

        const isLastRound = currentRoundIndex >= rounds.length - 1;
        if (isLastRound) {
          gameOver = true;
        }

        return {
          status: "correct",
          pointsEarned,
          targetCountry: target,
          gameOver
        };
      }

      // Prevent deducting a life twice for the same wrong country in one round
      if (wrongGuessesThisRound.has(clickedCountry.id)) {
        return { status: "already_guessed", clickedName: clickedCountry.name };
      }

      wrongGuessesThisRound.add(clickedCountry.id);
      lives = Math.max(0, lives - 1);

      const distanceKm =
        clickedCountry.centroid && targetCentroid
          ? calculateDistanceKm(clickedCountry.centroid, targetCentroid)
          : null;

      const direction =
        clickedCountry.centroid && targetCentroid
          ? calculateDirection(clickedCountry.centroid, targetCentroid)
          : null;

      if (lives === 0) {
        roundActive = false;
        gameOver = true;
        recordRoundResult(false, 0);
        saveHighScoreIfBeaten();
      }

      return {
        status: "wrong",
        clickedName: clickedCountry.name,
        distanceKm,
        direction,
        targetCountry: lives === 0 ? target : null,
        gameOver
      };
    },

    useJoker(type) {
      // type: "flag" | "capital"
      if (!canUseJoker(type)) {
        return { allowed: false };
      }

      jokersLeft -= 1;
      timeLeft = Math.max(1, timeLeft - JOKER_TIME_PENALTY);
      usedJokersThisRound.add(type);

      const target = rounds[currentRoundIndex].country;
      return {
        allowed: true,
        type,
        value:
          type === "flag"
            ? `https://flagcdn.com/w160/${target.iso2}.png`
            : target.capital,
        countryName: target.name,
        timeLeft,
        jokersLeft
      };
    },

    nextRound() {
      if (currentRoundIndex < rounds.length - 1 && lives > 0) {
        currentRoundIndex += 1;
        return this.startRound();
      }
      gameOver = true;
      saveHighScoreIfBeaten();
      return this.getSnapshot();
    },

    getSnapshot() {
      const current = rounds[currentRoundIndex] || null;
      return {
        score,
        highScore,
        lives,
        maxLives: INITIAL_LIVES,
        jokersLeft,
        timeLeft,
        roundNumber: currentRoundIndex + 1,
        totalRounds: rounds.length || TOTAL_ROUNDS,
        roundActive,
        gameOver,
        canUseFlagJoker: canUseJoker("flag"),
        canUseCapitalJoker: canUseJoker("capital"),
        currentDifficulty: current ? current.country.difficulty : null,
        currentClues: current ? { ...current.clues } : null,
        currentTargetId: current ? current.country.id : null,
        roundHistory: [...roundHistory]
      };
    }
  };
}