import { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Trophy,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  RotateCw,
  ChevronsDown,
} from "lucide-react";
import { api, type User } from "../types";
import {
  type Game,
  runnerSpeed,
  runnerGap,
  obstacle,
  hits,
  JUMP_SPEED,
  GRAVITY,
  type Obstacle,
  emptyBoard,
  bag,
  spawn,
  fits,
  turn,
  lock,
  linePoints,
  dropInterval,
  type Piece,
} from "./logic";
type Ranking = {
  top: { userId: string; name: string; score: number; rank: number }[];
  personalBest: number;
  rank: number | null;
};
function useRound(game: Game) {
  const [round, setRound] = useState(0),
    [phase, setPhase] = useState<"ready" | "starting" | "playing" | "over">(
      "ready",
    ),
    [paused, setPaused] = useState(false),
    [score, setScore] = useState(0),
    [ranking, setRanking] = useState<Ranking | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const run = useRef(""),
    pausedRef = useRef(false);
  pausedRef.current = paused;
  useEffect(() => {
    const pause = () => {
        if (document.hidden) setPaused(true);
      },
      blur = () => setPaused(true);
    document.addEventListener("visibilitychange", pause);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("visibilitychange", pause);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const start = async () => {
    setPhase("starting");
    setError("");
    setRanking(null);
    try {
      run.current = (await api("/games/" + game + "/start", "POST")).runId;
      setScore(0);
      setPaused(false);
      pausedRef.current = false;
      setRound((r) => r + 1);
      setPhase("playing");
    } catch (e: any) {
      setError(e.message);
      setPhase("ready");
    }
  };
  const save = async (points: number) => {
    setSaving(true);
    setError("");
    try {
      setRanking(
        await api("/games/" + game + "/finish", "POST", {
          runId: run.current,
          score: points,
        }),
      );
    } catch (e: any) {
      try {
        const board = await api("/games/" + game + "/leaderboard");
        setRanking(board);
        if (board.personalBest < points)
          setError("Score nog niet opgeslagen: " + e.message);
      } catch {
        setError("De score kon niet worden opgeslagen. Probeer opnieuw.");
      }
    } finally {
      setSaving(false);
    }
  };
  const end = (points: number) => {
    setScore(points);
    setPhase("over");
    void save(points);
  };
  return {
    round,
    phase,
    paused,
    pausedRef,
    setPaused,
    score,
    ranking,
    saving,
    error,
    start,
    end,
    retry: () => save(score),
  };
}
function Results({
  state,
  user,
}: {
  state: ReturnType<typeof useRound>;
  user: User;
}) {
  return (
    <div className="arcade-results" aria-live="polite">
      <h3>
        <Trophy size={18} />
        Score: {state.score.toLocaleString("nl-NL")}
      </h3>
      {state.saving && (
        <p className="muted">Score opslaan en rivalen zoeken…</p>
      )}
      {state.ranking && (
        <>
          <div className="leaderboard-title">
            <strong>De top 3 van het team</strong>
            <small>Beste score per speler</small>
          </div>
          <ol className="leaderboard">
            {state.ranking.top.map((p) => (
              <li key={p.userId} className={p.userId === user.id ? "you" : ""}>
                <span className="medal">{["🥇", "🥈", "🥉"][p.rank - 1]}</span>
                <strong>
                  {p.name}
                  {p.userId === user.id ? " (jij)" : ""}
                </strong>
                <b>{p.score.toLocaleString("nl-NL")}</b>
              </li>
            ))}
          </ol>
          <p className="personal-record">
            Jouw record:{" "}
            <strong>
              {state.ranking.personalBest.toLocaleString("nl-NL")}
            </strong>
            {state.ranking.rank && ` · plaats ${state.ranking.rank}`}
          </p>
          {state.ranking.top[0] && state.ranking.top[0].userId !== user.id && (
            <p className="muted">
              {state.ranking.top[0].name} staat bovenaan. Nog een poging?
            </p>
          )}
        </>
      )}
      {state.error && (
        <div className="error">
          {state.error}
          <button onClick={() => void state.retry()}>Opnieuw opslaan</button>
        </div>
      )}
      <button
        className="primary"
        onClick={() => void state.start()}
        disabled={state.saving}
      >
        <RotateCcw size={16} />
        Nog een ronde
      </button>
    </div>
  );
}
export function Arcade({ game, user }: { game: Game; user: User }) {
  return game === "runner" ? <Runner user={user} /> : <Tetris user={user} />;
}
function Runner({ user }: { user: User }) {
  const state = useRound("runner"),
    canvas = useRef<HTMLCanvasElement>(null),
    jump = useRef(() => {});
  useEffect(() => {
    if (!state.round) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let y = 0,
      velocity = 0,
      elapsed = 0,
      frame = 0,
      last = 0,
      ended = false,
      acc = 0,
      raf = 0;
    let obs: Obstacle[] = [obstacle(690, 0.2)];
    jump.current = () => {
      if (!ended && !state.pausedRef.current && y === 0) velocity = JUMP_SPEED;
    };
    const key = (e: KeyboardEvent) => {
      if (ended) return;
      if (["Space", "ArrowUp", "KeyP"].includes(e.code)) {
        e.preventDefault();
        if (e.code === "KeyP") {
          if (!e.repeat) state.setPaused((p) => !p);
        } else if (!e.repeat) jump.current();
      }
    };
    document.addEventListener("keydown", key);
    const draw = (time: number) => {
      const dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
      last = time;
      if (!state.pausedRef.current && !ended) {
        acc += dt;
        while (acc >= 1 / 120 && !ended) {
          const step = 1 / 120;
          acc -= step;
          elapsed += step;
          frame += step * 60;
          const speed = runnerSpeed(Math.floor(elapsed * 10));
          velocity -= GRAVITY * step;
          y = Math.max(0, y + velocity * step);
          if (!y) velocity = 0;
          obs.forEach((o) => (o.x -= speed * step));
          obs = obs.filter((o) => o.x + o.width > 0);
          if (!obs.length || obs[obs.length - 1].x < 640 - runnerGap(speed)) {
            const previous = obs[obs.length - 1];
            obs.push(
              obstacle(
                Math.max(
                  680,
                  previous
                    ? previous.x + previous.width + runnerGap(speed)
                    : 680,
                ),
              ),
            );
          }
          if (obs.some((o) => hits(o, y))) {
            ended = true;
            state.end(Math.floor(elapsed * 10));
          }
        }
      } else acc = 0;
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(0, 0, 640, 240);
      ctx.fillStyle = "#343741";
      ctx.font = "12px monospace";
      ctx.fillText("YA RUNNER", 20, 25);
      ctx.fillText(String(Math.floor(elapsed * 10)).padStart(5, "0"), 548, 25);
      ctx.font = "10px monospace";
      ctx.fillText(
        "SNELHEID " +
          (runnerSpeed(Math.floor(elapsed * 10)) / 260).toFixed(1) +
          "×",
        20,
        44,
      );
      const ground = 200;
      ctx.fillRect(0, ground, 640, 1);
      for (let i = 0; i < 8; i++)
        ctx.fillRect(
          (i * 91 - elapsed * runnerSpeed(Math.floor(elapsed * 10)) * 0.4) %
            720,
          ground + 12,
          7,
          1,
        );
      ctx.fillRect(73, ground - 36 - y, 24, 33);
      ctx.fillRect(87, ground - 46 - y, 22, 18);
      ctx.clearRect(102, ground - 42 - y, 3, 3);
      ctx.fillRect(62, ground - 29 - y, 13, 8);
      ctx.fillRect(76 + (Math.floor(frame / 7) % 2) * 13, ground - 4 - y, 5, 6);
      obs.forEach((o) => {
        const top = ground - o.bottom - o.height;
        if (o.kind === "bird") {
          ctx.fillRect(o.x + 7, top + 7, 18, 7);
          ctx.fillRect(o.x + 23, top + 4, 7, 7);
          ctx.fillRect(o.x, top + (Math.floor(frame / 9) % 2 ? 0 : 13), 17, 5);
        } else {
          const cactus = (x: number, h: number) => {
            ctx.fillRect(x + 7, ground - h, 9, h);
            ctx.fillRect(x, ground - h + 11, 7, 6);
            ctx.fillRect(x, ground - h + 4, 4, 13);
            ctx.fillRect(x + 16, ground - h + 8, 6, 5);
            ctx.fillRect(x + 19, ground - h + 2, 3, 11);
          };
          cactus(o.x, o.height);
          if (o.kind === "double") cactus(o.x + 24, o.height - 7);
        }
      });
      if (state.pausedRef.current && !ended) {
        ctx.fillStyle = "#fafafae8";
        ctx.fillRect(0, 65, 640, 110);
        ctx.fillStyle = "#606879";
        ctx.font = "18px monospace";
        ctx.textAlign = "center";
        ctx.fillText("PAUZE", 320, 120);
        ctx.textAlign = "left";
      }
      if (!ended) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", key);
      jump.current = () => {};
    };
  }, [state.round]);
  return (
    <div className="arcade">
      <p className="arcade-intro">
        Een kleine omweg. Een grote onderlinge strijd.
      </p>
      <canvas
        ref={canvas}
        width={640}
        height={240}
        className="runner-canvas"
        onPointerDown={() => jump.current()}
        aria-label="Runner. Spring over cactussen en lage vogels. Loop onder hoge vogels door."
      />
      {state.phase === "ready" && (
        <div className="game-start">
          <p>
            Enkele cactussen, dubbele cactussen en vogels.
            <br />
            Hoe verder je komt, hoe sneller je loopt.
          </p>
          <button className="primary" onClick={() => void state.start()}>
            <Play size={16} />
            Start de runner
          </button>
        </div>
      )}
      {state.phase === "starting" && <p>Even klaarmaken…</p>}
      {state.phase === "playing" && (
        <div className="game-controls">
          <button onClick={() => jump.current()}>↑ Spring</button>
          <button onClick={() => state.setPaused((p) => !p)}>
            {state.paused ? <Play size={15} /> : <Pause size={15} />}{" "}
            {state.paused ? "Verder" : "Pauze"}
          </button>
        </div>
      )}
      <p className="muted">
        Spatie / ↑ / tik = springen · P = pauze · hoge vogels: blijf op de grond
      </p>
      {state.phase === "over" && <Results state={state} user={user} />}{" "}
      {state.error && state.phase !== "over" && (
        <p className="error">{state.error}</p>
      )}
    </div>
  );
}
const COLORS = [
  "#f7f8fc",
  "#7eadd1",
  "#d2ad65",
  "#9a89cb",
  "#83b8a6",
  "#d58e99",
  "#8e9dcc",
  "#c8916a",
];
function Tetris({ user }: { user: User }) {
  const state = useRound("tetris"),
    canvas = useRef<HTMLCanvasElement>(null),
    action = useRef<(key: string) => void>(() => {}),
    [stats, setStats] = useState({ score: 0, lines: 0, level: 0 });
  useEffect(() => {
    if (!state.round) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let board = emptyBoard(),
      queue: number[] = [],
      piece: Piece,
      points = 0,
      lines = 0,
      level = 0,
      ended = false,
      raf = 0,
      last = 0,
      elapsed = 0;
    const next = () => {
      if (queue.length < 7) queue.push(...bag());
      return queue.shift()!;
    };
    piece = spawn(next());
    setStats({ score: 0, lines: 0, level: 0 });
    const update = () => setStats({ score: points, lines, level });
    const settle = () => {
      const result = lock(board, piece);
      board = result.board;
      points += linePoints(result.lines, level);
      lines += result.lines;
      level = Math.floor(lines / 10);
      piece = spawn(next());
      elapsed = 0;
      update();
      if (!fits(board, piece)) {
        ended = true;
        state.end(points);
      }
    };
    const drop = (soft = false) => {
      const p = { ...piece, y: piece.y + 1 };
      if (fits(board, p)) {
        piece = p;
        if (soft) {
          points++;
          update();
        }
      } else settle();
    };
    const cell = (x: number, y: number, color: number, ghost = false) => {
      ctx.globalAlpha = ghost ? 0.17 : 1;
      ctx.fillStyle = COLORS[color];
      ctx.fillRect(x * 24 + 1, y * 24 + 1, 22, 22);
      if (!ghost) {
        ctx.fillStyle = "#ffffff44";
        ctx.fillRect(x * 24 + 2, y * 24 + 2, 20, 3);
      }
      ctx.globalAlpha = 1;
    };
    const draw = () => {
      ctx.fillStyle = "#f7f8fc";
      ctx.fillRect(0, 0, 360, 480);
      for (let y = 0; y < 20; y++)
        for (let x = 0; x < 10; x++) {
          ctx.strokeStyle = "#e9ecf4";
          ctx.strokeRect(x * 24, y * 24, 24, 24);
          if (board[y][x]) cell(x, y, board[y][x]);
        }
      if (!ended) {
        let ghost = { ...piece };
        while (fits(board, { ...ghost, y: ghost.y + 1 })) ghost.y++;
        ghost.shape.forEach((r, y) =>
          r.forEach((v, x) => {
            if (v) cell(ghost.x + x, ghost.y + y, ghost.color, true);
          }),
        );
        piece.shape.forEach((r, y) =>
          r.forEach((v, x) => {
            if (v) cell(piece.x + x, piece.y + y, piece.color);
          }),
        );
      }
      ctx.fillStyle = "#818a9d";
      ctx.font = "11px monospace";
      ctx.fillText("VOLGENDE", 257, 24);
      const upcoming = spawn(queue[0]);
      upcoming.shape.forEach((r, y) =>
        r.forEach((v, x) => {
          if (v) {
            ctx.fillStyle = COLORS[upcoming.color];
            ctx.fillRect(257 + x * 20, 42 + y * 20, 18, 18);
          }
        }),
      );
      ctx.fillStyle = "#818a9d";
      ctx.fillText("LEVEL", 257, 150);
      ctx.fillText(String(level + 1), 257, 174);
      ctx.fillText("LIJNEN", 257, 225);
      ctx.fillText(String(lines), 257, 249);
      if (state.pausedRef.current && !ended) {
        ctx.fillStyle = "#f7f8fceb";
        ctx.fillRect(0, 170, 240, 110);
        ctx.fillStyle = "#626c82";
        ctx.font = "18px monospace";
        ctx.fillText("PAUZE", 86, 230);
      }
    };
    action.current = (key: string) => {
      if (ended || state.pausedRef.current) return;
      if (key === "left" || key === "right") {
        const p = { ...piece, x: piece.x + (key === "left" ? -1 : 1) };
        if (fits(board, p)) piece = p;
      } else if (key === "rotate") piece = turn(board, piece);
      else if (key === "down") drop(true);
      else if (key === "hard") {
        let count = 0;
        while (fits(board, { ...piece, y: piece.y + 1 })) {
          piece.y++;
          count++;
        }
        points += count * 2;
        settle();
      }
      draw();
    };
    const handler = (e: KeyboardEvent) => {
      if (ended) return;
      const map: Record<string, string> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "rotate",
        KeyX: "rotate",
        ArrowDown: "down",
        Space: "hard",
      };
      if (e.code === "KeyP") {
        e.preventDefault();
        if (!e.repeat) state.setPaused((p) => !p);
      } else if (map[e.code]) {
        e.preventDefault();
        if (
          !e.repeat ||
          ["ArrowLeft", "ArrowRight", "ArrowDown"].includes(e.code)
        )
          action.current(map[e.code]);
      }
    };
    document.addEventListener("keydown", handler);
    const loop = (time: number) => {
      const dt = last ? Math.min(time - last, 100) : 0;
      last = time;
      if (!state.pausedRef.current && !ended) {
        elapsed += dt;
        if (elapsed >= dropInterval(level)) {
          elapsed = 0;
          drop();
        }
      }
      draw();
      if (!ended) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handler);
      action.current = () => {};
    };
  }, [state.round]);
  return (
    <div className="arcade">
      <p className="arcade-intro">
        Een verborgen plek waar alles op zijn plek valt.
      </p>
      <div className="tetris-layout">
        <div>
          <canvas
            className="tetris-canvas"
            ref={canvas}
            width={360}
            height={480}
            aria-label="Tetris speelveld van 10 bij 20. Pijltjes bewegen en draaien, spatie laat vallen."
          />
          {state.phase === "ready" && (
            <button className="primary full" onClick={() => void state.start()}>
              <Play size={16} />
              Start Tetris
            </button>
          )}
        </div>
        <div className="tetris-sidebar">
          <div className="game-stat">
            <small>SCORE</small>
            <strong>{stats.score.toLocaleString("nl-NL")}</strong>
          </div>
          <div className="game-stat">
            <small>LEVEL</small>
            <strong>{stats.level + 1}</strong>
          </div>
          <p>
            Maak volle horizontale lijnen. Elke 10 lijnen ga je een level
            omhoog.
          </p>
          <p className="muted">
            ← → bewegen
            <br />↑ / X draaien
            <br />↓ zacht laten zakken
            <br />
            Spatie: direct laten vallen
            <br />
            P: pauzeren
          </p>
          {state.phase === "playing" && (
            <button onClick={() => state.setPaused((p) => !p)}>
              {state.paused ? <Play size={15} /> : <Pause size={15} />}{" "}
              {state.paused ? "Verder" : "Pauze"}
            </button>
          )}
        </div>
      </div>
      {state.phase === "playing" && (
        <div className="game-controls tetris-buttons">
          {[
            ["left", ArrowLeft, "Links"],
            ["rotate", RotateCw, "Draaien"],
            ["right", ArrowRight, "Rechts"],
            ["down", ArrowDown, "Zakken"],
            ["hard", ChevronsDown, "Laten vallen"],
          ].map(([key, Icon, label]: any) => (
            <button
              key={key}
              aria-label={label}
              onClick={() => action.current(key)}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      )}
      {state.phase === "over" && <Results state={state} user={user} />}{" "}
      {state.error && state.phase !== "over" && (
        <p className="error">{state.error}</p>
      )}
    </div>
  );
}
