let hostState = null;
let battleQuestions = [];
let zoomQuestions = [];


// ==========================================
// HELPERS
// ==========================================

function hostMessage(message) {
  const element =
    document.getElementById("hostMessage");

  if (element) {
    element.textContent = message;
  }
}


function escapeHTML(value) {
  const div = document.createElement("div");

  div.textContent =
    value == null ? "" : String(value);

  return div.innerHTML;
}


// ==========================================
// LOAD GAME STATE
// ==========================================

async function loadHostState() {

  const { data, error } =
    await supabaseClient
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single();

  if (error) {
    console.error(error);
    hostMessage("Could not load game state.");
    return;
  }

  hostState = data;

  updateHostStateDisplay();
}


// ==========================================
// UPDATE STATE DISPLAY
// ==========================================

function updateHostStateDisplay() {

  if (!hostState) return;

  const game =
    document.getElementById("hostCurrentGame");

  const round =
    document.getElementById("hostRound");

  if (game) {
    game.textContent =
      (hostState.game_mode || "lobby")
        .toUpperCase();
  }

  if (round) {
    round.textContent =
      hostState.round_number || 0;
  }

}


// ==========================================
// LOAD PLAYERS
// ==========================================

async function loadHostPlayers() {

  const { data, error } =
    await supabaseClient
      .from("players")
      .select("*")
      .order("joined_at", {
        ascending: true
      });

  if (error) {
    console.error(error);
    hostMessage("Could not load players.");
    return [];
  }

  const players = data || [];

  updateHostPlayerDisplay(players);

  return players;
}


// ==========================================
// PLAYER DISPLAY
// ==========================================

function updateHostPlayerDisplay(players) {

  const playerCount =
    document.getElementById("hostPlayerCount");

  const aliveCount =
    document.getElementById("hostAliveCount");

  const list =
    document.getElementById("hostPlayerList");


  const alive =
    players.filter(player => player.alive);


  if (playerCount) {
    playerCount.textContent =
      players.length;
  }

  if (aliveCount) {
    aliveCount.textContent =
      alive.length;
  }

  if (!list) return;


  if (players.length === 0) {
    list.innerHTML =
      "<p>No players yet.</p>";

    return;
  }


  list.innerHTML = "";


  players.forEach(player => {

    const row =
      document.createElement("div");

    row.className =
      "host-player-row";


    row.innerHTML = `
      <div>
        <strong>
          ${escapeHTML(player.nickname)}
        </strong>

        <span>
          ${
            player.alive
              ? "🔥 ALIVE"
              : "💀 ELIMINATED"
          }
        </span>
      </div>

      <strong>
        ${player.score || 0} pts
      </strong>
    `;


    list.appendChild(row);

  });

}


// ==========================================
// LOAD QUESTIONS
// ==========================================

async function loadQuestions() {

  const battleResult =
    await supabaseClient
      .from("battle_questions")
      .select("*")
      .order("id", {
        ascending: true
      });


  if (!battleResult.error) {
    battleQuestions =
      battleResult.data || [];
  }


  const zoomResult =
    await supabaseClient
      .from("zoom_questions")
      .select("*")
      .order("id", {
        ascending: true
      });


  if (!zoomResult.error) {
    zoomQuestions =
      zoomResult.data || [];
  }

}


// ==========================================
// UPDATE GAME STATE
// ==========================================

async function updateGameState(changes) {

  const { data, error } =
    await supabaseClient
      .from("game_state")
      .update({
        ...changes,
        updated_at:
          new Date().toISOString()
      })
      .eq("id", 1)
      .select()
      .single();


  if (error) {
    console.error(error);

    hostMessage(
      "Something went wrong updating the game."
    );

    return null;
  }


  hostState = data;

  updateHostStateDisplay();

  return data;
}


// ==========================================
// START BATTLE
// ==========================================

async function startBattle() {

  if (battleQuestions.length === 0) {
    hostMessage(
      "No Battle Royale questions have been added yet."
    );

    return;
  }


  await supabaseClient
    .from("players")
    .update({
      alive: true
    })
    .neq("id", "00000000-0000-0000-0000-000000000000");


  await updateGameState({
    game_mode: "battle",
    status: "question",
    current_question:
      battleQuestions[0].id,
    round_number: 1,
    zoom_level: 1
  });


  document.getElementById(
    "hostBattleQuestion"
  ).textContent =
    battleQuestions[0].question;


  await loadHostPlayers();


  hostMessage(
    "⚔️ Battle Royale started!"
  );

}


// ==========================================
// NEXT BATTLE QUESTION
// ==========================================

async function nextBattleQuestion() {

  if (
    !hostState ||
    hostState.game_mode !== "battle"
  ) {

    hostMessage(
      "Start Battle Royale first."
    );

    return;
  }


  const currentIndex =
    battleQuestions.findIndex(
      question =>
        question.id ===
        hostState.current_question
    );


  const nextIndex =
    currentIndex + 1;


  if (
    nextIndex >=
    battleQuestions.length
  ) {

    hostMessage(
      "That was the last Battle Royale question."
    );

    return;
  }


  const nextQuestion =
    battleQuestions[nextIndex];


  await updateGameState({
    status: "question",
    current_question:
      nextQuestion.id,
    round_number:
      (hostState.round_number || 0) + 1
  });


  document.getElementById(
    "hostBattleQuestion"
  ).textContent =
    nextQuestion.question;


  hostMessage(
    "Next Battle Royale question is live."
  );

}


// ==========================================
// MARK BATTLE ANSWERS
// ==========================================

async function revealBattleAnswers() {

  if (
    !hostState ||
    hostState.game_mode !== "battle"
  ) {

    hostMessage(
      "Battle Royale is not running."
    );

    return;
  }


  const question =
    battleQuestions.find(
      item =>
        item.id ===
        hostState.current_question
    );


  if (!question) {
    hostMessage(
      "Could not find this question."
    );

    return;
  }


  const { data: players } =
    await supabaseClient
      .from("players")
      .select("*")
      .eq("alive", true);


  const { data: answers } =
    await supabaseClient
      .from("answers")
      .select("*")
      .eq("game_mode", "battle")
      .eq(
        "question_id",
        hostState.current_question
      );


  const answerList =
    answers || [];


  for (const player of players || []) {

    const answer =
      answerList.find(
        item =>
          item.player_id ===
          player.id
      );


    const survived =
      answer &&
      String(answer.answer)
        .trim()
        .toUpperCase() ===
      String(question.correct_answer)
        .trim()
        .toUpperCase();


    if (!survived) {

      await supabaseClient
        .from("players")
        .update({
          alive: false
        })
        .eq("id", player.id);

    }

  }


  await updateGameState({
    status: "result"
  });


  await loadHostPlayers();


  hostMessage(
    `Answer revealed: ${question.correct_answer}`
  );

}


// ==========================================
// REDEMPTION
// ==========================================

async function redemptionRound() {

  const { error } =
    await supabaseClient
      .from("players")
      .update({
        alive: true
      })
      .eq("alive", false);


  if (error) {
    console.error(error);

    hostMessage(
      "Could not revive players."
    );

    return;
  }


  await loadHostPlayers();


  hostMessage(
    "✨ Redemption! Eliminated players are back."
  );

}


// ==========================================
// START ZOOMED IN
// ==========================================

async function startZoom() {

  if (zoomQuestions.length === 0) {

    hostMessage(
      "No Zoomed In images have been added yet."
    );

    return;
  }


  await updateGameState({
    game_mode: "zoom",
    status: "question",
    current_question:
      zoomQuestions[0].id,
    round_number: 1,
    zoom_level: 1
  });


  document.getElementById(
    "hostZoomQuestion"
  ).textContent =
    zoomQuestions[0].title;


  updateZoomHostPoints(1);


  hostMessage(
    "🔎 Zoomed In started!"
  );

}


// ==========================================
// ZOOM OUT
// ==========================================

async function zoomOut() {

  if (
    !hostState ||
    hostState.game_mode !== "zoom"
  ) {

    hostMessage(
      "Start Zoomed In first."
    );

    return;
  }


  const current =
    hostState.zoom_level || 1;


  if (current >= 4) {

    hostMessage(
      "This is already the final zoom level."
    );

    return;
  }


  const next =
    current + 1;


  await updateGameState({
    zoom_level: next
  });


  updateZoomHostPoints(next);


  hostMessage(
    `Zoom level ${next} shown.`
  );

}


// ==========================================
// ZOOM POINT DISPLAY
// ==========================================

function updateZoomHostPoints(level) {

  const points = {
    1: 1000,
    2: 750,
    3: 500,
    4: 250
  };


  const element =
    document.getElementById(
      "hostZoomPoints"
    );


  if (element) {

    element.textContent =
      `${points[level] || 250} POINTS`;

  }

}


// ==========================================
// MARK ZOOM ANSWERS
// ==========================================

async function revealZoomAnswers() {

  if (
    !hostState ||
    hostState.game_mode !== "zoom"
  ) {

    hostMessage(
      "Zoomed In is not running."
    );

    return;
  }


  const question =
    zoomQuestions.find(
      item =>
        item.id ===
        hostState.current_question
    );


  if (!question) {

    hostMessage(
      "Could not find this image."
    );

    return;
  }


  const { data: answers, error } =
    await supabaseClient
      .from("answers")
      .select("*")
      .eq("game_mode", "zoom")
      .eq(
        "question_id",
        hostState.current_question
      );


  if (error) {

    console.error(error);

    hostMessage(
      "Could not load answers."
    );

    return;
  }


  for (const answer of answers || []) {

    const correct =
      String(answer.answer)
        .trim()
        .toLowerCase() ===
      String(question.correct_answer)
        .trim()
        .toLowerCase();


    let awardedPoints = 0;


    if (correct) {

      awardedPoints =
        answer.points || 0;


      const { data: player } =
        await supabaseClient
          .from("players")
          .select("score")
          .eq(
            "id",
            answer.player_id
          )
          .single();


      if (player) {

        await supabaseClient
          .from("players")
          .update({
            score:
              (player.score || 0) +
              awardedPoints
          })
          .eq(
            "id",
            answer.player_id
          );

      }

    }


    await supabaseClient
      .from("answers")
      .update({
        correct: correct,
        points: awardedPoints
      })
      .eq("id", answer.id);

  }


  await updateGameState({
    status: "result"
  });


  await loadHostPlayers();


  hostMessage(
    `Correct answer: ${question.correct_answer}`
  );

}


// ==========================================
// NEXT ZOOM IMAGE
// ==========================================

async function nextZoomQuestion() {

  if (
    !hostState ||
    hostState.game_mode !== "zoom"
  ) {

    hostMessage(
      "Start Zoomed In first."
    );

    return;
  }


  const currentIndex =
    zoomQuestions.findIndex(
      question =>
        question.id ===
        hostState.current_question
    );


  const nextIndex =
    currentIndex + 1;


  if (
    nextIndex >=
    zoomQuestions.length
  ) {

    hostMessage(
      "That was the final Zoomed In image."
    );

    return;
  }


  const nextQuestion =
    zoomQuestions[nextIndex];


  await updateGameState({
    status: "question",
    current_question:
      nextQuestion.id,
    round_number:
      (hostState.round_number || 0) + 1,
    zoom_level: 1
  });


  document.getElementById(
    "hostZoomQuestion"
  ).textContent =
    nextQuestion.title;


  updateZoomHostPoints(1);


  hostMessage(
    "Next Zoomed In image is live."
  );

}


// ==========================================
// SHOW LOBBY
// ==========================================

async function showLobby() {

  await updateGameState({
    game_mode: "lobby",
    status: "waiting",
    current_question: 0,
    round_number: 0,
    zoom_level: 1
  });


  hostMessage(
    "Projector returned to lobby."
  );

}


// ==========================================
// SHOW LEADERBOARD
// ==========================================

async function showLeaderboard() {

  await updateGameState({
    game_mode: "leaderboard",
    status: "display"
  });


  hostMessage(
    "🏆 Leaderboard is on the projector."
  );

}


// ==========================================
// SHOW WINNER
// ==========================================

async function showWinner() {

  await updateGameState({
    game_mode: "winner",
    status: "display"
  });


  hostMessage(
    "👑 Winner screen launched!"
  );

}


// ==========================================
// REVIVE ALL
// ==========================================

async function reviveAllPlayers() {

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

    hostMessage(
      "Could not revive players."
    );

    return;
  }


  await loadHostPlayers();


  hostMessage(
    "All players revived."
  );

}


// ==========================================
// RESET SCORES
// ==========================================

async function resetScores() {

  const confirmed =
    confirm(
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

    hostMessage(
      "Could not reset scores."
    );

    return;
  }


  await loadHostPlayers();


  hostMessage(
    "Scores reset to 0."
  );

}


// ==========================================
// RESET EVERYTHING
// ==========================================

async function resetEverything() {

  const confirmed =
    confirm(
      "Reset the entire carnival game? This will delete all players and answers."
    );


  if (!confirmed) return;


  const answerDelete =
    await supabaseClient
      .from("answers")
      .delete()
      .neq("id", 0);


  if (answerDelete.error) {
    console.error(
      answerDelete.error
    );
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

    hostMessage(
      "Could not delete players."
    );

    return;
  }


  await updateGameState({
    game_mode: "lobby",
    status: "waiting",
    current_question: 0,
    round_number: 0,
    zoom_level: 1
  });


  await loadHostPlayers();


  hostMessage(
    "Everything reset. Ready for a new game."
  );

}


// ==========================================
// BUTTONS
// ==========================================

function connectHostButtons() {

  document
    .getElementById("startBattleButton")
    .addEventListener(
      "click",
      startBattle
    );


  document
    .getElementById("nextBattleButton")
    .addEventListener(
      "click",
      nextBattleQuestion
    );


  document
    .getElementById("revealBattleButton")
    .addEventListener(
      "click",
      revealBattleAnswers
    );


  document
    .getElementById("redemptionButton")
    .addEventListener(
      "click",
      redemptionRound
    );


  document
    .getElementById("startZoomButton")
    .addEventListener(
      "click",
      startZoom
    );


  document
    .getElementById("zoomOutButton")
    .addEventListener(
      "click",
      zoomOut
    );


  document
    .getElementById("revealZoomButton")
    .addEventListener(
      "click",
      revealZoomAnswers
    );


  document
    .getElementById("nextZoomButton")
    .addEventListener(
      "click",
      nextZoomQuestion
    );


  document
    .getElementById("showLobbyButton")
    .addEventListener(
      "click",
      showLobby
    );


  document
    .getElementById("showLeaderboardButton")
    .addEventListener(
      "click",
      showLeaderboard
    );


  document
    .getElementById("showWinnerButton")
    .addEventListener(
      "click",
      showWinner
    );


  document
    .getElementById("refreshStatsButton")
    .addEventListener(
      "click",
      async () => {
        await loadHostPlayers();
        await loadHostState();

        hostMessage(
          "Stats refreshed."
        );
      }
    );


  document
    .getElementById("resetBattleButton")
    .addEventListener(
      "click",
      reviveAllPlayers
    );


  document
    .getElementById("resetScoresButton")
    .addEventListener(
      "click",
      resetScores
    );


  document
    .getElementById("resetGameButton")
    .addEventListener(
      "click",
      resetEverything
    );

}


// ==========================================
// REALTIME
// ==========================================

function subscribeHost() {

  supabaseClient
    .channel("mgg-host-players")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players"
      },

      async () => {
        await loadHostPlayers();
      }
    )
    .subscribe();


  supabaseClient
    .channel("mgg-host-state")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "game_state",
        filter: "id=eq.1"
      },

      payload => {
        hostState = payload.new;
        updateHostStateDisplay();
      }
    )
    .subscribe();

}


// ==========================================
// START HOST
// ==========================================

async function startHost() {

  connectHostButtons();

  await loadQuestions();

  await loadHostState();

  await loadHostPlayers();

  subscribeHost();

  hostMessage(
    "Host controls ready."
  );

}


startHost();
