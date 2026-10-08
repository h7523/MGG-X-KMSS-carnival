let projectorState = null;
let projectorTimerInterval = null;

const PLAY_URL =
  "https://mgg-carnival.vercel.app/play.html";


// ==========================================
// PROJECTOR SCREENS
// ==========================================

const projectorLobby =
  document.getElementById("projectorLobby");

const projectorBattle =
  document.getElementById("projectorBattle");

const projectorZoom =
  document.getElementById("projectorZoom");

const projectorLeaderboard =
  document.getElementById("projectorLeaderboard");

const projectorWinner =
  document.getElementById("projectorWinner");


function showProjectorScreen(screen) {

  [
    projectorLobby,
    projectorBattle,
    projectorZoom,
    projectorLeaderboard,
    projectorWinner
  ].forEach(item => {

    if (item) {
      item.classList.add("hidden");
    }

  });

  if (screen) {
    screen.classList.remove("hidden");
  }

}


// ==========================================
// QR CODE
// ==========================================

function createQRCode() {

  const qrContainer =
    document.getElementById("qrCode");

  if (!qrContainer) return;

  qrContainer.innerHTML = "";

  new QRCode(qrContainer, {
    text: PLAY_URL,
    width: 210,
    height: 210,
    correctLevel: QRCode.CorrectLevel.H
  });

}


// ==========================================
// LOAD PLAYERS
// ==========================================

async function loadPlayers() {

  const { data, error } =
    await supabaseClient
      .from("players")
      .select("*")
      .order("joined_at", {
        ascending: true
      });

  if (error) {

    console.error(
      "Could not load players:",
      error
    );

    return [];
  }

  updateLobbyPlayers(data || []);

  return data || [];

}


// ==========================================
// UPDATE LOBBY
// ==========================================

function updateLobbyPlayers(players) {

  const count =
    document.getElementById(
      "projectorPlayerCount"
    );

  const names =
    document.getElementById(
      "projectorPlayerNames"
    );

  if (count) {
    count.textContent = players.length;
  }

  if (!names) return;

  names.innerHTML = "";

  if (players.length === 0) {

    names.innerHTML = `
      <span class="waiting-player-text">
        Waiting for players...
      </span>
    `;

    return;
  }

  players.forEach(player => {

    const chip =
      document.createElement("span");

    chip.className =
      "projector-player-chip";

    chip.textContent =
      player.nickname;

    names.appendChild(chip);

  });

}


// ==========================================
// LOAD GAME STATE
// ==========================================

async function loadProjectorState() {

  const { data, error } =
    await supabaseClient
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single();

  if (error) {

    console.error(
      "Could not load game state:",
      error
    );

    return;
  }

  projectorState = data;

  await handleProjectorState(data);

}


// ==========================================
// HANDLE GAME STATE
// ==========================================

async function handleProjectorState(state) {

  if (!state) return;


  // ------------------------------
  // LOBBY
  // ------------------------------

  if (
    state.game_mode === "lobby" ||
    state.status === "waiting"
  ) {

    showProjectorScreen(
      projectorLobby
    );

    await loadPlayers();

    return;
  }


  // ------------------------------
  // BATTLE ROYALE
  // ------------------------------

  if (
    state.game_mode === "battle"
  ) {

    showProjectorScreen(
      projectorBattle
    );

    const round =
      document.getElementById(
        "projectorBattleRound"
      );

    if (round) {
      round.textContent =
        state.round_number || 1;
    }

    await updateBattleStats();


    if (
      state.status === "question"
    ) {

      await loadBattleQuestion(
        state.current_question
      );

    }

    return;
  }


  // ------------------------------
  // ZOOMED IN
  // ------------------------------

  if (
    state.game_mode === "zoom"
  ) {

    showProjectorScreen(
      projectorZoom
    );

    const round =
      document.getElementById(
        "projectorZoomRound"
      );

    if (round) {
      round.textContent =
        state.round_number || 1;
    }

    await loadZoomQuestion(
      state.current_question,
      state.zoom_level
    );

    return;
  }


  // ------------------------------
  // LEADERBOARD
  // ------------------------------

  if (
    state.game_mode === "leaderboard"
  ) {

    showProjectorScreen(
      projectorLeaderboard
    );

    await loadLeaderboard();

    return;
  }


  // ------------------------------
  // WINNER
  // ------------------------------

  if (
    state.game_mode === "winner"
  ) {

    showProjectorScreen(
      projectorWinner
    );

    await showWinner();

  }

}


// ==========================================
// BATTLE STATS
// ==========================================

async function updateBattleStats() {

  const { data, error } =
    await supabaseClient
      .from("players")
      .select("id, alive");

  if (error) {

    console.error(
      "Battle stats error:",
      error
    );

    return;
  }

  const players = data || [];

  const alive =
    players.filter(
      player => player.alive
    ).length;

  const eliminated =
    players.length - alive;


  const aliveElement =
    document.getElementById(
      "projectorAliveCount"
    );

  const eliminatedElement =
    document.getElementById(
      "projectorEliminatedCount"
    );


  if (aliveElement) {
    aliveElement.textContent = alive;
  }

  if (eliminatedElement) {
    eliminatedElement.textContent =
      eliminated;
  }

}


// ==========================================
// BATTLE QUESTION
// ==========================================

async function loadBattleQuestion(
  questionId
) {

  if (!questionId) return;


  const { data, error } =
    await supabaseClient
      .from("battle_questions")
      .select(
        "id, question, option_a, option_b, option_c, option_d"
      )
      .eq("id", questionId)
      .single();


  if (error || !data) {

    console.error(
      "Battle question error:",
      error
    );

    return;
  }


  const question =
    document.getElementById(
      "projectorQuestion"
    );

  if (question) {
    question.textContent =
      data.question;
  }


  const answers =
    document.getElementById(
      "projectorAnswers"
    );

  if (!answers) return;


  answers.innerHTML = "";


  const options = [

    ["A", data.option_a],

    ["B", data.option_b],

    ["C", data.option_c],

    ["D", data.option_d]

  ];


  options.forEach(
    ([letter, text]) => {

      const card =
        document.createElement("div");

      card.className =
        "projector-answer-card";

      card.innerHTML = `
        <span>${letter}</span>
        <strong>${escapeHTML(text)}</strong>
      `;

      answers.appendChild(card);

    }
  );


  startProjectorTimer(10);

}


// ==========================================
// PROJECTOR TIMER
// ==========================================

function startProjectorTimer(seconds) {

  clearInterval(
    projectorTimerInterval
  );


  const timer =
    document.getElementById(
      "projectorTimer"
    );


  if (!timer) return;


  let remaining = seconds;

  timer.textContent =
    remaining;


  projectorTimerInterval =
    setInterval(() => {

      remaining -= 1;

      timer.textContent =
        Math.max(remaining, 0);


      if (remaining <= 0) {

        clearInterval(
          projectorTimerInterval
        );

      }

    }, 1000);

}


// ==========================================
// ZOOM QUESTION
// ==========================================

async function loadZoomQuestion(
  questionId,
  zoomLevel
) {

  if (!questionId) return;


  const { data, error } =
    await supabaseClient
      .from("zoom_questions")
      .select("id, title, image_url")
      .eq("id", questionId)
      .single();


  if (error || !data) {

    console.error(
      "Zoom question error:",
      error
    );

    return;
  }


  const image =
    document.getElementById(
      "projectorZoomImage"
    );


  if (image) {

    image.src =
      data.image_url;

    image.alt =
      data.title || "Zoom challenge";

    image.style.transform =
      `scale(${getZoomScale(zoomLevel)})`;

  }


  const points = {

    1: 1000,

    2: 750,

    3: 500,

    4: 250

  };


  const pointElement =
    document.getElementById(
      "projectorZoomPoints"
    );


  if (pointElement) {

    pointElement.textContent =
      points[zoomLevel] || 250;

  }


  const stage =
    document.getElementById(
      "projectorZoomStage"
    );


  const stageNames = {

    1: "EXTREME ZOOM",

    2: "ZOOMING OUT...",

    3: "GETTING EASIER...",

    4: "FINAL VIEW"

  };


  if (stage) {

    stage.textContent =
      stageNames[zoomLevel] ||
      "FINAL VIEW";

  }

}


// ==========================================
// ZOOM SCALE
// ==========================================

function getZoomScale(level) {

  const scales = {

    1: 5,

    2: 3.5,

    3: 2,

    4: 1

  };


  return scales[level] || 1;

}


// ==========================================
// LEADERBOARD
// ==========================================

async function loadLeaderboard() {

  const { data, error } =
    await supabaseClient
      .from("players")
      .select("*")
      .order("score", {
        ascending: false
      })
      .limit(5);


  if (error) {

    console.error(
      "Leaderboard error:",
      error
    );

    return;
  }


  const list =
    document.getElementById(
      "leaderboardList"
    );


  if (!list) return;


  list.innerHTML = "";


  const players =
    data || [];


  if (players.length === 0) {

    list.innerHTML = `
      <p class="waiting-player-text">
        No scores yet.
      </p>
    `;

    return;
  }


  players.forEach(
    (player, index) => {

      const row =
        document.createElement("div");

      row.className =
        "leaderboard-row";


      const medal =
        index === 0
          ? "👑"
          : index + 1;


      row.innerHTML = `
        <span class="leaderboard-position">
          ${medal}
        </span>

        <strong>
          ${escapeHTML(player.nickname)}
        </strong>

        <span class="leaderboard-score">
          ${player.score || 0}
        </span>
      `;


      list.appendChild(row);

    }
  );

}


// ==========================================
// WINNER
// ==========================================

async function showWinner() {

  const { data, error } =
    await supabaseClient
      .from("players")
      .select("*")
      .order("score", {
        ascending: false
      })
      .limit(1)
      .maybeSingle();


  if (error || !data) {

    console.error(
      "Winner error:",
      error
    );

    return;
  }


  const winner =
    document.getElementById(
      "winnerName"
    );


  if (winner) {

    winner.textContent =
      data.nickname.toUpperCase();

  }


  launchConfetti();

}


// ==========================================
// CONFETTI
// ==========================================

function launchConfetti() {

  if (
    typeof confetti !== "function"
  ) {
    return;
  }


  confetti({
    particleCount: 180,
    spread: 100,
    origin: {
      y: 0.6
    }
  });


  setTimeout(() => {

    confetti({
      particleCount: 120,
      spread: 130,
      origin: {
        x: 0.2,
        y: 0.7
      }
    });

  }, 450);


  setTimeout(() => {

    confetti({
      particleCount: 120,
      spread: 130,
      origin: {
        x: 0.8,
        y: 0.7
      }
    });

  }, 850);

}


// ==========================================
// REALTIME — GAME STATE
// ==========================================

function subscribeToProjectorState() {

  supabaseClient
    .channel(
      "mgg-projector-state"
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "game_state",
        filter: "id=eq.1"
      },

      async payload => {

        projectorState =
          payload.new;

        await handleProjectorState(
          payload.new
        );

      }
    )
    .subscribe();

}


// ==========================================
// REALTIME — PLAYERS
// ==========================================

function subscribeToProjectorPlayers() {

  supabaseClient
    .channel(
      "mgg-projector-players"
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players"
      },

      async () => {

        const players =
          await loadPlayers();


        if (
          projectorState &&
          projectorState.game_mode ===
            "battle"
        ) {

          await updateBattleStats();

        }


        if (
          projectorState &&
          projectorState.game_mode ===
            "leaderboard"
        ) {

          updateLobbyPlayers(
            players
          );

          await loadLeaderboard();

        }

      }
    )
    .subscribe();

}


// ==========================================
// SAFETY — TEXT FROM DATABASE
// ==========================================

function escapeHTML(value) {

  const div =
    document.createElement("div");

  div.textContent =
    value == null
      ? ""
      : String(value);

  return div.innerHTML;

}


// ==========================================
// START PROJECTOR
// ==========================================

async function startProjector() {

  createQRCode();

  await loadPlayers();

  await loadProjectorState();

  subscribeToProjectorState();

  subscribeToProjectorPlayers();

}


startProjector();
