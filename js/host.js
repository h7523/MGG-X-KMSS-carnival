// ======================================================
// MGG CARNIVAL — HOST CONTROLLER
// ======================================================

let gameState = null;
let players = [];
let battleQuestions = [];
let zoomQuestions = [];


// ======================================================
// HELPERS
// ======================================================

function byId(id) {
  return document.getElementById(id);
}

function setHostMessage(message) {
  const element = byId("hostStatusMessage");

  if (element) {
    element.textContent = message;
  }

  console.log("[MGG HOST]", message);
}

function normaliseAnswer(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// ======================================================
// LOAD GAME STATE
// ======================================================

async function loadGameState() {
  const { data, error } = await supabaseClient
    .from("game_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    console.error(error);
    setHostMessage("Could not load game state.");
    return;
  }

  gameState = data;
  updateHostDisplay();
}


// ======================================================
// LOAD PLAYERS
// ======================================================

async function loadPlayers() {
  const { data, error } = await supabaseClient
    .from("players")
    .select("*")
    .order("joined_at", {
      ascending: true
    });

  if (error) {
    console.error(error);
    return;
  }

  players = data || [];

  updateHostDisplay();
  renderPlayerList();
}


// ======================================================
// LOAD QUESTIONS
// ======================================================

async function loadQuestions() {
  const battleResult = await supabaseClient
    .from("battle_questions")
    .select("*")
    .order("id", {
      ascending: true
    });

  if (battleResult.error) {
    console.error(
      "Battle questions:",
      battleResult.error
    );
  } else {
    battleQuestions =
      battleResult.data || [];
  }


  const zoomResult = await supabaseClient
    .from("zoom_questions")
    .select("*")
    .order("id", {
      ascending: true
    });

  if (zoomResult.error) {
    console.error(
      "Zoom questions:",
      zoomResult.error
    );
  } else {
    zoomQuestions =
      zoomResult.data || [];
  }

  updateHostDisplay();
}


// ======================================================
// HOST DISPLAY
// ======================================================

function updateHostDisplay() {
  const playerCount =
    byId("hostPlayerCount");

  const aliveCount =
    byId("hostAliveCount");

  const game =
    byId("hostCurrentGame");

  const round =
    byId("hostRound");


  if (playerCount) {
    playerCount.textContent =
      players.length;
  }


  const alive =
    players.filter(
      player => player.alive
    ).length;


  if (aliveCount) {
    aliveCount.textContent = alive;
  }


  if (game) {
    if (!gameState) {
      game.textContent = "LOBBY";
    } else if (
      gameState.game_mode === "battle"
    ) {
      game.textContent =
        "BATTLE ROYALE";
    } else if (
      gameState.game_mode === "zoom"
    ) {
      game.textContent =
        "ZOOMED IN";
    } else if (
      gameState.game_mode ===
      "leaderboard"
    ) {
      game.textContent =
        "LEADERBOARD";
    } else if (
      gameState.game_mode === "winner"
    ) {
      game.textContent =
        "WINNER";
    } else {
      game.textContent =
        "LOBBY";
    }
  }


  if (round) {
    round.textContent =
      gameState?.round_number || 0;
  }


  updateBattleQuestionDisplay();
  updateZoomDisplay();
}


// ======================================================
// PLAYER LIST
// ======================================================

function renderPlayerList() {
  const container =
    byId("hostPlayerList");

  if (!container) return;

  container.innerHTML = "";


  if (players.length === 0) {
    container.innerHTML = `
      <p>No players have joined yet.</p>
    `;

    return;
  }


  const sorted = [...players].sort(
    (a, b) => {

      if (a.alive !== b.alive) {
        return a.alive ? -1 : 1;
      }

      return (
        (b.score || 0) -
        (a.score || 0)
      );
    }
  );


  sorted.forEach(player => {
    const row =
      document.createElement("div");

    row.className =
      "host-player-row";


    const name =
      document.createElement("strong");

    name.textContent =
      player.nickname;


    const details =
      document.createElement("span");

    details.textContent =
      player.alive
        ? `🔥 ALIVE • ${player.score || 0} pts`
        : `💀 ELIMINATED • ${player.score || 0} pts`;


    row.appendChild(name);
    row.appendChild(details);

    container.appendChild(row);
  });
}


// ======================================================
// UPDATE GAME STATE
// ======================================================

async function updateGameState(updates) {
  const payload = {
    ...updates,
    updated_at:
      new Date().toISOString()
  };


  const { data, error } =
    await supabaseClient
      .from("game_state")
      .update(payload)
      .eq("id", 1)
      .select()
      .single();


  if (error) {
    console.error(error);
    setHostMessage(
      "Could not update the game."
    );

    return null;
  }


  gameState = data;

  updateHostDisplay();

  return data;
}


// ======================================================
// DELETE ANSWERS FOR A GAME
// ======================================================

async function clearGameAnswers(
  gameMode
) {
  const { error } =
    await supabaseClient
      .from("answers")
      .delete()
      .eq(
        "game_mode",
        gameMode
      );


  if (error) {
    console.error(
      "Could not clear old answers:",
      error
    );

    setHostMessage(
      "Old answers could not be cleared. Reset may be required."
    );

    return false;
  }

  return true;
}


// ======================================================
// REVIVE ALL PLAYERS
// ======================================================

async function reviveAllPlayers(
  showMessage = true
) {
  if (players.length === 0) {
    if (showMessage) {
      setHostMessage(
        "There are no players to revive."
      );
    }

    return;
  }


  const { error } =
    await supabaseClient
      .from("players")
      .update({
        alive: true
      })
      .neq(
        "id",
        "00000000-0000-0000-0000-000000000000"
      );


  if (error) {
    console.error(error);

    setHostMessage(
      "Could not revive players."
    );

    return;
  }


  await loadPlayers();


  if (showMessage) {
    setHostMessage(
      "All players revived."
    );
  }
}


// ======================================================
// RESET SCORES
// ======================================================

async function resetScores() {
  const confirmed =
    window.confirm(
      "Reset every player's score to 0?"
    );

  if (!confirmed) return;


  const { error } =
    await supabaseClient
      .from("players")
      .update({
        score: 0
      })
      .neq(
        "id",
        "00000000-0000-0000-0000-000000000000"
      );


  if (error) {
    console.error(error);

    setHostMessage(
      "Could not reset scores."
    );

    return;
  }


  await loadPlayers();

  setHostMessage(
    "All scores reset."
  );
}


// ======================================================
// BATTLE — CURRENT QUESTION DISPLAY
// ======================================================

function updateBattleQuestionDisplay() {
  const element =
    byId("hostBattleQuestion");

  if (!element) return;


  if (
    !gameState ||
    gameState.game_mode !== "battle"
  ) {
    element.textContent =
      "No Battle Royale question active.";

    return;
  }


  const question =
    battleQuestions.find(
      item =>
        Number(item.id) ===
        Number(
          gameState.current_question
        )
    );


  if (!question) {
    element.textContent =
      "Question not found.";

    return;
  }


  element.textContent =
    `Round ${gameState.round_number}: ${question.question}`;
}


// ======================================================
// BATTLE — START
// ======================================================

async function startBattle() {
  if (battleQuestions.length === 0) {
    setHostMessage(
      "No Battle Royale questions found. Refresh the host page if you just added them."
    );

    return;
  }


  if (players.length === 0) {
    setHostMessage(
      "No players have joined yet."
    );

    return;
  }


  setHostMessage(
    "Preparing Battle Royale..."
  );


  const cleared =
    await clearGameAnswers(
      "battle"
    );


  if (!cleared) {
    return;
  }


  await reviveAllPlayers(false);


  const firstQuestion =
    battleQuestions[0];


  await updateGameState({
    game_mode: "battle",
    status: "question",
    current_question:
      firstQuestion.id,
    round_number: 1,
    zoom_level: 1
  });


  setHostMessage(
    "Battle Royale started! 🔥"
  );
}


// ======================================================
// BATTLE — NEXT QUESTION
// ======================================================

async function nextBattleQuestion() {
  if (
    !gameState ||
    gameState.game_mode !== "battle"
  ) {
    setHostMessage(
      "Start Battle Royale first."
    );

    return;
  }


  await loadPlayers();


  const alivePlayers =
    players.filter(
      player => player.alive
    );


  // Winner already exists
  if (alivePlayers.length === 1) {
    await crownBattleWinner(
      alivePlayers[0]
    );

    return;
  }


  // Everyone eliminated
  if (alivePlayers.length === 0) {
    setHostMessage(
      "Everyone was eliminated! Use Redemption Round to bring them back."
    );

    return;
  }


  const currentIndex =
    battleQuestions.findIndex(
      question =>
        Number(question.id) ===
        Number(
          gameState.current_question
        )
    );


  const nextIndex =
    currentIndex + 1;


  if (
    nextIndex >=
    battleQuestions.length
  ) {
    if (
      alivePlayers.length > 1
    ) {
      setHostMessage(
        `${alivePlayers.length} players are still alive but there are no more Battle Royale questions. Add more questions or use a tie-breaker.`
      );
    }

    return;
  }


  const nextQuestion =
    battleQuestions[nextIndex];


  await updateGameState({
    game_mode: "battle",
    status: "question",
    current_question:
      nextQuestion.id,
    round_number:
      (gameState.round_number || 0) +
      1
  });


  if (alivePlayers.length <= 3) {
    setHostMessage(
      `🔥 FINAL ${alivePlayers.length}! Next question is live.`
    );
  } else {
    setHostMessage(
      `Round ${
        (gameState.round_number || 0)
      } is live.`
    );
  }
}


// ======================================================
// BATTLE — REVEAL / MARK
// ======================================================

async function revealBattleAnswers() {
  if (
    !gameState ||
    gameState.game_mode !== "battle"
  ) {
    setHostMessage(
      "Battle Royale is not active."
    );

    return;
  }


  if (
    gameState.status === "result"
  ) {
    setHostMessage(
      "This question has already been revealed."
    );

    return;
  }


  const question =
    battleQuestions.find(
      item =>
        Number(item.id) ===
        Number(
          gameState.current_question
        )
    );


  if (!question) {
    setHostMessage(
      "Could not find the current question."
    );

    return;
  }


  const { data: alivePlayers, error: playerError } =
    await supabaseClient
      .from("players")
      .select("*")
      .eq("alive", true);


  if (playerError) {
    console.error(playerError);

    setHostMessage(
      "Could not load alive players."
    );

    return;
  }


  const { data: answers, error: answerError } =
    await supabaseClient
      .from("answers")
      .select("*")
      .eq(
        "game_mode",
        "battle"
      )
      .eq(
        "question_id",
        question.id
      );


  if (answerError) {
    console.error(answerError);

    setHostMessage(
      "Could not load answers."
    );

    return;
  }


  const correctAnswer =
    String(
      question.correct_answer
    )
      .trim()
      .toUpperCase();


  const eliminatedIds = [];


  for (
    const player of
    alivePlayers || []
  ) {
    const answer =
      (answers || []).find(
        item =>
          item.player_id ===
          player.id
      );


    const submittedAnswer =
      String(
        answer?.answer || ""
      )
        .trim()
        .toUpperCase();


    const correct =
      submittedAnswer ===
      correctAnswer;


    if (answer) {
      await supabaseClient
        .from("answers")
        .update({
          correct,
          points: 0
        })
        .eq(
          "id",
          answer.id
        );
    }


    if (!correct) {
      eliminatedIds.push(
        player.id
      );
    }
  }


  for (
    const playerId of
    eliminatedIds
  ) {
    await supabaseClient
      .from("players")
      .update({
        alive: false
      })
      .eq(
        "id",
        playerId
      );
  }


  // IMPORTANT:
  // Set result AFTER player
  // elimination updates so phones
  // receive the final alive state.
  await updateGameState({
    status: "result"
  });


  await loadPlayers();


  const survivors =
    players.filter(
      player => player.alive
    );


  if (survivors.length === 1) {
    setHostMessage(
      `👑 ${survivors[0].nickname} is the last player standing! Press NEXT QUESTION to crown the champion.`
    );

    return;
  }


  if (survivors.length === 0) {
    setHostMessage(
      "💀 Everyone was eliminated! Use REDEMPTION ROUND."
    );

    return;
  }


  if (survivors.length <= 3) {
    setHostMessage(
      `🔥 FINAL ${survivors.length}!`
    );

    return;
  }


  setHostMessage(
    `${survivors.length} players survived this round.`
  );
}


// ======================================================
// BATTLE — REDEMPTION
// ======================================================

async function redemptionRound() {
  if (
    !gameState ||
    gameState.game_mode !== "battle"
  ) {
    setHostMessage(
      "Battle Royale is not active."
    );

    return;
  }


  const eliminated =
    players.filter(
      player => !player.alive
    );


  if (eliminated.length === 0) {
    setHostMessage(
      "Nobody is eliminated right now."
    );

    return;
  }


  for (
    const player of eliminated
  ) {
    await supabaseClient
      .from("players")
      .update({
        alive: true
      })
      .eq(
        "id",
        player.id
      );
  }


  await loadPlayers();


  setHostMessage(
    `⚡ Redemption! ${eliminated.length} player(s) are back in the game.`
  );
}


// ======================================================
// BATTLE — CROWN WINNER
// ======================================================

async function crownBattleWinner(
  winner
) {
  if (!winner) return;


  await updateGameState({
    game_mode: "winner",
    status: "battle_winner"
  });


  setHostMessage(
    `👑 ${winner.nickname} is the MGG Battle Royale Champion!`
  );
}


// ======================================================
// ZOOM — DISPLAY
// ======================================================

function updateZoomDisplay() {
  const image =
    byId("hostZoomImage");

  const points =
    byId("hostZoomPoints");


  if (
    !gameState ||
    gameState.game_mode !== "zoom"
  ) {
    if (image) {
      image.textContent =
        "No Zoomed In image active.";
    }

    if (points) {
      points.textContent = "0";
    }

    return;
  }


  const question =
    zoomQuestions.find(
      item =>
        Number(item.id) ===
        Number(
          gameState.current_question
        )
    );


  if (image) {
    image.textContent =
      question?.title ||
      `Image ${gameState.round_number}`;
  }


  const pointValues = {
    1: 1000,
    2: 750,
    3: 500,
    4: 250
  };


  if (points) {
    points.textContent =
      pointValues[
        gameState.zoom_level
      ] || 250;
  }
}


// ======================================================
// ZOOM — START
// ======================================================

async function startZoom() {
  if (zoomQuestions.length === 0) {
    setHostMessage(
      "No Zoomed In images have been added yet."
    );

    return;
  }


  if (players.length === 0) {
    setHostMessage(
      "No players have joined yet."
    );

    return;
  }


  const cleared =
    await clearGameAnswers(
      "zoom"
    );


  if (!cleared) {
    return;
  }


  const first =
    zoomQuestions[0];


  await updateGameState({
    game_mode: "zoom",
    status: "question",
    current_question:
      first.id,
    zoom_level: 1,
    round_number: 1
  });


  setHostMessage(
    "Zoomed In started! 🔍"
  );
}


// ======================================================
// ZOOM — ZOOM OUT
// ======================================================

async function zoomOut() {
  if (
    !gameState ||
    gameState.game_mode !== "zoom"
  ) {
    setHostMessage(
      "Start Zoomed In first."
    );

    return;
  }


  if (
    gameState.status === "result"
  ) {
    setHostMessage(
      "The answer has already been revealed."
    );

    return;
  }


  const current =
    Number(
      gameState.zoom_level || 1
    );


  if (current >= 4) {
    setHostMessage(
      "This is already the final zoom level."
    );

    return;
  }


  await updateGameState({
    zoom_level: current + 1
  });


  setHostMessage(
    `Zoom level ${current + 1}.`
  );
}


// ======================================================
// ZOOM — ANSWER MATCHING
// ======================================================

function zoomAnswerIsCorrect(
  submitted,
  correct
) {
  const userAnswer =
    normaliseAnswer(submitted);

  const acceptedAnswers =
    String(correct || "")
      .split("|")
      .map(normaliseAnswer)
      .filter(Boolean);


  if (!userAnswer) {
    return false;
  }


  return acceptedAnswers.some(
    accepted => {

      if (
        userAnswer === accepted
      ) {
        return true;
      }


      // Allows small variations
      // such as "airpod" vs "airpods"
      if (
        accepted.length >= 5 &&
        (
          userAnswer.includes(
            accepted
          ) ||
          accepted.includes(
            userAnswer
          )
        )
      ) {
        return true;
      }


      return false;
    }
  );
}


// ======================================================
// ZOOM — REVEAL / MARK
// ======================================================

async function revealZoomAnswers() {
  if (
    !gameState ||
    gameState.game_mode !== "zoom"
  ) {
    setHostMessage(
      "Zoomed In is not active."
    );

    return;
  }


  // Prevent double scoring
  if (
    gameState.status === "result"
  ) {
    setHostMessage(
      "This image has already been scored."
    );

    return;
  }


  const question =
    zoomQuestions.find(
      item =>
        Number(item.id) ===
        Number(
          gameState.current_question
        )
    );


  if (!question) {
    setHostMessage(
      "Could not find this Zoomed In image."
    );

    return;
  }


  const { data: answers, error } =
    await supabaseClient
      .from("answers")
      .select("*")
      .eq(
        "game_mode",
        "zoom"
      )
      .eq(
        "question_id",
        question.id
      );


  if (error) {
    console.error(error);

    setHostMessage(
      "Could not load Zoomed In answers."
    );

    return;
  }


  for (
    const answer of
    answers || []
  ) {
    // If already marked,
    // never award it again.
    if (
      answer.correct === true ||
      Number(answer.points) > 0
    ) {
      continue;
    }


    const correct =
      zoomAnswerIsCorrect(
        answer.answer,
        question.correct_answer
      );


    const points =
      correct
        ? Number(
            answer.points || 0
          )
        : 0;


    if (correct && points > 0) {
      const { data: player } =
        await supabaseClient
          .from("players")
          .select("score")
          .eq(
            "id",
            answer.player_id
          )
          .single();


      const newScore =
        Number(
          player?.score || 0
        ) + points;


      await supabaseClient
        .from("players")
        .update({
          score: newScore
        })
        .eq(
          "id",
          answer.player_id
        );
    }


    await supabaseClient
      .from("answers")
      .update({
        correct,
        points
      })
      .eq(
        "id",
        answer.id
      );
  }


  await updateGameState({
    status: "result"
  });


  await loadPlayers();


  setHostMessage(
    `Answer revealed: ${question.correct_answer}`
  );
}


// ======================================================
// ZOOM — NEXT IMAGE
// ======================================================

async function nextZoomImage() {
  if (
    !gameState ||
    gameState.game_mode !== "zoom"
  ) {
    setHostMessage(
      "Start Zoomed In first."
    );

    return;
  }


  const currentIndex =
    zoomQuestions.findIndex(
      question =>
        Number(question.id) ===
        Number(
          gameState.current_question
        )
    );


  const nextIndex =
    currentIndex + 1;


  if (
    nextIndex >=
    zoomQuestions.length
  ) {
    await showLeaderboard();

    setHostMessage(
      "All Zoomed In images complete — leaderboard time! 🏆"
    );

    return;
  }


  const nextQuestion =
    zoomQuestions[nextIndex];


  await updateGameState({
    game_mode: "zoom",
    status: "question",
    current_question:
      nextQuestion.id,
    zoom_level: 1,
    round_number:
      (gameState.round_number || 0) +
      1
  });


  setHostMessage(
    `Zoomed In image ${
      (gameState.round_number || 0)
    } is live.`
  );
}


// ======================================================
// SHOW LOBBY
// ======================================================

async function showLobby() {
  await updateGameState({
    game_mode: "lobby",
    status: "waiting",
    current_question: 0,
    round_number: 0,
    zoom_level: 1
  });


  setHostMessage(
    "Projector returned to lobby."
  );
}


// ======================================================
// SHOW LEADERBOARD
// ======================================================

async function showLeaderboard() {
  await updateGameState({
    game_mode: "leaderboard",
    status: "show"
  });


  setHostMessage(
    "Leaderboard is on the projector."
  );
}


// ======================================================
// SHOW WINNER
// ======================================================

async function showWinner() {
  await loadPlayers();


  if (players.length === 0) {
    setHostMessage(
      "There are no players."
    );

    return;
  }


  // If coming from Battle Royale,
  // the last alive player wins.
  const alive =
    players.filter(
      player => player.alive
    );


  if (
    gameState?.game_mode === "battle" &&
    alive.length === 1
  ) {
    await crownBattleWinner(
      alive[0]
    );

    return;
  }


  // Otherwise the highest score
  // wins Zoomed In.
  const sorted =
    [...players].sort(
      (a, b) =>
        (b.score || 0) -
        (a.score || 0)
    );


  const winner = sorted[0];


  await updateGameState({
    game_mode: "winner",
    status: "zoom_winner"
  });


  setHostMessage(
    `👑 ${winner.nickname} is the Zoomed In Champion!`
  );
}


// ======================================================
// REFRESH
// ======================================================

async function refreshHost() {
  await Promise.all([
    loadPlayers(),
    loadQuestions()
  ]);

  await loadGameState();

  setHostMessage(
    "Host dashboard refreshed."
  );
}


// ======================================================
// RESET EVERYTHING
// ======================================================

async function resetEverything() {
  const confirmed =
    window.confirm(
      "RESET EVERYTHING?\n\nThis removes all players and answers and returns the projector to the lobby."
    );

  if (!confirmed) return;


  setHostMessage(
    "Resetting everything..."
  );


  const answerDelete =
    await supabaseClient
      .from("answers")
      .delete()
      .neq("id", 0);


  if (answerDelete.error) {
    console.error(
      answerDelete.error
    );

    setHostMessage(
      "Could not delete answers. A Supabase DELETE policy may still need to be enabled."
    );

    return;
  }


  const playerDelete =
    await supabaseClient
      .from("players")
      .delete()
      .neq(
        "id",
        "00000000-0000-0000-0000-000000000000"
      );


  if (playerDelete.error) {
    console.error(
      playerDelete.error
    );

    setHostMessage(
      "Could not delete players. A Supabase DELETE policy may still need to be enabled."
    );

    return;
  }


  await updateGameState({
    game_mode: "lobby",
    status: "waiting",
    current_question: 0,
    zoom_level: 1,
    round_number: 0
  });


  players = [];

  renderPlayerList();
  updateHostDisplay();


  setHostMessage(
    "Everything reset. Ready for a fresh game! ✨"
  );
}


// ======================================================
// BUTTON CONNECTIONS
// ======================================================

function connectButton(
  id,
  handler
) {
  const button = byId(id);

  if (button) {
    button.addEventListener(
      "click",
      handler
    );
  }
}


connectButton(
  "startBattleButton",
  startBattle
);

connectButton(
  "nextBattleButton",
  nextBattleQuestion
);

connectButton(
  "revealBattleButton",
  revealBattleAnswers
);

connectButton(
  "redemptionButton",
  redemptionRound
);


connectButton(
  "startZoomButton",
  startZoom
);

connectButton(
  "zoomOutButton",
  zoomOut
);

connectButton(
  "revealZoomButton",
  revealZoomAnswers
);

connectButton(
  "nextZoomButton",
  nextZoomImage
);


connectButton(
  "showLobbyButton",
  showLobby
);

connectButton(
  "showLeaderboardButton",
  showLeaderboard
);

connectButton(
  "showWinnerButton",
  showWinner
);

connectButton(
  "refreshStatsButton",
  refreshHost
);


connectButton(
  "reviveAllButton",
  () =>
    reviveAllPlayers(true)
);

connectButton(
  "resetScoresButton",
  resetScores
);

connectButton(
  "resetEverythingButton",
  resetEverything
);


// ======================================================
// REALTIME
// ======================================================

function subscribeToRealtime() {
  supabaseClient
    .channel(
      "mgg-host-players"
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players"
      },
      async () => {
        await loadPlayers();
      }
    )
    .subscribe();


  supabaseClient
    .channel(
      "mgg-host-state"
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "game_state",
        filter: "id=eq.1"
      },
      payload => {
        gameState =
          payload.new;

        updateHostDisplay();
      }
    )
    .subscribe();
}


// ======================================================
// START HOST
// ======================================================

async function startHost() {
  setHostMessage(
    "Loading MGG control panel..."
  );


  await loadQuestions();
  await loadPlayers();
  await loadGameState();


  subscribeToRealtime();


  setHostMessage(
    "MGG control panel ready ✨"
  );
}


startHost();
