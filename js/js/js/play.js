let currentPlayer = null;
let currentState = null;

const joinScreen = document.getElementById("joinScreen");
const waitingScreen = document.getElementById("waitingScreen");
const battleScreen = document.getElementById("battleScreen");
const zoomScreen = document.getElementById("zoomScreen");

const nicknameInput = document.getElementById("nickname");
const joinButton = document.getElementById("joinButton");
const joinError = document.getElementById("joinError");


// -------------------------------------
// SCREEN CONTROL
// -------------------------------------

function showScreen(screen) {

  [
    joinScreen,
    waitingScreen,
    battleScreen,
    zoomScreen
  ].forEach(item => item.classList.add("hidden"));

  screen.classList.remove("hidden");
}


// -------------------------------------
// JOIN GAME
// -------------------------------------

joinButton.addEventListener("click", joinGame);

nicknameInput.addEventListener("keydown", event => {

  if (event.key === "Enter") {
    joinGame();
  }

});


async function joinGame() {

  const nickname = nicknameInput.value.trim();

  joinError.textContent = "";

  if (!nickname) {
    joinError.textContent = "Enter your name first.";
    return;
  }

  joinButton.disabled = true;
  joinButton.textContent = "JOINING...";

  const { data, error } = await supabaseClient
    .from("players")
    .insert({
      nickname: nickname,
      score: 0,
      alive: true,
      connected: true
    })
    .select()
    .single();

  if (error) {

    console.error(error);

    joinError.textContent =
      "Couldn't join. Please try again.";

    joinButton.disabled = false;
    joinButton.textContent = "JOIN GAME";

    return;
  }

  currentPlayer = data;

  localStorage.setItem(
    "mgg_player_id",
    currentPlayer.id
  );

  document.getElementById("playerName").textContent =
    currentPlayer.nickname.toUpperCase();

  showScreen(waitingScreen);

  await loadGameState();
  subscribeToGame();
  subscribeToPlayer();
}


// -------------------------------------
// RETURNING PLAYER
// -------------------------------------

async function restorePlayer() {

  const savedId =
    localStorage.getItem("mgg_player_id");

  if (!savedId) return;

  const { data, error } = await supabaseClient
    .from("players")
    .select("*")
    .eq("id", savedId)
    .maybeSingle();

  if (error || !data) {

    localStorage.removeItem("mgg_player_id");
    return;

  }

  currentPlayer = data;

  document.getElementById("playerName").textContent =
    currentPlayer.nickname.toUpperCase();

  showScreen(waitingScreen);

  await loadGameState();
  subscribeToGame();
  subscribeToPlayer();
}


// -------------------------------------
// GAME STATE
// -------------------------------------

async function loadGameState() {

  const { data, error } = await supabaseClient
    .from("game_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  currentState = data;

  handleGameState(data);
}


function subscribeToGame() {

  supabaseClient
    .channel("mgg-game-state")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "game_state",
        filter: "id=eq.1"
      },
      payload => {

        currentState = payload.new;

        handleGameState(payload.new);
      }
    )
    .subscribe();
}


// -------------------------------------
// PLAYER UPDATES
// -------------------------------------

function subscribeToPlayer() {

  if (!currentPlayer) return;

  supabaseClient
    .channel("player-" + currentPlayer.id)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "players",
        filter: `id=eq.${currentPlayer.id}`
      },
      payload => {

        currentPlayer = payload.new;

        updatePlayerUI();
      }
    )
    .subscribe();
}


function updatePlayerUI() {

  if (!currentPlayer) return;

  document.getElementById("playerScore").textContent =
    currentPlayer.score ?? 0;

  if (
    currentState &&
    currentState.game_mode === "battle" &&
    currentState.status === "result"
  ) {

    if (currentPlayer.alive) {

      showScreen(battleScreen);

      hideBattlePanels();

      document
        .getElementById("survivedScreen")
        .classList.remove("hidden");

    } else {

      showScreen(battleScreen);

      hideBattlePanels();

      document
        .getElementById("eliminatedScreen")
        .classList.remove("hidden");
    }
  }
}


// -------------------------------------
// HANDLE GAME
// -------------------------------------

async function handleGameState(state) {

  if (!currentPlayer) return;

  if (
    state.game_mode === "lobby" ||
    state.status === "waiting"
  ) {

    showScreen(waitingScreen);
    return;
  }


  if (state.game_mode === "battle") {

    showScreen(battleScreen);

    document.getElementById("battleRound").textContent =
      state.round_number || 1;

    await updateAliveCount();

    if (state.status === "question") {

      await loadBattleQuestion(
        state.current_question
      );

    } else if (state.status === "result") {

      updatePlayerUI();
    }

    return;
  }


  if (state.game_mode === "zoom") {

    showScreen(zoomScreen);

    document.getElementById("zoomRound").textContent =
      state.round_number || 1;

    document.getElementById("playerScore").textContent =
      currentPlayer.score || 0;

    updateZoomPoints(state.zoom_level);

  }
}


// -------------------------------------
// BATTLE ROYALE
// -------------------------------------

async function loadBattleQuestion(questionId) {

  hideBattlePanels();

  document
    .getElementById("battleContent")
    .classList.remove("hidden");

  const { data, error } = await supabaseClient
    .from("battle_questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (error) {

    console.error(error);

    document.getElementById("questionText").textContent =
      "Waiting for question...";

    return;
  }

  document.getElementById("questionText").textContent =
    data.question;

  const answers = [
    ["A", data.option_a],
    ["B", data.option_b],
    ["C", data.option_c],
    ["D", data.option_d]
  ];

  const grid =
    document.getElementById("answerGrid");

  grid.innerHTML = "";

  answers.forEach(([letter, text]) => {

    const button =
      document.createElement("button");

    button.className = "answer-button";

    button.innerHTML = `
      <span>${letter}</span>
      ${escapeHTML(text)}
    `;

    button.addEventListener(
      "click",
      () => submitBattleAnswer(
        questionId,
        letter
      )
    );

    grid.appendChild(button);
  });

  startLocalTimer(10);
}


async function submitBattleAnswer(
  questionId,
  answer
) {

  if (!currentPlayer) return;

  const buttons =
    document.querySelectorAll(".answer-button");

  buttons.forEach(button => {
    button.disabled = true;
  });

  const { error } = await supabaseClient
    .from("answers")
    .insert({
      player_id: currentPlayer.id,
      game_mode: "battle",
      question_id: questionId,
      answer: answer
    });

  if (error) {

    console.error(error);

    if (error.code !== "23505") {
      alert("Your answer couldn't be submitted.");
      buttons.forEach(button => {
        button.disabled = false;
      });
      return;
    }
  }

  hideBattlePanels();

  document
    .getElementById("answerLocked")
    .classList.remove("hidden");
}


async function updateAliveCount() {

  const { count, error } = await supabaseClient
    .from("players")
    .select("*", {
      count: "exact",
      head: true
    })
    .eq("alive", true);

  if (!error) {

    document.getElementById("aliveCount").textContent =
      count ?? 0;
  }
}


function hideBattlePanels() {

  [
    "battleContent",
    "answerLocked",
    "survivedScreen",
    "eliminatedScreen"
  ].forEach(id => {

    document
      .getElementById(id)
      .classList.add("hidden");
  });
}


// -------------------------------------
// TIMER
// -------------------------------------

let timerInterval = null;

function startLocalTimer(seconds) {

  clearInterval(timerInterval);

  const display =
    document.getElementById("timerNumber");

  let remaining = seconds;

  display.textContent = remaining;

  timerInterval = setInterval(() => {

    remaining -= 1;

    display.textContent =
      Math.max(remaining, 0);

    if (remaining <= 0) {

      clearInterval(timerInterval);

      document
        .querySelectorAll(".answer-button")
        .forEach(button => {
          button.disabled = true;
        });
    }

  }, 1000);
}


// -------------------------------------
// ZOOMED IN
// -------------------------------------

function updateZoomPoints(level) {

  const points = {
    1: 1000,
    2: 750,
    3: 500,
    4: 250
  };

  document.getElementById("zoomPoints").textContent =
    `${points[level] || 250} POINTS`;
}


document
  .getElementById("zoomSubmit")
  .addEventListener(
    "click",
    submitZoomAnswer
  );


async function submitZoomAnswer() {

  if (!currentPlayer || !currentState) return;

  const input =
    document.getElementById("zoomAnswer");

  const answer =
    input.value.trim();

  if (!answer) return;

  const points = {
    1: 1000,
    2: 750,
    3: 500,
    4: 250
  };

  const button =
    document.getElementById("zoomSubmit");

  button.disabled = true;
  input.disabled = true;

  const { error } = await supabaseClient
    .from("answers")
    .insert({
      player_id: currentPlayer.id,
      game_mode: "zoom",
      question_id: currentState.current_question,
      answer: answer,
      points:
        points[currentState.zoom_level] || 250
    });

  if (error) {

    console.error(error);

    if (error.code !== "23505") {

      button.disabled = false;
      input.disabled = false;

      alert("Your answer couldn't be submitted.");

      return;
    }
  }

  button.textContent = "ANSWER LOCKED ✓";
}


// -------------------------------------
// BASIC TEXT SAFETY
// -------------------------------------

function escapeHTML(value) {

  const div = document.createElement("div");

  div.textContent = value;

  return div.innerHTML;
}


// -------------------------------------
// START
// -------------------------------------

restorePlayer();
